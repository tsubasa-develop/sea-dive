// すべてWebAudioで生成する環境音。外部音源ファイルは使わない。
export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private deepGain: GainNode | null = null;
  private muted = false;

  /** 初回のユーザー操作後に呼ぶこと */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // ブラウンノイズ(水中のこもった環境音)
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 420;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3;
    noise.connect(this.lp).connect(noiseGain).connect(this.master);
    noise.start();

    // うねりのLFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain).connect(noiseGain.gain);
    lfo.start();

    // 深海ドローン(深く潜ると聞こえてくる)
    this.deepGain = ctx.createGain();
    this.deepGain.gain.value = 0;
    const deepFilter = ctx.createBiquadFilter();
    deepFilter.type = 'lowpass';
    deepFilter.frequency.value = 160;
    for (const f of [52, 52.7, 78.2]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(deepFilter);
      osc.start();
    }
    deepFilter.connect(this.deepGain).connect(this.master);
  }

  setDepth(d: number): void {
    if (!this.ctx || !this.lp || !this.deepGain) return;
    const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(Math.max(90, 420 - d * 2.6), t, 0.5);
    this.deepGain.gain.setTargetAtTime(d > 62 ? 0.055 : 0, t, 1.5);
  }

  private tone(freq: number, delay: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseBurst(delay: number, dur: number, freq: number, q: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t0);
    bp.frequency.linearRampToValueAtTime(freq * 1.8, t0 + dur);
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
  }

  /** 呼気の泡の音 */
  exhale(): void {
    this.noiseBurst(0, 0.9, 650, 1.2, 0.09);
    for (let i = 0; i < 4; i++) {
      this.tone(500 + Math.random() * 500, 0.1 + i * 0.14, 0.08, 0.02, 'sine');
    }
  }

  shutter(): void {
    this.noiseBurst(0, 0.06, 2600, 2.5, 0.16);
    this.tone(1300, 0.02, 0.05, 0.06, 'square');
  }

  discovery(): void {
    this.tone(659, 0, 0.35, 0.09);       // E5
    this.tone(784, 0.1, 0.35, 0.09);     // G5
    this.tone(988, 0.2, 0.55, 0.1);      // B5
  }

  /** レア生物出現の予兆 */
  rare(): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(75, t0);
    osc.frequency.linearRampToValueAtTime(150, t0 + 1.2);
    osc.frequency.linearRampToValueAtTime(58, t0 + 2.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.11, t0 + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 3);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }
}
