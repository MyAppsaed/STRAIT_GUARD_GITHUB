// Lightweight WebAudio SFX + BGM synth — no external assets, fully offline.

type Kind = "fire" | "explosion" | "hit" | "click" | "win" | "lose";

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicTimer: number | null = null;
  musicMode: "menu" | "play" | null = null;
  muted = false;

  ensure() {
    if (this.ctx) return;
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.45;
    this.sfxGain.connect(this.master);
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  play(kind: Kind) {
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const out = this.sfxGain;

    const env = (g: GainNode, peak: number, attack: number, decay: number) => {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    };

    if (kind === "fire") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(900, t0);
      o.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
      env(g, 0.35, 0.005, 0.12);
      o.connect(g).connect(out);
      o.start(t0); o.stop(t0 + 0.14);
    } else if (kind === "explosion") {
      // noise burst
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass";
      filt.frequency.setValueAtTime(1200, t0);
      filt.frequency.exponentialRampToValueAtTime(120, t0 + 0.45);
      const g = ctx.createGain();
      env(g, 0.7, 0.005, 0.45);
      src.connect(filt).connect(g).connect(out);
      src.start(t0); src.stop(t0 + 0.5);
    } else if (kind === "hit") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, t0);
      o.frequency.exponentialRampToValueAtTime(80, t0 + 0.18);
      env(g, 0.5, 0.005, 0.2);
      o.connect(g).connect(out);
      o.start(t0); o.stop(t0 + 0.22);
    } else if (kind === "click") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(880, t0);
      env(g, 0.3, 0.002, 0.06);
      o.connect(g).connect(out);
      o.start(t0); o.stop(t0 + 0.08);
    } else if (kind === "win") {
      [523, 659, 784, 1046].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = f;
        const s = t0 + i * 0.12;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.3, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
        o.connect(g).connect(out);
        o.start(s); o.stop(s + 0.3);
      });
    } else if (kind === "lose") {
      [400, 300, 200, 120].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = f;
        const s = t0 + i * 0.15;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.35, s + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.35);
        o.connect(g).connect(out);
        o.start(s); o.stop(s + 0.4);
      });
    }
  }

  startMusic(mode: "menu" | "play") {
    this.ensure();
    if (!this.ctx || !this.musicGain) return;
    if (this.musicMode === mode && this.musicTimer !== null) return;
    this.stopMusic();
    this.musicMode = mode;
    const ctx = this.ctx;
    const out = this.musicGain;

    // Simple looping arpeggio. Menu = slow Dm; Play = faster Dm + bassline.
    const menuNotes = [146.83, 220.0, 261.63, 220.0, 174.61, 220.0, 261.63, 329.63];
    const playNotes = [146.83, 220.0, 261.63, 329.63, 293.66, 220.0, 174.61, 261.63];
    const notes = mode === "menu" ? menuNotes : playNotes;
    const step = mode === "menu" ? 0.42 : 0.22;
    let i = 0;

    const tick = () => {
      if (!this.ctx || this.musicMode !== mode) return;
      const t = this.ctx.currentTime;
      const f = notes[i % notes.length];
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.95);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + step);

      if (mode === "play" && i % 2 === 0) {
        const b = ctx.createOscillator(); const bg = ctx.createGain();
        b.type = "sine"; b.frequency.value = 73.42;
        bg.gain.setValueAtTime(0, t);
        bg.gain.linearRampToValueAtTime(0.6, t + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
        b.connect(bg).connect(out);
        b.start(t); b.stop(t + step * 2);
      }
      i++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, step * 1000);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicMode = null;
  }
}

export const audio = new AudioEngine();
