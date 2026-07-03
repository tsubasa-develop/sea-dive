const KEY = 'sea-dive-progress-v1';

export interface DiscoveredEntry {
  best: number;
  photoId?: string;
  at: number;
}

export const UNLOCKS = [
  { need: 0, limit: 32, label: '' },
  { need: 6, limit: 90, label: 'ドロップオフ・沈没船エリア' },
  { need: 14, limit: 999, label: '深海' },
];

export class Progress {
  discovered: Record<string, DiscoveredEntry> = {};

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.discovered = JSON.parse(raw);
    } catch { /* 壊れたデータは無視 */ }
  }

  get count(): number {
    return Object.keys(this.discovered).length;
  }

  get level(): number {
    let lv = 0;
    for (let i = 0; i < UNLOCKS.length; i++) {
      if (this.count >= UNLOCKS[i].need) lv = i;
    }
    return lv;
  }

  get depthLimit(): number {
    return UNLOCKS[this.level].limit;
  }

  /** 図鑑登録。新種なら isNew、深度解放が起きたら unlocked を返す */
  register(speciesId: string, score: number, photoId: string):
    { isNew: boolean; unlocked: { limit: number; label: string } | null } {
    const before = this.level;
    const cur = this.discovered[speciesId];
    const isNew = !cur;
    if (!cur || score >= cur.best) {
      this.discovered[speciesId] = { best: score, photoId, at: Date.now() };
    }
    this.save();
    const after = this.level;
    const unlocked = after > before
      ? { limit: UNLOCKS[after].limit, label: UNLOCKS[after].label }
      : null;
    return { isNew, unlocked };
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.discovered));
    } catch { /* quota等は無視 */ }
  }

  reset(): void {
    this.discovered = {};
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  }
}
