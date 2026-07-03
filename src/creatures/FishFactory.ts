import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { uTime } from '../core/uniforms';
import { rand } from '../core/noise';
import type { FishLook, SpeciesDef } from './SpeciesData';

// 魚は +Z が頭、-Z が尾。テクスチャは u=体軸(0=頭)、v=体周。
// 体は u∈[0, 0.86] を使い、右端 u∈[0.88, 1.0] はひれ専用領域。
const BODY_U = 0.86;
// 三角ひれ(棘など)が参照する単色パッチの中心
const FIN_U = 0.94;
const FIN_V = 0.05;
// 面ひれ(尾びれ等)がマップされる鰭条ストライプ領域
const FIN_REGION = { u0: 0.885, v0: 0.16, u1: 0.995, v1: 0.94 };

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
    tailFork: look?.tailFork ?? 0.55,
    dorsalH: look?.dorsalH ?? 0.09,
    analH: look?.analH ?? 0.05,
    noseK: look?.noseK ?? 0.75,
    arch: look?.arch ?? 0.2,
    hump: look?.hump ?? 0,
    base: look?.base ?? '#8899aa',
    belly: look?.belly,
    pattern: look?.pattern,
    finColor: look?.finColor,
    scales: look?.scales ?? true,
    gillSlits: look?.gillSlits ?? false,
    eyeColor: look?.eyeColor,
    emissiveDotsBelly: look?.emissiveDotsBelly,
    hammer: look?.hammer,
    lionfins: look?.lionfins,
    flukeH: look?.flukeH,
    eyeScale: look?.eyeScale,
    eyeX: look?.eyeX,
    swimFreq: look?.swimFreq ?? 5,
    swimAmp: look?.swimAmp ?? length * 0.055,
    swimMode: look?.swimMode,
    roughness: look?.roughness ?? 0.5,
    metalness: look?.metalness ?? 0.12,
  };
}

// ─────────────────────────── テクスチャ ───────────────────────────

