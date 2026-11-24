import React, { useEffect, useRef, useState } from 'react';
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
  onUpdateTitle: (newTitle: string) => void;
  onUpdatePageContent: (newContent: string, cursorIndex: number) => void;
  onSelectPage: (index: number) => void;
  onCreateNewPage: () => void;
  onDeleteCurrentPage: () => void;
  onExportNotebook: () => void;
  onPlayKeySound: (type: KeySoundType) => void;
}

const LINE_HEIGHT_PX = 34;
const SHEET_PADDING_TOP_PX = 28;
const SHEET_PADDING_X_PX = 44;

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
  onUpdateTitle,
  onUpdatePageContent,
  onSelectPage,
  onCreateNewPage,
  onDeleteCurrentPage,
  onExportNotebook,
  onPlayKeySound,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentPage: PageItem =
    notebook.pages[activePageIndex] || notebook.pages[0];

  const [cursorPos, setCursorPos] = useState<CursorVisualPosition>(() =>
    getCursorVisualPosition(
      currentPage?.content || '',
      (currentPage?.content || '').length,
      charsPerLine
    )
  );
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);
  const [strikePulseKey, setStrikePulseKey] = useState(0);
  const [pageTurnDirection, setPageTurnDirection] = useState<'next' | 'prev' | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const prevPageIndexRef = useRef<number>(activePageIndex);
  const hasExplicitCaretRef = useRef<boolean>(false);

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
    const isFocused = typeof document !== 'undefined' && document.activeElement === el;
    const sel =
      el && (isFocused || hasExplicitCaretRef.current)
        ? el.selectionStart
        : content.length;
    setCursorPos(getCursorVisualPosition(content, sel, charsPerLine));
  }, [currentPage?.content, charsPerLine]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore pure modifier keys
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) {
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
    setStrikePulseKey((prev) => prev + 1);
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
    setCursorPos(
      getCursorVisualPosition(el.value, el.selectionStart ?? el.value.length, charsPerLine)
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    hasExplicitCaretRef.current = true;
    const nextValue = e.target.value;
    const caret = e.target.selectionStart ?? nextValue.length;
    setCursorPos(getCursorVisualPosition(nextValue, caret, charsPerLine));
    onUpdatePageContent(nextValue, caret);
  };

  // Compute physical coordinates for the typewriter carriage & upward light cone
  const clampedRow = Math.min(maxLinesPerPage - 1, Math.max(0, cursorPos.visualRow));
  const colRatio = Math.min(1, Math.max(0, cursorPos.visualCol / Math.max(1, charsPerLine)));

  // Y position right underneath the currently active writing line
  const carriageTopPx = SHEET_PADDING_TOP_PX + (clampedRow + 1) * LINE_HEIGHT_PX;
  // Horizontal percentage across the writing area
  const carriageLeftPercent = colRatio * 94 + 3;

  const intensityMultiplier =
    lampIntensity === 'suave' ? 0.65 : lampIntensity === 'intensa' ? 1.35 : 1.0;

  const sheetMinHeightPx =
    SHEET_PADDING_TOP_PX * 2 + maxLinesPerPage * LINE_HEIGHT_PX + 28;

  const totalPages = notebook.pages.length;

  return (
    <div className="w-full max-w-[820px] mx-auto flex flex-col items-center">
      {/* Subtle Paper Sheet Navigation & Status Header */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-3 px-2 text-xs text-[#A89A8A]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => activePageIndex > 0 && onSelectPage(activePageIndex - 1)}
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
              activePageIndex < totalPages - 1 && onSelectPage(activePageIndex + 1)
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
            Línea {Math.min(maxLinesPerPage, cursorPos.visualRow + 1)}/{maxLinesPerPage}
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
        {/* Subtle stacked background sheets for notebook depth */}
        <div
          aria-hidden="true"
          className="absolute -bottom-2.5 left-3 right-3 h-6 rounded-b-xl bg-[#181411] border border-[#2C241F] opacity-80 pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-1.5 left-1.5 right-1.5 h-6 rounded-b-xl bg-[#1B1714] border border-[#322923] opacity-90 pointer-events-none"
        />

        {/* Primary Physical Typewriter Sheet */}
        <div
          className={`relative w-full rounded-xl bg-[#1D1916] border border-[#382F29] shadow-[0_24px_60px_rgba(0,0,0,0.65)] overflow-hidden transition-all duration-200 ${
            pageTurnDirection === 'next'
              ? 'opacity-90 translate-x-1'
              : pageTurnDirection === 'prev'
              ? 'opacity-90 -translate-x-1'
              : 'opacity-100 translate-x-0'
          }`}
        >
          {/* Sheet Header: Editable Document Title + Brass Folio Number */}
          <div className="flex items-center justify-between gap-4 px-8 sm:px-11 pt-6 pb-4 border-b border-[#2D2520] bg-[#1A1613]/70">
            <input
              type="text"
              value={notebook.title}
              onChange={(e) => onUpdateTitle(e.target.value)}
              aria-label="Título del cuaderno"
              placeholder="Título del cuaderno..."
              className="w-full bg-transparent font-editorial text-lg sm:text-xl font-normal text-[#F3E9D7] placeholder-[#75685A] focus:outline-none focus:text-[#FFF8EB] tracking-tight"
            />
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#8F7F6E] shrink-0 select-none">
              <span>FOLIO #{String(activePageIndex + 1).padStart(2, '0')}</span>
            </div>
          </div>

          {/* Writing Surface with Dynamic Lamp & Carriage */}
          <div
            className="relative w-full"
            style={{ minHeight: `${sheetMinHeightPx}px` }}
          >
            {/* Optional Ruled Notebook Lines */}
            {showRuledLines && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none select-none"
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
                      className={`w-full border-b transition-colors duration-200 flex items-center px-3 ${
                        isActiveRow
                          ? 'border-[#D99B4E]/30 bg-[#E8A856]/[0.03]'
                          : 'border-[#2B241F]/80'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-mono tabular-nums select-none transition-colors ${
                          isActiveRow ? 'text-[#E8A856]/80' : 'text-[#54483E]/60'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dynamic Typewriter Carriage & Upward Warm Light Beam */}
            <div
              aria-hidden="true"
              data-testid="typewriter-carriage-lamp"
              className="absolute left-0 right-0 pointer-events-none select-none transition-all duration-100 ease-out z-10"
              style={{
                top: `${carriageTopPx}px`,
              }}
            >
              {/* Full-width subtle warm ambient glow along the active writing line */}
              <div
                className="absolute -top-[42px] left-6 right-6 h-[46px] rounded-full pointer-events-none transition-opacity duration-300"
                style={{
                  background:
                    'linear-gradient(to top, rgba(235, 168, 78, 0.10), rgba(235, 168, 78, 0.02) 75%, transparent)',
                  opacity: intensityMultiplier,
                }}
              />

              {/* Moving Carriage Assembly tracking the active character column */}
              <div
                key={strikePulseKey > 0 && isActivelyTyping ? 'typing' : 'idle'}
                className={`absolute -translate-x-1/2 transition-all duration-75 ease-out ${
                  isActivelyTyping ? 'animate-carriage-typing' : 'animate-carriage-idle'
                }`}
                style={{
                  left: `${carriageLeftPercent}%`,
                }}
              >
                {/* Wide upward warm spotlight cone illuminating the letters above */}
                <div
                  className="pointer-events-none -translate-x-1/2"
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    left: '50%',
                    width: '280px',
                    height: '115px',
                    background: `radial-gradient(ellipse 65% 85% at 50% 100%, rgba(248, 188, 96, ${
                      0.32 * intensityMultiplier
                    }) 0%, rgba(232, 155, 68, ${
                      0.14 * intensityMultiplier
                    }) 48%, rgba(232, 155, 68, 0) 85%)`,
                    clipPath: 'polygon(36% 100%, 64% 100%, 100% 0%, 0% 0%)',
                    filter: 'blur(4px)',
                  }}
                />

                {/* Focused core beam right under the active word/character */}
                <div
                  className="pointer-events-none -translate-x-1/2"
                  style={{
                    position: 'absolute',
                    bottom: '1px',
                    left: '50%',
                    width: '92px',
                    height: '46px',
                    background: `radial-gradient(ellipse 60% 90% at 50% 100%, rgba(255, 224, 165, ${
                      0.46 * intensityMultiplier
                    }) 0%, rgba(242, 175, 88, ${
                      0.16 * intensityMultiplier
                    }) 55%, transparent 95%)`,
                    filter: 'blur(1.5px)',
                  }}
                />

                {/* Physical miniature brass carriage indicator bar & warm filament LED */}
                <div className="relative flex flex-col items-center">
                  {/* Glowing warm filament head */}
                  <div
                    className="w-7 h-1.5 rounded-full transition-shadow duration-150"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(217,155,78,0.3) 0%, #FFE4B5 50%, rgba(217,155,78,0.3) 100%)',
                      boxShadow: `0 0 ${14 * intensityMultiplier}px ${
                        4 * intensityMultiplier
                      }px rgba(245, 180, 88, 0.72)`,
                    }}
                  />
                  {/* Brass carriage bracket */}
                  <div className="w-11 h-1 mt-0.5 rounded-b bg-[#6E563A] border-t border-[#C89D66]/60 shadow-sm" />
                </div>
              </div>

              {/* Subtle mechanical carriage rail line across the active row */}
              <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-[#D99B4E]/35 to-transparent" />
            </div>

            {/* Monospace Typewriter Textarea */}
            <textarea
              ref={textareaRef}
              value={currentPage?.content || ''}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onClick={syncCaretPosition}
              onKeyUp={syncCaretPosition}
              onSelect={syncCaretPosition}
              aria-label={`Contenido de la hoja ${activePageIndex + 1}`}
              placeholder="Empieza a escribir... Cada tecla encenderá la lámpara del carro y guardará tus palabras automáticamente."
              spellCheck={false}
              style={{
                paddingTop: `${SHEET_PADDING_TOP_PX}px`,
                paddingBottom: `${SHEET_PADDING_TOP_PX}px`,
                paddingLeft: `${SHEET_PADDING_X_PX}px`,
                paddingRight: `${SHEET_PADDING_X_PX}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
                minHeight: `${sheetMinHeightPx}px`,
              }}
              className="relative z-20 w-full bg-transparent resize-none border-0 focus:outline-none font-typewriter text-[16px] sm:text-[17px] text-[#F4EBDC] placeholder-[#6B5E52] tracking-[0.015em] caret-[#F5B963] selection:bg-[#D99B4E]/30"
            />
          </div>

          {/* Sheet Bottom Margin Bar: Page Progress & Auto-Save Confirmation */}
          <div className="px-8 sm:px-11 py-3.5 border-t border-[#2A221E] bg-[#181412]/90 flex flex-wrap items-center justify-between gap-4 text-xs text-[#8C7E70]">
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span>Guardado automático en este navegador</span>
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
