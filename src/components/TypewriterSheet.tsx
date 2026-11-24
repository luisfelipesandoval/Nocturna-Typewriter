import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Trash2,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  CursorVisualPosition,
  getCursorVisualPosition,
  Notebook,
  PageItem,
  TextMetrics,
} from '../utils/pagination';
import { KeySoundType } from '../utils/soundEngine';

interface TypewriterSheetProps {
  notebook: Notebook;
  activePageIndex: number;
  maxLinesPerPage: number;
  charsPerLine: number;
  showRuledLines: boolean;
  lampIntensity: 'suave' | 'calida' | 'intensa';
  isDistractionFree: boolean;
  metrics: TextMetrics;
  autoTurnBanner: string | null;
  cloudStatusLabel?: string | null;
  onUpdateTitle: (newTitle: string) => void;
  onUpdatePageContent: (newContent: string, cursorIndex: number) => void;
  onSelectPage: (index: number) => void;
  onCreateNewPage: () => void;
  onDeleteCurrentPage: () => void;
  onExportNotebook: () => void;
  onPlayKeySound: (type: KeySoundType) => void;
}

const LINE_HEIGHT_PX = 36;
const SHEET_PADDING_TOP_PX = 88;
const SHEET_PADDING_X_PX = 56;

export const TypewriterSheet: React.FC<TypewriterSheetProps> = ({
  notebook,
  activePageIndex,
  maxLinesPerPage,
  charsPerLine,
  showRuledLines,
  lampIntensity,
  isDistractionFree,
  metrics,
  autoTurnBanner,
  cloudStatusLabel,
  onUpdateTitle,
  onUpdatePageContent,
  onSelectPage,
  onCreateNewPage,
  onDeleteCurrentPage,
  onExportNotebook,
  onPlayKeySound,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorCaretRef = useRef<HTMLSpanElement | null>(null);

  const currentPage: PageItem =
    notebook.pages[activePageIndex] || notebook.pages[0];
  const fullContent = currentPage?.content || '';

  const [caretIndex, setCaretIndex] = useState<number>(() => fullContent.length);
  const [cursorPos, setCursorPos] = useState<CursorVisualPosition>(() =>
    getCursorVisualPosition(fullContent, fullContent.length, charsPerLine)
  );

  // Exact pixel coordinates of the caret inside the writing surface
  const [caretPixel, setCaretPixel] = useState<{ x: number; y: number }>({
    x: SHEET_PADDING_X_PX,
    y: SHEET_PADDING_TOP_PX,
  });

  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [hammerStrike, setHammerStrike] = useState(false);
  const [pageTurnDirection, setPageTurnDirection] = useState<'next' | 'prev' | null>(null);

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

  // Measure exact pixel position of the caret whenever text or caretIndex changes
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
      const timer = window.setTimeout(() => setPageTurnDirection(null), 260);

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
    }, 95);

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

  // The horizontal rail sits directly underneath the active character line
  const railTopPx = caretPixel.y + LINE_HEIGHT_PX + 8;
  // Exact X pixel coordinate of the caret for the carriage & "T" typebar spotlight
  const spotlightCenterX = caretPixel.x;
  const spotlightCenterY = caretPixel.y + LINE_HEIGHT_PX * 0.52;

  const intensityMultiplier =
    lampIntensity === 'suave' ? 0.72 : lampIntensity === 'intensa' ? 1.32 : 1.0;

  const sheetMinHeightPx =
    SHEET_PADDING_TOP_PX * 2 + maxLinesPerPage * LINE_HEIGHT_PX + 42;

  const totalPages = notebook.pages.length;

  const textBeforeCaret = fullContent.slice(0, caretIndex);
  const textAfterCaret = fullContent.slice(caretIndex);

  // Spotlight mask so characters inside the upward beam glow bright bone-white
  // while characters further away rest in cozy dim shadow (matching reference image 1)
  const spotlightRadiusPx =
    lampIntensity === 'suave' ? 135 : lampIntensity === 'intensa' ? 210 : 170;
  const spotlightMaskGradient = `radial-gradient(ellipse ${spotlightRadiusPx}px ${
    spotlightRadiusPx * 1.45
  }px at ${spotlightCenterX}px ${
    spotlightCenterY - 26
  }px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 38%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0) 100%)`;

  return (
    <div className="w-full max-w-[840px] mx-auto flex flex-col items-center">
      {/* Subtle Paper Sheet Navigation & Status Header */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-3 px-2 text-xs text-[#A89A8A]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              activePageIndex > 0 && onSelectPage(activePageIndex - 1)
            }
            disabled={activePageIndex === 0}
            aria-label="Página anterior"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1F1A17] border border-[#332B26] text-[#E6DAC8] hover:bg-[#2A231F] hover:border-[#4A3E36] disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Anterior</span>
          </button>

          <div
            className="px-3 py-1.5 text-xs font-mono tabular-nums text-[#E6DAC8] select-none whitespace-nowrap"
            data-testid="page-indicator"
          >
            Hoja {activePageIndex + 1} de {totalPages}
          </div>

          <button
            type="button"
            onClick={() =>
              activePageIndex < totalPages - 1 &&
              onSelectPage(activePageIndex + 1)
            }
            disabled={activePageIndex >= totalPages - 1}
            aria-label="Página siguiente"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1F1A17] border border-[#332B26] text-[#E6DAC8] hover:bg-[#2A231F] hover:border-[#4A3E36] disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Siguiente</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onCreateNewPage}
            aria-label="Añadir nueva hoja al cuaderno"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#26201C] border border-[#3D322B] text-[#F0C987] hover:bg-[#322923] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Nueva hoja</span>
          </button>
        </div>

        {/* Right: Line capacity indicator & quick page actions */}
        <div className="flex items-center gap-3 font-mono tabular-nums">
          {autoTurnBanner && (
            <span
              role="status"
              className="text-[#F2B866] flex items-center gap-1.5 animate-fade-in"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{autoTurnBanner}</span>
            </span>
          )}
          <span>
            Línea {Math.min(maxLinesPerPage, clampedRow + 1)}/{maxLinesPerPage}
          </span>
          <span aria-hidden="true">·</span>
          <span>{metrics.words} palabras</span>
          {!isDistractionFree && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onExportNotebook}
                title="Descargar cuaderno en texto (.txt)"
                className="inline-flex items-center gap-1 text-[#C8B9A6] hover:text-[#F5E9D6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar</span>
              </button>
              {totalPages > 1 && (
                <button
                  type="button"
                  onClick={onDeleteCurrentPage}
                  title="Eliminar esta hoja"
                  aria-label="Eliminar hoja actual"
                  className="inline-flex items-center gap-1 text-[#A67B6B] hover:text-[#E59882] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Physical Stacked Paper Sheets Wrapper */}
      <div className="relative w-full">
        <div
          aria-hidden="true"
          className="absolute -bottom-2.5 left-3 right-3 h-6 rounded-b-xl bg-[#161310] border border-[#28211C] opacity-80 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-1.5 left-1.5 right-1.5 h-6 rounded-b-xl bg-[#1A1613] border border-[#2F2721] opacity-90 pointer-events-none"
        />

        {/* Primary Physical Typewriter Sheet */}
        <div
          className={`relative w-full rounded-xl bg-[#211C17] border border-[#362D26] shadow-[0_28px_70px_rgba(0,0,0,0.75)] overflow-hidden transition-all duration-200 ${
            pageTurnDirection === 'next'
              ? 'opacity-90 translate-x-1'
              : pageTurnDirection === 'prev'
              ? 'opacity-90 -translate-x-1'
              : 'opacity-100 translate-x-0'
          }`}
        >
          {/* Sheet Header: Editable Document Title + Brass Folio Number */}
          <div className="relative z-20 flex items-center justify-between gap-4 px-8 sm:px-14 pt-6 pb-3 border-b border-[#2D251F]/60 bg-transparent">
            <input
              type="text"
              value={notebook.title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              aria-label="Título del cuaderno"
              placeholder="Título del cuaderno..."
              className="w-full bg-transparent font-editorial text-lg sm:text-xl font-normal text-[#EADFCB] placeholder-[#6E6254] focus:outline-none focus:text-[#FFF8EB] tracking-tight"
            />
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#8A7B6A] shrink-0 select-none">
              <span>FOLIO #{String(activePageIndex + 1).padStart(2, '0')}</span>
            </div>
          </div>

          {/* Writing Surface with Volumetric Character-Following Lamp & Carriage */}
          <div
            className="relative w-full"
            style={{ minHeight: `${sheetMinHeightPx}px` }}
          >
            {/* Optional Subtle Ruled Notebook Lines */}
            {showRuledLines && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none select-none z-0"
                style={{
                  paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                }}
              >
                {Array.from({ length: maxLinesPerPage }).map((_, idx) => {
                  const isActiveRow = idx === clampedRow;
                  return (
                    <div
                      key={idx}
                      style={{ height: `${LINE_HEIGHT_PX}px` }}
                      className={`w-full border-b transition-colors duration-200 flex items-center px-4 ${
                        isActiveRow
                          ? 'border-[#544436]/40'
                          : 'border-[#2B231D]/55'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-mono tabular-nums select-none transition-colors ${
                          isActiveRow
                            ? 'text-[#B59263]/70'
                            : 'text-[#4D4238]/55'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 1. VOLUMETRIC UPWARD LIGHT CONE + CARRIAGE RAIL + CAPSULE WITH "T" HAMMER (Matches Reference Image 1) */}
            <div
              aria-hidden="true"
              data-testid="typewriter-carriage-lamp"
              className="absolute left-0 right-0 pointer-events-none select-none z-10"
              style={{
                top: `${railTopPx}px`,
              }}
            >
              {/* Horizontal bronze/brown carriage track rail running across the sheet */}
              <div
                className="w-full h-[2px]"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(84,65,48,0.35) 0%, #6E563F 15%, #84684D 50%, #6E563F 85%, rgba(84,65,48,0.35) 100%)',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.85)',
                }}
              />

              {/* Moving Carriage Assembly locked to exact caretPixel.x */}
              <div
                className={`absolute top-0 -translate-x-1/2 ${
                  isActivelyTyping ? '' : 'animate-carriage-idle'
                }`}
                style={{
                  left: `${spotlightCenterX}px`,
                }}
              >
                {/* Wide Tall Volumetric Spotlight Cone fanning upward from the "T" tip */}
                <div
                  className="pointer-events-none -translate-x-1/2"
                  style={{
                    position: 'absolute',
                    bottom: '13px',
                    left: '50%',
                    width: '540px',
                    height: '330px',
                    background: `conic-gradient(from -36deg at 50% 100%, transparent 0deg, rgba(226, 189, 138, ${
                      0.04 * intensityMultiplier
                    }) 10deg, rgba(235, 199, 148, ${
                      0.26 * intensityMultiplier
                    }) 25deg, rgba(250, 222, 178, ${
                      0.42 * intensityMultiplier
                    }) 36deg, rgba(235, 199, 148, ${
                      0.26 * intensityMultiplier
                    }) 47deg, rgba(226, 189, 138, ${
                      0.04 * intensityMultiplier
                    }) 62deg, transparent 72deg)`,
                    maskImage:
                      'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.85) 55%, transparent 98%)',
                    WebkitMaskImage:
                      'radial-gradient(ellipse 68% 96% at 50% 100%, black 0%, rgba(0,0,0,0.85) 55%, transparent 98%)',
                    filter: 'blur(8px)',
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
                  className={`relative flex flex-col items-center -mt-[13px] transition-transform duration-75 ${
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
                    className="w-[2.5px] h-[9px]"
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
                      '0 4px 10px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 250, 240, 0.8)',
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
                paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                paddingBottom: `${SHEET_PADDING_TOP_PX}px`,
                paddingLeft: `${SHEET_PADDING_X_PX}px`,
                paddingRight: `${SHEET_PADDING_X_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
              }}
              className="absolute inset-0 pointer-events-none invisible whitespace-pre-wrap break-words font-typewriter text-[17px] tracking-[0.02em]"
            >
              <span>{textBeforeCaret}</span>
              <span
                ref={mirrorCaretRef}
                data-testid="caret-pixel-anchor"
                className="inline-block w-0 h-[17px] align-baseline"
              />
              <span>{textAfterCaret || ' '}</span>
            </div>

            {/* 3. VISUAL TEXT LAYER A — Dimmed Nocturnal Ink outside the spotlight beam (e.g., "hola que" in reference) */}
            <div
              aria-hidden="true"
              style={{
                paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                paddingBottom: `${SHEET_PADDING_TOP_PX}px`,
                paddingLeft: `${SHEET_PADDING_X_PX}px`,
                paddingRight: `${SHEET_PADDING_X_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
              }}
              className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter text-[17px] tracking-[0.02em] text-[#7D7163] z-15"
            >
              {fullContent ? (
                fullContent
              ) : (
                <span className="text-[#594E43]">
                  Empieza a escribir... El foco seguirá e iluminará cada nuevo carácter.
                </span>
              )}
            </div>

            {/* 4. VISUAL TEXT LAYER B — Bright Illuminated Cream Ink inside the spotlight cone (e.g., "hondadssdsdsds" in reference) */}
            <div
              aria-hidden="true"
              data-testid="spotlight-illuminated-text"
              style={{
                paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                paddingBottom: `${SHEET_PADDING_TOP_PX}px`,
                paddingLeft: `${SHEET_PADDING_X_PX}px`,
                paddingRight: `${SHEET_PADDING_X_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
                maskImage: spotlightMaskGradient,
                WebkitMaskImage: spotlightMaskGradient,
                textShadow: '0 0 12px rgba(252, 215, 151, 0.35)',
              }}
              className="absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words font-typewriter font-medium text-[17px] tracking-[0.02em] text-[#FAF0DF] z-15"
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
              style={{
                paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                paddingBottom: `${SHEET_PADDING_TOP_PX}px`,
                paddingLeft: `${SHEET_PADDING_X_PX}px`,
                paddingRight: `${SHEET_PADDING_X_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
                minHeight: `${sheetMinHeightPx}px`,
                color: 'transparent',
                caretColor: '#E8C382',
              }}
              className="relative z-20 w-full bg-transparent resize-none border-0 focus:outline-none whitespace-pre-wrap break-words font-typewriter text-[17px] tracking-[0.02em] selection:bg-[#D99B4E]/35 selection:text-transparent"
            />
          </div>

          {/* Sheet Bottom Margin Bar: Cloud / Local Save Status & Page Numbers */}
          <div className="relative z-20 px-8 sm:px-14 py-3.5 border-t border-[#2A221E] bg-[#181412]/90 flex flex-wrap items-center justify-between gap-4 text-xs text-[#8C7E70]">
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span>
                {cloudStatusLabel || 'Guardado automático en este navegador'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{metrics.characters} caracteres</span>
              <span aria-hidden="true">·</span>
              <span>~{metrics.readingMinutes} min de lectura</span>
            </div>

            {/* Quick Page Dots / Numbers */}
            <div className="flex items-center gap-1.5">
              {notebook.pages.map((pg, idx) => {
                const isCurrent = idx === activePageIndex;
                return (
                  <button
                    key={pg.id}
                    type="button"
                    onClick={() => onSelectPage(idx)}
                    aria-label={`Ir a la hoja ${idx + 1}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`w-6 h-6 rounded text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#D99B4E] text-[#171310] font-semibold'
                        : 'bg-[#251F1B] text-[#A89A8A] hover:bg-[#332B25] hover:text-[#F2E9D8]'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
