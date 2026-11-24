import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CloudRain,
  TrainFront,
  Coffee,
  Bug,
  MoonStar,
  Flame,
  Volume2,
  VolumeX,
  Minimize2,
  Sliders,
  BookOpen,
} from 'lucide-react';
import {
  calculateTextMetrics,
  evaluatePageOverflow,
  Notebook,
} from './utils/pagination';
import {
  AmbientTrackId,
  KeySoundType,
  soundEngine,
} from './utils/soundEngine';
import {
  DEFAULT_AMBIENT_TRACKS,
  loadNotebooks,
  loadPreferences,
  saveNotebooks,
  savePreferences,
  UserPreferences,
} from './utils/storage';
import { TypewriterSheet } from './components/TypewriterSheet';
import { NotebookOrganizer } from './components/NotebookOrganizer';
import { AmbientSoundPanel } from './components/AmbientSoundPanel';

const CHARS_PER_LINE = 60;

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => loadNotebooks());
  const [prefs, setPrefs] = useState<UserPreferences>(() =>
    loadPreferences(loadNotebooks()[0]?.id || 'nb-bitacora-nocturna')
  );

  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);
  const [isDistractionFree, setIsDistractionFree] = useState(false);
  const [autoTurnBanner, setAutoTurnBanner] = useState<string | null>(null);

  // Ensure activeNotebook always resolves to a valid notebook
  const activeNotebook = useMemo(() => {
    return (
      notebooks.find((n) => n.id === prefs.activeNotebookId) || notebooks[0]
    );
  }, [notebooks, prefs.activeNotebookId]);

  const activePageIndex = useMemo(() => {
    const maxIdx = Math.max(0, (activeNotebook?.pages.length || 1) - 1);
    return Math.min(Math.max(0, prefs.activePageIndex), maxIdx);
  }, [activeNotebook, prefs.activePageIndex]);

  // Persist notebooks and preferences on change
  useEffect(() => {
    saveNotebooks(notebooks);
  }, [notebooks]);

  useEffect(() => {
    savePreferences(prefs);
  }, [prefs]);

  // Sync audio engine state
  useEffect(() => {
    soundEngine.setMasterKeyVolume(prefs.masterKeyVolume);
    soundEngine.setKeyMuted(prefs.keyMuted);
    soundEngine.setMasterAmbientVolume(
      prefs.masterAmbientVolume,
      prefs.ambientTracks
    );
    soundEngine.setAmbientMuted(prefs.ambientMuted, prefs.ambientTracks);
    soundEngine.syncAmbientTracks(prefs.ambientTracks);
  }, [
    prefs.masterKeyVolume,
    prefs.keyMuted,
    prefs.masterAmbientVolume,
    prefs.ambientMuted,
    prefs.ambientTracks,
  ]);

  // Listen for browser Fullscreen changes or Escape key
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isDistractionFree) {
        // Keep internal distraction-free state synced if user exits native fullscreen via Esc
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isOrganizerOpen) setIsOrganizerOpen(false);
        if (isSoundPanelOpen) setIsSoundPanelOpen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDistractionFree, isOrganizerOpen, isSoundPanelOpen]);

  const triggerAutoTurnNotification = useCallback((newPageNumber: number) => {
    setAutoTurnBanner(`Paso automático a la Hoja ${newPageNumber}`);
    window.setTimeout(() => {
      setAutoTurnBanner(null);
    }, 3200);
  }, []);

  const handlePlayKeySound = useCallback((type: KeySoundType) => {
    soundEngine.playKeySound(type);
  }, []);

  const handleUpdateTitle = (newTitle: string) => {
    if (!activeNotebook) return;
    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === activeNotebook.id
          ? { ...nb, title: newTitle, updatedAt: Date.now() }
          : nb
      )
    );
  };

  const handleUpdatePageContent = (newContent: string) => {
    if (!activeNotebook) return;

    if (prefs.autoTurnPages) {
      const overflow = evaluatePageOverflow(
        newContent,
        prefs.maxLinesPerPage,
        CHARS_PER_LINE
      );

      if (overflow.shouldTurnPage) {
        const now = Date.now();
        const nextIndex = activePageIndex + 1;
        soundEngine.playKeySound('pageturn');

        setNotebooks((prev) =>
          prev.map((nb) => {
            if (nb.id !== activeNotebook.id) return nb;
            const updatedPages = [...nb.pages];
            updatedPages[activePageIndex] = {
              ...updatedPages[activePageIndex],
              content: overflow.currentPageContent,
              updatedAt: now,
            };

            if (
              nextIndex < updatedPages.length &&
              updatedPages[nextIndex].content.trim().length === 0
            ) {
              updatedPages[nextIndex] = {
                ...updatedPages[nextIndex],
                content: overflow.carryOverContent,
                updatedAt: now,
              };
            } else {
              updatedPages.splice(nextIndex, 0, {
                id: `pg-${now}-${Math.random().toString(36).slice(2, 6)}`,
                content: overflow.carryOverContent,
                updatedAt: now,
              });
            }

            return {
              ...nb,
              updatedAt: now,
              pages: updatedPages,
            };
          })
        );

        setPrefs((prev) => ({
          ...prev,
          activePageIndex: nextIndex,
        }));
        triggerAutoTurnNotification(nextIndex + 1);
        return;
      }
    }

    // Normal in-page update
    const now = Date.now();
    setNotebooks((prev) =>
      prev.map((nb) => {
        if (nb.id !== activeNotebook.id) return nb;
        const updatedPages = nb.pages.map((pg, idx) =>
          idx === activePageIndex
            ? { ...pg, content: newContent, updatedAt: now }
            : pg
        );
        return { ...nb, updatedAt: now, pages: updatedPages };
      })
    );
  };

  const handleSelectPage = (index: number) => {
    if (!activeNotebook) return;
    const clamped = Math.max(0, Math.min(index, activeNotebook.pages.length - 1));
    if (clamped !== activePageIndex) {
      soundEngine.playKeySound('pageturn');
    }
    setPrefs((prev) => ({ ...prev, activePageIndex: clamped }));
  };

  const handleCreateNewPage = () => {
    if (!activeNotebook) return;
    const now = Date.now();
    const newPageIndex = activeNotebook.pages.length;
    soundEngine.playKeySound('pageturn');

    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === activeNotebook.id
          ? {
              ...nb,
              updatedAt: now,
              pages: [
                ...nb.pages,
                {
                  id: `pg-${now}-${Math.random().toString(36).slice(2, 6)}`,
                  content: '',
                  updatedAt: now,
                },
              ],
            }
          : nb
      )
    );
    setPrefs((prev) => ({ ...prev, activePageIndex: newPageIndex }));
  };

  const handleDeleteCurrentPage = () => {
    if (!activeNotebook || activeNotebook.pages.length <= 1) return;
    handleDeletePageFromNotebook(activeNotebook.id, activePageIndex);
  };

  const handleSelectNotebookAndPage = (notebookId: string, pageIndex: number) => {
    soundEngine.playKeySound('pageturn');
    setPrefs((prev) => ({
      ...prev,
      activeNotebookId: notebookId,
      activePageIndex: pageIndex,
    }));
  };

  const handleCreateNotebook = (customTitle?: string) => {
    const now = Date.now();
    const newNb: Notebook = {
      id: `nb-${now}`,
      title: customTitle || `Cuaderno Nocturno ${notebooks.length + 1}`,
      createdAt: now,
      updatedAt: now,
      pages: [
        {
          id: `pg-${now}-1`,
          content: '',
          updatedAt: now,
        },
      ],
    };
    soundEngine.playKeySound('pageturn');
    setNotebooks((prev) => [newNb, ...prev]);
    setPrefs((prev) => ({
      ...prev,
      activeNotebookId: newNb.id,
      activePageIndex: 0,
    }));
  };

  const handleDeleteNotebook = (notebookId: string) => {
    if (notebooks.length <= 1) return;
    const remaining = notebooks.filter((nb) => nb.id !== notebookId);
    setNotebooks(remaining);
    if (prefs.activeNotebookId === notebookId) {
      setPrefs((prev) => ({
        ...prev,
        activeNotebookId: remaining[0].id,
        activePageIndex: 0,
      }));
    }
  };

  const handleAddPageToNotebook = (notebookId: string) => {
    const now = Date.now();
    let targetPageIdx = 0;
    setNotebooks((prev) =>
      prev.map((nb) => {
        if (nb.id !== notebookId) return nb;
        targetPageIdx = nb.pages.length;
        return {
          ...nb,
          updatedAt: now,
          pages: [
            ...nb.pages,
            {
              id: `pg-${now}-${Math.random().toString(36).slice(2, 6)}`,
              content: '',
              updatedAt: now,
            },
          ],
        };
      })
    );
    soundEngine.playKeySound('pageturn');
    setPrefs((prev) => ({
      ...prev,
      activeNotebookId: notebookId,
      activePageIndex: targetPageIdx,
    }));
  };

  const handleDeletePageFromNotebook = (
    notebookId: string,
    pageIndex: number
  ) => {
    setNotebooks((prev) =>
      prev.map((nb) => {
        if (nb.id !== notebookId || nb.pages.length <= 1) return nb;
        const nextPages = nb.pages.filter((_, idx) => idx !== pageIndex);
        return {
          ...nb,
          updatedAt: Date.now(),
          pages: nextPages,
        };
      })
    );
    if (prefs.activeNotebookId === notebookId) {
      setPrefs((prev) => ({
        ...prev,
        activePageIndex: Math.max(0, Math.min(prev.activePageIndex, pageIndex - 1)),
      }));
    }
  };

  const handleExportNotebook = () => {
    if (!activeNotebook) return;
    const formatted = activeNotebook.pages
      .map(
        (p, idx) =>
          `--- ${activeNotebook.title} · Hoja ${idx + 1} ---\n\n${p.content}`
      )
      .join('\n\n\n');

    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeNotebook.title || 'cuaderno')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleTrack = (id: AmbientTrackId) => {
    setPrefs((prev) => ({
      ...prev,
      ambientMuted: false,
      ambientTracks: {
        ...prev.ambientTracks,
        [id]: {
          ...prev.ambientTracks[id],
          active: !prev.ambientTracks[id]?.active,
        },
      },
    }));
  };

  const handleChangeTrackVolume = (id: AmbientTrackId, volume: number) => {
    setPrefs((prev) => ({
      ...prev,
      ambientTracks: {
        ...prev.ambientTracks,
        [id]: {
          ...prev.ambientTracks[id],
          volume,
        },
      },
    }));
  };

  const handleApplyPreset = (
    preset: 'lluvia_tren' | 'noche_grillos' | 'cafe_lluvia' | 'silencio'
  ) => {
    if (preset === 'silencio') {
      setPrefs((prev) => ({
        ...prev,
        ambientTracks: { ...DEFAULT_AMBIENT_TRACKS },
      }));
      return;
    }

    const next = { ...DEFAULT_AMBIENT_TRACKS };
    if (preset === 'lluvia_tren') {
      next.lluvia = { active: true, volume: 0.65 };
      next.tren = { active: true, volume: 0.55 };
    } else if (preset === 'noche_grillos') {
      next.noche = { active: true, volume: 0.6 };
      next.grillos = { active: true, volume: 0.45 };
    } else if (preset === 'cafe_lluvia') {
      next.cafeteria = { active: true, volume: 0.5 };
      next.lluvia = { active: true, volume: 0.55 };
    }

    setPrefs((prev) => ({
      ...prev,
      ambientMuted: false,
      ambientTracks: next,
    }));
  };

  const toggleDistractionFree = () => {
    const nextState = !isDistractionFree;
    setIsDistractionFree(nextState);
    setIsOrganizerOpen(false);
    setIsSoundPanelOpen(false);

    if (nextState) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const currentPageContent =
    activeNotebook?.pages[activePageIndex]?.content || '';
  const currentMetrics = useMemo(
    () => calculateTextMetrics(currentPageContent, CHARS_PER_LINE),
    [currentPageContent]
  );

  const activeAmbientCount = Object.values(prefs.ambientTracks).filter(
    (t) => t.active
  ).length;

  const quickAmbientButtons: Array<{
    id: AmbientTrackId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'lluvia', label: 'Lluvia', icon: CloudRain },
    { id: 'tren', label: 'Tren', icon: TrainFront },
    { id: 'cafeteria', label: 'Cafetería', icon: Coffee },
    { id: 'grillos', label: 'Grillos', icon: Bug },
    { id: 'noche', label: 'Noche', icon: MoonStar },
    { id: 'chimenea', label: 'Hoguera', icon: Flame },
  ];

  return (
    <div className="min-h-screen bg-[#14110F] text-[#F2E9D8] flex flex-col relative selection:bg-[#D99B4E]/30">
      {/* Subtle Warm Desk Ambient Radial Vignette */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, rgba(217, 155, 78, 0.065) 0%, rgba(20, 17, 15, 0) 68%)',
        }}
      />

      {/* Top Bar Contract (3 zones separated by gap-8) — hidden in Distraction-Free Fullscreen */}
      {!isDistractionFree && (
        <header className="relative z-30 flex items-center justify-between gap-8 px-6 py-4 border-b border-[#29221D] bg-[#161310]/90 backdrop-blur-sm">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#escritorio"
            onClick={(e) => {
              e.preventDefault();
              setIsOrganizerOpen(false);
              setIsSoundPanelOpen(false);
            }}
            className="font-editorial text-lg font-semibold tracking-tight text-[#F5ECD9] whitespace-nowrap shrink-0"
          >
            Nocturna
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-6 text-sm font-medium text-[#BFB09E]"
          >
            <button
              type="button"
              onClick={() => {
                setIsOrganizerOpen((prev) => !prev);
                setIsSoundPanelOpen(false);
              }}
              className="hover:text-[#F5ECD9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cuadernos ({notebooks.length})
            </button>
            <button
              type="button"
              onClick={handleCreateNewPage}
              className="hover:text-[#F5ECD9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Nueva Hoja
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSoundPanelOpen((prev) => !prev);
                setIsOrganizerOpen(false);
              }}
              className="hover:text-[#F5ECD9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ambiente ({activeAmbientCount})
            </button>
            <button
              type="button"
              onClick={() =>
                setPrefs((prev) => ({
                  ...prev,
                  showRuledLines: !prev.showRuledLines,
                }))
              }
              className="hover:text-[#F5ECD9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Renglones
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={toggleDistractionFree}
              className="px-4 py-2 text-xs font-medium text-[#171310] bg-[#D99B4E] rounded-lg hover:bg-[#E6A95C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pantalla Completa
            </button>
          </div>
        </header>
      )}

      {/* Distraction-Free Fullscreen Floating Exit & Quick Sound Controls */}
      {isDistractionFree && (
        <div className="fixed top-4 right-5 z-40 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSoundPanelOpen((prev) => !prev)}
            aria-label="Abrir mezclador de sonidos ambientales"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[#1E1915]/90 border border-[#382E27] text-[#D8C7B4] hover:text-[#F5ECD9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-[#D99B4E]" />
            <span>Sonidos ({activeAmbientCount})</span>
          </button>
          <button
            type="button"
            onClick={toggleDistractionFree}
            aria-label="Salir de pantalla completa"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[#1E1915]/90 border border-[#382E27] text-[#F0C987] hover:bg-[#29221C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Salir de Pantalla Completa</span>
          </button>
        </div>
      )}

      {/* Main Writing Desk Workspace */}
      <main
        id="escritorio"
        className={`relative z-10 flex-1 flex flex-col justify-between px-4 sm:px-8 ${
          isDistractionFree ? 'pt-16 pb-8' : 'py-6'
        }`}
      >
        {/* Discreet Quick-Access Bar for Ambient Sounds & Organizer */}
        {!isDistractionFree && (
          <div className="w-full max-w-[820px] mx-auto mb-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#1A1613] border border-[#2C241E]">
            {/* Left: Quick ambient sound toggles */}
            <div
              className="flex flex-wrap sm:flex-nowrap items-center gap-1.5"
              role="group"
              aria-label="Sonidos ambientales rápidos"
            >
              {quickAmbientButtons.map((item) => {
                const Icon = item.icon;
                const isActive = prefs.ambientTracks[item.id]?.active;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleTrack(item.id)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#D99B4E]/20 border border-[#D99B4E]/50 text-[#F4C47C]'
                        : 'bg-[#221C18] border border-transparent text-[#A89A8A] hover:text-[#EAE0D0] hover:bg-[#2A231E]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right: Quick mute & mixer/organizer drawer buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setPrefs((prev) => ({ ...prev, keyMuted: !prev.keyMuted }))
                }
                aria-label={
                  prefs.keyMuted
                    ? 'Activar sonido de máquina de escribir'
                    : 'Silenciar máquina de escribir'
                }
                title={
                  prefs.keyMuted
                    ? 'Sonido de teclas silenciado'
                    : 'Sonido mecánico de teclas activo'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-[#221C18] text-[#C8B9A6] hover:text-[#F4EBDC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {prefs.keyMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-[#C97B63]" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#D99B4E]" />
                )}
                <span>Teclas</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSoundPanelOpen(true);
                  setIsOrganizerOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-[#27201B] border border-[#3B3028] text-[#E6DAC8] hover:border-[#D99B4E]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-[#D99B4E]" />
                <span>Ajustar Mezcla</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOrganizerOpen(true);
                  setIsSoundPanelOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-[#27201B] border border-[#3B3028] text-[#E6DAC8] hover:border-[#D99B4E]/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#D99B4E]" />
                <span>Organizador</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Physical Sheet & Dynamic Typewriter Lamp */}
        {activeNotebook && (
          <TypewriterSheet
            notebook={activeNotebook}
            activePageIndex={activePageIndex}
            maxLinesPerPage={prefs.maxLinesPerPage}
            charsPerLine={CHARS_PER_LINE}
            showRuledLines={prefs.showRuledLines}
            lampIntensity={prefs.lampIntensity}
            isDistractionFree={isDistractionFree}
            metrics={currentMetrics}
            autoTurnBanner={autoTurnBanner}
            onUpdateTitle={handleUpdateTitle}
            onUpdatePageContent={handleUpdatePageContent}
            onSelectPage={handleSelectPage}
            onCreateNewPage={handleCreateNewPage}
            onDeleteCurrentPage={handleDeleteCurrentPage}
            onExportNotebook={handleExportNotebook}
            onPlayKeySound={handlePlayKeySound}
          />
        )}

        {/* Quiet Footer */}
        <footer className="w-full max-w-[820px] mx-auto mt-8 pt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E6155]">
          <div>
            Nocturna · Máquina de escribir y bloc de hojas con foco de lectura
          </div>
          <div>
            Pulsa cada tecla para escuchar el mecanismo · Paso automático a las{' '}
            {prefs.maxLinesPerPage} líneas
          </div>
        </footer>
      </main>

      {/* Left Drawer: Notebook & Pages Organizer */}
      <NotebookOrganizer
        isOpen={isOrganizerOpen}
        notebooks={notebooks}
        activeNotebookId={activeNotebook?.id || ''}
        activePageIndex={activePageIndex}
        onClose={() => setIsOrganizerOpen(false)}
        onSelectNotebookAndPage={handleSelectNotebookAndPage}
        onCreateNotebook={handleCreateNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        onAddPageToNotebook={handleAddPageToNotebook}
        onDeletePageFromNotebook={handleDeletePageFromNotebook}
      />

      {/* Right Drawer: Ambient Sound Mixer & Machine Settings */}
      <AmbientSoundPanel
        isOpen={isSoundPanelOpen}
        onClose={() => setIsSoundPanelOpen(false)}
        ambientTracks={prefs.ambientTracks}
        masterKeyVolume={prefs.masterKeyVolume}
        masterAmbientVolume={prefs.masterAmbientVolume}
        keyMuted={prefs.keyMuted}
        ambientMuted={prefs.ambientMuted}
        maxLinesPerPage={prefs.maxLinesPerPage}
        autoTurnPages={prefs.autoTurnPages}
        showRuledLines={prefs.showRuledLines}
        lampIntensity={prefs.lampIntensity}
        onToggleTrack={handleToggleTrack}
        onChangeTrackVolume={handleChangeTrackVolume}
        onApplyPreset={handleApplyPreset}
        onChangeMasterKeyVolume={(vol) =>
          setPrefs((prev) => ({ ...prev, masterKeyVolume: vol, keyMuted: false }))
        }
        onChangeMasterAmbientVolume={(vol) =>
          setPrefs((prev) => ({
            ...prev,
            masterAmbientVolume: vol,
            ambientMuted: false,
          }))
        }
        onToggleKeyMute={() =>
          setPrefs((prev) => ({ ...prev, keyMuted: !prev.keyMuted }))
        }
        onToggleAmbientMute={() =>
          setPrefs((prev) => ({ ...prev, ambientMuted: !prev.ambientMuted }))
        }
        onChangeMaxLinesPerPage={(lines) =>
          setPrefs((prev) => ({ ...prev, maxLinesPerPage: lines }))
        }
        onToggleAutoTurnPages={() =>
          setPrefs((prev) => ({ ...prev, autoTurnPages: !prev.autoTurnPages }))
        }
        onToggleRuledLines={() =>
          setPrefs((prev) => ({ ...prev, showRuledLines: !prev.showRuledLines }))
        }
        onChangeLampIntensity={(intensity) =>
          setPrefs((prev) => ({ ...prev, lampIntensity: intensity }))
        }
        onTestKeySound={() => soundEngine.playKeySound('char')}
      />
    </div>
  );
}
