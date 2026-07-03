import * as THREE from 'three';
import { fbm2, smoothstep, lerp, mulberry32 } from '../core/noise';
import { uTime } from '../core/uniforms';

// ワールド: 中心=浅いサンゴ礁台地 → 斜面 → 断崖(ドロップオフ) → 深海平原
export const WORLD_RADIUS = 258;

// ─── シードによるランダム地形 ───
// リロードのたびに新しい海が生まれる。マクロ構造(礁→断崖→深海)は保ちつつ、
// リング半径・深さ・うねり・海山・海底谷をシードから決定する。
export const WORLD_SEED = Math.floor(Math.random() * 0xffffffff);
const R = mulberry32(WORLD_SEED);

// ノイズ空間のオフセット(=地形の「模様」そのものが変わる)
const NX1 = R() * 512, NZ1 = R() * 512;
const NX2 = R() * 512, NZ2 = R() * 512;
const NX3 = R() * 512, NZ3 = R() * 512;

// リング半径
const SLOPE_R0 = 48 + R() * 16;                  // 礁斜面の始まり
const SLOPE_R1 = 98 + R() * 18;                  // 断崖の始まり
const CLIFF_R1 = SLOPE_R1 + 38 + R() * 16;       // 断崖の終わり
const ABYSS_R1 = 210 + R() * 28;                 // 深海平原に至る半径

// 各帯の深さ(深海種の生息条件を満たすよう下限を確保)
const D_PLATEAU = -(6 + R() * 2.5);
const D_SLOPE = 24 + R() * 10;
const D_CLIFF = 58 + R() * 14;
const D_ABYSS = 34 + R() * 12;
const REEF_FLOOR = D_PLATEAU - D_SLOPE;          // 礁斜面下端の目安
const CLIFF_FLOOR = REEF_FLOOR - D_CLIFF;        // 断崖下端の目安
const ABYSS_FLOOR = CLIFF_FLOOR - D_ABYSS;       // 深海平原の目安

// 海山(深海にそびえる岩の尖塔。参考画像の遠景シルエット)
interface Seamount { x: number; z: number; h: number; s2: number }
const SEAMOUNTS: Seamount[] = [];
{
  const n = 2 + Math.floor(R() * 3); // 2〜4座
  for (let i = 0; i < n; i++) {
    const rr = 168 + R() * 62;
    const th = R() * Math.PI * 2;
    const sigma = 13 + R() * 12;
    SEAMOUNTS.push({
      x: Math.cos(th) * rr, z: Math.sin(th) * rr,
      h: 30 + R() * 45, s2: sigma * sigma,
    });
  }
}

// 海底谷(礁から断崖へ抜けるひと筋の水路)
const CANYON_ANG = R() * Math.PI;
const CANYON_SIN = Math.sin(CANYON_ANG);
const CANYON_COS = Math.cos(CANYON_ANG);
const CANYON_W = 11 + R() * 8;
const CANYON_D = 9 + R() * 10;

/** 海底谷の方角(遺構の配置に使う) */
export const CANYON_ANGLE = CANYON_ANG;
/** 断崖が始まる半径(遺構の配置に使う) */
export const RING_SLOPE_END = SLOPE_R1;

export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let d = D_PLATEAU;
  d -= smoothstep(SLOPE_R0, SLOPE_R1, r) * D_SLOPE;
  d -= smoothstep(SLOPE_R1, CLIFF_R1, r) * D_CLIFF;
  d -= smoothstep(CLIFF_R1, ABYSS_R1, r) * D_ABYSS;
  // 大きなうねり(深いほど強く)
  d += fbm2(x * 0.018 + NX1, z * 0.018 + NZ1, 4) * (3 + smoothstep(CLIFF_R1 - 10, CLIFF_R1 + 50, r) * 9);
  // サンゴ礁の細かい起伏(根)
  const reefW = 1 - smoothstep(SLOPE_R0 + 25, SLOPE_R1 + 15, r);
  d += fbm2(x * 0.11 + NX2, z * 0.11 + NZ2, 3) * 2.2 * reefW;
  // 断崖のごつごつ
  const cliffW = smoothstep(SLOPE_R1 - 10, SLOPE_R1 + 15, r) * (1 - smoothstep(CLIFF_R1 + 10, CLIFF_R1 + 40, r));
  d += fbm2(x * 0.05 + NX3, z * 0.05 + NZ3, 3) * 6 * cliffW;
  // 海底谷: 中心からの視線に垂直な距離で刻む(礁〜断崖のみ)
  const perp = Math.abs(x * CANYON_SIN - z * CANYON_COS);
  if (perp < CANYON_W * 2) {
    const canyonW = smoothstep(SLOPE_R0 * 0.7, SLOPE_R0 * 1.3, r) * (1 - smoothstep(CLIFF_R1, CLIFF_R1 + 30, r));
    const g = 1 - perp / (CANYON_W * 2);
    d -= g * g * CANYON_D * canyonW;
  }
  // 海山(深海の尖塔。頂上は-35mより上には出ない)
  for (const m of SEAMOUNTS) {
    const dx = x - m.x, dz = z - m.z;
    const q = 1 - (dx * dx + dz * dz) / (m.s2 * 4);
    if (q > 0) {
      const bump = q * q * m.h * (0.8 + fbm2(x * 0.07 + NX2, z * 0.07 + NZ3, 2) * 0.35);
      d = Math.min(d + bump, -35);
    }
  }
  // スタート地点は平らに
  d = lerp(D_PLATEAU + 0.5, d, smoothstep(4, 14, r));
  return d;
}

