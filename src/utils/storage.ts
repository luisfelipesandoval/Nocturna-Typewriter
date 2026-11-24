import { Notebook } from './pagination';
import { AmbientTrackId } from './soundEngine';

const OLD_KEYS = [
  'nocturna_typewriter_notebooks_v1',
  'nocturna_typewriter_prefs_v1',
  'nocturna_typewriter_notebooks_v2',
  'nocturna_typewriter_prefs_v2',
];

const STORAGE_KEY_NOTEBOOKS = 'nocturna_typewriter_notebooks_v3';
const STORAGE_KEY_PREFS = 'nocturna_typewriter_prefs_v3';

export interface UserPreferences {
  activeNotebookId: string;
  activePageIndex: number;
  maxLinesPerPage: number;
  autoTurnPages: boolean;
  showRuledLines: boolean;
  lampIntensity: 'suave' | 'calida' | 'intensa';
  masterKeyVolume: number;
  masterAmbientVolume: number;
  keyMuted: boolean;
  ambientMuted: boolean;
  ambientTracks: Record<AmbientTrackId, { active: boolean; volume: number }>;
}

export const DEFAULT_AMBIENT_TRACKS: Record<
  AmbientTrackId,
  { active: boolean; volume: number }
> = {
  lluvia: { active: false, volume: 0.65 },
  tren: { active: false, volume: 0.5 },
  cafeteria: { active: false, volume: 0.45 },
  grillos: { active: false, volume: 0.4 },
  noche: { active: false, volume: 0.55 },
  chimenea: { active: false, volume: 0.5 },
};

export function createBlankDraftNotebook(): Notebook {
  const now = Date.now();
  return {
    id: `draft-${now}`,
    title: 'Sin título',
    createdAt: now,
    updatedAt: now,
    pages: [
      {
        id: `pg-${now}-1`,
        updatedAt: now,
        content: '',
      },
    ],
  };
}

export function loadNotebooks(): Notebook[] {
  if (typeof window === 'undefined') return [createBlankDraftNotebook()];
  try {
    // Clean up any legacy pre-populated storage keys
    for (const key of OLD_KEYS) {
      window.localStorage.removeItem(key);
    }

    const raw = window.localStorage.getItem(STORAGE_KEY_NOTEBOOKS);
    if (!raw) {
      const initial = [createBlankDraftNotebook()];
      return initial;
    }
    const parsed = JSON.parse(raw) as Notebook[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createBlankDraftNotebook()];
    }
    return parsed;
  } catch {
    return [createBlankDraftNotebook()];
  }
}

export function saveNotebooks(notebooks: Notebook[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_NOTEBOOKS,
      JSON.stringify(notebooks)
    );
  } catch {}
}

export function clearLocalNotebooks(): Notebook {
  const blank = createBlankDraftNotebook();
  if (typeof window !== 'undefined') {
    try {
      for (const key of OLD_KEYS) {
        window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(
        STORAGE_KEY_NOTEBOOKS,
        JSON.stringify([blank])
      );
    } catch {}
  }
  return blank;
}

export function loadPreferences(defaultNotebookId: string): UserPreferences {
  const fallback: UserPreferences = {
    activeNotebookId: defaultNotebookId,
    activePageIndex: 0,
    maxLinesPerPage: 16,
    autoTurnPages: true,
    showRuledLines: false,
    lampIntensity: 'calida',
    masterKeyVolume: 0.65,
    masterAmbientVolume: 0.55,
    keyMuted: false,
    ambientMuted: false,
    ambientTracks: { ...DEFAULT_AMBIENT_TRACKS },
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...fallback,
      ...parsed,
      ambientTracks: {
        ...DEFAULT_AMBIENT_TRACKS,
        ...(parsed.ambientTracks || {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
  } catch {}
}
