export interface PageItem {
  id: string;
  content: string;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pages: PageItem[];
}

export interface CursorVisualPosition {
  visualRow: number;
  visualCol: number;
  totalVisualLines: number;
  maxCols: number;
}

export interface OverflowSplitResult {
  shouldTurnPage: boolean;
  currentPageContent: string;
  carryOverContent: string;
  visualLineCount: number;
}

/**
 * Splits text into visual lines given a fixed monospace column width (charsPerLine).
 * Preserves hard newlines and wraps long paragraphs by word boundaries when possible.
 */
export function computeVisualLines(text: string, charsPerLine: number = 62): string[] {
  const safeMaxCols = Math.max(20, charsPerLine);
  if (!text) return [''];

  const paragraphs = text.split('\n');
  const visualLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      visualLines.push('');
      continue;
    }

    let remaining = paragraph;
    while (remaining.length > safeMaxCols) {
      let breakIndex = remaining.lastIndexOf(' ', safeMaxCols);
      if (breakIndex <= 0) {
        breakIndex = safeMaxCols;
        visualLines.push(remaining.slice(0, breakIndex));
        remaining = remaining.slice(breakIndex);
      } else {
        // Include trailing space on the current line so character offsets match 1:1
        visualLines.push(remaining.slice(0, breakIndex + 1));
        remaining = remaining.slice(breakIndex + 1);
      }
    }
    visualLines.push(remaining);
  }

  return visualLines.length > 0 ? visualLines : [''];
}

/**
 * Given text and a caret index (selectionStart), computes the exact visual row (0-indexed)
 * and visual column (0-indexed) where the typewriter carriage and light cone should sit.
 */
export function getCursorVisualPosition(
  text: string,
  selectionStart: number,
  charsPerLine: number = 62
): CursorVisualPosition {
  const safeMaxCols = Math.max(20, charsPerLine);
  const clampedCursor = Math.max(0, Math.min(selectionStart, text.length));
  const textBeforeCursor = text.slice(0, clampedCursor);
  const linesBefore = computeVisualLines(textBeforeCursor, safeMaxCols);
  const allLines = computeVisualLines(text, safeMaxCols);

  const visualRow = Math.max(0, linesBefore.length - 1);
  const currentLineText = linesBefore[linesBefore.length - 1] ?? '';
  const visualCol = Math.min(safeMaxCols, currentLineText.length);

  return {
    visualRow,
    visualCol,
    totalVisualLines: allLines.length,
    maxCols: safeMaxCols,
  };
}

/**
 * Determines whether the page has exceeded maxLinesPerPage (or maxCharsPerPage),
 * and if so, splits the content cleanly into currentPageContent and carryOverContent
 * for the automatic page transition.
 */
