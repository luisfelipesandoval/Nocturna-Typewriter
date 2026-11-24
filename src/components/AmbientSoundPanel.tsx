import React from 'react';
import {
  CloudRain,
  TrainFront,
  Coffee,
  Bug,
  MoonStar,
  Flame,
  Volume2,
  VolumeX,
  Sliders,
  X,
  LampDesk,
} from 'lucide-react';
import { AmbientTrackId } from '../utils/soundEngine';

interface AmbientSoundPanelProps {
  isOpen: boolean;
  onClose: () => void;
  ambientTracks: Record<AmbientTrackId, { active: boolean; volume: number }>;
  masterKeyVolume: number;
  masterAmbientVolume: number;
  keyMuted: boolean;
  ambientMuted: boolean;
  maxLinesPerPage: number;
  autoTurnPages: boolean;
  showRuledLines: boolean;
  lampIntensity: 'suave' | 'calida' | 'intensa';
  onToggleTrack: (id: AmbientTrackId) => void;
  onChangeTrackVolume: (id: AmbientTrackId, volume: number) => void;
  onApplyPreset: (preset: 'lluvia_tren' | 'noche_grillos' | 'cafe_lluvia' | 'silencio') => void;
  onChangeMasterKeyVolume: (vol: number) => void;
  onChangeMasterAmbientVolume: (vol: number) => void;
  onToggleKeyMute: () => void;
  onToggleAmbientMute: () => void;
  onChangeMaxLinesPerPage: (lines: number) => void;
  onToggleAutoTurnPages: () => void;
  onToggleRuledLines: () => void;
  onChangeLampIntensity: (intensity: 'suave' | 'calida' | 'intensa') => void;
  onTestKeySound: () => void;
}

const TRACK_META: Array<{
  id: AmbientTrackId;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'lluvia',
    label: 'Lluvia',
    subtitle: 'Gotas suaves sobre el cristal',
    icon: CloudRain,
  },
  {
    id: 'tren',
    label: 'Tren',
    subtitle: 'Compás nocturno sobre rieles',
    icon: TrainFront,
  },
  {
    id: 'cafeteria',
    label: 'Cafetería',
    subtitle: 'Murmullo cálido y porcelana',
    icon: Coffee,
  },
  {
    id: 'grillos',
    label: 'Grillos',
    subtitle: 'Canto pausado en el jardín',
    icon: Bug,
  },
  {
    id: 'noche',
    label: 'Noche',
    subtitle: 'Brisa profunda de medianoche',
    icon: MoonStar,
  },
  {
    id: 'chimenea',
    label: 'Hoguera',
    subtitle: 'Crepitar suave de leña',
    icon: Flame,
  },
];

