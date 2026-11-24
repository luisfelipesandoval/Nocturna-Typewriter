import { Notebook } from './pagination';
import { AmbientTrackId } from './soundEngine';

const STORAGE_KEY_NOTEBOOKS = 'nocturna_typewriter_notebooks_v1';
const STORAGE_KEY_PREFS = 'nocturna_typewriter_prefs_v1';

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

export function createDefaultNotebooks(): Notebook[] {
  const now = Date.now();
  return [
    {
      id: 'nb-bitacora-nocturna',
      title: 'Bitácora de Medianoche',
      createdAt: now - 3600_000 * 12,
      updatedAt: now - 1800_000,
      pages: [
        {
          id: 'pg-bitacora-1',
          updatedAt: now - 1800_000,
          content: `La lámpara del carro proyecta un cono de luz ámbar sobre
el papel oscuro. Cada pulsación resuena con el golpe seco
y metálico de los tipos contra el rodillo en la noche.

Escribe libremente en esta hoja. Debajo de la línea activa
verás el carro luminoso desplazarse letra a letra e
iluminar hacia arriba tu texto mientras avanzan las ideas.

Cuando llenes las líneas de esta página, el cuaderno pasará
automáticamente a una hoja nueva con el murmullo del papel.`,
        },
        {
          id: 'pg-bitacora-2',
          updatedAt: now - 900_000,
          content: `Segunda hoja del cuaderno. Puedes navegar entre páginas anteriores y siguientes con las flechas del cabezal o usando el organizador de hojas a la izquierda.

En el panel de Ambiente Sonoro puedes combinar lluvia nocturna, el traqueteo lejano de un tren, murmullo de cafetería, grillos o viento de medianoche para construir tu refugio de concentración.`,
        },
      ],
    },
    {
      id: 'nb-cartas-lluvia',
      title: 'Apuntes en el Expreso del Sur',
      createdAt: now - 3600_000 * 36,
      updatedAt: now - 3600_000 * 5,
      pages: [
        {
          id: 'pg-expreso-1',
          updatedAt: now - 3600_000 * 5,
          content: `Vagón 4, asiento junto a la ventanilla. Las luces de los pueblos pasan como brasas fugaces tras el cristal empañado.

No hay mejor lugar para ordenar ideas que una mesa angosta de madera oscura y el compás constante de los rieles en la madrugada.`,
        },
      ],
    },
  ];
}

export function loadNotebooks(): Notebook[] {
  if (typeof window === 'undefined') return createDefaultNotebooks();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_NOTEBOOKS);
    if (!raw) {
      const defaults = createDefaultNotebooks();
      saveNotebooks(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw) as Notebook[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = createDefaultNotebooks();
      saveNotebooks(defaults);
      return defaults;
    }
    return parsed;
  } catch {
    return createDefaultNotebooks();
  }
}

export function saveNotebooks(notebooks: Notebook[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_NOTEBOOKS, JSON.stringify(notebooks));
  } catch {}
}

export function loadPreferences(defaultNotebookId: string): UserPreferences {
  const fallback: UserPreferences = {
    activeNotebookId: defaultNotebookId,
    activePageIndex: 0,
    maxLinesPerPage: 16,
    autoTurnPages: true,
    showRuledLines: true,
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
