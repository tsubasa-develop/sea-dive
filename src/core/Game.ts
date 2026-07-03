import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Ambience } from '../audio/Ambience';
import { CreatureManager } from '../creatures/CreatureManager';
import { SPECIES } from '../creatures/SpeciesData';
import { PhotoSystem } from '../photo/PhotoSystem';
import { AlbumStore } from '../state/AlbumStore';
import { Progress } from '../state/Progress';
import { UI, type DexEntry } from '../ui/UI';
import { Environment } from '../world/Environment';
import { Flora } from '../world/Flora';
import { Particles } from '../world/Particles';
import { createTerrain } from '../world/Terrain';
import { Input } from './Input';
import { clamp } from './noise';
import { Player } from './Player';
import { uTime } from './uniforms';

function zoneLabel(depth: number): string {
  return depth < 28 ? 'サンゴ礁' : depth < 75 ? 'ドロップオフ' : '深海';
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private env: Environment;
  private particles: Particles;
  private manager: CreatureManager;
  private input: Input;
  private player: Player;
  private photo = new PhotoSystem();
  private album = new AlbumStore();
  private progress = new Progress();
  private ui: UI;
  private ambience = new Ambience();
  private composer: EffectComposer;
  private exhaleTimer = 3;
  private started = false;
  private shooting = false;
  private debug = false;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    root.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    this.scene.add(this.camera); // フラッシュライトをぶら下げるため

    this.env = new Environment(this.scene, this.camera, this.renderer);
    this.scene.add(createTerrain());

    // ポストプロセス: 発光体(クラゲ・深海生物・水面のきらめき)に淡いブルーム
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.5, 0.85
    ));
    this.composer.addPass(new OutputPass());
    const flora = new Flora(this.scene);
    this.particles = new Particles(this.scene);
    this.manager = new CreatureManager(this.scene, {
      anemones: flora.anemones,
      cavePos: flora.cavePos,
      wreckPos: flora.wreckPos,
      patches: flora.patches,
    });

    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this.camera);
    this.player.depthLimit = this.progress.depthLimit;
    this.ui = new UI(root);
    void this.album.open();

    this.wire();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.frame());
    // デバッグ・自動テスト用フック
    (window as unknown as Record<string, unknown>).__game = this;
  }

  private wire(): void {
    this.ui.onStart = () => {
      this.ambience.start();
      this.started = true;
      this.input.requestLock();
    };
    this.ui.onStartDebug = () => {
      this.debug = true;
      this.manager.debugMode = true;
      this.player.depthLimit = 999;
      this.ui.setDebug(true);
      this.ambience.start();
      this.started = true;
      this.input.requestLock();
      this.ui.toast('[DEBUG] イベント高頻度モード · 1/2/3 テレポート · E 召喚', 'warn');
    };
    this.renderer.domElement.addEventListener('click', () => {
      if (this.started && !this.input.locked && !this.ui.modalOpen) this.input.requestLock();
    });
    this.input.onLockChange = (locked) => {
      if (locked) {
        this.ui.hideTitle();
      } else if (!this.ui.modalOpen) {
        // ポインタロック解除(ESC等) → ポーズ
        if (this.photo.active) this.exitPhotoMode();
        this.ui.showTitle(true);
      }
    };
    this.input.onShoot = () => {
      if (this.photo.active) void this.shoot();
    };
    this.input.onWheel = (dy) => {
      this.photo.wheel(dy, this.camera);
      this.ui.setZoom(this.photo.zoomRatio);
    };
    this.input.onKey = (code) => this.handleKey(code);

    this.manager.onEvent = (def) => {
      this.ui.toast(def.eventLine ?? '…何かが近づいてくる', 'rare');
      this.ambience.rare();
    };
    this.player.onLimitWarn = () => {
      this.ui.toast(`これ以上は潜れない(可潜深度 ${this.player.depthLimit}m)。図鑑を増やして解放しよう`, 'warn');
    };
    this.player.onBoundsWarn = () => this.ui.toast('これより先は何もない外洋だ', 'warn');

    this.ui.onResetProgress = () => {
      this.progress.reset();
      this.player.depthLimit = this.progress.depthLimit;
      this.ui.closeModals();
      this.ui.toast('図鑑と進行状況をリセットしました');
    };
    this.ui.onDeletePhoto = (id) => {
      void this.album.remove(id).then(() => this.openAlbum());
    };
    this.ui.onModalClosed = () => this.input.requestLock();
  }

  private handleKey(code: string): void {
    if (!this.started) return;
    if (this.debug && this.input.locked) {
      if (code === 'Digit1') this.teleport(24, -6, 24);
      else if (code === 'Digit2') this.teleport(0, -52, 122);
      else if (code === 'Digit3') this.teleport(-165, -116, 96);
      else if (code === 'KeyE') {
        const def = this.manager.forceEvent(this.player.position);
        if (def) this.ui.toast(`[DEBUG] ${def.name} を召喚`, 'rare');
      }
    }
    switch (code) {
      case 'KeyC':
        if (this.ui.modalOpen) break;
        if (this.photo.active) this.exitPhotoMode();
        else if (this.input.locked) {
          this.photo.enter(this.camera);
          this.ui.setCameraMode(true);
          this.ui.setZoom(this.photo.zoomRatio);
        }
        break;
      case 'KeyF': {
        const on = this.env.toggleFlashlight();
        this.ui.setLight(on);
        break;
      }
      case 'KeyM': {
        const muted = this.ambience.toggleMute();
        this.ui.toast(muted ? 'サウンド OFF' : 'サウンド ON');
        break;
      }
      case 'Tab':
        this.toggleModal('dex');
        break;
      case 'KeyP':
        this.toggleModal('album');
        break;
      case 'Escape':
        if (this.ui.closeModals()) this.input.requestLock();
        break;
    }
  }

  private toggleModal(kind: 'dex' | 'album'): void {
    if (this.ui.modalOpen) {
      this.ui.closeModals();
      this.input.requestLock();
      return;
    }
    if (this.photo.active) this.exitPhotoMode();
    this.input.exitLock();
    if (kind === 'dex') void this.openDex();
    else this.openAlbum();
  }

  private async openDex(): Promise<void> {
    const photos = await this.album.all();
    const byId = new Map(photos.map((p) => [p.id, p.dataUrl]));
    const entries: DexEntry[] = SPECIES.map((def) => {
      const d = this.progress.discovered[def.id];
      return {
        def,
        discovered: !!d,
        best: d?.best,
        thumbnail: d?.photoId ? byId.get(d.photoId) : undefined,
      };
    });
    this.ui.openDex(entries);
  }

  private openAlbum(): void {
    void this.album.all().then((photos) => this.ui.openAlbum(photos));
  }

  private teleport(x: number, y: number, z: number): void {
    this.player.position.set(x, y, z);
    this.player.velocity.set(0, 0, 0);
  }

  private exitPhotoMode(): void {
    this.photo.exit(this.camera);
    this.ui.setCameraMode(false);
    this.ui.setReticle(null, false);
  }

  private async shoot(): Promise<void> {
    if (this.shooting) return;
    this.shooting = true;
    try {
      const res = await this.photo.shoot(
        this.renderer, () => this.composer.render(), this.camera, this.manager, this.progress, this.album
      );
      this.ui.flash();
      this.ambience.shutter();
      this.ui.showResult(res);
      if (res.newSpecies.length > 0) {
        this.ambience.discovery();
        for (const s of res.newSpecies) this.ui.toast(`✦ 図鑑に登録: ${s.name}`, 'new');
      }
      if (res.unlocked) {
        if (!this.debug) this.player.depthLimit = res.unlocked.limit;
        this.ui.unlockBanner(res.unlocked.label, res.unlocked.limit);
      }
    } finally {
      this.shooting = false;
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private frame(): void {
    const dt = clamp(this.clock.getDelta(), 0, 0.05);
    uTime.value += dt;
    const t = uTime.value;
    const playing = this.input.locked && !this.ui.modalOpen;

    this.player.update(dt, this.input, playing);
    const pos = this.player.position;
    const depth = Math.max(0, -pos.y);

    const bg = this.env.update(pos);
    this.scene.background = bg;
    this.particles.update(dt, pos);
    this.manager.update(dt, t, pos, this.player.speed);
    this.ambience.setDepth(depth);

    // 呼吸(泡と音)
    if (playing) {
      this.exhaleTimer -= dt;
      if (this.exhaleTimer <= 0) {
        this.exhaleTimer = 3.6 + Math.random() * 1.6;
        const origin = pos.clone();
        origin.y += 0.25;
        this.particles.emitBubbles(origin, 6);
        this.ambience.exhale();
      }
    }

    this.ui.setHud(depth, zoneLabel(depth), this.progress.count, this.player.depthLimit);
    if (this.photo.active) {
      const target = this.photo.reticleTarget(this.camera, this.manager);
      if (target) {
        this.ui.setReticle(target.def.name, !!this.progress.discovered[target.def.id]);
      } else {
        this.ui.setReticle(null, false);
      }
    }

    this.composer.render();
  }
}