export function evaluatePageOverflow(
  text: string,
  maxLinesPerPage: number = 18,
  charsPerLine: number = 62
): OverflowSplitResult {
  const safeMaxLines = Math.max(5, maxLinesPerPage);
  const safeMaxCols = Math.max(20, charsPerLine);
  const maxChars = safeMaxLines * safeMaxCols;

  const visualLines = computeVisualLines(text, safeMaxCols);

  if (visualLines.length <= safeMaxLines && text.length <= maxChars) {
    return {
      shouldTurnPage: false,
      currentPageContent: text,
      carryOverContent: '',
      visualLineCount: visualLines.length,
    };
  }

  // Reconstruct the text that fits on the first `safeMaxLines` visual lines
  // by consuming characters from `text` line by line.
  let charIndex = 0;
  const rawParagraphs = text.split('\n');
  let producedLines = 0;

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const paragraph = rawParagraphs[pIdx];
    const wrapped = computeVisualLines(paragraph, safeMaxCols);

    if (producedLines + wrapped.length <= safeMaxLines) {
      producedLines += wrapped.length;
      charIndex += paragraph.length;
      // Add the newline delimiter if it isn't the last paragraph and we still have line budget
      if (pIdx < rawParagraphs.length - 1) {
        if (producedLines < safeMaxLines) {
          charIndex += 1; // include '\n'
        } else {
          // Exact boundary at the end of a paragraph before '\n'
          const currentPageContent = text.slice(0, charIndex);
          const carryOverContent = text.slice(charIndex + 1);
          return {
            shouldTurnPage: true,
            currentPageContent,
            carryOverContent,
            visualLineCount: safeMaxLines,
          };
        }
      }
    } else {
      // Overflow happens inside this paragraph
      const allowedInParagraph = safeMaxLines - producedLines;
      for (let wIdx = 0; wIdx < allowedInParagraph; wIdx++) {
        charIndex += wrapped[wIdx].length;
      }
      const currentPageContent = text.slice(0, charIndex).replace(/[ ]+$/, '');
      const carryOverContent = text.slice(charIndex).replace(/^\n/, '');
      return {
        shouldTurnPage: true,
        currentPageContent,
        carryOverContent,
        visualLineCount: safeMaxLines,
      };
    }
  }

  // Fallback character limit split
  const currentPageContent = text.slice(0, maxChars);
  const carryOverContent = text.slice(maxChars);
  return {
    shouldTurnPage: true,
    currentPageContent,
    carryOverContent,
    visualLineCount: visualLines.length,
  };
}

export interface TextMetrics {
  words: number;
  characters: number;
  visualLines: number;
  readingMinutes: number;
}

export function calculateTextMetrics(text: string, charsPerLine: number = 62): TextMetrics {
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const characters = text.length;
  const visualLines = text.length === 0 ? 1 : computeVisualLines(text, charsPerLine).length;
  const readingMinutes = Math.max(1, Math.ceil(words / 200));

  return {
    words,
    characters,
    visualLines,
    readingMinutes,
  };
}

/**
 * Moves a caret index up or down by `rowDelta` visual lines while preserving column offset.
 */
export function moveCaretByVisualRows(
  text: string,
  currentCaretIndex: number,
  rowDelta: number,
  charsPerLine: number = 62
): number {
  if (!text || rowDelta === 0) return Math.max(0, Math.min(currentCaretIndex, text.length));
  const safeMaxCols = Math.max(20, charsPerLine);
  const clampedCaret = Math.max(0, Math.min(currentCaretIndex, text.length));

  interface VisualLineSpan {
    start: number;
    end: number;
  }

  const spans: VisualLineSpan[] = [];
  const paragraphs = text.split('\n');
  let cursor = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];
    if (paragraph.length === 0) {
      spans.push({ start: cursor, end: cursor });
    } else {
      let remaining = paragraph;
      let localOffset = 0;
      while (remaining.length > safeMaxCols) {
        let breakIndex = remaining.lastIndexOf(' ', safeMaxCols);
        let chunkLen: number;
        if (breakIndex <= 0) {
          chunkLen = safeMaxCols;
        } else {
          chunkLen = breakIndex + 1;
        }
        spans.push({
          start: cursor + localOffset,
          end: cursor + localOffset + chunkLen,
        });
        localOffset += chunkLen;
        remaining = remaining.slice(chunkLen);
      }
      spans.push({
        start: cursor + localOffset,
        end: cursor + paragraph.length,
      });
    }
    cursor += paragraph.length + 1; // +1 for '\n'
  }

  if (spans.length === 0) return 0;

  let activeRow = spans.length - 1;
  for (let i = 0; i < spans.length; i++) {
    if (clampedCaret >= spans[i].start && clampedCaret <= spans[i].end) {
      activeRow = i;
      break;
    }
  }

  const colOffset = Math.max(0, clampedCaret - spans[activeRow].start);
  const targetRow = Math.max(0, Math.min(spans.length - 1, activeRow + rowDelta));
  const targetSpan = spans[targetRow];
  const maxColOnTarget = Math.max(0, targetSpan.end - targetSpan.start);
  return targetSpan.start + Math.min(colOffset, maxColOnTarget);
}

