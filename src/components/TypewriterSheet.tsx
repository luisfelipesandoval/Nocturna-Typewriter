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

  // Fixed vertical rail position in the center of the viewport (never moves down when typing)
  const [fixedRailTopPx, setFixedRailTopPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 420;
    return Math.max(320, Math.min(540, Math.round(window.innerHeight * 0.62)));
  });

  // Exact pixel coordinates of the caret inside the paper block
  const [caretPixel, setCaretPixel] = useState<{ x: number; y: number }>({
    x: 24,
    y: 0,
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
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
  }, []);

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
        textareaRef.current.scrollTop = 0;
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
    el.scrollTop = 0;
    hasExplicitCaretRef.current = true;
    const sel = el.selectionStart ?? el.value.length;
    setCaretIndex(sel);
    setCursorPos(getCursorVisualPosition(el.value, sel, charsPerLine));
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    hasExplicitCaretRef.current = true;
    e.target.scrollTop = 0;
    const nextValue = e.target.value;
    const caret = e.target.selectionStart ?? nextValue.length;
    setCaretIndex(caret);
    setCursorPos(getCursorVisualPosition(nextValue, caret, charsPerLine));
    onUpdatePageContent(nextValue, caret);
  };

  // The horizontal rail NEVER moves down. It stays fixed at fixedRailTopPx.
  // The active line (caretPixel.y) is always pinned right above the "T" hammer on the rail,
  // and as more lines are written, the text translates UPWARD into the darkness.
  const stageHeightPx = fixedRailTopPx - 10;
  const activeLineTargetY = stageHeightPx - LINE_HEIGHT_PX - 4;
  const textTranslateY = activeLineTargetY - caretPixel.y;

  const spotlightCenterX = caretPixel.x;

  const intensityMultiplier =
    lampIntensity === 'suave' ? 0.7 : lampIntensity === 'intensa' ? 1.3 : 1.0;

  const textBeforeCaret = fullContent.slice(0, caretIndex);
  const textAfterCaret = fullContent.slice(caretIndex);

  // Single non-nested vertical fade mask on Text Layer A (in paper coordinates)
  // so older lines fade progressively into the dark background as they rise above the rail:
  const activeTop = caretPixel.y;
  const activeBot = caretPixel.y + LINE_HEIGHT_PX + 4;
  const row1Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 1);
  const row2Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 2);
  const row3Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 3);
  const row4Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 4);
  const row5Up = Math.max(0, activeTop - LINE_HEIGHT_PX * 5.2);

  const baseTextVerticalFadeMask =
    activeTop <= 4
      ? `linear-gradient(180deg, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${activeBot}px, rgba(0,0,0,0) ${
          activeBot + 4
        }px)`
      : `linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${row5Up}px, rgba(0,0,0,0.12) ${row4Up}px, rgba(0,0,0,0.26) ${row3Up}px, rgba(0,0,0,0.44) ${row2Up}px, rgba(0,0,0,0.68) ${row1Up}px, rgba(0,0,0,0.92) ${activeTop}px, rgba(0,0,0,0.92) ${activeBot}px, rgba(0,0,0,0) ${
          activeBot + 4
        }px)`;

  // Single non-nested radial spotlight mask on Text Layer B (in paper coordinates)
  // centered at the caret so characters touched by the light beam shine in crisp cream (#FFF6E6)
  // on the active line and fade naturally upward along the beam cone without washing out:
  const spotlightRadiusX =
    lampIntensity === 'suave' ? 115 : lampIntensity === 'intensa' ? 185 : 145;
  const spotlightRadiusY =
    lampIntensity === 'suave' ? 135 : lampIntensity === 'intensa' ? 205 : 170;
  const spotlightMaskGradient = `radial-gradient(ellipse ${spotlightRadiusX}px ${spotlightRadiusY}px at ${spotlightCenterX}px ${
    caretPixel.y + LINE_HEIGHT_PX * 0.55
  }px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 28%, rgba(0,0,0,0.52) 56%, rgba(0,0,0,0.18) 80%, rgba(0,0,0,0) 100%)`;

  const dynamicPaperHeightPx = Math.max(
    800,
    caretPixel.y + LINE_HEIGHT_PX * 10 + 400
  );

  return (
    <div
      ref={containerRef}
      onClick={() => textareaRef.current?.focus()}
      className={`relative w-full flex-1 overflow-hidden flex flex-col items-center justify-start transition-opacity duration-200 cursor-text ${
        pageTurnDirection ? 'opacity-85' : 'opacity-100'
      }`}
      style={{ height: '100vh', minHeight: `${fixedRailTopPx + 180}px` }}
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

        {/* 2. PAPER STAGE ABOVE THE FIXED CENTER RAIL — Clips anything below the horizontal rail */}
        <div
          className="absolute top-0 left-0 right-0 overflow-hidden z-20"
          style={{
            height: `${stageHeightPx}px`,
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

            {/* VISUAL TEXT LAYER A — Muted Nocturnal Ink outside the spotlight cone, fading into darkness as lines rise */}
            <div
              aria-hidden="true"
              style={{
                paddingTop: '0px',
                paddingBottom: '80px',
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
                paddingBottom: '80px',
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
              onKeyUp={syncCaretPosition}
              onSelect={syncCaretPosition}
              aria-label={`Contenido de la hoja ${activePageIndex + 1}`}
              spellCheck={false}
              autoFocus
              style={{
                paddingTop: '0px',
                paddingBottom: '80px',
                paddingLeft: '24px',
                paddingRight: '24px',
                lineHeight: `${LINE_HEIGHT_PX}px`,
                height: `${dynamicPaperHeightPx}px`,
                color: 'transparent',
                caretColor: '#F3D08E',
              }}
              className="relative z-20 w-full overflow-hidden bg-transparent resize-none border-0 focus:outline-none whitespace-pre-wrap break-words font-typewriter text-[18px] tracking-[0.02em] selection:bg-[#D99B4E]/35 selection:text-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