export const AmbientSoundPanel: React.FC<AmbientSoundPanelProps> = ({
  isOpen,
  onClose,
  ambientTracks,
  masterKeyVolume,
  masterAmbientVolume,
  keyMuted,
  ambientMuted,
  maxLinesPerPage,
  autoTurnPages,
  showRuledLines,
  lampIntensity,
  onToggleTrack,
  onChangeTrackVolume,
  onApplyPreset,
  onChangeMasterKeyVolume,
  onChangeMasterAmbientVolume,
  onToggleKeyMute,
  onToggleAmbientMute,
  onChangeMaxLinesPerPage,
  onToggleAutoTurnPages,
  onToggleRuledLines,
  onChangeLampIntensity,
  onTestKeySound,
}) => {
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Panel de sonidos ambientales y ajustes de máquina"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-[390px] bg-[#171310] border-l border-[#312822] shadow-[-16px_0_48px_rgba(0,0,0,0.75)] flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2C241E] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 text-[#D99B4E]" />
          <h2 className="font-editorial text-base font-normal text-[#F3E9D7]">
            Ambiente Sonoro y Máquina
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel de sonidos"
          className="p-1.5 rounded-md text-[#A89A8A] hover:text-[#F2E9D8] hover:bg-[#26201C] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Section 1: Master Volume Controls (Typewriter & Ambient) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#D6C5B2]">
              Control General de Volumen
            </h3>
            <button
              type="button"
              onClick={onTestKeySound}
              className="text-xs text-[#E8A856] hover:text-[#F5C57E] transition-colors cursor-pointer"
            >
              Probar sonido de tecla
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-[#1D1815] border border-[#2F2721] space-y-3.5">
            {/* Mechanical Keys Master Volume */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#E6DAC8]">Teclas mecánicas y carro</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-[#A89A8A]">
                    {keyMuted ? 'Silenciado' : `${Math.round(masterKeyVolume * 100)}%`}
                  </span>
                  <button
                    type="button"
                    onClick={onToggleKeyMute}
                    aria-label={
                      keyMuted
                        ? 'Activar sonido de teclas'
                        : 'Silenciar sonido de teclas'
                    }
                    className="p-1 rounded bg-[#29221D] text-[#D8C7B4] hover:text-[#F0C987] transition-colors cursor-pointer"
                  >
                    {keyMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-[#C97B63]" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={keyMuted ? 0 : Math.round(masterKeyVolume * 100)}
                onChange={(e) => onChangeMasterKeyVolume(Number(e.target.value) / 100)}
                aria-label="Volumen general de teclas mecánicas"
                className="w-full accent-[#D99B4E] h-1.5 bg-[#2D251F] rounded-lg cursor-pointer"
              />
            </div>

            {/* Ambient Master Volume */}
            <div className="space-y-1.5 pt-2 border-t border-[#29221D]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#E6DAC8]">Mezcla ambiental de fondo</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-[#A89A8A]">
                    {ambientMuted
                      ? 'Silenciado'
                      : `${Math.round(masterAmbientVolume * 100)}%`}
                  </span>
                  <button
                    type="button"
                    onClick={onToggleAmbientMute}
                    aria-label={
                      ambientMuted
                        ? 'Activar sonido ambiental'
                        : 'Silenciar sonido ambiental'
                    }
                    className="p-1 rounded bg-[#29221D] text-[#D8C7B4] hover:text-[#F0C987] transition-colors cursor-pointer"
                  >
                    {ambientMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-[#C97B63]" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={ambientMuted ? 0 : Math.round(masterAmbientVolume * 100)}
                onChange={(e) =>
                  onChangeMasterAmbientVolume(Number(e.target.value) / 100)
                }
                aria-label="Volumen general de sonidos ambientales"
                className="w-full accent-[#D99B4E] h-1.5 bg-[#2D251F] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Combinable Ambient Soundscapes */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#D6C5B2]">
              Sonidos Ambientales Combinables
            </h3>
            <button
              type="button"
              onClick={() => onApplyPreset('silencio')}
              className="text-xs text-[#9E8F7F] hover:text-[#E6DAC8] transition-colors cursor-pointer"
            >
              Apagar todos
            </button>
          </div>

          {/* Quick Atmosphere Presets */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onApplyPreset('lluvia_tren')}
              className="px-2.5 py-1.5 rounded-md text-xs bg-[#211B17] border border-[#332B24] text-[#D8C7B4] hover:border-[#D99B4E]/50 hover:text-[#F3E9D7] transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Tren + Lluvia
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset('noche_grillos')}
              className="px-2.5 py-1.5 rounded-md text-xs bg-[#211B17] border border-[#332B24] text-[#D8C7B4] hover:border-[#D99B4E]/50 hover:text-[#F3E9D7] transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Noche + Grillos
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset('cafe_lluvia')}
              className="px-2.5 py-1.5 rounded-md text-xs bg-[#211B17] border border-[#332B24] text-[#D8C7B4] hover:border-[#D99B4E]/50 hover:text-[#F3E9D7] transition-colors whitespace-nowrap truncate cursor-pointer"
            >
              Café + Lluvia
            </button>
          </div>

          <div className="space-y-2.5">
            {TRACK_META.map((track) => {
              const Icon = track.icon;
              const state = ambientTracks[track.id] || {
                active: false,
                volume: 0.5,
              };
              return (
                <div
                  key={track.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    state.active
                      ? 'bg-[#241E19] border-[#524133]'
                      : 'bg-[#1B1613] border-[#2B231E]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleTrack(track.id)}
                      aria-pressed={state.active}
                      className="flex items-center gap-2.5 text-left flex-1 cursor-pointer"
                    >
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                          state.active
                            ? 'bg-[#D99B4E] text-[#171310]'
                            : 'bg-[#26201B] text-[#9E8F7F]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-[#F2E9D8]">
                          {track.label}
                        </div>
                        <div className="text-[11px] text-[#8E7F70]">
                          {track.subtitle}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleTrack(track.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        state.active
                          ? 'bg-[#D99B4E]/20 text-[#F2B866] border border-[#D99B4E]/40'
                          : 'bg-[#251F1B] text-[#9E8F7F] hover:text-[#E6DAC8]'
                      }`}
                    >
                      {state.active ? 'Activo' : 'Activar'}
                    </button>
                  </div>

                  {state.active && (
                    <div className="mt-2.5 pt-2 border-t border-[#312821] flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={Math.round(state.volume * 100)}
                        onChange={(e) =>
                          onChangeTrackVolume(track.id, Number(e.target.value) / 100)
                        }
                        aria-label={`Volumen de ${track.label}`}
                        className="flex-1 accent-[#D99B4E] h-1.5 bg-[#332A23] rounded-lg cursor-pointer"
                      />
                      <span className="text-[11px] font-mono tabular-nums text-[#B8A896] w-9 text-right">
                        {Math.round(state.volume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Physical Sheet & Lamp Preferences */}
        <section className="space-y-3 pt-2 border-t border-[#2A221D]">
          <div className="flex items-center gap-2">
            <LampDesk className="w-3.5 h-3.5 text-[#D99B4E]" />
            <h3 className="text-xs font-medium text-[#D6C5B2]">
              Comportamiento del Papel y Foco
            </h3>
          </div>

          <div className="p-3.5 rounded-lg bg-[#1D1815] border border-[#2F2721] space-y-4 text-xs">
            {/* Lines per page */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#E6DAC8]">
                <span>Capacidad de líneas por hoja</span>
                <span className="font-mono tabular-nums text-[#F0C987]">
                  {maxLinesPerPage} líneas
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[12, 16, 20, 24].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onChangeMaxLinesPerPage(count)}
                    className={`py-1.5 rounded font-mono tabular-nums transition-colors cursor-pointer ${
                      maxLinesPerPage === count
                        ? 'bg-[#D99B4E] text-[#171310] font-semibold'
                        : 'bg-[#26201B] text-[#B5A594] hover:bg-[#312923]'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Lamp Intensity */}
            <div className="space-y-1.5">
              <div className="text-[#E6DAC8]">Intensidad del haz de luz cálida</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'suave', label: 'Suave' },
                    { id: 'calida', label: 'Cálida' },
                    { id: 'intensa', label: 'Intensa' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeLampIntensity(opt.id)}
                    className={`py-1.5 rounded transition-colors cursor-pointer ${
                      lampIntensity === opt.id
                        ? 'bg-[#D99B4E] text-[#171310] font-semibold'
                        : 'bg-[#26201B] text-[#B5A594] hover:bg-[#312923]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles: Auto turn page & Ruled lines */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-[#D8C7B4]">
                  Pasar de hoja automáticamente al llenar
                </span>
                <input
                  type="checkbox"
                  checked={autoTurnPages}
                  onChange={onToggleAutoTurnPages}
                  className="accent-[#D99B4E] w-4 h-4 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-[#D8C7B4]">
                  Mostrar renglones guía numerados
                </span>
                <input
                  type="checkbox"
                  checked={showRuledLines}
                  onChange={onToggleRuledLines}
                  className="accent-[#D99B4E] w-4 h-4 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};
