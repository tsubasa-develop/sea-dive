import * as THREE from 'three';
import { fbm2, smoothstep, lerp } from '../core/noise';
import { uTime } from '../core/uniforms';

// ワールド: 中心=浅いサンゴ礁台地 → 斜面 → 断崖(ドロップオフ) → 深海平原
export const WORLD_RADIUS = 258;

export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let d = -7;
  d -= smoothstep(55, 105, r) * 26;   // 礁斜面 → -33
  d -= smoothstep(105, 150, r) * 62;  // 断崖 → -95
  d -= smoothstep(150, 230, r) * 40;  // 深海平原 → -135
  // 大きなうねり(深いほど強く)
  d += fbm2(x * 0.018 + 3.1, z * 0.018 - 1.7, 4) * (3 + smoothstep(140, 200, r) * 9);
  // サンゴ礁の細かい起伏(根)
  const reefW = 1 - smoothstep(80, 120, r);
  d += fbm2(x * 0.11, z * 0.11, 3) * 2.2 * reefW;
  // 断崖のごつごつ
  const cliffW = smoothstep(95, 120, r) * (1 - smoothstep(160, 190, r));
  d += fbm2(x * 0.05 - 8, z * 0.05 + 5, 3) * 6 * cliffW;
  // スタート地点は平らに
  d = lerp(-6.5, d, smoothstep(4, 14, r));
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
const C_ROCK = new THREE.Color('#4c5c66');
const C_DEEP = new THREE.Color('#2a3540');
const C_ABYSS = new THREE.Color('#1b232b');

export function createTerrain(): THREE.Mesh {
  const SIZE = 560;
  const SEG = 240;
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
    // 深度と傾斜で色を決める
    if (h > -33) {
      col.copy(C_SAND).lerp(C_REEF, smoothstep(0.18, 0.55, slope) * 0.8 + smoothstep(-12, -30, h) * 0.4);
    } else if (h > -95) {
      col.copy(C_REEF).lerp(C_ROCK, smoothstep(-33, -60, h));
    } else {
      col.copy(C_DEEP).lerp(C_ABYSS, smoothstep(-100, -135, h));
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
  // 浅場の海底にコースティクス(揺らめく光の網目)を焼き込む
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader =
      'varying vec3 vCauP;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vCauP = position;'
      );
    sh.fragmentShader =
      'uniform float uTime;\nvarying vec3 vCauP;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
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
  mat.customProgramCacheKey = () => 'terrain-caustics';

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  return mesh;
}
