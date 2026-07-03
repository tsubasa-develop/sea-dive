import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Ambience } from '../audio/Ambience';
import { CreatureManager } from '../creatures/CreatureManager';
import { initModelLibrary } from '../creatures/ModelLibrary';
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
  /** 検証・デバッグ用に公開 */
  readonly flora: Flora;
  private composer: EffectComposer;
  private exhaleTimer = 3;
  private started = false;
  private paused = false;
  private shooting = false;
  private shakeT = 0;
  /** サメの被弾数。2回で死亡 */
  private sharkHits = 0;
  private dead = false;

  /** 探索操作を受け付ける状態か */
  private get playing(): boolean {
    return this.started && !this.paused && !this.dead && !this.ui.modalOpen;
  }

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    root.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    this.scene.add(this.camera); // フラッシュライトをぶら下げるため

    // GLBモデル置き換え(public/models/manifest.json に登録された種)
    initModelLibrary(this.renderer);

    this.env = new Environment(this.scene, this.camera, this.renderer);
    this.scene.add(createTerrain());

    // ポストプロセス: MSAA付きレンダーターゲット + GTAO(環境遮蔽) + 淡いブルーム
    const bufSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, {
      samples: 4, type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const gtao = new GTAOPass(this.scene, this.camera, bufSize.x, bufSize.y);
    gtao.updateGtaoMaterial({ radius: 0.6, scale: 1.2, thickness: 1.2 });
    this.composer.addPass(gtao);
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.46, 0.55, 0.82
    ));
    this.composer.addPass(new OutputPass());
    const flora = new Flora(this.scene);
    this.flora = flora;
    this.particles = new Particles(this.scene);
    this.manager = new CreatureManager(this.scene, {
      anemones: flora.anemones,
      cavePos: flora.cavePos,
      wreckPos: flora.wreckPos,
      patches: flora.patches,
    });

    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this.camera);
    this.player.colliders = flora.colliders;
    // フリー探索モード: 深度制限なし・イベント高頻度
    this.player.depthLimit = 999;
    this.manager.debugMode = true;
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
      this.paused = false;
      this.ui.hideTitle();
      this.ui.setDebug(true);
    };
    this.input.onShoot = () => {
      if (this.playing && this.photo.active) void this.shoot();
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
    // サメ襲撃
    this.manager.onPredatorWarn = () => {
      this.ui.toast('!! 巨大な捕食者の気配…浅瀬のサンゴ礁へ逃げ込め!', 'danger');
      this.ambience.danger();
    };
    this.manager.onPredatorHit = (dir) => {
      if (this.dead) return;
      // ノックバック + 赤フラッシュ + シェイク
      this.player.velocity.addScaledVector(dir, 9);
      this.player.velocity.y += 2.2;
      this.ui.damage();
      this.ambience.bite();
      this.shakeT = 0.7;
      this.sharkHits++;
      if (this.sharkHits >= 2) {
        this.die();
      } else {
        this.ui.setInjury(true);
        this.ui.toast('重傷だ…! もう一度噛まれたらもたない', 'danger');
      }
    };
    this.manager.onPredatorGone = (escaped) => {
      if (this.dead) return;
      this.ui.toast(escaped ? 'サメは深みへ消えていった…助かった' : 'サメは興味を失い、去っていった', 'info');
      // 生き延びれば傷は癒える
      if (this.sharkHits > 0) {
        this.sharkHits = 0;
        this.ui.setInjury(false);
        this.ui.toast('傷はなんとか塞がりそうだ', 'info');
      }
    };
    this.ui.onRespawn = () => window.location.reload();
    this.player.onLimitWarn = () => {
      this.ui.toast(`これ以上は潜れない(可潜深度 ${this.player.depthLimit}m)。図鑑を増やして解放しよう`, 'warn');
    };
    this.player.onBoundsWarn = () => this.ui.toast('これより先は何もない外洋だ', 'warn');

    this.ui.onResetProgress = () => {
      this.progress.reset();
      this.ui.closeModals();
      this.ui.toast('図鑑と進行状況をリセットしました');
    };
    this.ui.onDeletePhoto = (id) => {
      void this.album.remove(id).then(() => this.openAlbum());
    };
  }

  /** サメに2回噛まれた — 死亡してリスタート待ち */
  private die(): void {
    this.dead = true;
    if (this.photo.active) this.exitPhotoMode();
    this.ui.closeModals();
    this.ambience.death();
    this.ui.showDeath();
    this.shakeT = 1.2;
    // ゆっくり沈んでいく
    this.player.velocity.set(0, -0.6, 0);
  }

  private handleKey(code: string): void {
    if (!this.started || this.dead) return;
    if (this.playing) {
      if (code === 'Digit1') this.teleport(24, -6, 24);
      else if (code === 'Digit2') this.teleport(0, -52, 122);
      else if (code === 'Digit3') this.teleport(-165, -116, 96);
      else if (code === 'KeyE') {
        const def = this.manager.forceEvent(this.player.position);
        if (def) this.ui.toast(`${def.name} を召喚`, 'rare');
      } else if (code === 'KeyG') {
        const def = this.manager.forcePredator(this.player.position);
        if (def) this.ui.toast(`${def.name} 襲撃開始`, 'warn');
      }
    }
    switch (code) {
      case 'KeyC':
        if (this.ui.modalOpen || this.paused) break;
        if (this.photo.active) this.exitPhotoMode();
        else {
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
        if (this.ui.closeModals()) break;
        // モーダルが開いていなければポーズをトグル
        if (this.paused) {
          this.paused = false;
          this.ui.hideTitle();
        } else {
          if (this.photo.active) this.exitPhotoMode();
          this.paused = true;
          this.ui.showTitle(true);
        }
        break;
    }
  }

  private toggleModal(kind: 'dex' | 'album'): void {
    if (this.ui.modalOpen) {
      this.ui.closeModals();
      return;
    }
    if (this.paused) return;
    if (this.photo.active) this.exitPhotoMode();
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
      // フリー探索モードでは深度は常に無制限(解放演出は不要)
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
    const playing = this.playing;

    this.player.update(dt, this.input, playing);
    // 被弾シェイク
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT * 0.09;
      this.camera.rotation.x += (Math.random() - 0.5) * k;
      this.camera.rotation.z += (Math.random() - 0.5) * k;
    }
    const pos = this.player.position;
    const depth = Math.max(0, -pos.y);

    const bg = this.env.update(pos);
    this.scene.background = bg;
    // 水中ライトはマウスカーソルの方向を照らす
    this.env.aimFlashlight(
      dt,
      (this.input.pointer.x / window.innerWidth) * 2 - 1,
      -(this.input.pointer.y / window.innerHeight) * 2 + 1,
      this.camera
    );
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
