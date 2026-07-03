export class Input {
  keys = new Set<string>();
  locked = false;
  onShoot?: () => void;
  onWheel?: (dy: number) => void;
  onKey?: (code: string) => void;
  onLockChange?: (locked: boolean) => void;
  private dx = 0;
  private dy = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.onKey?.(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.onShoot?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.onWheel?.(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      // 新しいChromeではPromiseを返す。非対応環境の拒否も握りつぶす
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') void r.catch(() => {});
    } catch { /* headless等では失敗する */ }
  }

  exitLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }
}
