import { GAME } from '../configs/game';

/** Нота: высота (C4, A#3…), длительность в долях такта. */
type Note = [string, number];
/**
 * Гимн России (музыка А. В. Александрова): мелодия куплета и бас по тактам, темп — долей в минуту.
 * Ведущий голос — мягкая «медь» (треугольник с тихой пилой октавой ниже), под ним — бас на первую долю.
 */
const ANTHEM = {
  bpm: 76,
  melody: [
    ['G4', 1],
    ['C5', 2], ['G4', 1.5], ['A4', 0.5], ['B4', 2], ['E4', 1], ['E4', 1],
    ['A4', 2], ['G4', 1.5], ['F4', 0.5], ['G4', 2], ['C4', 1], ['C4', 1],
    ['D4', 2], ['D4', 1.5], ['E4', 0.5], ['F4', 2], ['F4', 1.5], ['G4', 0.5],
    ['A4', 2], ['B4', 1], ['C5', 1], ['D5', 3], ['G4', 1],
    ['E5', 2], ['D5', 1.5], ['C5', 0.5], ['D5', 2], ['B4', 1], ['G4', 1],
    ['C5', 2], ['B4', 1.5], ['A4', 0.5], ['B4', 2], ['E4', 1], ['E4', 1],
    ['A4', 2], ['G4', 1.5], ['F4', 0.5], ['G4', 2], ['C4', 1], ['C4', 1],
    ['C5', 2], ['B4', 1.5], ['A4', 0.5], ['G4', 4],
  ] as Note[],
  /** Бас — по такту (4 доли), начиная после затакта. */
  bass: ['C3', 'E3', 'F3', 'C3', 'G2', 'F2', 'A2', 'G2', 'C3', 'G2', 'A2', 'E2', 'F2', 'C3', 'G2', 'C3'],
} as const;
/**
 * Частые звуки боя звучат каждый раз чуть выше или ниже (± PITCH_JITTER доли частоты): сотый одинаковый удар
 * утомляет, а небольшой разброс сохраняет узнаваемость (лекция 6).
 */
const PITCH_JITTER = 0.05;
const VARIED_SOUNDS: ReadonlySet<string> = new Set(['swing', 'slash', 'shing', 'heavy', 'thrust', 'bow', 'hit', 'hurt', 'dash', 'poof', 'splat', 'pickup']);
/** Частота ноты: C4 = до первой октавы. */
function freq(note: string): number {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) return 440;
  const n = names.indexOf(m[1]!) + (Number(m[2]) + 1) * 12;
  return 440 * 2 ** ((n - 69) / 12);
}

/**
 * Звуки и музыка без файлов: всё синтезируется WebAudio.
 * Браузер разрешает звук только после первого нажатия, поэтому init() вызывается по клику/клавише.
 */
