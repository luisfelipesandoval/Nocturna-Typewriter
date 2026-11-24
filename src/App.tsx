import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Cloud,
  LogIn,
  LogOut,
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
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  loadUserNotebooksFromCloud,
  saveNotebookToCloud,
  deleteNotebookFromCloud,
  deletePageFromCloud,
  User,
} from './utils/firebase';
import { TypewriterSheet } from './components/TypewriterSheet';
import { NotebookOrganizer } from './components/NotebookOrganizer';
import { AmbientSoundPanel } from './components/AmbientSoundPanel';

const CHARS_PER_LINE = 60;

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => loadNotebooks());
  const [prefs, setPrefs] = useState<UserPreferences>(() =>
    loadPreferences(loadNotebooks()[0]?.id || 'nb-bitacora-nocturna')
  );

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<
    'idle' | 'syncing' | 'synced' | 'error'
  >('idle');
  const [authBanner, setAuthBanner] = useState<string | null>(null);

  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [isSoundPanelOpen, setIsSoundPanelOpen] = useState(false);
  const [isDistractionFree, setIsDistractionFree] = useState(false);
  const [autoTurnBanner, setAutoTurnBanner] = useState<string | null>(null);

  const cloudSaveTimerRef = useRef<number | null>(null);
  const initialCloudLoadDoneRef = useRef<string | null>(null);

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

  // Listen for Firebase Auth state changes and merge/sync notebooks with Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);

      if (user && initialCloudLoadDoneRef.current !== user.uid) {
        initialCloudLoadDoneRef.current = user.uid;
        setCloudSyncState('syncing');
        try {
          const cloudNotebooks = await loadUserNotebooksFromCloud(user.uid);
          const localNotebooks = loadNotebooks();

          if (cloudNotebooks.length > 0) {
            // Merge any local notebooks that don't exist in cloud yet
            const cloudIds = new Set(cloudNotebooks.map((n) => n.id));
            const unsyncedLocal = localNotebooks.filter(
              (n) => !cloudIds.has(n.id)
            );
            for (const localNb of unsyncedLocal) {
              await saveNotebookToCloud(user.uid, localNb);
            }
            const combined = [...cloudNotebooks, ...unsyncedLocal];
            setNotebooks(combined);
          } else {
            // Upload current local notebooks so user doesn't lose what they wrote
            for (const nb of localNotebooks) {
              await saveNotebookToCloud(user.uid, nb);
            }
          }
          setCloudSyncState('synced');
        } catch (err) {
          console.error('Error syncing notebooks with Google Cloud:', err);
          setCloudSyncState('error');
        }
      } else if (!user) {
        initialCloudLoadDoneRef.current = null;
        setCloudSyncState('idle');
      }
    });

    return () => unsubscribe();
  }, []);

  // Persist notebooks locally and schedule debounced cloud save when authenticated
  useEffect(() => {
    saveNotebooks(notebooks);

    if (!isAuthReady || !currentUser || !activeNotebook) return;
    if (cloudSaveTimerRef.current) {
      window.clearTimeout(cloudSaveTimerRef.current);
    }

    setCloudSyncState('syncing');
    cloudSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveNotebookToCloud(currentUser.uid, activeNotebook);
        setCloudSyncState('synced');
      } catch (err) {
        console.error('Error saving active notebook to Firestore:', err);
        setCloudSyncState('error');
      }
    }, 650);

    return () => {
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
    };
  }, [notebooks, activeNotebook, currentUser, isAuthReady]);

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

  // Listen for Escape key to close drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isOrganizerOpen) setIsOrganizerOpen(false);
        if (isSoundPanelOpen) setIsSoundPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOrganizerOpen, isSoundPanelOpen]);

  const handleGoogleAuthClick = async () => {
    if (currentUser) {
      try {
        await signOutUser();
        setAuthBanner('Sesión de Google cerrada · Guardado local activo');
        window.setTimeout(() => setAuthBanner(null), 3500);
      } catch (err) {
        console.error('Sign-out error:', err);
      }
    } else {
      try {
        setCloudSyncState('syncing');
        const user = await signInWithGoogle();
        setAuthBanner(
          `Conectado con Google (${user.displayName || user.email})`
        );
        window.setTimeout(() => setAuthBanner(null), 3500);
      } catch (err) {
        console.error('Google Sign-In error:', err);
        setCloudSyncState('idle');
        setAuthBanner(
          'No se pudo completar el acceso con Google (ventana cerrada)'
        );
        window.setTimeout(() => setAuthBanner(null), 3500);
      }
    }
  };

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
    const clamped = Math.max(
      0,
      Math.min(index, activeNotebook.pages.length - 1)
    );
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

  const handleSelectNotebookAndPage = (
    notebookId: string,
    pageIndex: number
  ) => {
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

  const handleDeleteNotebook = async (notebookId: string) => {
    if (notebooks.length <= 1) return;
    const targetNb = notebooks.find((nb) => nb.id === notebookId);
    const remaining = notebooks.filter((nb) => nb.id !== notebookId);
    setNotebooks(remaining);
    if (prefs.activeNotebookId === notebookId) {
      setPrefs((prev) => ({
        ...prev,
        activeNotebookId: remaining[0].id,
        activePageIndex: 0,
      }));
    }
    if (currentUser && targetNb) {
      try {
        await deleteNotebookFromCloud(currentUser.uid, targetNb);
      } catch (err) {
        console.error('Error deleting notebook from Firestore:', err);
      }
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

  const handleDeletePageFromNotebook = async (
    notebookId: string,
    pageIndex: number
  ) => {
    const targetNb = notebooks.find((n) => n.id === notebookId);
    const targetPage = targetNb?.pages[pageIndex];

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
        activePageIndex: Math.max(
          0,
          Math.min(prev.activePageIndex, pageIndex - 1)
        ),
      }));
    }
    if (currentUser && targetPage) {
      try {
        await deletePageFromCloud(currentUser.uid, notebookId, targetPage.id);
      } catch (err) {
        console.error('Error deleting page from Firestore:', err);
      }
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

  const cloudStatusLabel = useMemo(() => {
    if (authBanner) return authBanner;
    if (!currentUser) {
      return 'Guardado local · Ingresa con Google para guardar en la nube';
    }
    if (cloudSyncState === 'syncing') {
      return 'Sincronizando con tu cuenta de Google...';
    }
    if (cloudSyncState === 'error') {
      return 'Guardado en navegador (reintentando nube)';
    }
    return `Guardado en Google (${currentUser.displayName || currentUser.email})`;
  }, [authBanner, currentUser, cloudSyncState]);

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

          {/* Zone 2: 5 concise single-line text navigation links */}
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
            <button
              type="button"
              onClick={toggleDistractionFree}
              className="hover:text-[#F5ECD9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pantalla Completa
            </button>
          </nav>

          {/* Zone 3: 1 primary action (Google Sign-In / Cloud Sync Account) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleGoogleAuthClick}
              data-testid="google-auth-button"
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentUser
                  ? 'bg-[#251F1B] border border-[#46392F] text-[#F2E9D8] hover:bg-[#312923]'
                  : 'bg-[#D99B4E] text-[#171310] hover:bg-[#E6A95C]'
              }`}
            >
              {currentUser ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-[#E8A856]" />
                  <span>
                    {currentUser.displayName?.split(' ')[0] || 'Conectado'} · Salir
                  </span>
                  <LogOut className="w-3.5 h-3.5 text-[#A89A8A]" />
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Ingresar con Google</span>
                </>
              )}
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
          <div className="w-full max-w-[840px] mx-auto mb-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#1A1613] border border-[#2C241E]">
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
            cloudStatusLabel={cloudStatusLabel}
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
        <footer className="w-full max-w-[840px] mx-auto mt-8 pt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-[#6E6155]">
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
          setPrefs((prev) => ({
            ...prev,
            masterKeyVolume: vol,
            keyMuted: false,
          }))
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
          setPrefs((prev) => ({
            ...prev,
            showRuledLines: !prev.showRuledLines,
          }))
        }
        onChangeLampIntensity={(intensity) =>
          setPrefs((prev) => ({ ...prev, lampIntensity: intensity }))
        }
        onTestKeySound={() => soundEngine.playKeySound('char')}
      />
    </div>
  );
}
