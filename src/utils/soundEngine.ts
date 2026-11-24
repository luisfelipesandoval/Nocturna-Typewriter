export type AmbientTrackId =
  | 'lluvia'
  | 'tren'
  | 'cafeteria'
  | 'grillos'
  | 'noche'
  | 'chimenea';

export interface AmbientTrackConfig {
  id: AmbientTrackId;
  label: string;
  description: string;
  active: boolean;
  volume: number; // 0 to 1
}

export type KeySoundType = 'char' | 'space' | 'enter' | 'delete' | 'pageturn';

class NocturnaSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private masterKeyVolume: number = 0.65;
  private masterAmbientVolume: number = 0.55;
  private keyMuted: boolean = false;
  private ambientMuted: boolean = false;

  private ambientNodes: Map<
    AmbientTrackId,
    {
      gainNode: GainNode;
      cleanup: () => void;
    }
  > = new Map();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 4; // 4-second looping pink-ish noise buffer
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public setMasterKeyVolume(vol: number) {
    this.masterKeyVolume = Math.max(0, Math.min(1, vol));
  }

  public setKeyMuted(muted: boolean) {
    this.keyMuted = muted;
  }

  public setMasterAmbientVolume(vol: number, activeTracks: Record<AmbientTrackId, { active: boolean; volume: number }>) {
    this.masterAmbientVolume = Math.max(0, Math.min(1, vol));
    this.syncAmbientTracks(activeTracks);
  }

  public setAmbientMuted(muted: boolean, activeTracks: Record<AmbientTrackId, { active: boolean; volume: number }>) {
    this.ambientMuted = muted;
    this.syncAmbientTracks(activeTracks);
  }

  public playKeySound(type: KeySoundType) {
    if (this.keyMuted || this.masterKeyVolume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const vol = this.masterKeyVolume;

    if (type === 'char') {
      // Subtle mechanical typebar strike + paper thud
      const jitter = (Math.random() - 0.5) * 140;

      // 1. Metallic hammer click
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1450 + jitter, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.028);

      clickGain.gain.setValueAtTime(0.24 * vol, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

      osc.connect(clickGain);
      clickGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.034);

      // 2. Crisp short burst of filtered noise (ribbon hitting paper)
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2100 + jitter, now);
      filter.Q.setValueAtTime(2.2, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.32 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now, Math.random() * 2, 0.03);

      // 3. Secondary key release return tick (very soft, 42ms later)
      const relOsc = ctx.createOscillator();
      const relGain = ctx.createGain();
      relOsc.type = 'sine';
      relOsc.frequency.setValueAtTime(520 + jitter * 0.4, now + 0.042);
      relOsc.frequency.exponentialRampToValueAtTime(140, now + 0.062);
      relGain.gain.setValueAtTime(0.06 * vol, now + 0.042);
      relGain.gain.exponentialRampToValueAtTime(0.001, now + 0.064);
      relOsc.connect(relGain);
      relGain.connect(ctx.destination);
      relOsc.start(now + 0.042);
      relOsc.stop(now + 0.065);
    } else if (type === 'space') {
      // Deeper hollow wooden/metal spacebar lever thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(280 + (Math.random() - 0.5) * 20, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.055);

      gain.gain.setValueAtTime(0.34 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);

      // Soft mechanical thump noise
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28 * vol, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now, Math.random() * 2, 0.05);
    } else if (type === 'delete') {
      // Soft backspace escapement ratchet step
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.035);

      gain.gain.setValueAtTime(0.2 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'enter') {
      // Carriage slide + warm muted brass bell ding
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.linearRampToValueAtTime(1450, now + 0.14);
      filter.Q.setValueAtTime(3.0, now);

      const slideGain = ctx.createGain();
      slideGain.gain.setValueAtTime(0.01, now);
      slideGain.gain.linearRampToValueAtTime(0.25 * vol, now + 0.04);
      slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      noise.connect(filter);
      filter.connect(slideGain);
      slideGain.connect(ctx.destination);
      noise.start(now, Math.random() * 2, 0.17);

      // Gentle vintage brass bell chime
      const bell = ctx.createOscillator();
      const bellOver = ctx.createOscillator();
      const bellGain = ctx.createGain();

      bell.type = 'sine';
      bell.frequency.setValueAtTime(2280, now + 0.03);
      bellOver.type = 'sine';
      bellOver.frequency.setValueAtTime(4565, now + 0.03);

      bellGain.gain.setValueAtTime(0.09 * vol, now + 0.03);
      bellGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48);

      bell.connect(bellGain);
      bellOver.connect(bellGain);
      bellGain.connect(ctx.destination);

      bell.start(now + 0.03);
      bellOver.start(now + 0.03);
      bell.stop(now + 0.5);
      bellOver.stop(now + 0.5);
    } else if (type === 'pageturn') {
      // Soft paper sheet rustle
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.22);
      filter.Q.setValueAtTime(1.4, now);

      const rustleGain = ctx.createGain();
      rustleGain.gain.setValueAtTime(0.005, now);
      rustleGain.gain.linearRampToValueAtTime(0.22 * vol, now + 0.07);
      rustleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      noise.connect(filter);
      filter.connect(rustleGain);
      rustleGain.connect(ctx.destination);
      noise.start(now, Math.random() * 2, 0.26);
    }
  }

  public syncAmbientTracks(tracks: Record<AmbientTrackId, { active: boolean; volume: number }>) {
    const trackIds: AmbientTrackId[] = ['lluvia', 'tren', 'cafeteria', 'grillos', 'noche', 'chimenea'];

    for (const id of trackIds) {
      const cfg = tracks[id];
      const shouldRun = cfg && cfg.active && !this.ambientMuted && this.masterAmbientVolume > 0.01 && cfg.volume > 0.01;
      const existing = this.ambientNodes.get(id);

      if (!shouldRun) {
        if (existing) {
          existing.cleanup();
          this.ambientNodes.delete(id);
        }
        continue;
      }

      const ctx = this.ensureContext();
      if (!ctx || !this.noiseBuffer) continue;

      const targetGain = cfg.volume * this.masterAmbientVolume;

      if (existing) {
        existing.gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.12);
      } else {
        const created = this.createAmbientGenerator(ctx, id, targetGain);
        if (created) {
          this.ambientNodes.set(id, created);
        }
      }
    }
  }

  private createAmbientGenerator(
    ctx: AudioContext,
    id: AmbientTrackId,
    initialGain: number
  ): { gainNode: GainNode; cleanup: () => void } | null {
    if (!this.noiseBuffer) return null;

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.001, ctx.currentTime);
    mainGain.gain.setTargetAtTime(initialGain, ctx.currentTime, 0.25);
    mainGain.connect(ctx.destination);

    const disposers: Array<() => void> = [];

    if (id === 'lluvia') {
      // Warm steady rain against a study window
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1350;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 240;

      src.connect(lp);
      lp.connect(hp);
      hp.connect(mainGain);
      src.start();
      disposers.push(() => {
        try {
          src.stop();
        } catch {}
      });
    } else if (id === 'tren') {
      // Rhythmic nocturnal train cabin hum + gentle rail cadence
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;

      src.connect(lp);
      lp.connect(mainGain);
      src.start();

      // Periodic rail joint cadence (ta-ka ... ta-ka)
      const interval = window.setInterval(() => {
        if (!this.ctx || !this.noiseBuffer) return;
        const t = this.ctx.currentTime;
        [0, 0.17].forEach((offset) => {
          if (!this.ctx || !this.noiseBuffer) return;
          const clack = this.ctx.createBufferSource();
          clack.buffer = this.noiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 340;
          bp.Q.value = 2.5;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.28, t + offset);
          g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.08);
          clack.connect(bp);
          bp.connect(g);
          g.connect(mainGain);
          clack.start(t + offset, Math.random() * 2, 0.09);
        });
      }, 1450);

      disposers.push(() => {
        window.clearInterval(interval);
        try {
          src.stop();
        } catch {}
      });
    } else if (id === 'cafeteria') {
      // Warm coffeehouse murmur + subtle occasional porcelain chime
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.85;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);

      const subGain = ctx.createGain();
      subGain.gain.value = 0.7;

      src.connect(bp);
      bp.connect(subGain);
      subGain.connect(mainGain);
      src.start();
      lfo.start();

      const cupInterval = window.setInterval(() => {
        if (!this.ctx || Math.random() > 0.55) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1650 + Math.random() * 450, t);
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
        osc.connect(g);
        g.connect(mainGain);
        osc.start(t);
        osc.stop(t + 0.17);
      }, 3200);

      disposers.push(() => {
        window.clearInterval(cupInterval);
        try {
          src.stop();
          lfo.stop();
        } catch {}
      });
    } else if (id === 'grillos') {
      // Soft summer night crickets
      const cricketInterval = window.setInterval(() => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        for (let pulse = 0; pulse < 3; pulse++) {
          const start = t + pulse * 0.055;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(4150 + (Math.random() - 0.5) * 80, start);
          g.gain.setValueAtTime(0.001, start);
          g.gain.linearRampToValueAtTime(0.055, start + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, start + 0.042);
          osc.connect(g);
          g.connect(mainGain);
          osc.start(start);
          osc.stop(start + 0.045);
        }
      }, 920);

      disposers.push(() => {
        window.clearInterval(cricketInterval);
      });
    } else if (id === 'noche') {
      // Enveloping midnight breeze & deep nocturnal air
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 290;
      filter.Q.value = 1.8;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.14;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 110;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      src.connect(filter);
      filter.connect(mainGain);
      src.start();
      lfo.start();

      disposers.push(() => {
        try {
          src.stop();
          lfo.stop();
        } catch {}
      });
    } else if (id === 'chimenea') {
      // Warm hearth ember hum + gentle wood crackles
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      src.connect(lp);
      lp.connect(mainGain);
      src.start();

      const crackleInterval = window.setInterval(() => {
        if (!this.ctx || !this.noiseBuffer) return;
        const t = this.ctx.currentTime;
        const pop = this.ctx.createBufferSource();
        pop.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 1800 + Math.random() * 900;
        hp.Q.value = 3.2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.24, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
        pop.connect(hp);
        hp.connect(g);
        g.connect(mainGain);
        pop.start(t, Math.random() * 2, 0.03);
      }, 420);

      disposers.push(() => {
        window.clearInterval(crackleInterval);
        try {
          src.stop();
        } catch {}
      });
    }

    return {
      gainNode: mainGain,
      cleanup: () => {
        disposers.forEach((fn) => fn());
        try {
          mainGain.disconnect();
        } catch {}
      },
    };
  }
}

export const soundEngine = new NocturnaSoundEngine();