class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  muted = false;
  private musicTimer = 0;
  private musicMode: 'calm' | 'tense' | 'off' = 'off';
  private step = 0;
  /** Играющий гимн: его громкость (отключить — тишина сразу) и таймер конца; музыка, которая играла до него. */
  private anthem: { gain: GainNode; timer: number; resume: 'calm' | 'tense' | 'off' } | null = null;
  /** Множитель частоты для звука, который играет сейчас (play задаёт его для VARIED_SOUNDS, потом — снова 1). */
  private pitch = 1;

  constructor() {
    try { this.muted = JSON.parse(localStorage.getItem(GAME.settingsKey) ?? '{}').muted === true; } catch { /* нет настроек */ }
  }

  init(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.7;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.5;
        this.musicGain.connect(this.master);
      } catch { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    try { localStorage.setItem(GAME.settingsKey, JSON.stringify({ muted: this.muted })); } catch { /* ок */ }
    return this.muted;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0, dest?: AudioNode): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0 * this.pitch, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.pitch), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, delay = 0, q = 1): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq * this.pitch; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  play(name: string): void {
    if (!this.ctx || this.muted) return;
    this.pitch = VARIED_SOUNDS.has(name) ? 1 + (Math.random() * 2 - 1) * PITCH_JITTER : 1;
    this.voice(name);
    this.pitch = 1;
  }

  private voice(name: string): void {
    switch (name) {
      case 'click': this.tone(520, 700, 0.06, 'square', 0.08); break;
      case 'select': this.tone(380, 380, 0.05, 'square', 0.05); break;
      case 'error': this.tone(180, 120, 0.15, 'sawtooth', 0.1); break;
      case 'swing': this.noise(0.14, 1800, 0.22, 0, 0.7); this.tone(300, 120, 0.1, 'triangle', 0.06); break;
      // голоса удара (оружие складывается — звучат разом): свист клинка, звон катаны, тяжёлый гул, свист укола, тетива, гром
      case 'slash': this.noise(0.12, 2400, 0.2, 0, 0.8); this.tone(500, 200, 0.1, 'triangle', 0.05); break;
      case 'shing': this.tone(1800, 2600, 0.12, 'triangle', 0.05); this.tone(3200, 2400, 0.16, 'sine', 0.035); this.noise(0.07, 4200, 0.12, 0, 2); break;
      case 'heavy': this.noise(0.24, 600, 0.35, 0, 0.6); this.tone(140, 55, 0.22, 'sine', 0.2); break;
      case 'thrust': this.noise(0.09, 1500, 0.22, 0, 1.5); this.tone(620, 300, 0.08, 'square', 0.035); break;
      case 'bow': this.tone(240, 170, 0.18, 'triangle', 0.11); this.tone(480, 420, 0.1, 'sine', 0.05); this.noise(0.05, 3000, 0.1, 0, 2); break;
      case 'thunder': this.noise(0.3, 300, 0.35, 0, 0.6); this.tone(90, 40, 0.3, 'sawtooth', 0.08); for (let i = 0; i < 3; i++) this.noise(0.03, 3500, 0.2, 0.04 + i * 0.05, 3); break;
      // голоса магии
      case 'fire': this.noise(0.35, 900, 0.28, 0, 0.5); this.tone(180, 380, 0.3, 'sawtooth', 0.035); break;
      case 'frost': this.tone(1600, 1600, 0.25, 'sine', 0.06); this.tone(2400, 2400, 0.3, 'sine', 0.045, 0.05); this.noise(0.14, 5000, 0.08, 0, 2); break;
      case 'zap': this.tone(900, 300, 0.12, 'square', 0.05); this.noise(0.1, 3500, 0.16, 0, 2); break;
      case 'chime': this.tone(880, 880, 0.3, 'sine', 0.05); this.tone(1320, 1320, 0.35, 'sine', 0.04, 0.08); break;
      case 'wind': this.noise(0.5, 800, 0.2, 0, 0.3); this.noise(0.4, 1600, 0.08, 0.1, 0.5); break;
      case 'blades': [1400, 1760, 2100].forEach((f, i) => this.tone(f, f * 1.02, 0.35, 'sine', 0.035, i * 0.06)); break;
      case 'hit': this.noise(0.1, 900, 0.4); this.tone(220, 70, 0.12, 'square', 0.12); break;
      case 'pickup': this.tone(660, 990, 0.07, 'square', 0.07); this.tone(990, 1320, 0.08, 'square', 0.06, 0.06); break;
      case 'hurt': this.tone(260, 60, 0.28, 'sawtooth', 0.16); this.noise(0.12, 600, 0.3); break;
      case 'dash': this.noise(0.18, 1200, 0.2, 0, 0.5); break;
      case 'poof': this.noise(0.25, 700, 0.35, 0, 0.7); this.tone(200, 90, 0.18, 'triangle', 0.1); break;
      case 'splat': this.noise(0.15, 450, 0.4, 0, 1.5); this.tone(150, 60, 0.15, 'sine', 0.2); break;
      case 'build': for (let i = 0; i < 4; i++) { this.noise(0.07, 700 + i * 90, 0.45, i * 0.11, 2); this.tone(130, 90, 0.08, 'square', 0.1, i * 0.11); } this.tone(523, 784, 0.4, 'triangle', 0.14, 0.5); this.tone(784, 1046, 0.5, 'triangle', 0.12, 0.65); break;
      case 'heal': this.tone(440, 880, 0.3, 'sine', 0.16); this.tone(660, 1320, 0.3, 'sine', 0.1, 0.1); break;
      case 'rest': this.tone(392, 392, 0.4, 'sine', 0.1); this.tone(523, 523, 0.4, 'sine', 0.1, 0.15); this.tone(659, 659, 0.6, 'sine', 0.1, 0.3); break;
      case 'portal': this.tone(200, 800, 0.7, 'sine', 0.14); this.tone(300, 1200, 0.7, 'triangle', 0.06); break;
      case 'warn': this.tone(150, 110, 0.35, 'sawtooth', 0.12); break;
      case 'roar': this.tone(90, 40, 0.7, 'sawtooth', 0.22); this.noise(0.6, 300, 0.4); break;
      case 'slam': this.noise(0.35, 220, 0.8, 0, 0.6); this.tone(80, 35, 0.35, 'sine', 0.35); break;
      case 'death': this.tone(300, 40, 0.8, 'sawtooth', 0.15); break;
      case 'victory': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.4, 'triangle', 0.14, i * 0.13)); break;
      default: break;
    }
  }

  /** Гимн: заиграть (фоновая музыка замолкает) или, если уже играет, остановить. Возвращает: играет ли теперь. */
  toggleAnthem(): boolean {
    if (this.anthem) { this.stopAnthem(); return false; }
    if (!this.ctx || !this.master) return false;
    const ctx = this.ctx, gain = ctx.createGain(), beat = 60 / ANTHEM.bpm, t0 = ctx.currentTime + 0.1;
    gain.gain.value = 1; gain.connect(this.master);
    const voice = (f: number, at: number, dur: number, type: OscillatorType, vol: number): void => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.04);
      g.gain.setValueAtTime(vol, at + Math.max(0.05, dur - 0.08));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(gain); o.start(at); o.stop(at + dur + 0.05);
    };
    let t = t0;
    for (const [note, beats] of ANTHEM.melody) {
      const f = freq(note), dur = beats * beat;
      voice(f, t, dur * 0.95, 'triangle', 0.16);
      voice(f / 2, t, dur * 0.95, 'sawtooth', 0.025);
      t += dur;
    }
    ANTHEM.bass.forEach((note, i) => voice(freq(note), t0 + beat + i * 4 * beat, 4 * beat * 0.95, 'sine', 0.14));
    const resume = this.musicMode;
    this.music('off');
    this.anthem = { gain, timer: window.setTimeout(() => this.stopAnthem(), (t - t0 + 0.4) * 1000), resume };
    return true;
  }

  /** Остановить гимн (если играет) и вернуть прежнюю музыку. */
  stopAnthem(): void {
    const a = this.anthem;
    if (!a) return;
    this.anthem = null;
    window.clearTimeout(a.timer);
    a.gain.disconnect();
    this.music(a.resume);
  }

  get anthemPlaying(): boolean { return this.anthem !== null; }

  // ---------- музыка: тихий генератор мелодий ----------
  music(mode: 'calm' | 'tense' | 'off'): void {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    window.clearInterval(this.musicTimer);
    this.step = 0;
    if (mode === 'off') return;
    const beat = mode === 'calm' ? 520 : 420;
    this.musicTimer = window.setInterval(() => this.musicStep(), beat);
  }

  private musicStep(): void {
    if (!this.ctx || this.muted || !this.musicGain) return;
    const A = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    const s = this.step++;
    if (this.musicMode === 'calm') {
      const chord = [[0, 2, 4], [5 - 5, 3, 5], [2, 4, 6], [1, 3, 5]][Math.floor(s / 8) % 4] ?? [0, 2, 4];
      const idx = chord[s % 3] ?? 0;
      this.tone(A[idx]!, A[idx]!, 1.1, 'triangle', 0.07, 0, this.musicGain);
      if (s % 8 === 0) this.tone(A[chord[0]!]! / 2, A[chord[0]!]! / 2, 3.6, 'sine', 0.09, 0, this.musicGain);
      if (s % 5 === 3) this.tone(A[(s * 3) % 8]! * 2, A[(s * 3) % 8]! * 2, 0.6, 'sine', 0.04, 0, this.musicGain);
    } else {
      if (s % 8 === 0) this.tone(55, 55, 3.4, 'sawtooth', 0.04, 0, this.musicGain);
      if (s % 4 === 0) this.tone(110, 108, 0.5, 'triangle', 0.08, 0, this.musicGain);
      if (s % 7 === 2) { const f = A[(s * 5) % 5]!; this.tone(f, f * 0.99, 0.9, 'sine', 0.05, 0, this.musicGain); }
    }
  }
}

export const audio = new AudioSystem();
