// マーケットプレイス等で入手したGLBモデルで生物を置き換えるパイプライン。
//
// 使い方:
//   1. public/models/ に .glb を置く
//   2. public/models/manifest.json に種ID → 設定を書く
//        { "great_white": { "file": "great_white.glb", "yaw": 3.1416 } }
//   3. リロードすると該当種が自動でGLBに置き換わる(無ければ手続き生成のまま)
//
// 設定項目:
//   file:  models/ からの相対パス(必須)
//   yaw/pitch/roll: 向き補正(ラジアン)。ゲームは +Z が前方
//   scale: 体長正規化後の追加倍率(default 1)
//   noSwim: true でスキンアニメ無しモデルへの泳ぎシェーダー適用を止める
//   swimAxis: 泳ぎシェーダーの体軸('z' | '-z' | 'x' | '-x'、default 'z')

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { uTime } from '../core/uniforms';
import { rand } from '../core/noise';
import type { SpeciesDef } from './SpeciesData';

interface ModelEntry {
  file: string;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: number;
  noSwim?: boolean;
  swimAxis?: 'z' | '-z' | 'x' | '-x';
}

export interface LoadedCreature {
  object: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
}

type SwapCallback = (loaded: LoadedCreature) => void;

let manifest: Record<string, ModelEntry> | null = null;
let manifestReady = false;
let loader: GLTFLoader | null = null;
const pendingSwaps: { def: SpeciesDef; onLoaded: SwapCallback }[] = [];

/** 起動時に一度呼ぶ。manifest取得後、登録済みの生物を順次置き換える */
export function initModelLibrary(renderer: THREE.WebGLRenderer): void {
  loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('decoders/draco/');
  loader.setDRACOLoader(draco);
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath('decoders/basis/');
  ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  void fetch('models/manifest.json')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((json: Record<string, ModelEntry> | null) => {
      manifest = json;
      manifestReady = true;
      for (const p of pendingSwaps) void trySwap(p.def, p.onLoaded);
      pendingSwaps.length = 0;
    });
}

/**
 * 生物の生成時に呼ぶ。manifestにモデルがあれば読み込み、完了時にコールバックする。
 * manifest取得前の呼び出しはキューに積む。
 */
export function attachModel(def: SpeciesDef, onLoaded: SwapCallback): void {
  if (!manifestReady) {
    pendingSwaps.push({ def, onLoaded });
    return;
  }
  void trySwap(def, onLoaded);
}

async function trySwap(def: SpeciesDef, onLoaded: SwapCallback): Promise<void> {
  const entry = manifest?.[def.id];
  if (!entry || !loader) return;
  try {
    const gltf = await loader.loadAsync('models/' + entry.file);
    const root = gltf.scene;
    root.rotation.set(entry.pitch ?? 0, entry.yaw ?? 0, entry.roll ?? 0);

    // 体長へ正規化(回転補正後のバウンディングボックス基準)
    const holder = new THREE.Group();
    holder.add(root);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    const k = (def.length / maxDim) * (entry.scale ?? 1);
    holder.scale.setScalar(k);
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    holder.position.sub(center);

    const wrap = new THREE.Group();
    wrap.add(holder);
    wrap.name = def.id + '-glb';

    let mixer: THREE.AnimationMixer | undefined;
    if (gltf.animations.length > 0) {
      // スキンアニメ付き: 最初のクリップを再生
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(gltf.animations[0]).play();
      mixer.update(rand(0, 2)); // 個体ごとに位相をずらす
    } else if (!entry.noSwim) {
      // 骨なしモデル: 手続き泳ぎシェーダーをマテリアルへ注入
      applySwayToModel(root, def, entry, maxDim);
    }
    onLoaded({ object: wrap, mixer });
  } catch (e) {
    console.warn(`[ModelLibrary] ${def.id} の読み込みに失敗。手続き生成のまま続行`, e);
  }
}

/** 骨なしGLBに泳ぎの揺れを与える(モデルのローカル空間で体軸方向に減衰する横揺れ) */
function applySwayToModel(root: THREE.Object3D, def: SpeciesDef, entry: ModelEntry, modelLen: number): void {
  const freq = def.fish?.swimFreq ?? 3;
  // 振幅はモデル単位(あとで体長スケールが掛かる)
  const amp = modelLen * 0.03;
  const axis = entry.swimAxis ?? 'z';
  const axisExpr = axis === 'z' ? 'position.z'
    : axis === '-z' ? '(-position.z)'
    : axis === 'x' ? 'position.x'
    : '(-position.x)';
  const phase = { value: rand(0, Math.PI * 2) };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m, i) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.uniforms.uPhase = phase;
        sh.vertexShader =
          'uniform float uTime;\nuniform float uPhase;\n' +
          sh.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            {
              float swT = clamp(0.5 - ${axisExpr} / ${modelLen.toFixed(4)}, 0.0, 1.0);
              transformed.x += sin(uTime * ${freq.toFixed(3)} + uPhase - swT * 2.6) * ${amp.toFixed(5)} * (0.1 + swT * swT);
            }`
          );
      };
      m.customProgramCacheKey = () => `glb-sway-${def.id}-${i}`;
    });
  });
}
