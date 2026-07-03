import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { uTime } from '../core/uniforms';
import { rand } from '../core/noise';
import type { FishLook, SpeciesDef } from './SpeciesData';

// 魚は +Z が頭、-Z が尾。テクスチャは u=体軸(0=頭)、v=体周。
// ひれのUVは右下隅の単色パッチを参照する。
const FIN_U = 0.97;
const FIN_V = 0.03;

export interface FishParams extends FishLook {
  length: number;
  clavus?: boolean;        // マンボウの舵びれ(尾びれの代わり)
  longPectorals?: number;  // 長い胸びれ(ザトウクジラ)。体長比
}

export function resolveParams(look: FishLook | undefined, length: number): FishParams {
  return {
    length,
    height: look?.height ?? 0.28,
    width: look?.width ?? 0.13,
    tailSpan: look?.tailSpan ?? 0.34,
    tailLen: look?.tailLen ?? 0.2,
    dorsalH: look?.dorsalH ?? 0.09,
    analH: look?.analH ?? 0,
    noseK: look?.noseK ?? 0.75,
    hump: look?.hump ?? 0,
    base: look?.base ?? '#8899aa',
    belly: look?.belly,
    pattern: look?.pattern,
    finColor: look?.finColor,
    emissiveDotsBelly: look?.emissiveDotsBelly,
    hammer: look?.hammer,
    lionfins: look?.lionfins,
    flukeH: look?.flukeH,
    eyeScale: look?.eyeScale,
    eyeX: look?.eyeX,
    swimFreq: look?.swimFreq ?? 5,
    swimAmp: look?.swimAmp ?? length * 0.055,
    swimMode: look?.swimMode,
    roughness: look?.roughness ?? 0.55,
    metalness: look?.metalness ?? 0.12,
  };
}

// ─────────────────────────── テクスチャ ───────────────────────────

