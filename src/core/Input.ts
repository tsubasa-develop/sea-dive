// マウスはドラッグ中のみ視点を回す方式。ポインターロックは使わない。
// 撮影モードでは「ほぼ動かさない短いクリック」をシャッターとして扱う。
const CLICK_MOVE_MAX = 6;   // px
const CLICK_TIME_MAX = 280; // ms

export class Input {
  keys = new Set<string>();
  /** 左ボタンを押してドラッグ中か */
  dragging = false;
  onShoot?: () => void;
  onWheel?: (dy: number) => void;
  onKey?: (code: string) => void;
  private dx = 0;
  private dy = 0;
  private moved = 0;
  private downAt = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.onKey?.(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.endDrag();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.moved = 0;
      this.downAt = performance.now();
      canvas.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
      this.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      const quick = performance.now() - this.downAt < CLICK_TIME_MAX;
      const still = this.moved < CLICK_MOVE_MAX;
      this.endDrag();
      if (quick && still) this.onShoot?.(); // 撮影モード時のみGame側で使う
    });
    canvas.addEventListener('wheel', (e) => {
      this.onWheel?.(e.deltaY);
    }, { passive: true });
    // 右クリックメニューはゲームの邪魔なので抑止
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private endDrag(): void {
    this.dragging = false;
    this.canvas.classList.remove('dragging');
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }
}
