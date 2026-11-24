import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Lightbulb,
  Hourglass,
  Share,
  MoreHorizontal,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Flame,
  X,
  Pause,
  Play,
  RotateCcw,
  ClipboardCopy,
  FileDown,
  FileText,
  FileType,
  BookPlus,
  FilePlus,
  Trash2,
  CloudRain,
  TrainFront,
  Coffee,
  Bug,
  MoonStar,
  Maximize2,
  Minimize2,
  LogIn,
  LogOut,
  Smartphone,
  AlertTriangle,
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
  createBlankDraftNotebook,
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
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  checkGoogleRedirectResult,
  parseFirebaseAuthError,
  ParsedAuthError,
  signOutUser,
  loadUserNotebooksFromCloud,
  saveNotebookToCloud,
  deleteNotebookFromCloud,
  deletePageFromCloud,
  User,
} from './utils/firebase';
import { TypewriterSheet } from './components/TypewriterSheet';

const CHARS_PER_LINE = 60;
const DAILY_WORD_GOAL = 500;

type ActivePopover =
  | null
  | 'library'
  | 'timer'
  | 'export'
  | 'more'
  | 'sound'
  | 'account';

const AMBIENT_TRACK_ITEMS: Array<{
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

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => loadNotebooks());
  const [prefs, setPrefs] = useState<UserPreferences>(() =>
    loadPreferences(loadNotebooks()[0]?.id || 'draft-initial')
  );

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<
    'idle' | 'syncing' | 'synced' | 'error'
  >('idle');
  const [authBanner, setAuthBanner] = useState<string | null>(null);
  const [authErrorDetail, setAuthErrorDetail] =
    useState<ParsedAuthError | null>(null);
  const [copiedDomainFeedback, setCopiedDomainFeedback] = useState(false);

  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [isDistractionFree, setIsDistractionFree] = useState(false);
  const [autoTurnBanner, setAutoTurnBanner] = useState<string | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // Pomodoro Writing Session Timer (25:00 default)
  const [timerDurationSec, setTimerDurationSec] = useState(25 * 60);
  const [timerRemainingSec, setTimerRemainingSec] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const cloudSaveTimerRef = useRef<number | null>(null);
  const initialCloudLoadDoneRef = useRef<string | null>(null);

  const activeNotebook = useMemo(() => {
    return (
      notebooks.find((n) => n.id === prefs.activeNotebookId) || notebooks[0]
    );
  }, [notebooks, prefs.activeNotebookId]);

  const activePageIndex = useMemo(() => {
    const maxIdx = Math.max(0, (activeNotebook?.pages.length || 1) - 1);
    return Math.min(Math.max(0, prefs.activePageIndex), maxIdx);
  }, [activeNotebook, prefs.activePageIndex]);

  // Check if returning from mobile Google Redirect login (e.g. on Vercel mobile)
  useEffect(() => {
    checkGoogleRedirectResult()
      .then((user) => {
        if (user) {
          setAuthErrorDetail(null);
          setAuthBanner(
            `Conectado (${user.displayName?.split(' ')[0] || user.email})`
          );
          window.setTimeout(() => setAuthBanner(null), 3000);
        }
      })
      .catch((err) => {
        const parsed = parseFirebaseAuthError(err);
        setAuthErrorDetail(parsed);
        setActivePopover('account');
      });
  }, []);

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

          // Keep only local notebooks where the user has actually written something
          const writtenLocal = localNotebooks.filter((n) =>
            n.pages.some((p) => p.content.trim().length > 0)
          );

          const cloudIds = new Set(cloudNotebooks.map((n) => n.id));
          const unsyncedLocal = writtenLocal.filter((n) => !cloudIds.has(n.id));

          for (const localNb of unsyncedLocal) {
            await saveNotebookToCloud(user.uid, localNb);
          }

          // Always start login session on a fresh blank draft sheet on the desk,
          // while keeping any saved cloud notebooks in Tu biblioteca
          const freshDraft = createBlankDraftNotebook();
          const combined = [freshDraft, ...cloudNotebooks, ...unsyncedLocal];
          setNotebooks(combined);
          setPrefs((prev) => ({
            ...prev,
            activeNotebookId: freshDraft.id,
            activePageIndex: 0,
          }));
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
    const hasContent = activeNotebook.pages.some(
      (p) => p.content.trim().length > 0
    );
    if (activeNotebook.id.startsWith('draft-') && !hasContent) {
      return;
    }

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

  // Pomodoro writing session timer interval
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = window.setInterval(() => {
      setTimerRemainingSec((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          soundEngine.playKeySound('enter');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Synchronous popup trigger for PC & Mobile
  const handleDirectGooglePopupLogin = async () => {
    try {
      // IMPORTANT: Call signInWithGooglePopup immediately before any state setter
      // so mobile & desktop popup blockers recognize the direct user click gesture
      const user = await signInWithGooglePopup();
      setAuthErrorDetail(null);
      setActivePopover(null);
      setAuthBanner(
        `Conectado (${user.displayName?.split(' ')[0] || user.email})`
      );
      window.setTimeout(() => setAuthBanner(null), 2800);
    } catch (err) {
      const parsed = parseFirebaseAuthError(err);
      setAuthErrorDetail(parsed);
      setCloudSyncState('idle');

      // If on mobile / standalone domain (like Vercel) and popup was blocked, offer or trigger redirect
      const isStandaloneWindow =
        typeof window !== 'undefined' && window.self === window.top;
      if (parsed.isPopupBlocked && isStandaloneWindow) {
        try {
          await signInWithGoogleRedirect();
          return;
        } catch (redirErr) {
          setAuthErrorDetail(parseFirebaseAuthError(redirErr));
        }
      }
      setActivePopover('account');
    }
  };

  const handleGoogleRedirectLogin = async () => {
    try {
      setAuthErrorDetail(null);
      await signInWithGoogleRedirect();
    } catch (err) {
      setAuthErrorDetail(parseFirebaseAuthError(err));
      setActivePopover('account');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setActivePopover(null);
      setAuthBanner('Sesión cerrada');
      window.setTimeout(() => setAuthBanner(null), 2800);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const triggerAutoTurnNotification = useCallback((newPageNumber: number) => {
    setAutoTurnBanner(`Hoja ${newPageNumber}`);
    window.setTimeout(() => {
      setAutoTurnBanner(null);
    }, 2600);
  }, []);

  const handlePlayKeySound = useCallback((type: KeySoundType) => {
    soundEngine.playKeySound(type);
  }, []);

  const deriveTitleFromText = (text: string, fallback: string): string => {
    const firstLine = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!firstLine) return fallback;
    return firstLine.slice(0, 28);
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

            const autoTitle =
              activePageIndex === 0 &&
              (nb.title === 'Sin título' || nb.title === 'Hoja en Blanco')
                ? deriveTitleFromText(overflow.currentPageContent, nb.title)
                : nb.title;

            return {
              ...nb,
              title: autoTitle,
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
        const autoTitle =
          activePageIndex === 0
            ? deriveTitleFromText(newContent, 'Sin título')
            : nb.title;
        return {
          ...nb,
          title: autoTitle,
          updatedAt: now,
          pages: updatedPages,
        };
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

  const handleCreateLoosePage = () => {
    const now = Date.now();
    const newNb: Notebook = {
      id: `note-${now}`,
      title: 'Sin título',
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
    setActivePopover(null);
  };

  const handleCreateNewBook = () => {
    const now = Date.now();
    const bookCount =
      notebooks.filter((n) => n.id.startsWith('book-')).length + 1;
    const newBook: Notebook = {
      id: `book-${now}`,
      title: `Libro ${bookCount}`,
      createdAt: now,
      updatedAt: now,
      pages: [
        {
          id: `pg-${now}-1`,
          content: '',
          updatedAt: now,
        },
        {
          id: `pg-${now}-2`,
          content: '',
          updatedAt: now,
        },
      ],
    };
    soundEngine.playKeySound('pageturn');
    setNotebooks((prev) => [newBook, ...prev]);
    setPrefs((prev) => ({
      ...prev,
      activeNotebookId: newBook.id,
      activePageIndex: 0,
    }));
    setActivePopover(null);
  };

  const handleAddChapterPageToCurrent = () => {
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

  const handleDeleteNotebook = async (notebookId: string) => {
    const targetNb = notebooks.find((nb) => nb.id === notebookId);
    const remaining = notebooks.filter((nb) => nb.id !== notebookId);
    const nextList =
      remaining.length > 0 ? remaining : [createBlankDraftNotebook()];
    setNotebooks(nextList);
    if (prefs.activeNotebookId === notebookId) {
      setPrefs((prev) => ({
        ...prev,
        activeNotebookId: nextList[0].id,
        activePageIndex: 0,
      }));
    }
    if (currentUser && targetNb && !targetNb.id.startsWith('draft-')) {
      try {
        await deleteNotebookFromCloud(currentUser.uid, targetNb);
      } catch (err) {
        console.error('Error deleting notebook from Firestore:', err);
      }
    }
  };

  const handleDeleteCurrentPage = async () => {
    if (!activeNotebook || activeNotebook.pages.length <= 1) return;
    const targetPage = activeNotebook.pages[activePageIndex];
    const nextIdx = Math.max(0, activePageIndex - 1);

    setNotebooks((prev) =>
      prev.map((nb) =>
        nb.id === activeNotebook.id
          ? {
              ...nb,
              updatedAt: Date.now(),
              pages: nb.pages.filter((_, i) => i !== activePageIndex),
            }
          : nb
      )
    );
    setPrefs((prev) => ({ ...prev, activePageIndex: nextIdx }));

    if (currentUser && targetPage) {
      try {
        await deletePageFromCloud(
          currentUser.uid,
          activeNotebook.id,
          targetPage.id
        );
      } catch (err) {
        console.error('Error deleting page from Firestore:', err);
      }
    }
  };

  const getFullNotebookText = () => {
    if (!activeNotebook) return '';
    return activeNotebook.pages.map((p) => p.content).join('\n\n');
  };

  const handleCopyText = async () => {
    const text = getFullNotebookText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFeedback(true);
      window.setTimeout(() => {
        setCopiedFeedback(false);
        setActivePopover(null);
      }, 1100);
    } catch {}
  };

  const handleExportTxt = () => {
    if (!activeNotebook) return;
    const formatted = getFullNotebookText();
    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeNotebook.title || 'nota')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActivePopover(null);
  };

  const handleExportWord = () => {
    if (!activeNotebook) return;
    const text = getFullNotebookText()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:'Courier New',Courier,monospace;font-size:12pt;line-height:1.6;margin:2in 1.2in;color:#1F1A14;}</style></head><body>${text}</body></html>`;
    const blob = new Blob([htmlDoc], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeNotebook.title || 'nota')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActivePopover(null);
  };

  const handleExportTypewrittenPdf = () => {
    if (!activeNotebook) return;
    const text = getFullNotebookText()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const htmlSheet = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${activeNotebook.title}</title><style>@page{margin:22mm;}body{background:#F7F1E5;color:#231D16;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:13pt;line-height:1.75;padding:32px;max-width:680px;margin:0 auto;white-space:pre-wrap;}</style></head><body>${text}</body></html>`;
    const blob = new Blob([htmlSheet], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeNotebook.title || 'papel-mecanografiado')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')}-mecanografiado.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActivePopover(null);
  };

  const handleCycleLampIntensity = () => {
    const order: Array<'suave' | 'calida' | 'intensa'> = [
      'calida',
      'intensa',
      'suave',
    ];
    const nextIdx = (order.indexOf(prefs.lampIntensity) + 1) % order.length;
    setPrefs((prev) => ({ ...prev, lampIntensity: order[nextIdx] }));
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

  const toggleDistractionFree = () => {
    const nextState = !isDistractionFree;
    setIsDistractionFree(nextState);
    setActivePopover(null);

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

  const totalWordsAllPages = useMemo(() => {
    const allText = notebooks
      .flatMap((nb) => nb.pages.map((p) => p.content))
      .join(' ');
    return calculateTextMetrics(allText, CHARS_PER_LINE).words;
  }, [notebooks]);

  const activeAmbientCount = Object.values(prefs.ambientTracks).filter(
    (t) => t.active
  ).length;

  const userInitial = useMemo(() => {
    if (!currentUser) return 'G';
    const source = currentUser.displayName || currentUser.email || 'Usuario';
    return source.trim().charAt(0).toUpperCase();
  }, [currentUser]);

  const totalPages = activeNotebook?.pages.length || 1;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerProgressRatio =
    timerDurationSec > 0
      ? Math.max(0, Math.min(1, 1 - timerRemainingSec / timerDurationSec))
      : 0;

  // Library lists: only show books or pages that were actually written or created by the user
  // (never pre-populate an untouched initial blank draft in Tu biblioteca)
  const booksList = notebooks.filter(
    (nb) => nb.id.startsWith('book-') || nb.pages.length > 1
  );
  const loosePagesList = notebooks.filter(
    (nb) =>
      !nb.id.startsWith('book-') &&
      nb.pages.length <= 1 &&
      (!nb.id.startsWith('draft-') ||
        nb.pages.some((p) => p.content.trim().length > 0))
  );

  return (
    <div className="min-h-screen bg-[#1F1A14] text-[#F2E9D8] flex flex-col relative overflow-x-hidden selection:bg-[#D99B4E]/30">
      {/* TOP-LEFT FLOATING CREAM PILL — No logo, only active note selector & Guardado */}
      <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
        <div className="inline-flex items-center gap-2.5 px-2.5 py-1.5 rounded-full bg-[#D7CEC1] text-[#28211A] shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            onClick={() =>
              setActivePopover((prev) =>
                prev === 'library' ? null : 'library'
              )
            }
            aria-label="Abrir biblioteca de páginas y libros"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors max-w-[160px] truncate cursor-pointer ${
              activePopover === 'library'
                ? 'bg-[#C4B8A8] text-[#1D1610]'
                : 'bg-[#C9BFB0]/65 text-[#2F261D] hover:bg-[#C4B8A8]'
            }`}
          >
            <span className="truncate">
              {activeNotebook?.title || 'Sin título'}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-75" />
          </button>

          {/* Save status indicator */}
          <span className="inline-flex items-center gap-1 pr-1.5 text-[11px] text-[#6B5F52] whitespace-nowrap select-none">
            <Check className="w-3 h-3 text-[#5A5044]" />
            <span>
              {authBanner
                ? authBanner
                : cloudSyncState === 'syncing'
                ? 'Guardando...'
                : 'Guardado'}
            </span>
          </span>
        </div>

        {/* Subtle Page Switcher Pill when active notebook/book has multiple sheets */}
        {(totalPages > 1 || autoTurnBanner) && (
          <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#D7CEC1] text-[#2B231B] text-xs font-mono tabular-nums shadow-md">
            <button
              type="button"
              onClick={() =>
                activePageIndex > 0 && handleSelectPage(activePageIndex - 1)
              }
              disabled={activePageIndex === 0}
              aria-label="Página anterior"
              className="p-0.5 hover:text-[#000] disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span data-testid="page-indicator">
              Hoja {activePageIndex + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                activePageIndex < totalPages - 1 &&
                handleSelectPage(activePageIndex + 1)
              }
              disabled={activePageIndex >= totalPages - 1}
              aria-label="Página siguiente"
              className="p-0.5 hover:text-[#000] disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleAddChapterPageToCurrent}
              title="Añadir nueva hoja a este cuaderno"
              aria-label="Añadir nueva hoja al cuaderno"
              className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#C4B8A8] text-[#282018] font-sans font-semibold text-[11px] hover:bg-[#B8AC9B] cursor-pointer"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* POPOVER 1: "Tu biblioteca" (Starts with zero pre-made pages until user writes or creates one) */}
      {activePopover === 'library' && (
        <div
          role="dialog"
          aria-label="Tu biblioteca"
          className="fixed top-16 left-4 z-40 w-[335px] rounded-[22px] bg-[#F4EDE1] text-[#35281E] shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-1.5"
        >
          <div className="rounded-[18px] border border-dashed border-[#D3C6B4] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-xl font-normal text-[#2E2218]">
                Tu biblioteca
              </h2>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                aria-label="Cerrar biblioteca"
                className="p-1 text-[#6E5D4D] hover:text-[#2E2218] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* LIBROS section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-[#8C735B]">
                  LIBROS
                </span>
                <button
                  type="button"
                  onClick={handleCreateNewBook}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-dashed border-[#B7A691] text-xs font-medium text-[#3B2E22] hover:bg-[#EAE0D0] transition-colors cursor-pointer"
                >
                  <BookPlus className="w-3.5 h-3.5 text-[#7A624B]" />
                  <span>Libro nuevo</span>
                </button>
              </div>

              {booksList.length === 0 ? (
                <div className="rounded-xl bg-[#EAE0D0]/90 py-3.5 px-3 text-center font-editorial italic text-xs text-[#6B5A48]">
                  Reúne páginas en un libro, capítulo a capítulo.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {booksList.map((book) => {
                    const isSelected = book.id === activeNotebook?.id;
                    const bookWords = calculateTextMetrics(
                      book.pages.map((p) => p.content).join(' '),
                      CHARS_PER_LINE
                    ).words;
                    return (
                      <div
                        key={book.id}
                        className={`group rounded-xl p-3 flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[#FAF5EC] shadow-xs border border-[#DFD3C2]'
                            : 'bg-[#EDE4D5]/70 hover:bg-[#FAF5EC]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playKeySound('pageturn');
                            setPrefs((prev) => ({
                              ...prev,
                              activeNotebookId: book.id,
                              activePageIndex: 0,
                            }));
                            setActivePopover(null);
                          }}
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="font-editorial text-sm text-[#2A1F16] truncate">
                            {book.title}
                          </div>
                          <div className="text-[11px] text-[#7D6B58]">
                            {book.pages.length} hojas · {bookWords}{' '}
                            {bookWords === 1 ? 'palabra' : 'palabras'}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNotebook(book.id)}
                          aria-label={`Eliminar ${book.title}`}
                          className="p-1 text-[#9E8770] hover:text-[#B54B32] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SUELTAS section */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-[#8C735B]">
                  SUELTAS
                </span>
                <button
                  type="button"
                  onClick={handleCreateLoosePage}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-dashed border-[#B7A691] text-xs font-medium text-[#3B2E22] hover:bg-[#EAE0D0] transition-colors cursor-pointer"
                >
                  <FilePlus className="w-3.5 h-3.5 text-[#7A624B]" />
                  <span>Página nueva</span>
                </button>
              </div>

              {loosePagesList.length === 0 ? (
                <div className="rounded-xl bg-[#EAE0D0]/90 py-3.5 px-3 text-center font-editorial italic text-xs text-[#6B5A48]">
                  Aún no hay páginas guardadas. Empieza a escribir en el
                  escritorio.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {loosePagesList.map((note) => {
                    const isSelected = note.id === activeNotebook?.id;
                    const noteWords = calculateTextMetrics(
                      note.pages[0]?.content || '',
                      CHARS_PER_LINE
                    ).words;
                    return (
                      <div
                        key={note.id}
                        className={`group rounded-xl p-3 flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[#FAF5EC] shadow-xs border border-[#DFD3C2]'
                            : 'bg-[#EDE4D5]/70 hover:bg-[#FAF5EC]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playKeySound('pageturn');
                            setPrefs((prev) => ({
                              ...prev,
                              activeNotebookId: note.id,
                              activePageIndex: 0,
                            }));
                            setActivePopover(null);
                          }}
                          className="text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="font-editorial text-sm text-[#2A1F16] truncate">
                            {note.title || 'Sin título'}
                          </div>
                          <div className="text-[11px] text-[#7D6B58]">
                            {isSelected ? 'En el escritorio · ' : ''}
                            {noteWords}{' '}
                            {noteWords === 1 ? 'palabra' : 'palabras'}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteNotebook(note.id)}
                          aria-label={`Eliminar ${note.title}`}
                          className="p-1 text-[#9E8770] hover:text-[#B54B32] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOP-RIGHT FLOATING CREAM CONTROLS */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <div className="inline-flex items-center gap-2.5 px-3 py-1 rounded-full bg-[#D7CEC1] text-[#2B231B] shadow-[0_6px_20px_rgba(0,0,0,0.45)]">
          {/* 1. Lightbulb: Lamp intensity */}
          <button
            type="button"
            onClick={handleCycleLampIntensity}
            aria-label="Cambiar intensidad del foco de luz"
            title={`Intensidad del foco: ${prefs.lampIntensity}`}
            className="p-1 text-[#382E24] hover:text-[#0F0C09] transition-colors cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5" />
          </button>

          {/* 2. Hourglass: Writing Session Pomodoro Timer */}
          <button
            type="button"
            onClick={() =>
              setActivePopover((prev) => (prev === 'timer' ? null : 'timer'))
            }
            aria-label="Sesión de escritura Pomodoro"
            className={`inline-flex items-center gap-1.5 rounded-full transition-colors cursor-pointer ${
              isTimerRunning || activePopover === 'timer'
                ? 'px-2.5 py-0.5 bg-[#D5BDA7] text-[#A84A24] font-medium text-xs'
                : 'p-1 text-[#382E24] hover:text-[#0F0C09]'
            }`}
          >
            <Hourglass className="w-3.5 h-3.5" />
            {(isTimerRunning || activePopover === 'timer') && (
              <span className="tabular-nums">
                {formatTimer(timerRemainingSec)}
              </span>
            )}
          </button>

          {/* 3. Share / Export Menu trigger */}
          <button
            type="button"
            onClick={() =>
              setActivePopover((prev) => (prev === 'export' ? null : 'export'))
            }
            aria-label="Exportar texto"
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              activePopover === 'export'
                ? 'bg-[#3B2A1E] text-[#E6C080]'
                : 'text-[#382E24] hover:text-[#0F0C09]'
            }`}
          >
            <Share className="w-3.5 h-3.5" />
          </button>

          {/* 4. More Options (Page capacity, ruled lines, fullscreen) */}
          <button
            type="button"
            onClick={() =>
              setActivePopover((prev) => (prev === 'more' ? null : 'more'))
            }
            aria-label="Ajustes de hoja y pantalla completa"
            className={`p-1 rounded-full transition-colors cursor-pointer ${
              activePopover === 'more'
                ? 'bg-[#3B2A1E] text-[#E6C080]'
                : 'text-[#382E24] hover:text-[#0F0C09]'
            }`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Circular Cream Sound / Ambient Mixer Button */}
        <button
          type="button"
          onClick={() =>
            setActivePopover((prev) => (prev === 'sound' ? null : 'sound'))
          }
          aria-label="Ambiente sonoro y sonido de teclas"
          title="Sonidos ambientales (lluvia, tren, cafetería, grillos, noche) y volumen"
          className={`relative w-8 h-8 rounded-full flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-colors cursor-pointer ${
            activePopover === 'sound'
              ? 'bg-[#3B2A1E] text-[#E6C080]'
              : 'bg-[#D7CEC1] text-[#2B231B] hover:bg-[#E4DCD0]'
          }`}
        >
          {prefs.keyMuted && activeAmbientCount === 0 ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
          {activeAmbientCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#D9822B] border border-[#1F1A14]" />
          )}
        </button>

        {/* Circular Dark-Bronze Google Sign-In / Account Button */}
        <button
          type="button"
          onClick={() => {
            if (currentUser || activePopover === 'account') {
              setActivePopover((prev) =>
                prev === 'account' ? null : 'account'
              );
            } else {
              // Trigger Google popup synchronously on click for maximum PC/Mobile compatibility;
              // if blocked or unauthorized on Vercel, it opens the account diagnostic popover automatically.
              handleDirectGooglePopupLogin();
            }
          }}
          data-testid="google-auth-button"
          aria-label={
            currentUser
              ? `Cuenta de Google conectada (${
                  currentUser.displayName || currentUser.email
                })`
              : 'Ingresar con Google para guardar lo escrito'
          }
          title={
            currentUser
              ? `Conectado con Google: ${
                  currentUser.displayName || currentUser.email
                }`
              : 'Ingresar con Google para sincronizar y guardar en la nube'
          }
          className={`w-8 h-8 rounded-full border font-editorial italic font-semibold text-xs flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-colors cursor-pointer ${
            currentUser
              ? 'bg-[#3A4D39] border-[#5D7A5B] text-[#E5F2E4]'
              : 'bg-[#4A3828] border-[#6E563F] text-[#E5C089] hover:bg-[#5B4532]'
          }`}
        >
          {userInitial}
        </button>
      </div>

      {/* POPOVER 6: Google Account & Mobile/Vercel Login Helper */}
      {activePopover === 'account' && (
        <div
          role="dialog"
          aria-label="Cuenta de Google y sincronización"
          className="fixed top-16 right-4 z-40 w-[330px] rounded-[22px] bg-[#F4EDE1] text-[#35281E] shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-1.5"
        >
          <div className="rounded-[18px] border border-dashed border-[#D3C6B4] p-4 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-normal text-[#2E2218]">
                {currentUser ? 'Tu cuenta de Google' : 'Guardar con Google'}
              </h2>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                aria-label="Cerrar panel de cuenta"
                className="p-1 text-[#6E5D4D] hover:text-[#2E2218] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {currentUser ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#FAF5EC] border border-[#DFD3C2]">
                  <div className="font-medium text-[#2A1F16] truncate">
                    {currentUser.displayName || 'Usuario conectado'}
                  </div>
                  <div className="text-[11px] text-[#7D6B58] truncate">
                    {currentUser.email}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#4C6B4A] font-medium">
                    ✓ Sincronización en la nube activa
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#3B2A1E] text-[#E6C080] font-medium hover:bg-[#4A3526] transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {authErrorDetail && (
                  <div className="p-3 rounded-xl bg-[#EFE2D1] border border-[#D4B696] space-y-2 text-[#4A2E1B]">
                    <div className="flex items-start gap-2 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-[#A84A24] shrink-0 mt-0.5" />
                      <span>{authErrorDetail.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#5C3D28]">
                      {authErrorDetail.message}
                    </p>

                    {authErrorDetail.isUnauthorizedDomain && (
                      <div className="pt-1 space-y-1.5">
                        <div className="text-[11px] font-medium text-[#3B2618]">
                          Pasos para habilitar Vercel en 30 segundos:
                        </div>
                        <ol className="list-decimal list-inside text-[11px] space-y-1 text-[#5C3D28]">
                          <li>
                            Abre Firebase Console → proyecto{' '}
                            <code className="font-mono bg-[#DFCEB9] px-1 rounded">
                              {authErrorDetail.projectId}
                            </code>
                          </li>
                          <li>
                            Ve a <b>Authentication → Settings → Dominios autorizados</b>
                          </li>
                          <li>
                            Agrega este dominio:{' '}
                            <code className="font-mono bg-[#DFCEB9] px-1 rounded">
                              {authErrorDetail.currentHostname}
                            </code>
                          </li>
                        </ol>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                authErrorDetail.currentHostname
                              );
                              setCopiedDomainFeedback(true);
                              window.setTimeout(
                                () => setCopiedDomainFeedback(false),
                                2000
                              );
                            } catch {}
                          }}
                          className="mt-1 w-full py-1.5 px-3 rounded-lg bg-[#FAF5EC] border border-[#C8B49B] text-[11px] font-medium text-[#2F231A] hover:bg-[#EDE3D2] cursor-pointer"
                        >
                          {copiedDomainFeedback
                            ? '¡Dominio copiado al portapapeles!'
                            : `Copiar dominio (${authErrorDetail.currentHostname})`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleDirectGooglePopupLogin}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#3B2A1E] text-[#E6C080] font-medium hover:bg-[#4A3526] transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Ingresar con Google (Ventana)</span>
                </button>

                <button
                  type="button"
                  onClick={handleGoogleRedirectLogin}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#FAF5EC] border border-[#D8CBB8] text-[#2F231A] font-medium hover:bg-[#EFE6D8] transition-colors cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#8A5A36]" />
                  <span>Ingresar en Celular (Sin ventana emergente)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPOVER 2: "Sesión de escritura" Pomodoro Timer */}
      {activePopover === 'timer' && (
        <div
          role="dialog"
          aria-label="Sesión de escritura"
          className="fixed top-16 right-4 z-40 w-[285px] rounded-[22px] bg-[#F4EDE1] text-[#35281E] shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-1.5"
        >
          <div className="rounded-[18px] border border-dashed border-[#D3C6B4] p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between">
              <h2 className="font-editorial text-lg font-normal text-[#2E2218]">
                Sesión de escritura
              </h2>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                aria-label="Cerrar temporizador"
                className="p-1 text-[#6E5D4D] hover:text-[#2E2218] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Circular Pomodoro Dial */}
            <div className="relative w-40 h-40 my-4 flex flex-col items-center justify-center">
              <svg
                className="absolute inset-0 w-full h-full -rotate-90"
                viewBox="0 0 120 120"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="#F8F3EA"
                  stroke="#DDD1BE"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#A84A24"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={
                    2 * Math.PI * 50 * (1 - timerProgressRatio)
                  }
                />
              </svg>
              <span className="relative text-[10px] font-semibold tracking-[0.18em] text-[#7A6855]">
                ESCRITURA
              </span>
              <span className="relative font-editorial text-4xl text-[#2F231A] tabular-nums mt-0.5">
                {formatTimer(timerRemainingSec)}
              </span>
            </div>

            {/* Pause / Start & Reset Pill Buttons */}
            <div className="flex items-center gap-2.5 w-full justify-center">
              <button
                type="button"
                onClick={() => setIsTimerRunning((prev) => !prev)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#3B2A1E] text-[#E6C080] text-xs font-medium hover:bg-[#4A3526] transition-colors cursor-pointer"
              >
                {isTimerRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pausa</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Iniciar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimerRemainingSec(timerDurationSec);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#FAF5EC] border border-[#D8CBB8] text-[#2F231A] text-xs font-medium hover:bg-[#EFE6D8] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar</span>
              </button>
            </div>

            {/* Duration selector */}
            <button
              type="button"
              onClick={() => {
                const nextMin =
                  timerDurationSec === 25 * 60
                    ? 15
                    : timerDurationSec === 15 * 60
                    ? 45
                    : 25;
                setTimerDurationSec(nextMin * 60);
                setTimerRemainingSec(nextMin * 60);
                setIsTimerRunning(false);
              }}
              className="mt-3.5 text-[11px] text-[#8A5A36] border-b border-dotted border-[#8A5A36] hover:text-[#5E3B20] cursor-pointer"
            >
              Pomodoro ({Math.round(timerDurationSec / 60)} min) · Hábitos de
              escritura
            </button>
          </div>
        </div>
      )}

      {/* POPOVER 3: Export Dropdown */}
      {activePopover === 'export' && (
        <div
          role="menu"
          aria-label="Opciones de exportación"
          className="fixed top-16 right-16 z-40 w-[250px] rounded-2xl bg-[#F6EFE4] text-[#2F231A] shadow-[0_20px_50px_rgba(0,0,0,0.65)] p-2 space-y-0.5"
        >
          <button
            type="button"
            onClick={handleCopyText}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#2F231A] hover:bg-[#EAE0D0] transition-colors text-left cursor-pointer"
          >
            <ClipboardCopy className="w-4 h-4 text-[#8A6240] shrink-0" />
            <span>{copiedFeedback ? '¡Texto copiado!' : 'Copiar texto'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportTypewrittenPdf}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#2F231A] hover:bg-[#EAE0D0] transition-colors text-left cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-[#8A6240] shrink-0" />
            <span>PDF, papel mecanografiado</span>
          </button>

          <button
            type="button"
            onClick={handleExportWord}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#2F231A] hover:bg-[#EAE0D0] transition-colors text-left cursor-pointer"
          >
            <FileType className="w-4 h-4 text-[#8A6240] shrink-0" />
            <span>Documento de Word</span>
          </button>

          <button
            type="button"
            onClick={handleExportTxt}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#2F231A] hover:bg-[#EAE0D0] transition-colors text-left cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#8A6240] shrink-0" />
            <span>Texto plano (.txt)</span>
          </button>
        </div>
      )}

      {/* POPOVER 4: Ambient Sound Mixer & Key Volume */}
      {activePopover === 'sound' && (
        <div
          role="dialog"
          aria-label="Ambiente sonoro y volumen"
          className="fixed top-16 right-4 z-40 w-[330px] rounded-[22px] bg-[#F4EDE1] text-[#35281E] shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-1.5"
        >
          <div className="rounded-[18px] border border-dashed border-[#D3C6B4] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-normal text-[#2E2218]">
                Sonidos y ambiente
              </h2>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                aria-label="Cerrar sonidos"
                className="p-1 text-[#6E5D4D] hover:text-[#2E2218] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Master Volumes */}
            <div className="space-y-2.5 bg-[#EAE0D0]/75 p-3 rounded-xl">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#2F231A]">
                    Teclas mecánicas
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPrefs((prev) => ({
                        ...prev,
                        keyMuted: !prev.keyMuted,
                      }))
                    }
                    className="text-[11px] font-mono text-[#7A624B] hover:text-[#2F231A] cursor-pointer"
                  >
                    {prefs.keyMuted
                      ? 'Silenciado'
                      : `${Math.round(prefs.masterKeyVolume * 100)}%`}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={
                    prefs.keyMuted ? 0 : Math.round(prefs.masterKeyVolume * 100)
                  }
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      masterKeyVolume: Number(e.target.value) / 100,
                      keyMuted: false,
                    }))
                  }
                  aria-label="Volumen de teclas mecánicas"
                  className="w-full accent-[#8A5A36] h-1.5 bg-[#D5C7B4] rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1 pt-1 border-t border-[#D8CBB8]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#2F231A]">
                    Volumen ambiental
                  </span>
                  <span className="text-[11px] font-mono text-[#7A624B]">
                    {Math.round(prefs.masterAmbientVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(prefs.masterAmbientVolume * 100)}
                  onChange={(e) =>
                    setPrefs((prev) => ({
                      ...prev,
                      masterAmbientVolume: Number(e.target.value) / 100,
                      ambientMuted: false,
                    }))
                  }
                  aria-label="Volumen general de ambiente"
                  className="w-full accent-[#8A5A36] h-1.5 bg-[#D5C7B4] rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Individual Combinable Tracks */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {AMBIENT_TRACK_ITEMS.map((item) => {
                const Icon = item.icon;
                const st = prefs.ambientTracks[item.id] || {
                  active: false,
                  volume: 0.5,
                };
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl p-2.5 transition-colors ${
                      st.active
                        ? 'bg-[#FAF5EC] border border-[#D8CBB8]'
                        : 'bg-[#EDE4D5]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleToggleTrack(item.id)}
                        className="flex items-center gap-2.5 text-xs font-medium text-[#2F231A] flex-1 text-left cursor-pointer"
                      >
                        <Icon
                          className={`w-4 h-4 ${
                            st.active ? 'text-[#A84A24]' : 'text-[#7D6B58]'
                          }`}
                        />
                        <span>{item.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleTrack(item.id)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer ${
                          st.active
                            ? 'bg-[#3B2A1E] text-[#E6C080]'
                            : 'bg-[#DFD3C2] text-[#5C4B3B]'
                        }`}
                      >
                        {st.active ? 'Activo' : 'Activar'}
                      </button>
                    </div>
                    {st.active && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={Math.round(st.volume * 100)}
                          onChange={(e) =>
                            handleChangeTrackVolume(
                              item.id,
                              Number(e.target.value) / 100
                            )
                          }
                          aria-label={`Volumen de ${item.label}`}
                          className="flex-1 accent-[#A84A24] h-1 bg-[#D5C7B4] rounded-lg cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-[#7D6B58] w-8 text-right">
                          {Math.round(st.volume * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* POPOVER 5: More Settings (Lines per page, Ruled lines, Fullscreen, Delete current sheet) */}
      {activePopover === 'more' && (
        <div
          role="dialog"
          aria-label="Ajustes de hoja"
          className="fixed top-16 right-4 z-40 w-[290px] rounded-[22px] bg-[#F4EDE1] text-[#35281E] shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-1.5"
        >
          <div className="rounded-[18px] border border-dashed border-[#D3C6B4] p-4 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-lg font-normal text-[#2E2218]">
                Opciones de página
              </h2>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                aria-label="Cerrar opciones"
                className="p-1 text-[#6E5D4D] hover:text-[#2E2218] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[#5C4B3B] font-medium">
                Líneas por hoja (paso automático)
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[12, 16, 20, 24].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() =>
                      setPrefs((prev) => ({ ...prev, maxLinesPerPage: count }))
                    }
                    className={`py-1.5 rounded-lg font-mono transition-colors cursor-pointer ${
                      prefs.maxLinesPerPage === count
                        ? 'bg-[#3B2A1E] text-[#E6C080] font-semibold'
                        : 'bg-[#EAE0D0] text-[#4A3B2D] hover:bg-[#DFD3C2]'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-[#3B2E22] font-medium">
                Cambio automático de hoja
              </span>
              <input
                type="checkbox"
                checked={prefs.autoTurnPages}
                onChange={() =>
                  setPrefs((prev) => ({
                    ...prev,
                    autoTurnPages: !prev.autoTurnPages,
                  }))
                }
                className="accent-[#3B2A1E] w-4 h-4 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-[#3B2E22] font-medium">
                Renglones guía sutiles
              </span>
              <input
                type="checkbox"
                checked={prefs.showRuledLines}
                onChange={() =>
                  setPrefs((prev) => ({
                    ...prev,
                    showRuledLines: !prev.showRuledLines,
                  }))
                }
                className="accent-[#3B2A1E] w-4 h-4 rounded cursor-pointer"
              />
            </label>

            <div className="pt-2 border-t border-[#DFD3C2] flex flex-col gap-1.5">
              <button
                type="button"
                onClick={toggleDistractionFree}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#3B2A1E] text-[#E6C080] font-medium hover:bg-[#4A3526] transition-colors cursor-pointer"
              >
                {isDistractionFree ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Salir de pantalla completa</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Modo pantalla completa</span>
                  </>
                )}
              </button>

              {totalPages > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteCurrentPage}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[#A84A24] hover:bg-[#EAE0D0] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Borrar hoja actual ({activePageIndex + 1})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN MINIMALIST TYPEWRITER WORKSPACE */}
      <main
        id="escritorio"
        onClick={() => {
          if (activePopover) setActivePopover(null);
        }}
        className="relative z-10 flex-1 flex flex-col"
      >
        {activeNotebook && (
          <TypewriterSheet
            notebook={activeNotebook}
            activePageIndex={activePageIndex}
            maxLinesPerPage={prefs.maxLinesPerPage}
            charsPerLine={CHARS_PER_LINE}
            showRuledLines={prefs.showRuledLines}
            lampIntensity={prefs.lampIntensity}
            onUpdatePageContent={handleUpdatePageContent}
            onPlayKeySound={handlePlayKeySound}
          />
        )}
      </main>

      {/* BOTTOM-LEFT MINIMALIST WORD COUNT */}
      <div className="fixed bottom-4 left-5 z-30 flex items-center gap-3 text-xs text-[#9C8E7E]">
        <span className="font-medium text-[#C5B8A8] tabular-nums">
          {currentMetrics.words}{' '}
          {currentMetrics.words === 1 ? 'palabra' : 'palabras'}
        </span>
      </div>

      {/* BOTTOM-RIGHT FLOATING DAILY WORD GOAL PILL */}
      <div className="fixed bottom-4 right-5 z-30">
        <button
          type="button"
          onClick={() =>
            setActivePopover((prev) => (prev === 'timer' ? null : 'timer'))
          }
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#CFC6B8] text-[#2B231B] text-xs font-medium shadow-[0_6px_20px_rgba(0,0,0,0.45)] hover:bg-[#DDD4C7] transition-colors tabular-nums cursor-pointer"
        >
          <Flame className="w-3.5 h-3.5 text-[#8B6F4E]" />
          <span>
            {totalWordsAllPages} de {DAILY_WORD_GOAL} palabras hoy
          </span>
        </button>
      </div>
    </div>
  );
}