export function slopeAt(x: number, z: number): number {
  const e = 0.6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** カメラからの視線が地形に遮られるか(解析関数をレイマーチ) */
export function isOccludedByTerrain(from: THREE.Vector3, to: THREE.Vector3): boolean {
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    if (y < heightAt(x, z) - 0.2) return true;
  }
  return false;
}

const C_SAND = new THREE.Color('#cbb98d');
const C_REEF = new THREE.Color('#8e9a72');
const C_ALGAE = new THREE.Color('#7a8a5e');
const C_RUBBLE = new THREE.Color('#a89a80');
const C_ROCK = new THREE.Color('#4c5c66');
const C_DEEP = new THREE.Color('#2a3540');
const C_ABYSS = new THREE.Color('#1b232b');

export function createTerrain(): THREE.Mesh {
  const SIZE = 560;
  const SEG = 300;
  const geom = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = slopeAt(x, z);
    const dither = fbm2(x * 0.35 + 40, z * 0.35 - 40, 2) * 0.12;
    // 深度と傾斜で色を決める(帯の境界はシード由来の実際の深さに追従)
    if (h > REEF_FLOOR) {
      col.copy(C_SAND).lerp(C_REEF, smoothstep(0.18, 0.55, slope) * 0.8 + smoothstep(-12, REEF_FLOOR + 3, h) * 0.4);
      // 礁原のまだら(藻場・サンゴ礫)— 単調な砂漠に見えないように
      const algae = smoothstep(0.1, 0.55, fbm2(x * 0.045 + 17, z * 0.045 - 9, 3));
      const rubble = smoothstep(0.15, 0.6, fbm2(x * 0.09 - 31, z * 0.09 + 23, 2));
      col.lerp(C_ALGAE, algae * 0.55).lerp(C_RUBBLE, rubble * 0.3);
    } else if (h > CLIFF_FLOOR) {
      col.copy(C_REEF).lerp(C_ROCK, smoothstep(REEF_FLOOR, REEF_FLOOR - 27, h));
    } else {
      col.copy(C_DEEP).lerp(C_ABYSS, smoothstep(CLIFF_FLOOR - 5, ABYSS_FLOOR, h));
    }
    col.offsetHSL(0, 0, dither * 0.5);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
  });
  // 実写PBRテクスチャ(Poly Haven CC0)。砂=真上投影、崖=トライプラナー
  const texLoader = new THREE.TextureLoader();
  const loadTex = (url: string): THREE.Texture => {
    const t = texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const tSand = loadTex('textures/sand.jpg');
  const tCliff = loadTex('textures/cliff.jpg');

  // テクスチャブレンド + 浅場のコースティクス(揺らめく光の網目)を焼き込む
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.tSand = { value: tSand };
    sh.uniforms.tCliff = { value: tCliff };
    sh.vertexShader =
      'varying vec3 vCauP;\nvarying vec3 vTNrm;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vCauP = position;\n vTNrm = normal;'
      );
    sh.fragmentShader =
      'uniform float uTime;\nuniform sampler2D tSand;\nuniform sampler2D tCliff;\nvarying vec3 vCauP;\nvarying vec3 vTNrm;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 nrm = normalize(vTNrm);
          vec3 bw = abs(nrm);
          bw /= (bw.x + bw.y + bw.z);
          // 砂: 2周波数で混ぜてタイリング感を消す
          vec3 sandC = texture2D(tSand, vCauP.xz * 0.09).rgb;
          sandC = mix(sandC, texture2D(tSand, vCauP.xz * 0.014).rgb, 0.45);
          // 崖: トライプラナー投影
          vec3 cliffC = texture2D(tCliff, vCauP.zy * 0.07).rgb * bw.x
                      + texture2D(tCliff, vCauP.xz * 0.07).rgb * bw.y
                      + texture2D(tCliff, vCauP.xy * 0.07).rgb * bw.z;
          float rockW = smoothstep(0.985, 0.8, nrm.y);
          vec3 texC = mix(sandC, cliffC, rockW);
          // 彩度を少し落として頂点カラー(深度の色設計)と馴染ませる
          vec3 texMix = mix(vec3(dot(texC, vec3(0.3333))), texC, 0.62);
          diffuseColor.rgb *= texMix * 2.15;

          float t = uTime;
          float c1 = sin(vCauP.x * 0.9 + t * 1.1) + sin(vCauP.z * 1.1 - t * 0.9) + sin((vCauP.x + vCauP.z) * 0.6 + t * 0.6);
          float ca = pow(clamp(1.0 - abs(c1) * 0.45, 0.0, 1.0), 3.0);
          float c2 = sin(vCauP.x * 2.1 - t * 1.7) + sin(vCauP.z * 1.9 + t * 1.3) + sin((vCauP.x - vCauP.z) * 1.4 - t);
          float cb = pow(clamp(1.0 - abs(c2) * 0.5, 0.0, 1.0), 3.0);
          float fade = smoothstep(-45.0, -6.0, vCauP.y);
          diffuseColor.rgb *= 1.0 + (ca * 0.55 + cb * 0.3) * fade;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-caustics-tex';

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  return mesh;
}
