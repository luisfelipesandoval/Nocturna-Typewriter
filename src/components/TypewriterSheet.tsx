import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  CursorVisualPosition,
  getCursorVisualPosition,
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
const WRITING_OFFSET_TOP_PX = 290;

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorCaretRef = useRef<HTMLSpanElement | null>(null);

  const currentPage: PageItem =
    notebook.pages[activePageIndex] || notebook.pages[0];
  const fullContent = currentPage?.content || '';

  const [caretIndex, setCaretIndex] = useState<number>(() => fullContent.length);
  const [cursorPos, setCursorPos] = useState<CursorVisualPosition>(() =>
    getCursorVisualPosition(fullContent, fullContent.length, charsPerLine)
  );

  // Exact pixel coordinates of the caret relative to the centered writing column
  const [caretPixel, setCaretPixel] = useState<{ x: number; y: number }>({
    x: 0,
    y: WRITING_OFFSET_TOP_PX,
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

  const measureCaretPixels = useCallback(() => {
    const marker = mirrorCaretRef.current;
    if (marker) {
      setCaretPixel({
        x: marker.offsetLeft,
        y: marker.offsetTop,
      });
    }
  }, []);

  useLayoutEffect(() => {
    measureCaretPixels();
  }, [fullContent, caretIndex, measureCaretPixels, showRuledLines]);

  useEffect(() => {
    window.addEventListener('resize', measureCaretPixels);
    return () => window.removeEventListener('resize', measureCaretPixels);
  }, [measureCaretPixels]);

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
      setCaretIndex(len);
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(len, len);
      }
      setCursorPos(getCursorVisualPosition(pageText, len, charsPerLine));
      return () => window.clearTimeout(timer);
    }
  }, [activePageIndex, notebook.pages, charsPerLine]);

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
    setCaretIndex(sel);
    setCursorPos(getCursorVisualPosition(content, sel, charsPerLine));
  }, [currentPage?.content, charsPerLine]);

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
  };

  const syncCaretPosition = () => {
    const el = textareaRef.current;
    if (!el) return;
    hasExplicitCaretRef.current = true;
    const sel = el.selectionStart ?? el.value.length;
    setCaretIndex(sel);
    setCursorPos(getCursorVisualPosition(el.value, sel, charsPerLine));
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    hasExplicitCaretRef.current = true;
    const nextValue = e.target.value;
    const caret = e.target.selectionStart ?? nextValue.length;
    setCaretIndex(caret);
    setCursorPos(getCursorVisualPosition(nextValue, caret, charsPerLine));
    onUpdatePageContent(nextValue, caret);
  };

  const clampedRow = Math.min(
    maxLinesPerPage - 1,
    Math.max(0, cursorPos.visualRow)
  );

  // Full-width horizontal rail sits directly underneath the active character line
  const railTopPx = caretPixel.y + LINE_HEIGHT_PX + 10;
  const spotlightCenterX = caretPixel.x;
  const spotlightCenterY = caretPixel.y + LINE_HEIGHT_PX * 0.52;

  const intensityMultiplier =
    lampIntensity === 'suave' ? 0.65 : lampIntensity === 'intensa' ? 1.35 : 1.0;

  const surfaceMinHeightPx =
    WRITING_OFFSET_TOP_PX + maxLinesPerPage * LINE_HEIGHT_PX + 140;

  const textBeforeCaret = fullContent.slice(0, caretIndex);
  const textAfterCaret = fullContent.slice(caretIndex);

  // Spotlight mask so characters inside the upward beam glow bright bone-white
  // while characters further outside the cone rest in soft shadow
  const spotlightRadiusPx =
    lampIntensity === 'suave' ? 140 : lampIntensity === 'intensa' ? 225 : 175;
  const spotlightMaskGradient = `radial-gradient(ellipse ${spotlightRadiusPx}px ${
    spotlightRadiusPx * 1.5
  }px at ${spotlightCenterX}px ${
    spotlightCenterY - 24
  }px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.32) 72%, rgba(0,0,0,0) 100%)`;

  return (
    <div
      ref={containerRef}
      onClick={() => textareaRef.current?.focus()}
      className={`relative w-full flex-1 flex flex-col items-center justify-start transition-opacity duration-200 cursor-text ${
        pageTurnDirection ? 'opacity-85' : 'opacity-100'
      }`}
      style={{ minHeight: `${surfaceMinHeightPx}px` }}
    >
      {/* Full-viewport horizontal bronze/brown carriage track rail stretching edge-to-edge */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 pointer-events-none select-none z-10"
        style={{
          top: `${railTopPx}px`,
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

      {/* Centered Typewriter Writing Column */}
      <div
        className="relative w-full max-w-[680px] mx-auto"
        style={{ minHeight: `${surfaceMinHeightPx}px` }}
      >
        {/* Optional Subtle Ruled Lines (only if user enables them) */}
        {showRuledLines && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 pointer-events-none select-none z-0"
            style={{
              top: `${WRITING_OFFSET_TOP_PX}px`,
            }}
          >
            {Array.from({ length: maxLinesPerPage }).map((_, idx) => {
              const isActiveRow = idx === clampedRow;
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

        {/* 1. VOLUMETRIC UPWARD LIGHT CONE + CAPSULE CARRIAGE WITH "T" HAMMER */}
        <div
          aria-hidden="true"
          data-testid="typewriter-carriage-lamp"
          className="absolute left-0 right-0 pointer-events-none select-none z-10"
          style={{
            top: `${railTopPx}px`,
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
            {/* Large Soft Ambient Halo behind the cone (like reference image) */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '-20px',
                left: '50%',
                width: '720px',
                height: '440px',
                background: `radial-gradient(ellipse 55% 65% at 50% 72%, rgba(215, 178, 126, ${
                  0.18 * intensityMultiplier
                }) 0%, rgba(168, 134, 88, ${
                  0.07 * intensityMultiplier
                }) 52%, transparent 88%)`,
                filter: 'blur(20px)',
              }}
            />

            {/* Wide Tall Volumetric Spotlight Cone fanning upward from the "T" tip */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '13px',
                left: '50%',
                width: '560px',
                height: '340px',
                background: `conic-gradient(from -36deg at 50% 100%, transparent 0deg, rgba(224, 188, 138, ${
                  0.04 * intensityMultiplier
                }) 9deg, rgba(235, 199, 148, ${
                  0.26 * intensityMultiplier
                }) 24deg, rgba(250, 222, 178, ${
                  0.42 * intensityMultiplier
                }) 36deg, rgba(235, 199, 148, ${
                  0.26 * intensityMultiplier
                }) 48deg, rgba(224, 188, 138, ${
                  0.04 * intensityMultiplier
                }) 63deg, transparent 72deg)`,
                maskImage:
                  'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.82) 54%, transparent 96%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.82) 54%, transparent 96%)',
                filter: 'blur(9px)',
              }}
            />

            {/* Core intense warm hotspot directly illuminating the active character & caret */}
            <div
              className="pointer-events-none -translate-x-1/2"
              style={{
                position: 'absolute',
                bottom: '11px',
                left: '50%',
                width: '180px',
                height: '130px',
                background: `radial-gradient(ellipse 52% 85% at 50% 100%, rgba(255, 232, 192, ${
                  0.48 * intensityMultiplier
                }) 0%, rgba(228, 186, 128, ${
                  0.22 * intensityMultiplier
                }) 48%, transparent 92%)`,
                clipPath: 'polygon(43% 100%, 57% 100%, 100% 0%, 0% 0%)',
                filter: 'blur(4px)',
              }}
            />

            {/* The "T" Typebar Hammer Post rising above the capsule toward the active character */}
            <div
              className={`relative flex flex-col items-center -mt-[14px] transition-transform duration-75 ${
                hammerStrike ? '-translate-y-1' : 'translate-y-0'
              }`}
            >
              {/* Horizontal crossbar of the "T" */}
              <div
                className="w-[11px] h-[2.5px] rounded-[1px]"
                style={{
                  background: '#F4E5CE',
                  boxShadow: '0 0 8px rgba(248, 212, 156, 0.75)',
                }}
              />
              {/* Vertical stem of the "T" */}
              <div
                className="w-[2.5px] h-[10px]"
                style={{
                  background:
                    'linear-gradient(180deg, #F4E5CE 0%, #CBB79A 100%)',
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

        {/* 2. HIDDEN MIRROR LAYER: Measures exact pixel (x, y) of the active caret */}
        <div
          aria-hidden="true"
          style={{
            paddingTop: `${WRITING_OFFSET_TOP_PX}px`,
            paddingBottom: '80px',
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

        {/* 3. VISUAL TEXT LAYER A — Dimmed Nocturnal Ink outside the spotlight beam */}
        <div
          aria-hidden="true"
          style={{
            paddingTop: `${WRITING_OFFSET_TOP_PX}px`,
            paddingBottom: '80px',
            paddingLeft: '24px',
            paddingRight: '24px',
            lineHeight: `${LINE_HEIGHT_PX}px`,
          }}
          className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] text-[#7D7163] z-15"
        >
          {fullContent}
        </div>

        {/* 4. VISUAL TEXT LAYER B — Bright Illuminated Cream Ink inside the spotlight cone */}
        <div
          aria-hidden="true"
          data-testid="spotlight-illuminated-text"
          style={{
            paddingTop: `${WRITING_OFFSET_TOP_PX}px`,
            paddingBottom: '80px',
            paddingLeft: '24px',
            paddingRight: '24px',
            lineHeight: `${LINE_HEIGHT_PX}px`,
            maskImage: spotlightMaskGradient,
            WebkitMaskImage: spotlightMaskGradient,
            textShadow: '0 0 12px rgba(252, 215, 151, 0.35)',
          }}
          className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] text-[#FAF0DF] z-15"
        >
          {fullContent}
        </div>

        {/* 5. INTERACTIVE TEXTAREA — Transparent ink with warm golden caret aligned to the "T" spotlight */}
        <textarea
          ref={textareaRef}
          value={fullContent}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={syncCaretPosition}
          onKeyUp={syncCaretPosition}
          onSelect={syncCaretPosition}
          aria-label={`Contenido de la hoja ${activePageIndex + 1}`}
          spellCheck={false}
          autoFocus
          style={{
            paddingTop: `${WRITING_OFFSET_TOP_PX}px`,
            paddingBottom: '80px',
            paddingLeft: '24px',
            paddingRight: '24px',
            lineHeight: `${LINE_HEIGHT_PX}px`,
            minHeight: `${surfaceMinHeightPx}px`,
            color: 'transparent',
            caretColor: '#E8C382',
          }}
          className="relative z-20 w-full bg-transparent resize-none border-0 focus:outline-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] selection:bg-[#D99B4E]/35 selection:text-transparent"
        />
      </div>
    </div>
  );
};