export function makeFishTexture(p: FishParams): THREE.CanvasTexture {
  const w = 1024, h = 512;
  const bw = w * BODY_U; // 体がマップされる横幅
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(p.base);
  const belly = p.belly ? new THREE.Color(p.belly) : base.clone().offsetHSL(0, -0.1, 0.25);
  const back = base.clone().multiplyScalar(0.52);
  const css = (col: THREE.Color, a = 1): string =>
    `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;

  // canvas y: 0=左舷シーム, 0.25h=背, 0.5h=右舷, 0.75h=腹, h=左舷シーム
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, css(base));
  grad.addColorStop(0.16, css(back));
  grad.addColorStop(0.25, css(back.clone().multiplyScalar(0.92)));
  grad.addColorStop(0.36, css(base));
  grad.addColorStop(0.55, css(base.clone().lerp(belly, 0.55)));
  grad.addColorStop(0.66, css(belly));
  grad.addColorStop(0.9, css(belly));
  grad.addColorStop(1, css(base));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // 背のまだら模様(ソフトな radial gradient の重ね合わせ)
  const mottle = back.clone().multiplyScalar(0.75);
  for (let i = 0; i < 46; i++) {
    const x = rand(0.03, 0.95) * bw;
    const y = rand(0.08, 0.42) * h;
    const r = rand(14, 44);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, css(mottle, 0.1));
    rg.addColorStop(1, css(mottle, 0));
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 腹側の真珠光沢
  for (const yy of [0.72 * h]) {
    const lg = g.createLinearGradient(0, yy - 30, 0, yy + 30);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.09)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, yy - 30, bw, 60);
  }

  // 鱗(overlapping arcs)。鯨類・エイなどは scales=false
  if (p.scales) {
    const rows = 30;
    const rr = h / rows * 0.62;
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * (h / rows);
      // 腹の中心では薄く
      const bellyDist = Math.min(Math.abs(y - 0.75 * h) / (0.25 * h), 1);
      const alpha = 0.028 + 0.05 * bellyDist;
      const off = (row % 2) * rr;
      for (let x = off; x < bw - 4; x += rr * 1.65) {
        g.strokeStyle = `rgba(10,14,20,${alpha})`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(x, y, rr, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
        g.strokeStyle = `rgba(255,255,255,${alpha * 0.75})`;
        g.beginPath();
        g.arc(x, y - 1.5, rr, Math.PI * 0.2, Math.PI * 0.8);
        g.stroke();
      }
    }
  }

  const pat = p.pattern;
  if (pat) {
    g.fillStyle = pat.color ?? '#111';
    if (pat.kind === 'bands') {
      const n = pat.count ?? 3;
      const bwid = (pat.width ?? 0.06) * bw;
      for (let i = 0; i < n; i++) {
        const cx = bw * (0.14 + 0.74 * (n === 1 ? 0.5 : i / (n - 1))) + rand(-2, 2);
        if (pat.edge) {
          g.fillStyle = 'rgba(21,21,15,0.9)';
          g.fillRect(cx - bwid / 2 - 5, 0, bwid + 10, h);
        }
        // ソフトエッジのバンド
        const lg = g.createLinearGradient(cx - bwid / 2 - 4, 0, cx + bwid / 2 + 4, 0);
        const pc = new THREE.Color(pat.color ?? '#111');
        lg.addColorStop(0, css(pc, 0));
        lg.addColorStop(0.18, css(pc, 0.92));
        lg.addColorStop(0.82, css(pc, 0.92));
        lg.addColorStop(1, css(pc, 0));
        g.fillStyle = lg;
        g.fillRect(cx - bwid / 2 - 4, 0, bwid + 8, h);
      }
    } else if (pat.kind === 'spots') {
      const pc = new THREE.Color(pat.color ?? '#111');
      for (let i = 0; i < 220; i++) {
        const x = rand(0.05, 0.97) * bw;
        const y = rand(0.04, 0.56) * h; // 背中側のみ
        const r = rand(3, 8);
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, css(pc, 0.85));
        rg.addColorStop(0.7, css(pc, 0.7));
        rg.addColorStop(1, css(pc, 0));
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    } else if (pat.kind === 'speckle') {
      const pc = new THREE.Color(pat.color ?? '#111');
      for (let i = 0; i < 140; i++) {
        const x = rand(0.04, 0.96) * bw;
        const y = rand(0, 1) * h;
        const r = rand(2.5, 7);
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, css(pc, 0.5));
        rg.addColorStop(1, css(pc, 0));
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    } else if (pat.kind === 'eyeband') {
      g.globalAlpha = 0.9;
      g.fillRect(bw * 0.07, 0, bw * 0.06, h);
      g.fillRect(bw * 0.82, 0, bw * 0.05, h);
      g.globalAlpha = 1;
    } else if (pat.kind === 'hstripe') {
      g.globalAlpha = 0.9;
      g.fillRect(bw * 0.08, h * 0.14, bw * 0.72, h * 0.3);
      g.globalAlpha = 1;
    }
  }

  // 虹色の光沢(側面に薄く。金属度が高いほど強い)
  {
    const k = 0.55 + (p.metalness ?? 0.12) * 1.4;
    for (const sy of [0, 0.5 * h, h]) {
      const ig = g.createLinearGradient(0, sy - h * 0.17, 0, sy + h * 0.17);
      ig.addColorStop(0, 'rgba(120,220,255,0)');
      ig.addColorStop(0.32, `rgba(140,255,220,${(0.09 * k).toFixed(3)})`);
      ig.addColorStop(0.5, `rgba(255,190,230,${(0.11 * k).toFixed(3)})`);
      ig.addColorStop(0.68, `rgba(160,200,255,${(0.09 * k).toFixed(3)})`);
      ig.addColorStop(1, 'rgba(120,220,255,0)');
      g.fillStyle = ig;
      g.fillRect(0, sy - h * 0.17, bw, h * 0.34);
    }
  }

  // 側線(両舷)
  g.strokeStyle = css(back, 0.28);
  g.lineWidth = 2.5;
  for (const sy of [0, 0.5 * h, h]) {
    g.beginPath();
    g.moveTo(bw * 0.13, sy);
    g.quadraticCurveTo(bw * 0.42, sy - h * 0.035, bw * 0.88, sy + h * 0.01);
    g.stroke();
  }

  // エラ(両舷 + シーム)
  for (const sy of [0, 0.5 * h, h]) {
    if (p.gillSlits) {
      // サメの鰓裂(5本)
      g.strokeStyle = 'rgba(10,14,18,0.55)';
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const x = bw * (0.155 + i * 0.023);
        g.beginPath();
        g.moveTo(x, sy - h * 0.055);
        g.quadraticCurveTo(x + 7, sy, x, sy + h * 0.055);
        g.stroke();
      }
    } else {
      // エラ蓋の曲線と、その後ろのわずかな陰
      const gx = bw * 0.14;
      const grd = g.createRadialGradient(gx, sy, 6, gx, sy, h * 0.15);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.82, 'rgba(6,10,14,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(gx - h * 0.16, sy - h * 0.16, h * 0.32, h * 0.32);
      g.strokeStyle = 'rgba(8,12,16,0.4)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.arc(gx - h * 0.045, sy, h * 0.115, -Math.PI * 0.42, Math.PI * 0.42);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(gx - h * 0.045 + 3, sy, h * 0.115, -Math.PI * 0.36, Math.PI * 0.36);
      g.stroke();
    }
    // 口
    g.strokeStyle = 'rgba(8,10,14,0.6)';
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(bw * 0.004, sy + h * 0.028);
    g.quadraticCurveTo(bw * 0.03, sy + h * 0.045, bw * 0.055, sy + h * 0.04);
    g.stroke();
  }

  // 目(両舷 + シームのラップ分)
  const eyeX = bw * (p.eyeX ?? 0.065);
  const eyeR = h * 0.055 * (p.eyeScale ?? 1);
  const iris = new THREE.Color(p.eyeColor ?? '#c8a44a');
  for (const ey of [0, 0.5 * h, h]) {
    // 眼窩の縁
    g.fillStyle = 'rgba(10,12,16,0.55)';
    g.beginPath(); g.arc(eyeX, ey, eyeR * 1.18, 0, Math.PI * 2); g.fill();
    // 白目〜虹彩〜瞳
    g.fillStyle = '#ddd8cc';
    g.beginPath(); g.arc(eyeX, ey, eyeR, 0, Math.PI * 2); g.fill();
    const ig = g.createRadialGradient(eyeX, ey, eyeR * 0.1, eyeX, ey, eyeR * 0.82);
    ig.addColorStop(0, css(iris.clone().multiplyScalar(1.25)));
    ig.addColorStop(1, css(iris.clone().multiplyScalar(0.55)));
    g.fillStyle = ig;
    g.beginPath(); g.arc(eyeX, ey, eyeR * 0.82, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#07070a';
    g.beginPath(); g.arc(eyeX + eyeR * 0.06, ey, eyeR * 0.48, 0, Math.PI * 2); g.fill();
    // ハイライト
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(eyeX - eyeR * 0.28, ey - eyeR * 0.3, eyeR * 0.16, 0, Math.PI * 2); g.fill();
  }

  // ── ひれ領域(右端) ──
  const finCol = p.finColor ? new THREE.Color(p.finColor) : base.clone().multiplyScalar(0.72);
  // 鰭条ストライプ領域: 半透明の膜っぽいグラデ + 放射状の筋
  const fx0 = w * 0.88, fx1 = w;
  const fy0 = 0, fy1 = h;
  const fg = g.createLinearGradient(fx0, 0, fx1, 0);
  fg.addColorStop(0, css(finCol));
  fg.addColorStop(1, css(finCol.clone().multiplyScalar(0.66)));
  g.fillStyle = fg;
  g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  // 鰭条(fin rays)
  g.strokeStyle = css(finCol.clone().multiplyScalar(0.45), 0.5);
  g.lineWidth = 2.2;
  for (let i = 0; i < 26; i++) {
    const y = (i + 0.5) * (h / 26);
    g.beginPath();
    g.moveTo(fx0, y);
    g.lineTo(fx1, y + h * 0.012);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = (i + 0.5) * (h / 26) + 2.4;
    g.beginPath();
    g.moveTo(fx0, y);
    g.lineTo(fx1, y + h * 0.012);
    g.stroke();
  }
  // 三角ひれ用の単色パッチ(右下)
  g.fillStyle = css(finCol);
  g.fillRect(w * 0.88, h * 0.9, w * 0.12, h * 0.1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** バンプマップ(鱗・エラ・鰭条の凹凸)。中間グレー=平坦 */
function makeFishBumpTexture(p: FishParams): THREE.CanvasTexture {
  const w = 512, h = 256;
  const bw = w * BODY_U;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);

  if (p.scales) {
    const rows = 30;
    const rr = h / rows * 0.62;
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * (h / rows);
      const off = (row % 2) * rr;
      for (let x = off; x < bw - 2; x += rr * 1.65) {
        // 鱗の上端は盛り上がり、下は影
        g.strokeStyle = 'rgba(230,230,230,0.5)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(x, y - 1, rr, Math.PI * 0.18, Math.PI * 0.82);
        g.stroke();
        g.strokeStyle = 'rgba(60,60,60,0.45)';
        g.beginPath();
        g.arc(x, y + 0.6, rr, Math.PI * 0.2, Math.PI * 0.8);
        g.stroke();
      }
    }
  }
  // エラ蓋 / 鰓裂の溝
  for (const sy of [0, 0.5 * h, h]) {
    g.strokeStyle = 'rgba(40,40,40,0.8)';
    g.lineWidth = 2.6;
    if (p.gillSlits) {
      for (let i = 0; i < 5; i++) {
        const x = bw * (0.155 + i * 0.023);
        g.beginPath();
        g.moveTo(x, sy - h * 0.055);
        g.quadraticCurveTo(x + 4, sy, x, sy + h * 0.055);
        g.stroke();
      }
    } else {
      g.beginPath();
      g.arc(bw * 0.14 - h * 0.045, sy, h * 0.115, -Math.PI * 0.42, Math.PI * 0.42);
      g.stroke();
    }
  }
  // 鰭条の畝(ひれ領域)
  g.strokeStyle = 'rgba(50,50,50,0.7)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) {
    const y = (i + 0.5) * (h / 26);
    g.beginPath();
    g.moveTo(w * 0.88, y);
    g.lineTo(w, y + h * 0.012);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
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
    const x = w * BODY_U * (0.14 + 0.08 * i);
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

/**
 * 滑らかな輪郭のひれ。2D点列(角を通る)を中点補間の二次曲線で結び、
 * UVは鰭条ストライプ領域へマップする。mtx でボディ座標系へ配置。
 */
function finFromShape(pts: [number, number][], mtx: THREE.Matrix4): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = pts.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m0 = mid(pts[0], pts[1]);
  shape.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const cur = pts[i % n];
    const nxt = pts[(i + 1) % n];
    const m = mid(cur, nxt);
    shape.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
  }
  const geo = new THREE.ShapeGeometry(shape, 5).toNonIndexed();
  geo.deleteAttribute('normal');
  // UV: 形状のバウンディングボックス → 鰭条領域
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sx = Math.max(bb.max.x - bb.min.x, 1e-5);
  const sy = Math.max(bb.max.y - bb.min.y, 1e-5);
  const posA = geo.attributes.position as THREE.BufferAttribute;
  const uvArr = new Float32Array(posA.count * 2);
  for (let i = 0; i < posA.count; i++) {
    const tx = (posA.getX(i) - bb.min.x) / sx;
    const ty = (posA.getY(i) - bb.min.y) / sy;
    uvArr[i * 2] = FIN_REGION.u0 + tx * (FIN_REGION.u1 - FIN_REGION.u0);
    uvArr[i * 2 + 1] = FIN_REGION.v0 + ty * (FIN_REGION.v1 - FIN_REGION.v0);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  geo.applyMatrix4(mtx);
  return geo;
}

export function makeFishGeometry(p: FishParams): THREE.BufferGeometry {
  const L = p.length;
  const RINGS = 32, SEG = 22;
  const profile = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(Math.max(t, 1e-4), p.noseK!)), 0.9);
  const ryAt = (t: number): number => {
    let r = profile(t) * p.height! * L * 0.5;
    if (p.hump) r *= 1 + p.hump * Math.exp(-Math.pow((t - 0.28) / 0.18, 2)) * 0.5;
    return r;
  };
  const rxAt = (t: number): number => profile(t) * p.width! * L * 0.5;
  // 背側をアーチ状に持ち上げる(腹は平ら気味に)— 実魚のシルエット
  const yOffAt = (t: number): number => ryAt(t) * p.arch!;
  const zAt = (t: number): number => L * (0.5 - t);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const ry = ryAt(t), rx = rxAt(t), z = zAt(t), yo = yOffAt(t);
    for (let j = 0; j <= SEG; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / SEG;
      positions.push(Math.cos(th) * rx, Math.sin(th) * ry + yo, z);
      uvs.push(t * BODY_U, j / SEG);
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
  const fork = p.tailFork!;

  // 尾びれを配置する行列: shape平面の +x → -z(後方)
  const tailMtx = (): THREE.Matrix4 => {
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    m.setPosition(0, yOffAt(0.98), zT + 0.03 * L);
    return m;
  };

  if (p.clavus) {
    // マンボウ: 縦長の丸い舵びれ
    parts.push(finFromShape([
      [0, span * 0.5], [tl * 0.7, span * 0.42], [tl * 0.9, 0],
      [tl * 0.7, -span * 0.42], [0, -span * 0.5],
    ], tailMtx()));
  } else if (p.flukeH) {
    // 鯨類: 水平の三日月尾びれ
    const m = new THREE.Matrix4()
      .makeRotationY(Math.PI / 2)
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(0, yOffAt(0.98), zT + 0.02 * L);
    parts.push(finFromShape([
      [0, 0], [tl * 0.55, span * 0.32], [tl, span * 0.52],
      [tl * 0.62, span * 0.1], [tl * 0.55, 0],
      [tl * 0.62, -span * 0.1], [tl, -span * 0.52], [tl * 0.55, -span * 0.32],
    ], m));
  } else {
    // 一般的な二叉尾。fork が浅いと丸尾に近づく
    const notch = tl * (1 - 0.62 * fork);
    parts.push(finFromShape([
      [0, span * 0.09], [tl * 0.55, span * 0.34], [tl, span * 0.5],
      [notch * 0.92, span * 0.12], [notch * 0.88, 0], [notch * 0.92, -span * 0.12],
      [tl, -span * 0.5], [tl * 0.55, -span * 0.34], [0, -span * 0.09],
    ], tailMtx()));
  }

  if (p.dorsalH! > 0) {
    // 背びれ: 背の稜線に沿った基部 + 後方に流れる輪郭
    const t0 = 0.3, t1 = 0.72;
    const zBase = zAt(t0);
    const back = (t: number): number => ryAt(t) * 0.92 + yOffAt(t);
    const bx = (t: number): number => zBase - zAt(t); // 後方距離
    const hFin = p.dorsalH! * L;
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    m.setPosition(0, 0, zBase);
    parts.push(finFromShape([
      [bx(t0), back(t0) * 0.9],
      [bx(t0 + 0.06), back(t0 + 0.1) + hFin],
      [bx(t0 + 0.22), back(t0 + 0.2) + hFin * 0.72],
      [bx(t1), back(t1) + hFin * 0.28],
      [bx(t1), back(t1) * 0.86],
      [bx((t0 + t1) / 2), back((t0 + t1) / 2) * 0.8],
    ], m));
  }
  if (p.analH! > 0) {
    const t0 = 0.5, t1 = 0.74;
    const zBase = zAt(t0);
    const bel = (t: number): number => -ryAt(t) * 0.92 + yOffAt(t);
    const bx = (t: number): number => zBase - zAt(t);
    const hFin = p.analH! * L;
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    m.setPosition(0, 0, zBase);
    parts.push(finFromShape([
      [bx(t0), bel(t0) * 0.88],
      [bx(t0 + 0.05), bel(t0 + 0.08) - hFin],
      [bx(t1), bel(t1) - hFin * 0.25],
      [bx(t1), bel(t1) * 0.85],
      [bx((t0 + t1) / 2), bel((t0 + t1) / 2) * 0.8],
    ], m));
  }

  // 胸びれ(しずく形)
  const tP = 0.27;
  const zP = zAt(tP), rxP = rxAt(tP), ryP = ryAt(tP);
  const pecLen = p.longPectorals ? p.longPectorals * L : L * 0.16;
  const pecWid = p.longPectorals ? pecLen * 0.22 : pecLen * 0.42;
  for (const side of [-1, 1]) {
    // 右側の姿勢(下向きに傾け後方へ流す)を作り、左側はX鏡映で対称に
    const m = new THREE.Matrix4()
      .makeRotationZ(-0.42)
      .multiply(new THREE.Matrix4().makeRotationY(1.05));
    if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    m.setPosition(side * rxP * 0.9, -ryP * 0.12 + yOffAt(tP), zP);
    parts.push(finFromShape([
      [0, pecWid * 0.3], [pecLen * 0.5, pecWid * 0.42], [pecLen, 0],
      [pecLen * 0.55, -pecWid * 0.4], [0, -pecWid * 0.28],
    ], m));
  }
  // 腹びれ(小さな一対)。幅広の体(エイ等)には付けない
  if (!p.flukeH && !p.clavus && p.width! < 0.7) {
    const tV = 0.4;
    const zV = zAt(tV), ryV = ryAt(tV);
    for (const side of [-1, 1]) {
      const m = new THREE.Matrix4()
        .makeRotationZ(-0.9)
        .multiply(new THREE.Matrix4().makeRotationY(0.9));
      if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      m.setPosition(side * rxAt(tV) * 0.4, -ryV * 0.85 + yOffAt(tV), zV);
      const pl = L * 0.09;
      parts.push(finFromShape([
        [0, pl * 0.14], [pl * 0.6, pl * 0.1], [pl, -pl * 0.12], [pl * 0.4, -pl * 0.16],
      ], m));
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
    bumpMap: makeFishBumpTexture(p),
    bumpScale: Math.min(Math.max(0.012 * p.length, 0.004), 0.05),
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
