import { SPECIES, rarityStars, ZONE_LABEL, type SpeciesDef } from '../creatures/SpeciesData';
import type { ShotResult } from '../photo/PhotoSystem';
import type { PhotoRecord } from '../state/AlbumStore';

export interface DexEntry {
  def: SpeciesDef;
  discovered: boolean;
  best?: number;
  thumbnail?: string;
}

export class UI {
  onStart?: () => void;
  onRespawn?: () => void;
  onResetProgress?: () => void;
  onDeletePhoto?: (id: string) => void;
  onModalClosed?: () => void;

  private root: HTMLElement;
  private el = {} as Record<string, HTMLElement>;
  private resultTimer = 0;
  private started = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.insertAdjacentHTML('beforeend', `
      <div id="vignette"></div>
      <div id="flash"></div>
      <div id="damage"></div>
      <div id="injury"></div>
      <div id="death-screen" class="hidden">
        <div id="death-inner">
          <h2>深海に呑まれた…</h2>
          <p>撮影した写真と図鑑の記録は失われません。</p>
          <button id="btn-respawn">新しい海で再スタート</button>
        </div>
      </div>
      <div id="hud" class="hidden">
        <div id="hud-topleft">
          <div id="hud-depth">0<span class="unit">m</span></div>
          <div id="hud-zone"></div>
          <div id="hud-limit"></div>
        </div>
        <div id="hud-topright">
          <div id="hud-dex">図鑑 0 / ${SPECIES.length}</div>
          <div id="hud-light" class="hidden">🔦 ライトON</div>
        </div>
        <div id="hud-debug" class="hidden">1/2/3 テレポート · E イベント召喚 · G サメ襲撃</div>
        <div id="hud-dot"></div>
        <div id="toasts"></div>
        <div id="hud-hints">左ドラッグ 視点 · WASD 移動 · SPACE 浮上 · SHIFT 潜行 · <b>C カメラ</b> · TAB 図鑑 · P アルバム · F ライト · M 音 · ESC ポーズ</div>
      </div>
      <div id="camera-ui" class="hidden">
        <div class="cam-corner tl"></div><div class="cam-corner tr"></div>
        <div class="cam-corner bl"></div><div class="cam-corner br"></div>
        <div class="cam-grid v1"></div><div class="cam-grid v2"></div>
        <div class="cam-grid h1"></div><div class="cam-grid h2"></div>
        <div id="cam-label">● REC 撮影モード</div>
        <div id="cam-target"></div>
        <div id="cam-zoom"><div id="cam-zoom-fill"></div></div>
        <div id="cam-hints">クリック シャッター · ドラッグ 視点 · ホイール ズーム · C 終了</div>
      </div>
      <div id="result-card" class="hidden"></div>
      <div id="unlock-banner" class="hidden"></div>
      <div id="modal-dex" class="modal hidden">
        <div class="modal-box">
          <div class="modal-head">
            <h2>海洋生物図鑑 <span id="dex-count"></span></h2>
            <div><button id="dex-reset" class="btn-sub">記録をリセット</button>
            <button class="btn-close" data-close>× 閉じる (TAB)</button></div>
          </div>
          <div id="dex-grid" class="modal-body"></div>
        </div>
      </div>
      <div id="modal-album" class="modal hidden">
        <div class="modal-box">
          <div class="modal-head">
            <h2>フォトアルバム <span id="album-count"></span></h2>
            <button class="btn-close" data-close>× 閉じる (P)</button>
          </div>
          <div id="album-grid" class="modal-body"></div>
        </div>
      </div>
      <div id="photo-viewer" class="modal hidden"></div>
      <div id="title-screen">
        <div id="title-inner">
          <p id="title-sub">未知の海を潜り、生き物を撮影して図鑑を完成させよう</p>
          <h1>Sea Dive<span>蒼の図鑑</span></h1>
          <div id="title-controls">
            <div><b>視点</b>左ドラッグ</div>
            <div><b>移動</b>WASD / 矢印キー</div>
            <div><b>浮上 / 潜行</b>SPACE / SHIFT</div>
            <div><b>カメラ構える</b>C</div>
            <div><b>シャッター</b>クリック(カメラ中)</div>
            <div><b>図鑑 / アルバム</b>TAB / P</div>
            <div><b>水中ライト</b>F(深海で必須)</div>
            <div><b>ポーズ</b>ESC</div>
          </div>
          <button id="btn-start">クリックしてダイブ開始</button>
          <p id="title-note">全深度を自由に探索できます。深海や沖には「何か」が潜んでいるかもしれません。</p>
        </div>
      </div>
    `);

