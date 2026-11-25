import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import {
  CursorVisualPosition,
  getCursorVisualPosition,
  moveCaretByVisualRows,
  Notebook,
  PageItem,
} from '../utils/pagination';
import { KeySoundType } from '../utils/soundEngine';

interface TypewriterSheetProps {
  notebook: Notebook;
  activePageIndex: number;
  maxLinesPerPage: number;
  charsPerLine: number;
  showRuledLines: boolean;
  lampIntensity: 'suave' | 'calida' | 'intensa';
  onUpdatePageContent: (newContent: string, cursorIndex: number) => void;
  onPlayKeySound: (type: KeySoundType) => void;
}

const LINE_HEIGHT_PX = 34;

export const TypewriterSheet: React.FC<TypewriterSheetProps> = ({
  notebook,
  activePageIndex,
  maxLinesPerPage,
  charsPerLine,
  showRuledLines,
  lampIntensity,
  onUpdatePageContent,
  onPlayKeySound,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorCaretRef = useRef<HTMLSpanElement | null>(null);

  const currentPage: PageItem =
    notebook.pages[activePageIndex] || notebook.pages[0];
  const fullContent = currentPage?.content || '';

  const [caretIndex, setCaretIndex] = useState<number>(() => fullContent.length);
  const [cursorPos, setCursorPos] = useState<CursorVisualPosition>(() =>
    getCursorVisualPosition(fullContent, fullContent.length, charsPerLine)
  );

  // Fixed vertical rail position in the center of the viewport (never moves down when typing)
  const [fixedRailTopPx, setFixedRailTopPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 420;
    return Math.max(320, Math.min(540, Math.round(window.innerHeight * 0.62)));
  });

  // Exact pixel coordinates of the caret inside the paper block
  const [caretPixel, setCaretPixel] = useState<{ x: number; y: number }>({
    x: 24,
    y: 3,
  });

  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [hammerStrike, setHammerStrike] = useState(false);
  const [pageTurnDirection, setPageTurnDirection] = useState<
    'next' | 'prev' | null
  >(null);

  const typingTimeoutRef = useRef<number | null>(null);
  const hammerTimeoutRef = useRef<number | null>(null);
  const prevPageIndexRef = useRef<number>(activePageIndex);
  const hasExplicitCaretRef = useRef<boolean>(false);
  const wheelAccumRef = useRef<number>(0);
  const caretIndexRef = useRef<number>(caretIndex);

  // Touch-scroll tracking for tablets and phones
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchLastYRef = useRef<number | null>(null);
  const touchAccumRef = useRef<number>(0);
  const isTouchDraggingRef = useRef<boolean>(false);
  const lastTouchScrollAtRef = useRef<number>(0);

  // Movable & opacity-hideable line navigator pill state
  const navPillRef = useRef<HTMLDivElement | null>(null);
  const [navOffset, setNavOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem('nocturna_line_nav_offset_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed?.x === 'number' &&
          typeof parsed?.y === 'number'
        ) {
          return { x: parsed.x, y: parsed.y };
        }
      }
    } catch {}
    return { x: 0, y: 0 };
  });

  const [isNavDimmed, setIsNavDimmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nocturna_line_nav_dimmed_v1') === '1';
    } catch {
      return false;
    }
  });

  const navDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const wasNavDraggedRef = useRef<boolean>(false);

  const handleNavPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    wasNavDraggedRef.current = false;
    navDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: navOffset.x,
      origY: navOffset.y,
      moved: false,
    };
  };

  const handleNavPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = navDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      wasNavDraggedRef.current = true;
      try {
        navPillRef.current?.setPointerCapture(e.pointerId);
      } catch {}
    }

    if (drag.moved) {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const maxX = Math.max(80, vw / 2 - 70);
      const minY = -(fixedRailTopPx + 10);
      const maxY = Math.max(60, vh - fixedRailTopPx - 70);

      const nextX = Math.round(
        Math.max(-maxX, Math.min(maxX, drag.origX + dx))
      );
      const nextY = Math.round(
        Math.max(minY, Math.min(maxY, drag.origY + dy))
      );
      setNavOffset({ x: nextX, y: nextY });
    }
  };

  const handleNavPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = navDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (drag.moved) {
      try {
        navPillRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
      try {
        localStorage.setItem(
          'nocturna_line_nav_offset_v1',
          JSON.stringify(navOffset)
        );
      } catch {}
      window.setTimeout(() => {
        wasNavDraggedRef.current = false;
      }, 60);
    }
    navDragRef.current = null;
  };

  const toggleNavDimmed = () => {
    if (wasNavDraggedRef.current) return;
    setIsNavDimmed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nocturna_line_nav_dimmed_v1', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    caretIndexRef.current = caretIndex;
  }, [caretIndex]);

  const lockZeroScroll = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
      textareaRef.current.scrollLeft = 0;
    }
    if (stageRef.current) {
      stageRef.current.scrollTop = 0;
      stageRef.current.scrollLeft = 0;
    }
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  }, []);

  const measureCaretPixels = useCallback(() => {
    lockZeroScroll();
    const marker = mirrorCaretRef.current;
    if (marker) {
      setCaretPixel({
        x: marker.offsetLeft,
        y: marker.offsetTop,
      });
    }
  }, [lockZeroScroll]);

  useLayoutEffect(() => {
    measureCaretPixels();
  }, [fullContent, caretIndex, measureCaretPixels, showRuledLines]);

  useEffect(() => {
    const handleResize = () => {
      setFixedRailTopPx(
        Math.max(320, Math.min(540, Math.round(window.innerHeight * 0.62)))
      );
      measureCaretPixels();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureCaretPixels]);

  const syncCaretPosition = useCallback(() => {
    lockZeroScroll();
    const el = textareaRef.current;
    if (!el) return;
    // Do not let native post-swipe touch selection snap caretIndex back after a tablet vertical drag
    if (
      isTouchDraggingRef.current ||
      Date.now() - lastTouchScrollAtRef.current < 350
    ) {
      el.setSelectionRange(caretIndexRef.current, caretIndexRef.current);
      return;
    }
    hasExplicitCaretRef.current = true;
    const sel = el.selectionStart ?? el.value.length;
    caretIndexRef.current = sel;
    setCaretIndex(sel);
    setCursorPos(getCursorVisualPosition(el.value, sel, charsPerLine));
  }, [charsPerLine, lockZeroScroll]);

  // Listen to document selectionchange so mobile/tablet touch caret movements
  // and mouse clicks on upper lines always sync caretIndex immediately
  useEffect(() => {
    const handleSelectionChange = () => {
      if (
        typeof document !== 'undefined' &&
        document.activeElement === textareaRef.current
      ) {
        syncCaretPosition();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', handleSelectionChange);
  }, [syncCaretPosition]);

  // Detect page changes for smooth visual transition
  useEffect(() => {
    if (prevPageIndexRef.current !== activePageIndex) {
      const dir = activePageIndex > prevPageIndexRef.current ? 'next' : 'prev';
      setPageTurnDirection(dir);
      prevPageIndexRef.current = activePageIndex;
      hasExplicitCaretRef.current = false;
      const timer = window.setTimeout(() => setPageTurnDirection(null), 240);

      const pageText = notebook.pages[activePageIndex]?.content || '';
      const len = pageText.length;
      caretIndexRef.current = len;
      setCaretIndex(len);
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(len, len);
      }
      lockZeroScroll();
      setCursorPos(getCursorVisualPosition(pageText, len, charsPerLine));
      return () => window.clearTimeout(timer);
    }
  }, [activePageIndex, notebook.pages, charsPerLine, lockZeroScroll]);

  // Keep cursor position synced when content changes
  useEffect(() => {
    const content = currentPage?.content || '';
    const el = textareaRef.current;
    const isFocused =
      typeof document !== 'undefined' && document.activeElement === el;
    const sel =
      el && (isFocused || hasExplicitCaretRef.current)
        ? Math.min(el.selectionStart ?? content.length, content.length)
        : content.length;
    lockZeroScroll();
    caretIndexRef.current = sel;
    setCaretIndex(sel);
    setCursorPos(getCursorVisualPosition(content, sel, charsPerLine));
  }, [currentPage?.content, charsPerLine, lockZeroScroll]);

  const stepVisualRow = useCallback(
    (rowSteps: number) => {
      lockZeroScroll();
      if (!fullContent || rowSteps === 0) return;
      const nextCaret = moveCaretByVisualRows(
        fullContent,
        caretIndexRef.current,
        rowSteps,
        charsPerLine
      );
      if (nextCaret !== caretIndexRef.current) {
        hasExplicitCaretRef.current = true;
        lastTouchScrollAtRef.current = Date.now();
        caretIndexRef.current = nextCaret;
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(nextCaret, nextCaret);
        }
        setCaretIndex(nextCaret);
        setCursorPos(
          getCursorVisualPosition(fullContent, nextCaret, charsPerLine)
        );
      }
    },
    [charsPerLine, fullContent, lockZeroScroll]
  );

  const jumpToLatestLine = useCallback(() => {
    lockZeroScroll();
    const endCaret = fullContent.length;
    hasExplicitCaretRef.current = true;
    lastTouchScrollAtRef.current = Date.now();
    caretIndexRef.current = endCaret;
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(endCaret, endCaret);
    }
    setCaretIndex(endCaret);
    setCursorPos(getCursorVisualPosition(fullContent, endCaret, charsPerLine));
  }, [charsPerLine, fullContent, lockZeroScroll]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(
        e.key
      )
    ) {
      return;
    }

    if (e.key === 'Enter') {
      onPlayKeySound('enter');
    } else if (e.key === ' ') {
      onPlayKeySound('space');
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      onPlayKeySound('delete');
    } else if (e.key.length === 1 || e.key.startsWith('Arrow')) {
      onPlayKeySound('char');
    }

    setIsActivelyTyping(true);
    setHammerStrike(true);

    if (hammerTimeoutRef.current) {
      window.clearTimeout(hammerTimeoutRef.current);
    }
    hammerTimeoutRef.current = window.setTimeout(() => {
      setHammerStrike(false);
    }, 90);

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      setIsActivelyTyping(false);
    }, 1100);

    // Sync immediately on the next frame for held navigation keys (ArrowUp/ArrowDown/Home/End)
    window.requestAnimationFrame(() => {
      syncCaretPosition();
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    hasExplicitCaretRef.current = true;
    lockZeroScroll();
    const nextValue = e.target.value;
    const caret = e.target.selectionStart ?? nextValue.length;
    caretIndexRef.current = caret;
    setCaretIndex(caret);
    setCursorPos(getCursorVisualPosition(nextValue, caret, charsPerLine));
    onUpdatePageContent(nextValue, caret);
  };

  // Allow mouse wheel / trackpad vertical scroll to smoothly move up and down
  // through written lines while keeping the active line pinned at the center rail
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    lockZeroScroll();
    if (!fullContent) return;
    wheelAccumRef.current += e.deltaY;
    const STEP_THRESHOLD = 28;
    if (Math.abs(wheelAccumRef.current) < STEP_THRESHOLD) return;

    const rowSteps =
      wheelAccumRef.current > 0
        ? Math.floor(wheelAccumRef.current / STEP_THRESHOLD)
        : Math.ceil(wheelAccumRef.current / STEP_THRESHOLD);
    wheelAccumRef.current -= rowSteps * STEP_THRESHOLD;

    stepVisualRow(rowSteps);
  };

  // Tablet & mobile vertical finger-swipe scrolling:
  // Dragging finger DOWN pulls earlier lines down out of the darkness;
  // Dragging finger UP pushes lines back up toward the latest line.
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartXRef.current = e.touches[0].clientX;
    touchLastYRef.current = e.touches[0].clientY;
    touchAccumRef.current = 0;
    isTouchDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || touchLastYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const totalDy = currentY - (touchStartYRef.current ?? currentY);
    const totalDx = currentX - (touchStartXRef.current ?? currentX);

    if (!isTouchDraggingRef.current) {
      if (Math.abs(totalDy) > 8 && Math.abs(totalDy) >= Math.abs(totalDx)) {
        isTouchDraggingRef.current = true;
      } else {
        return;
      }
    }

    // Pull finger down (currentY > lastY) => dy < 0 => move to earlier lines above
    // Push finger up (currentY < lastY) => dy > 0 => move to later lines below
    const dy = touchLastYRef.current - currentY;
    touchLastYRef.current = currentY;
    touchAccumRef.current += dy;
    lastTouchScrollAtRef.current = Date.now();

    const TOUCH_STEP_PX = 22;
    if (Math.abs(touchAccumRef.current) < TOUCH_STEP_PX) return;

    const rowSteps =
      touchAccumRef.current > 0
        ? Math.floor(touchAccumRef.current / TOUCH_STEP_PX)
        : Math.ceil(touchAccumRef.current / TOUCH_STEP_PX);
    touchAccumRef.current -= rowSteps * TOUCH_STEP_PX;

    stepVisualRow(rowSteps);
  };

  const handleTouchEnd = () => {
    if (isTouchDraggingRef.current) {
      lastTouchScrollAtRef.current = Date.now();
      isTouchDraggingRef.current = false;
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(
          caretIndexRef.current,
          caretIndexRef.current
        );
      }
    } else {
      window.requestAnimationFrame(() => {
        syncCaretPosition();
      });
    }
    touchStartYRef.current = null;
    touchStartXRef.current = null;
    touchLastYRef.current = null;
    touchAccumRef.current = 0;
  };

  // The horizontal rail NEVER moves down. It stays fixed at fixedRailTopPx.
  // The active line (caretPixel.y) is always pinned right above the "T" hammer on the rail,
  // and as more lines are written, the text translates UPWARD into the darkness.
  const stageHeightPx = fixedRailTopPx - 14;
  const activeLineTargetY = stageHeightPx - 28;
  const textTranslateY = activeLineTargetY - caretPixel.y;

  const spotlightCenterX = caretPixel.x;

  const intensityMultiplier =
    lampIntensity === 'suave' ? 0.7 : lampIntensity === 'intensa' ? 1.3 : 1.0;

  const textBeforeCaret = fullContent.slice(0, caretIndex);
  const textAfterCaret = fullContent.slice(caretIndex);

  // Single non-nested vertical fade mask on Text Layer A (in paper coordinates)
  // so older lines fade progressively into the dark background as they rise above the rail,
  // and any lines below the active line are cleanly hidden above the rail:
  const activeTop = caretPixel.y;
  const activeBot = caretPixel.y + 26;
  const row1Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 1);
  const row2Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 2);
  const row3Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 3);
  const row4Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 4);
  const row5Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 5.2);

  const baseTextVerticalFadeMask =
    activeTop <= 6
      ? `linear-gradient(180deg, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${activeBot}px, rgba(0,0,0,0) ${
          activeBot + 2
        }px)`
      : `linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${row5Up}px, rgba(0,0,0,0.12) ${row4Up}px, rgba(0,0,0,0.26) ${row3Up}px, rgba(0,0,0,0.44) ${row2Up}px, rgba(0,0,0,0.68) ${row1Up}px, rgba(0,0,0,0.92) ${activeTop}px, rgba(0,0,0,0.92) ${activeBot}px, rgba(0,0,0,0) ${
          activeBot + 2
        }px)`;

  // Single non-nested radial spotlight mask on Text Layer B (in paper coordinates)
  // centered at the caret so characters touched by the light beam shine in crisp cream (#F7EBD9)
  // on the active line and fade naturally upward along the beam cone without washing out:
  const spotlightRadiusX =
    lampIntensity === 'suave' ? 115 : lampIntensity === 'intensa' ? 185 : 145;
  const spotlightRadiusY =
    lampIntensity === 'suave' ? 135 : lampIntensity === 'intensa' ? 205 : 170;
  const spotlightMaskGradient = `radial-gradient(ellipse ${spotlightRadiusX}px ${spotlightRadiusY}px at ${spotlightCenterX}px ${
    caretPixel.y + LINE_HEIGHT_PX * 0.45
  }px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 28%, rgba(0,0,0,0.52) 56%, rgba(0,0,0,0.18) 80%, rgba(0,0,0,0) 100%)`;

  const dynamicPaperHeightPx = Math.max(
    LINE_HEIGHT_PX * 3,
    (cursorPos.totalVisualLines + 2) * LINE_HEIGHT_PX,
    caretPixel.y + LINE_HEIGHT_PX * 3
  );

  const canGoUpLine = cursorPos.visualRow > 0;
  const canGoDownLine = cursorPos.visualRow < cursorPos.totalVisualLines - 1;

  return (
    <div
      ref={containerRef}
      onScroll={lockZeroScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        if (e.target !== textareaRef.current) {
          textareaRef.current?.focus();
          lockZeroScroll();
        }
      }}
      className={`relative w-full flex-1 flex flex-col items-center justify-start transition-opacity duration-200 cursor-text ${
        pageTurnDirection ? 'opacity-85' : 'opacity-100'
      }`}
      style={{
        height: '100vh',
        minHeight: `${fixedRailTopPx + 180}px`,
        overflow: 'clip',
        touchAction: 'pan-x',
      }}
    >
      {/* FIXED HORIZONTAL BRONZE RAIL IN THE CENTER OF THE VIEWPORT */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 pointer-events-none select-none z-10"
        style={{
          top: `${fixedRailTopPx}px`,
        }}
      >
        <div
          className="w-full h-[2px]"
          style={{
            background:
              'linear-gradient(90deg, #4B3B2B 0%, #6E5740 25%, #856A4E 50%, #6E5740 75%, #4B3B2B 100%)',
            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.85)',
          }}
        />
      </div>

      {/* MOVABLE & OPACITY-HIDEABLE TABLET/TOUCH LINE NAVIGATOR (shown when 2+ lines exist) */}
      {cursorPos.totalVisualLines > 1 && (
        <div
          ref={navPillRef}
          data-testid="movable-line-navigator"
          onPointerDown={handleNavPointerDown}
          onPointerMove={handleNavPointerMove}
          onPointerUp={handleNavPointerUp}
          onPointerCancel={handleNavPointerUp}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 z-30 flex items-center gap-1 px-2 py-1 rounded-full select-none transition-opacity duration-200 cursor-grab active:cursor-grabbing"
          style={{
            top: `${fixedRailTopPx + 28}px`,
            transform: `translate3d(calc(-50% + ${navOffset.x}px), ${navOffset.y}px, 0)`,
            opacity: isNavDimmed ? 0.16 : 0.94,
            background: 'rgba(34, 28, 22, 0.78)',
            border: '1px solid rgba(133, 106, 78, 0.3)',
            boxShadow: isNavDimmed
              ? 'none'
              : '0 4px 14px rgba(0, 0, 0, 0.48)',
            touchAction: 'none',
          }}
        >
          {/* Drag grip handle indicator */}
          <span
            aria-hidden="true"
            className="flex items-center justify-center text-[#8C7A64] pl-0.5 pr-0.5 pointer-events-none"
            title="Arrastrar para mover por la pantalla"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>

          <button
            type="button"
            aria-label="Subir a la línea anterior"
            disabled={!canGoUpLine}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (wasNavDraggedRef.current) return;
              stepVisualRow(-1);
            }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
              canGoUpLine
                ? 'text-[#E3D3BA] hover:bg-[#3A2F24] active:bg-[#4B3D2F] cursor-pointer'
                : 'text-[#5A4E40] cursor-not-allowed'
            }`}
            title="Ver línea anterior (↑)"
          >
            ↑
          </button>

          <span className="text-[11px] font-sans tracking-wide text-[#9E8C75] px-1 tabular-nums">
            Línea {cursorPos.visualRow + 1} / {cursorPos.totalVisualLines}
          </span>

          <button
            type="button"
            aria-label="Bajar a la línea siguiente"
            disabled={!canGoDownLine}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (wasNavDraggedRef.current) return;
              stepVisualRow(1);
            }}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors ${
              canGoDownLine
                ? 'text-[#E3D3BA] hover:bg-[#3A2F24] active:bg-[#4B3D2F] cursor-pointer'
                : 'text-[#5A4E40] cursor-not-allowed'
            }`}
            title="Ver línea siguiente (↓)"
          >
            ↓
          </button>

          {canGoDownLine && (
            <button
              type="button"
              aria-label="Volver a la última línea escrita"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (wasNavDraggedRef.current) return;
                jumpToLatestLine();
              }}
              className="ml-0.5 px-2 py-0.5 rounded-full text-[11px] font-sans text-[#EAD9BF] bg-[#3B2F23] hover:bg-[#4D3E2E] active:bg-[#5B4937] transition-colors cursor-pointer"
              title="Volver al final del texto"
            >
              Final ↓
            </button>
          )}

          {/* Eye button to hide/show the pill by lowering its opacity */}
          <button
            type="button"
            aria-label={
              isNavDimmed
                ? 'Mostrar controles de línea'
                : 'Ocultar controles bajando su opacidad'
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleNavDimmed}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[#C4B197] hover:text-[#F2E3CC] hover:bg-[#3A2F24] active:bg-[#4B3D2F] transition-colors cursor-pointer ml-0.5"
            title={
              isNavDimmed
                ? 'Restaurar opacidad'
                : 'Ocultar bajando la opacidad'
            }
          >
            {isNavDimmed ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {/* CENTERED TYPEWRITER COLUMN */}
      <div
        className="relative w-full max-w-[680px] mx-auto"
        style={{ height: `${fixedRailTopPx + 180}px` }}
      >
        {/* 1. VOLUMETRIC UPWARD LIGHT CONE + CAPSULE CARRIAGE WITH "T" HAMMER (Pinned to fixed center rail) */}
        <div
          aria-hidden="true"
          data-testid="typewriter-carriage-lamp"
          className="absolute left-0 right-0 pointer-events-none select-none z-10"
          style={{
            top: `${fixedRailTopPx}px`,
          }}
        >
          <div
            className={`absolute top-0 -translate-x-1/2 ${
              isActivelyTyping ? '' : 'animate-carriage-idle'
            }`}
            style={{
              left: `${spotlightCenterX}px`,
            }}
          >
            {/* Large Soft Warm Ambient Halo behind the cone (translucent so letters never wash out) */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '-20px',
                left: '50%',
                width: '720px',
                height: '440px',
                background: `radial-gradient(ellipse 55% 65% at 50% 72%, rgba(206, 165, 110, ${
                  0.13 * intensityMultiplier
                }) 0%, rgba(158, 122, 76, ${
                  0.05 * intensityMultiplier
                }) 52%, transparent 88%)`,
                filter: 'blur(22px)',
              }}
            />

            {/* Wide Volumetric Spotlight Cone fanning upward from the "T" tip (dark-amber translucent glow) */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '14px',
                left: '50%',
                width: '540px',
                height: '330px',
                background: `conic-gradient(from -36deg at 50% 100%, transparent 0deg, rgba(212, 174, 122, ${
                  0.03 * intensityMultiplier
                }) 9deg, rgba(222, 182, 128, ${
                  0.15 * intensityMultiplier
                }) 24deg, rgba(238, 198, 142, ${
                  0.24 * intensityMultiplier
                }) 36deg, rgba(222, 182, 128, ${
                  0.15 * intensityMultiplier
                }) 48deg, rgba(212, 174, 122, ${
                  0.03 * intensityMultiplier
                }) 63deg, transparent 72deg)`,
                maskImage:
                  'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.78) 54%, transparent 96%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.78) 54%, transparent 96%)',
                filter: 'blur(10px)',
              }}
            />

            {/* Focused warm beam origin just above the "T" crossbar (kept subtle so cream letters stay razor-sharp) */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                width: '160px',
                height: '115px',
                background: `radial-gradient(ellipse 50% 82% at 50% 100%, rgba(235, 195, 138, ${
                  0.22 * intensityMultiplier
                }) 0%, rgba(208, 166, 110, ${
                  0.11 * intensityMultiplier
                }) 48%, transparent 92%)`,
                clipPath: 'polygon(42% 100%, 58% 100%, 100% 0%, 0% 0%)',
                filter: 'blur(5px)',
              }}
            />

            {/* The "T" Typebar Hammer Post rising above the capsule toward the active character */}
            <div
              className={`relative flex flex-col items-center -mt-[15px] transition-transform duration-75 ${
                hammerStrike ? '-translate-y-1' : 'translate-y-0'
              }`}
            >
              {/* Horizontal crossbar of the "T" */}
              <div
                className="w-[12px] h-[2.5px] rounded-[1px]"
                style={{
                  background: '#F0DFC5',
                  boxShadow: '0 0 6px rgba(240, 204, 148, 0.55)',
                }}
              />
              {/* Vertical stem of the "T" */}
              <div
                className="w-[2.5px] h-[11px]"
                style={{
                  background:
                    'linear-gradient(180deg, #F0DFC5 0%, #C8B396 100%)',
                }}
              />
            </div>

            {/* Cream/Ivory Pill Capsule Carriage with 2 Orange Dots + 1 Dark Dot */}
            <div
              className="relative -mt-[2px] w-[46px] h-[18px] rounded-full flex items-center px-[7px] gap-[4px]"
              style={{
                background:
                  'linear-gradient(180deg, #EFE1CA 0%, #C6B295 100%)',
                boxShadow:
                  '0 4px 10px rgba(0, 0, 0, 0.78), inset 0 1px 1px rgba(255, 250, 240, 0.85)',
                border: '1px solid rgba(118, 97, 73, 0.55)',
              }}
            >
              <span
                className="w-[4.5px] h-[4.5px] rounded-full shrink-0"
                style={{ backgroundColor: '#DE8C3E' }}
              />
              <span
                className="w-[4.5px] h-[4.5px] rounded-full shrink-0"
                style={{ backgroundColor: '#DE8C3E' }}
              />
              <span
                className="w-[4.5px] h-[4.5px] rounded-full shrink-0"
                style={{ backgroundColor: '#4A3F35' }}
              />
            </div>
          </div>
        </div>

        {/* 2. PAPER STAGE ABOVE THE FIXED CENTER RAIL — Clips anything below the horizontal rail without creating a scroll container */}
        <div
          ref={stageRef}
          onScroll={lockZeroScroll}
          className="absolute top-0 left-0 right-0 z-20"
          style={{
            height: `${stageHeightPx}px`,
            overflow: 'clip',
          }}
        >
          {/* UPWARD-SHIFTING PAPER LAYER: Moves up as new lines are typed so active line stays at the fixed rail */}
          <div
            className="relative w-full transition-transform duration-150 ease-out"
            style={{
              height: `${dynamicPaperHeightPx}px`,
              transform: `translate3d(0, ${textTranslateY}px, 0)`,
            }}
          >
            {/* Optional Subtle Ruled Lines (moves up with paper if enabled) */}
            {showRuledLines && (
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 pointer-events-none select-none z-0"
              >
                {Array.from({
                  length: Math.max(maxLinesPerPage, cursorPos.visualRow + 6),
                }).map((_, idx) => {
                  const isActiveRow = idx === cursorPos.visualRow;
                  return (
                    <div
                      key={idx}
                      style={{ height: `${LINE_HEIGHT_PX}px` }}
                      className={`w-full border-b transition-colors duration-200 ${
                        isActiveRow
                          ? 'border-[#544436]/35'
                          : 'border-[#2D241C]/40'
                      }`}
                    />
                  );
                })}
              </div>
            )}

            {/* HIDDEN MIRROR LAYER: Measures exact pixel (x, y) of the active caret inside the paper */}
            <div
              aria-hidden="true"
              style={{
                paddingTop: '0px',
                paddingBottom: '12px',
                paddingLeft: '24px',
                paddingRight: '24px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
              }}
              className="absolute inset-0 pointer-events-none invisible whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em]"
            >
              <span>{textBeforeCaret}</span>
              <span
                ref={mirrorCaretRef}
                data-testid="caret-pixel-anchor"
                className="inline-block w-0 h-[18px] align-baseline"
              />
              <span>{textAfterCaret || ' '}</span>
            </div>

            {/* VISUAL TEXT LAYER A — Muted Nocturnal Ink outside the spotlight cone, fading into darkness as lines rise */}
            <div
              aria-hidden="true"
              style={{
                paddingTop: '0px',
                paddingBottom: '12px',
                paddingLeft: '24px',
                paddingRight: '24px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
                maskImage: baseTextVerticalFadeMask,
                WebkitMaskImage: baseTextVerticalFadeMask,
              }}
              className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] text-[#7D6F5D] z-15"
            >
              {fullContent}
            </div>

            {/* VISUAL TEXT LAYER B — Crisp High-Contrast Warm Cream Ink inside the spotlight cone */}
            <div
              aria-hidden="true"
              data-testid="spotlight-illuminated-text"
              style={{
                paddingTop: '0px',
                paddingBottom: '12px',
                paddingLeft: '24px',
                paddingRight: '24px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
                maskImage: spotlightMaskGradient,
                WebkitMaskImage: spotlightMaskGradient,
              }}
              className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] text-[#F7EBD9] z-16"
            >
              {fullContent}
            </div>

            {/* INTERACTIVE TEXTAREA — Transparent ink with warm golden caret aligned to the "T" spotlight */}
            <textarea
              ref={textareaRef}
              value={fullContent}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onClick={syncCaretPosition}
              onMouseUp={syncCaretPosition}
              onKeyUp={syncCaretPosition}
              onSelect={syncCaretPosition}
              onScroll={lockZeroScroll}
              aria-label={`Contenido de la hoja ${activePageIndex + 1}`}
              spellCheck={false}
              autoFocus
              style={{
                paddingTop: '0px',
                paddingBottom: '12px',
                paddingLeft: '24px',
                paddingRight: '24px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
                height: `${dynamicPaperHeightPx}px`,
                color: 'transparent',
                caretColor: '#F3D08E',
                overflow: 'clip',
                touchAction: 'pan-x',
              }}
              className="relative z-20 w-full bg-transparent resize-none border-0 focus:outline-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] selection:bg-[#D99B4E]/35 selection:text-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