export function makeFishTexture(p: FishParams): THREE.CanvasTexture {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(p.base);
  const belly = p.belly ? new THREE.Color(p.belly) : base.clone().offsetHSL(0, -0.1, 0.25);
  const back = base.clone().multiplyScalar(0.6);
  const css = (col: THREE.Color): string => '#' + col.getHexString();

  // canvas y: 0=左舷シーム, 0.25h=背, 0.5h=右舷, 0.75h=腹, h=左舷シーム
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, css(base));
  grad.addColorStop(0.18, css(back));
  grad.addColorStop(0.34, css(base));
  grad.addColorStop(0.6, css(belly));
  grad.addColorStop(0.88, css(belly));
  grad.addColorStop(1, css(base));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  const pat = p.pattern;
  if (pat) {
    g.globalAlpha = 0.88;
    g.fillStyle = pat.color ?? '#111';
    if (pat.kind === 'bands') {
      const n = pat.count ?? 3;
      const bw = (pat.width ?? 0.06) * w;
      for (let i = 0; i < n; i++) {
        const cx = w * (0.14 + 0.74 * (n === 1 ? 0.5 : i / (n - 1))) + rand(-2, 2);
        if (pat.edge) {
          g.fillStyle = '#15150f';
          g.fillRect(cx - bw / 2 - 3, 0, bw + 6, h);
          g.fillStyle = pat.color ?? '#fff';
        }
        g.fillRect(cx - bw / 2, 0, bw, h);
      }
    } else if (pat.kind === 'spots') {
      for (let i = 0; i < 130; i++) {
        const x = rand(0.06, 0.97) * w;
        const y = rand(0.04, 0.56) * h; // 背中側のみ
        g.beginPath();
        g.arc(x, y, rand(2.4, 4.6), 0, Math.PI * 2);
        g.fill();
      }
    } else if (pat.kind === 'speckle') {
      g.globalAlpha = 0.55;
      for (let i = 0; i < 70; i++) {
        g.beginPath();
        g.arc(rand(0.05, 0.95) * w, rand(0, 1) * h, rand(1.8, 4), 0, Math.PI * 2);
        g.fill();
      }
    } else if (pat.kind === 'eyeband') {
      g.fillRect(w * 0.07, 0, w * 0.06, h);
      g.fillRect(w * 0.82, 0, w * 0.05, h);
    } else if (pat.kind === 'hstripe') {
      g.fillRect(w * 0.08, h * 0.14, w * 0.72, h * 0.3);
    }
    g.globalAlpha = 1;
  }

  // 目(両舷 + シームのラップ分)
  const eyeX = w * (p.eyeX ?? 0.065);
  const eyeR = h * 0.06 * (p.eyeScale ?? 1);
  // 継ぎ目(y=0/h)は上下の半円が合わさって1つの目になる
  for (const ey of [0, 0.5 * h, h]) {
    g.fillStyle = '#e8e8e8';
    g.beginPath(); g.arc(eyeX, ey, eyeR, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0a0c';
    g.beginPath(); g.arc(eyeX + 1, ey, eyeR * 0.63, 0, Math.PI * 2); g.fill();
  }

  // ひれ用の単色パッチ(右下)
  g.fillStyle = p.finColor ?? css(base.clone().multiplyScalar(0.75));
  g.fillRect(w * 0.9, h * 0.9, w * 0.1, h * 0.1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeEmissiveDotsTexture(): THREE.CanvasTexture {
  const w = 256, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#8ef2ff';
  for (let i = 0; i < 9; i++) {
    const x = w * (0.14 + 0.08 * i);
    g.beginPath(); g.arc(x, h * 0.72, 2.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 4, h * 0.85, 1.8, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────── ジオメトリ ───────────────────────────

function triGeometry(verts: number[][], u = FIN_U, v = FIN_V): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(verts.flat());
  const uv = new Float32Array(verts.length * 2);
  for (let i = 0; i < verts.length; i++) { uv[i * 2] = u; uv[i * 2 + 1] = v; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function makeFishGeometry(p: FishParams): THREE.BufferGeometry {
  const L = p.length;
  const RINGS = 16, SEG = 12;
  const profile = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(Math.max(t, 1e-4), p.noseK!)), 0.9);
  const ryAt = (t: number): number => {
    let r = profile(t) * p.height! * L * 0.5;
    if (p.hump) r *= 1 + p.hump * Math.exp(-Math.pow((t - 0.28) / 0.18, 2)) * 0.5;
    return r;
  };
  const rxAt = (t: number): number => profile(t) * p.width! * L * 0.5;
  const zAt = (t: number): number => L * (0.5 - t);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const ry = ryAt(t), rx = rxAt(t), z = zAt(t);
    for (let j = 0; j <= SEG; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / SEG;
      positions.push(Math.cos(th) * rx, Math.sin(th) * ry, z);
      uvs.push(t, j / SEG);
    }
  }
  const ringW = SEG + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * ringW + j;
      const b = (i + 1) * ringW + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  body.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  body.setIndex(indices);
  const parts: THREE.BufferGeometry[] = [body.toNonIndexed()];

  const zT = -L / 2;
  const tl = p.tailLen! * L;
  const span = p.tailSpan! * L;
  if (p.clavus) {
    // マンボウ: 縦長の舵びれ
    parts.push(triGeometry([[0, span * 0.5, zT + 0.02 * L], [0, -span * 0.5, zT + 0.02 * L], [0, -span * 0.38, zT - 0.09 * L]]));
    parts.push(triGeometry([[0, span * 0.5, zT + 0.02 * L], [0, -span * 0.38, zT - 0.09 * L], [0, span * 0.38, zT - 0.09 * L]]));
  } else if (p.flukeH) {
    // 鯨類: 水平の尾びれ
    parts.push(triGeometry([[0, 0, zT + 0.02 * L], [span * 0.55, 0, zT - tl], [span * 0.14, 0, zT - tl * 0.5]]));
    parts.push(triGeometry([[0, 0, zT + 0.02 * L], [-span * 0.14, 0, zT - tl * 0.5], [-span * 0.55, 0, zT - tl]]));
  } else {
    parts.push(triGeometry([[0, 0, zT + 0.02 * L], [0, span * 0.5, zT - tl], [0, span * 0.12, zT - tl * 0.45]]));
    parts.push(triGeometry([[0, 0, zT + 0.02 * L], [0, -span * 0.12, zT - tl * 0.45], [0, -span * 0.5, zT - tl]]));
  }

  if (p.dorsalH! > 0) {
    // 頂点をやや後方に倒して流線的に
    parts.push(triGeometry([
      [0, ryAt(0.3) * 0.85, zAt(0.3)],
      [0, ryAt(0.52) + p.dorsalH! * L, zAt(0.54)],
      [0, ryAt(0.64) * 0.85, zAt(0.64)],
    ]));
  }
  if (p.analH! > 0) {
    parts.push(triGeometry([
      [0, -ryAt(0.34) * 0.85, zAt(0.34)],
      [0, -(ryAt(0.5) + p.analH! * L), zAt(0.5)],
      [0, -ryAt(0.66) * 0.85, zAt(0.66)],
    ]));
  }

  // 胸びれ
  const tP = 0.28;
  const zP = zAt(tP), rxP = rxAt(tP), ryP = ryAt(tP);
  if (p.longPectorals) {
    // ザトウクジラの長い胸びれ(白いオール状)
    const pl = p.longPectorals * L;
    for (const side of [-1, 1]) {
      const sx = side * rxP * 0.85, sy = -ryP * 0.2;
      const tx = side * (rxP + pl), ty = -ryP * 1.7, tz = zP - pl * 0.55;
      parts.push(triGeometry([[sx, sy, zP + 0.035 * L], [sx, sy, zP - 0.035 * L], [tx, ty, tz - 0.02 * L]]));
      parts.push(triGeometry([[sx, sy, zP + 0.035 * L], [tx, ty, tz - 0.02 * L], [tx, ty, tz + 0.02 * L]]));
    }
  } else {
    for (const side of [-1, 1]) {
      parts.push(triGeometry([
        [side * rxP * 0.9, -ryP * 0.15, zP],
        [side * (rxP + 0.15 * L), -ryP * 0.6, zP - 0.11 * L],
        [side * rxP * 0.9, -ryP * 0.5, zP - 0.15 * L],
      ]));
    }
  }

  if (p.hammer) {
    // 他パーツと属性を揃える(非インデックス化 + normal除去)
    const bar = new THREE.BoxGeometry(L * 0.4, L * 0.045, L * 0.085).toNonIndexed();
    bar.deleteAttribute('normal');
    bar.translate(0, 0, L * 0.45);
    const uv = bar.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3, 0.5);
    parts.push(bar);
  }

  if (p.lionfins) {
    // ミノカサゴの扇状の棘
    const t0 = 0.36;
    const z0 = zAt(t0), rx0 = rxAt(t0), ry0 = ryAt(t0);
    const N = 13;
    for (let i = 0; i < N; i++) {
      const a = (-1 + (2 * i) / (N - 1)) * 1.9; // 上半周
      const dx = Math.sin(a), dy = Math.cos(a);
      const bx = dx * rx0 * 0.8, by = dy * ry0 * 0.8;
      const tipX = dx * (rx0 + L * 0.5), tipY = dy * (ry0 + L * 0.45);
      parts.push(triGeometry([
        [bx, by, z0 + 0.02 * L],
        [bx, by, z0 - 0.03 * L],
        [tipX, tipY, z0 - L * 0.14],
      ]));
    }
  }

  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

// ─────────────────────────── 泳ぎアニメーション ───────────────────────────

export type SwimMode = 'sway' | 'flap' | 'waggle' | 'vsway';

export function applySwim(
  mat: THREE.Material, key: string, p: FishParams,
  mode: SwimMode, instanced: boolean, phaseRef?: { value: number }
): void {
  const L = p.length;
  const freq = p.swimFreq!;
  const amp = p.swimAmp!;
  const phase = phaseRef ?? { value: rand(0, Math.PI * 2) };
  mat.userData.phase = phase;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    if (!instanced) sh.uniforms.uPhase = phase;
    const ph = instanced ? 'aPhase' : 'uPhase';
    const decl = 'uniform float uTime;\n' + (instanced ? 'attribute float aPhase;\n' : 'uniform float uPhase;\n');
    let code = '';
    if (mode === 'sway') {
      code = `
        float swT = clamp(0.5 - position.z / ${L.toFixed(4)}, 0.0, 1.0);
        transformed.x += sin(uTime * ${freq.toFixed(3)} + ${ph} - swT * 2.6) * ${amp.toFixed(4)} * (0.1 + swT * swT);`;
    } else if (mode === 'vsway') {
      // 鯨類: 体を上下にうねらせる
      code = `
        float swT = clamp(0.5 - position.z / ${L.toFixed(4)}, 0.0, 1.0);
        transformed.y += sin(uTime * ${freq.toFixed(3)} + ${ph} - swT * 2.1) * ${amp.toFixed(4)} * (0.06 + swT * swT);`;
    } else if (mode === 'flap') {
      const half = Math.max(p.width! * L * 0.5, 0.001);
      code = `
        float swW = clamp(abs(position.x) / ${half.toFixed(4)}, 0.0, 1.2);
        transformed.y += sin(uTime * ${freq.toFixed(3)} + ${ph} - swW * 1.8) * ${amp.toFixed(4)} * swW * swW;`;
    } else {
      const half = Math.max(p.height! * L * 0.5, 0.001);
      code = `
        float swY = clamp(abs(position.y) / ${half.toFixed(4)}, 0.0, 1.3);
        transformed.x += sin(uTime * ${freq.toFixed(3)} + ${ph}) * ${amp.toFixed(4)} * swY * swY;`;
    }
    sh.vertexShader = decl + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n{${code}\n}`
    );
  };
  mat.customProgramCacheKey = () => `swim-${key}-${mode}-${instanced ? 'i' : 's'}`;
}

export function makeFishMaterial(p: FishParams, key: string, mode: SwimMode, instanced: boolean, phaseRef?: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: makeFishTexture(p),
    roughness: p.roughness,
    metalness: p.metalness,
    side: THREE.DoubleSide,
  });
  if (p.emissiveDotsBelly) {
    mat.emissive = new THREE.Color('#ffffff');
    mat.emissiveIntensity = 1.2;
    mat.emissiveMap = makeEmissiveDotsTexture();
  }
  applySwim(mat, key, p, mode, instanced, phaseRef);
  return mat;
}

// ─────────────────────────── 上位API ───────────────────────────

/** 単体の魚メッシュ(個体・イベント種用) */
export function fishMesh(def: SpeciesDef, mode: SwimMode = 'sway'): THREE.Mesh {
  const p = resolveParams(def.fish, def.length);
  const geo = makeFishGeometry(p);
  const mat = makeFishMaterial(p, def.id + '-solo', p.swimMode ?? mode, false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = def.id;
  return mesh;
}

/** 群れ用インスタンスメッシュ(位相attribute付き) */
export function fishInstanced(def: SpeciesDef, count: number): THREE.InstancedMesh {
  const p = resolveParams(def.fish, def.length);
  const geo = makeFishGeometry(p);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = rand(0, Math.PI * 2);
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const mat = makeFishMaterial(p, def.id, p.swimMode ?? 'sway', true);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.name = def.id;
  return mesh;
}