    const q = (id: string): HTMLElement => root.querySelector('#' + id)!;
    for (const id of [
      'hud', 'hud-depth', 'hud-zone', 'hud-limit', 'hud-dex', 'hud-light', 'hud-debug', 'toasts',
      'camera-ui', 'cam-target', 'cam-zoom-fill', 'result-card', 'unlock-banner',
      'modal-dex', 'dex-grid', 'dex-count', 'modal-album', 'album-grid', 'album-count',
      'photo-viewer', 'title-screen', 'flash', 'damage', 'injury', 'death-screen',
    ]) this.el[id] = q(id);

    q('btn-start').addEventListener('click', () => this.onStart?.());
    q('btn-respawn').addEventListener('click', () => this.onRespawn?.());
    q('dex-reset').addEventListener('click', () => {
      if (confirm('図鑑と進行状況をリセットしますか?(写真は残ります)')) this.onResetProgress?.();
    });
    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => { this.closeModals(); this.onModalClosed?.(); }));
  }

  // ─────────── タイトル/ポーズ ───────────
  showTitle(paused: boolean): void {
    this.el['title-screen'].classList.remove('hidden');
    const btn = this.root.querySelector('#btn-start') as HTMLElement;
    btn.textContent = paused ? 'クリックして潜水を再開' : 'クリックしてダイブ開始';
  }

  hideTitle(): void {
    this.started = true;
    this.el['title-screen'].classList.add('hidden');
    this.el['hud'].classList.remove('hidden');
  }

  // ─────────── HUD ───────────
  setHud(depth: number, zone: string, dexCount: number, depthLimit: number): void {
    this.el['hud-depth'].innerHTML = `${depth.toFixed(1)}<span class="unit">m</span>`;
    this.el['hud-zone'].textContent = zone;
    this.el['hud-limit'].textContent = depthLimit < 999 ? `可潜深度 ${depthLimit}m` : '可潜深度 無制限';
    this.el['hud-dex'].textContent = `図鑑 ${dexCount} / ${SPECIES.length}`;
  }

  setLight(on: boolean): void {
    this.el['hud-light'].classList.toggle('hidden', !on);
  }

  setDebug(on: boolean): void {
    this.el['hud-debug'].classList.toggle('hidden', !on);
  }

  setCameraMode(on: boolean): void {
    this.el['camera-ui'].classList.toggle('hidden', !on);
    this.el['hud'].classList.toggle('camera', on);
  }

  setReticle(name: string | null, discovered: boolean): void {
    const el = this.el['cam-target'];
    if (!name) {
      el.textContent = '';
      return;
    }
    el.textContent = discovered ? name : `未登録の生物 (${name.length > 0 ? '?' : ''}??)`;
    el.classList.toggle('undiscovered', !discovered);
  }

  setZoom(ratio: number): void {
    this.el['cam-zoom-fill'].style.height = `${Math.round(ratio * 100)}%`;
  }

  flash(): void {
    const f = this.el['flash'];
    f.classList.remove('active');
    void f.offsetWidth; // reflow でアニメ再生
    f.classList.add('active');
  }

  /** サメ被弾時の赤いフラッシュ */
  damage(): void {
    const d = this.el['damage'];
    d.classList.remove('active');
    void d.offsetWidth;
    d.classList.add('active');
  }

  /** 重傷状態(次の被弾で死亡)の常時ビネット */
  setInjury(on: boolean): void {
    this.el['injury'].classList.toggle('active', on);
  }

  /** 死亡画面 */
  showDeath(): void {
    this.setInjury(false);
    this.el['death-screen'].classList.remove('hidden');
  }

  // ─────────── 撮影結果 ───────────
  showResult(res: ShotResult): void {
    const card = this.el['result-card'];
    const bonusHtml = res.bonuses.map((b) => `<span>${b.label} +${b.value}</span>`).join('');
    const newHtml = res.newSpecies.map((s) =>
      `<div class="result-new">✦ 新種登録!<b>${s.name}</b><span class="stars">${rarityStars(s.rarity)}</span></div>`
    ).join('');
    card.innerHTML = `
      <img src="${res.photo.dataUrl}" alt="">
      <div class="result-info">
        <div class="result-rank rank-${res.rank}">${res.rank === '-' ? '記録' : res.rank}</div>
        <div class="result-score">${res.score}<span>点</span></div>
        <div class="result-subject">${res.subjectDef ? res.subjectDef.name : '被写体なし'}</div>
        <div class="result-bonuses">${bonusHtml}</div>
        ${newHtml}
      </div>`;
    card.classList.remove('hidden');
    window.clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => card.classList.add('hidden'), 5500);
  }

  toast(msg: string, kind: 'info' | 'rare' | 'new' | 'warn' | 'danger' = 'info'): void {
    const div = document.createElement('div');
    div.className = `toast toast-${kind}`;
    div.textContent = msg;
    this.el['toasts'].appendChild(div);
    const long = kind === 'rare' || kind === 'danger';
    window.setTimeout(() => div.classList.add('out'), long ? 6000 : 3800);
    window.setTimeout(() => div.remove(), long ? 6600 : 4400);
  }

  unlockBanner(label: string, limit: number): void {
    const b = this.el['unlock-banner'];
    b.innerHTML = `<div class="unlock-title">潜水深度が解放された!</div>
      <div class="unlock-detail">${label} — 可潜深度 ${limit >= 999 ? '無制限' : limit + 'm'}</div>`;
    b.classList.remove('hidden');
    window.setTimeout(() => b.classList.add('hidden'), 6000);
  }

  // ─────────── 図鑑 ───────────
  openDex(entries: DexEntry[]): void {
    const zones: ('reef' | 'open' | 'deep')[] = ['reef', 'open', 'deep'];
    let html = '';
    for (const zone of zones) {
      html += `<h3 class="dex-zone">${ZONE_LABEL[zone]}</h3><div class="dex-row">`;
      for (const e of entries.filter((x) => x.def.zone === zone)) {
        if (e.discovered) {
          html += `
            <div class="dex-card found">
              <div class="dex-thumb">${e.thumbnail ? `<img src="${e.thumbnail}">` : '<div class="noimg">NO PHOTO</div>'}</div>
              <div class="dex-name">${e.def.name}</div>
              <div class="dex-stars">${rarityStars(e.def.rarity)} <span class="dex-best">BEST ${e.best ?? 0}点</span></div>
              <div class="dex-desc">${e.def.desc}</div>
              <div class="dex-depth">生息深度 ${e.def.depth[0]}〜${e.def.depth[1]}m</div>
            </div>`;
        } else {
          html += `
            <div class="dex-card">
              <div class="dex-thumb"><div class="noimg">???</div></div>
              <div class="dex-name">???</div>
              <div class="dex-stars">${rarityStars(e.def.rarity)}</div>
              <div class="dex-desc">生息深度 ${e.def.depth[0]}〜${e.def.depth[1]}m。まだ撮影されていない。</div>
            </div>`;
        }
      }
      html += '</div>';
    }
    this.el['dex-grid'].innerHTML = html;
    this.el['dex-count'].textContent = `${entries.filter((e) => e.discovered).length} / ${entries.length}`;
    this.el['modal-dex'].classList.remove('hidden');
  }

  // ─────────── アルバム ───────────
  openAlbum(photos: PhotoRecord[]): void {
    const grid = this.el['album-grid'];
    this.el['album-count'].textContent = `${photos.length}枚`;
    if (photos.length === 0) {
      grid.innerHTML = '<p class="album-empty">まだ写真がありません。Cキーでカメラを構えて撮影しよう。</p>';
    } else {
      grid.innerHTML = photos.map((p) => `
        <div class="album-card" data-photo="${p.id}">
          <img src="${p.dataUrl}">
          <div class="album-meta"><span class="rank-${p.rank}">${p.rank}</span> ${p.score}点 · ${p.subject} · 深度${p.depth}m</div>
        </div>`).join('');
      grid.querySelectorAll('.album-card').forEach((card) => {
        card.addEventListener('click', () => {
          const p = photos.find((x) => x.id === (card as HTMLElement).dataset.photo);
          if (p) this.showPhotoViewer(p);
        });
      });
    }
    this.el['modal-album'].classList.remove('hidden');
  }

  private showPhotoViewer(p: PhotoRecord): void {
    const v = this.el['photo-viewer'];
    const date = new Date(p.at);
    v.innerHTML = `
      <div class="viewer-box">
        <img src="${p.dataUrl}">
        <div class="viewer-bar">
          <span><b class="rank-${p.rank}">${p.rank}</b> ${p.score}点 · ${p.subject} · 深度${p.depth}m · ${date.toLocaleString('ja-JP')}</span>
          <span>
            <a class="btn-sub" href="${p.dataUrl}" download="seadive-${p.id}.jpg">💾 保存</a>
            <button class="btn-sub" data-del>🗑 削除</button>
            <button class="btn-close" data-close-viewer>× 閉じる</button>
          </span>
        </div>
      </div>`;
    v.classList.remove('hidden');
    v.querySelector('[data-close-viewer]')!.addEventListener('click', () => v.classList.add('hidden'));
    v.querySelector('[data-del]')!.addEventListener('click', () => {
      v.classList.add('hidden');
      this.onDeletePhoto?.(p.id);
    });
  }

  get modalOpen(): boolean {
    return !this.el['modal-dex'].classList.contains('hidden')
      || !this.el['modal-album'].classList.contains('hidden')
      || !this.el['photo-viewer'].classList.contains('hidden');
  }

  /** 開いているモーダルを閉じる。何か閉じたらtrue */
  closeModals(): boolean {
    let closed = false;
    for (const id of ['modal-dex', 'modal-album', 'photo-viewer']) {
      if (!this.el[id].classList.contains('hidden')) {
        this.el[id].classList.add('hidden');
        closed = true;
      }
    }
    return closed;
  }
}
