import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, slopeAt, CANYON_ANGLE, RING_SLOPE_END } from './Terrain';
import { noise2, rand, randInt, pick } from '../core/noise';
import { uTime } from '../core/uniforms';

interface FloorSpot { x: number; y: number; z: number }

/** カメラのめり込み防止用の球コライダー */
export interface Collider { x: number; y: number; z: number; r: number }

function placeOnFloor(count: number, rMin: number, rMax: number, slopeMax = 99): FloorSpot[] {
  const spots: FloorSpot[] = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 30) {
    const r = Math.sqrt(rand(rMin * rMin, rMax * rMax));
    const th = rand(0, Math.PI * 2);
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    if (slopeAt(x, z) > slopeMax) continue;
    spots.push({ x, y: heightAt(x, z), z });
  }
  return spots;
}

function polar(r: number, th: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(th) * r, heightAt(Math.cos(th) * r, Math.sin(th) * r), Math.sin(th) * r);
}

/** サンゴの「根」— パッチ中心の周りにガウス状に集める */
function placeOnPatches(
  count: number, patches: { x: number; z: number }[], spread: number, slopeMax = 0.6
): FloorSpot[] {
  const spots: FloorSpot[] = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 30) {
    const p = pick(patches);
    const x = p.x + (rand(-1, 1) + rand(-1, 1)) * spread * 0.6;
    const z = p.z + (rand(-1, 1) + rand(-1, 1)) * spread * 0.6;
    const r = Math.hypot(x, z);
    if (r < 11 || r > 105) continue;
    if (slopeAt(x, z) > slopeMax) continue;
    spots.push({ x, y: heightAt(x, z), z });
  }
  return spots;
}

/**
 * 実写テクスチャのトライプラナー投影(岩・遺跡用)。
 * UVを持たないジオメトリにワールド空間から貼り、頂点カラー/マテリアル色と乗算する。
 */
function applyTriplanar(mat: THREE.Material, tex: THREE.Texture, scale: number, key: string): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tTri = { value: tex };
    sh.vertexShader =
      'varying vec3 vTriP;\nvarying vec3 vTriN;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vTriP = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          vTriN = mat3(instanceMatrix) * normal;
        #else
          vTriP = transformed;
          vTriN = normal;
        #endif`
      );
    sh.fragmentShader =
      'uniform sampler2D tTri;\nvarying vec3 vTriP;\nvarying vec3 vTriN;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 nrm = normalize(vTriN);
          vec3 bw = abs(nrm);
          bw /= (bw.x + bw.y + bw.z);
          vec3 c = texture2D(tTri, vTriP.zy * ${scale.toFixed(3)}).rgb * bw.x
                 + texture2D(tTri, vTriP.xz * ${scale.toFixed(3)}).rgb * bw.y
                 + texture2D(tTri, vTriP.xy * ${scale.toFixed(3)}).rgb * bw.z;
          diffuseColor.rgb *= mix(vec3(dot(c, vec3(0.3333))), c, 0.55) * 2.2;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'triplanar-' + key;
}

/** 揺らぎシェーダー(海藻・イソギンチャク等)。高さに応じて先端ほど揺れる */
function applySway(mat: THREE.Material, key: string, amp: number, freq: number, height: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader =
      'uniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            float swPh = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;
          #else
            float swPh = 0.0;
          #endif
          float swF = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
          transformed.x += sin(uTime * ${freq.toFixed(2)} + swPh) * ${amp.toFixed(3)} * swF * swF;
          transformed.z += cos(uTime * ${freq.toFixed(2)} * 0.83 + swPh * 1.3) * ${amp.toFixed(3)} * 0.6 * swF * swF;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'sway-' + key;
}

interface InstanceXform { m: THREE.Matrix4; color?: THREE.Color; s: number }

interface PlaceOpts {
  scale?: [number, number];
  sink?: number;
  palette?: string[];
  squash?: boolean;
  /** 指定すると list に半径 r×スケール の球コライダーを追加する */
  collide?: { list: Collider[]; r: number };
}

/** スポット列 → インスタンス変換列(位置・回転・スケール・色) */
function genTransforms(spots: FloorSpot[], opts: PlaceOpts = {}): InstanceXform[] {
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const [s0, s1] = opts.scale ?? [0.8, 1.3];
  return spots.map((spot) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
    const sc = rand(s0, s1);
    if (opts.squash) s.set(sc * rand(0.7, 1.3), sc * rand(0.6, 1.2), sc * rand(0.7, 1.3));
    else s.set(sc, sc, sc);
    p.set(spot.x, spot.y - (opts.sink ?? 0.08), spot.z);
    const x: InstanceXform = { m: new THREE.Matrix4().compose(p, q, s), s: Math.max(s.x, s.y, s.z) };
    if (opts.palette) x.color = new THREE.Color(pick(opts.palette)).offsetHSL(0, 0, rand(-0.04, 0.04));
    if (opts.collide) {
      opts.collide.list.push({ x: spot.x, y: spot.y, z: spot.z, r: opts.collide.r * x.s });
    }
    return x;
  });
}

function instancedFrom(
  geom: THREE.BufferGeometry, mat: THREE.Material, xforms: InstanceXform[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geom, mat, xforms.length);
  mesh.frustumCulled = false;
  xforms.forEach((x, i) => {
    mesh.setMatrixAt(i, x.m);
    if (x.color) mesh.setColorAt(i, x.color);
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function makeInstanced(
  geom: THREE.BufferGeometry, mat: THREE.Material, spots: FloorSpot[], opts: PlaceOpts = {}
): THREE.InstancedMesh {
  return instancedFrom(geom, mat, genTransforms(spots, opts));
}

/** 高さ方向の明度グラデーションを頂点カラーに焼き込む(instanceColorと乗算される) */
function paintY(g: THREE.BufferGeometry, yMin: number, yMax: number, bLo: number, bHi: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / Math.max(yMax - yMin, 1e-5)));
    const b = bLo + (bHi - bLo) * t;
    arr[i * 3] = b; arr[i * 3 + 1] = b; arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** 中心→縁の明度グラデーション(テーブルサンゴの白い縁) */
function paintRadial(g: THREE.BufferGeometry, rMax: number, bLo: number, bHi: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / rMax);
    const b = bLo + (bHi - bLo) * t * t;
    arr[i * 3] = b; arr[i * 3 + 1] = b; arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

interface BranchOpts {
  len0: number;      // 幹の長さ
  r0: number;        // 幹の半径
  maxDepth: number;
  splitNear: number; // 浅い階層の分岐数
  splitFar: number;  // 深い階層の分岐数
  spread: [number, number]; // 分岐角の範囲
  shrink: [number, number]; // 長さの縮小率
}

/** 樹状サンゴの共通ジェネレータ(ミドリイシ/白い樹状サンゴ) */
function branchCoralGeometry(o: BranchOpts): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  // 枝先ほど明るく(成長端の白)
  const bright = (d: number): number => 0.5 + 0.85 * Math.pow(d / (o.maxDepth + 1), 1.3);
  const branch = (m: THREE.Matrix4, len: number, r: number, depth: number): void => {
    const cyl = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1);
    paintY(cyl, -len / 2, len / 2, bright(depth), bright(depth + 1));
    cyl.translate(0, len / 2, 0);
    cyl.applyMatrix4(m);
    geoms.push(cyl);
    if (depth >= o.maxDepth) return;
    const n = depth < 2 ? o.splitNear : o.splitFar;
    for (let i = 0; i < n; i++) {
      const child = new THREE.Matrix4()
        .multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, len * rand(0.7, 0.95), 0))
        .multiply(new THREE.Matrix4().makeRotationY(rand(0, Math.PI * 2)))
        .multiply(new THREE.Matrix4().makeRotationX(rand(o.spread[0], o.spread[1])));
      branch(child, len * rand(o.shrink[0], o.shrink[1]), r * 0.66, depth + 1);
    }
  };
  branch(new THREE.Matrix4(), o.len0, o.r0, 0);
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

function staghornGeometry(): THREE.BufferGeometry {
  return branchCoralGeometry({
    len0: 0.36, r0: 0.055, maxDepth: 5,
    splitNear: 3, splitFar: 2, spread: [0.42, 0.9], shrink: [0.62, 0.76],
  });
}

/** 白い樹状サンゴ(参考画像の白い"木")— 細く密に枝分かれ */
function whiteTreeGeometry(): THREE.BufferGeometry {
  return branchCoralGeometry({
    len0: 0.6, r0: 0.05, maxDepth: 5,
    splitNear: 3, splitFar: 2, spread: [0.35, 0.9], shrink: [0.62, 0.78],
  });
}

/** 波打つ縁の皿(テーブルサンゴ1枚)。中心は暗く縁は白い */
function plateDisc(r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.9, r * 0.09, 22, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    // 縁のうねり + 同心円の成長線 + 全体をわずかにお椀型に
    const wave = noise2(Math.cos(ang) * 2.1 + r * 7, Math.sin(ang) * 2.1) * 0.14 * r * (rr / r);
    const rings = Math.sin(rr * 14 / r) * 0.012 * r;
    pos.setY(i, pos.getY(i) + wave + rings + (rr / r) * (rr / r) * r * 0.14);
  }
  paintRadial(g, r, 0.62, 1.35);
  g.computeVertexNormals();
  return g;
}

/** 段積みテーブルサンゴ(参考画像の主役)— 皿が塔のように重なる */
function plateStackGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const tiers = randInt(3, 6);
  let y = 0;
  let radius = rand(0.45, 0.85);
  let px = 0, pz = 0;
  for (let i = 0; i < tiers; i++) {
    const stemH = rand(0.16, 0.3);
    const stem = new THREE.CylinderGeometry(radius * 0.18, radius * 0.26, stemH, 6);
    paintY(stem, -stemH / 2, stemH / 2, 0.5, 0.62);
    stem.translate(px, y + stemH / 2, pz);
    geoms.push(stem);
    const disc = plateDisc(radius);
    disc.translate(px, y + stemH, pz);
    geoms.push(disc);
    y += stemH + radius * 0.08;
    px += rand(-0.3, 0.3) * radius;
    pz += rand(-0.3, 0.3) * radius;
    radius *= rand(0.6, 0.78);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

/** シャコガイの殻(波打つ2枚貝)。外套膜は別ジオメトリで発光させる */
function clamShellGeometry(): THREE.BufferGeometry {
  const half = (tilt: number): THREE.BufferGeometry => {
    const g = new THREE.SphereGeometry(0.3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const scallop = 1 + Math.abs(Math.sin(ang * 5)) * 0.13; // 貝殻の波
      pos.setXYZ(i, x * scallop, pos.getY(i) * 0.55, z * scallop * 0.75);
    }
    g.rotateX(tilt);
    g.computeVertexNormals();
    return g;
  };
  const top = half(Math.PI + 0.55);
  top.translate(0, 0.3, -0.04);
  const bottom = half(-0.15);
  bottom.translate(0, 0.02, 0);
  const merged = mergeGeometries([top, bottom]);
  paintY(merged, 0, 0.35, 0.75, 1.1);
  return merged;
}

/** シャコガイの外套膜(青い唇状の膜)— emissiveマテリアルで別描画 */
function clamMantleGeometry(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.22, 0.055, 6, 20);
  g.scale(1, 0.75, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const ang = Math.atan2(y, x);
    pos.setZ(i, pos.getZ(i) + Math.sin(ang * 6) * 0.035); // 膜のうねり
  }
  g.rotateX(-Math.PI / 2 + 0.18);
  g.translate(0, 0.2, 0);
  g.computeVertexNormals();
  return g;
}

/** 樽カイメン(縦縞の入った大きな壺) */
function barrelSpongeGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.42, 0.55, 1.15, 18, 4, true);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const y01 = (y + 0.575) / 1.15;
    // 胴の膨らみ + 縦畝 + 口すぼまり
    const belly = 1 + Math.sin(y01 * Math.PI) * 0.24;
    const ribs = 1 + Math.sin(ang * 9 + y01 * 1.5) * 0.05;
    const mouth = y01 > 0.85 ? 1 - (y01 - 0.85) * 1.1 : 1;
    pos.setXYZ(i, x * belly * ribs * mouth, y, z * belly * ribs * mouth);
  }
  paintY(g, -0.575, 0.575, 0.55, 1.15);
  g.translate(0, 0.575, 0);
  g.computeVertexNormals();
  return g;
}

/** ムチカラマツ(細長い鞭状のサンゴ)の束 */
function whipCoralGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const n = randInt(2, 4);
  for (let i = 0; i < n; i++) {
    const h = rand(1.6, 3.2);
    const whip = new THREE.CylinderGeometry(0.008, 0.022, h, 5, 6);
    const pos = whip.attributes.position as THREE.BufferAttribute;
    const bend = rand(0.15, 0.5);
    const ph = rand(0, Math.PI * 2);
    for (let j = 0; j < pos.count; j++) {
      const y01 = (pos.getY(j) + h / 2) / h;
      pos.setX(j, pos.getX(j) + Math.sin(y01 * 2.2 + ph) * bend * y01);
      pos.setZ(j, pos.getZ(j) + Math.cos(y01 * 1.7 + ph) * bend * 0.6 * y01);
    }
    paintY(whip, -h / 2, h / 2, 0.7, 1.2);
    whip.translate(rand(-0.2, 0.2), h / 2, rand(-0.2, 0.2));
    geoms.push(whip);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

/** 発光クリスタルの群晶。先端ほど明るい */
function crystalGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const n = randInt(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rand(0.5, 1.5);
    const c = new THREE.OctahedronGeometry(h * 0.22, 0);
    c.scale(0.55, h / (h * 0.22 * 2), 0.55);
    paintY(c, -h / 2, h / 2, 0.55, 1.5);
    const m = new THREE.Matrix4()
      .makeTranslation(rand(-0.35, 0.35), h * 0.28, rand(-0.35, 0.35))
      .multiply(new THREE.Matrix4().makeRotationX(rand(-0.5, 0.5)))
      .multiply(new THREE.Matrix4().makeRotationZ(rand(-0.5, 0.5)));
    c.applyMatrix4(m);
    geoms.push(c);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

function brainCoralGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.55, 18, 13);
  g.scale(1, 0.6, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + noise2(x * 6 + y * 3, z * 6 - y * 2) * 0.09;
    pos.setXYZ(i, x * n, Math.max(0, y) * n, z * n);
  }
  g.computeVertexNormals();
  return g;
}

function seafanTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const draw = (x: number, y: number, ang: number, len: number, w: number, d: number): void => {
    if (d > 5 || len < 4) return;
    const nx = x + Math.cos(ang) * len;
    const ny = y - Math.sin(ang) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    const n = d < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) draw(nx, ny, ang + rand(-0.65, 0.65), len * rand(0.6, 0.8), w * 0.72, d + 1);
  };
  for (let i = 0; i < 7; i++) draw(128, 190, Math.PI / 2 + rand(-1.0, 1.0), rand(40, 62), 5, 0);
  return new THREE.CanvasTexture(c);
}

/** 管状カイメン(チューブスポンジ)の束 */
function tubeSpongeGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const n = randInt(2, 5);
  for (let i = 0; i < n; i++) {
    const h = rand(0.5, 1.3);
    const r = h * rand(0.09, 0.13);
    const tube = new THREE.CylinderGeometry(r * 1.2, r * 0.7, h, 8, 2, true);
    paintY(tube, -h / 2, h / 2, 0.55, 1.25);
    tube.translate(0, h / 2, 0);
    const m = new THREE.Matrix4()
      .makeTranslation(rand(-0.28, 0.28), 0, rand(-0.28, 0.28))
      .multiply(new THREE.Matrix4().makeRotationX(rand(-0.22, 0.22)))
      .multiply(new THREE.Matrix4().makeRotationZ(rand(-0.22, 0.22)));
    tube.applyMatrix4(m);
    geoms.push(tube);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

/** ソフトコーラル(ウミトサカ)— もこもこした房 */
function softCoralGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.15, 0.32, 7);
  paintY(trunk, -0.16, 0.16, 0.5, 0.75);
  trunk.translate(0, 0.16, 0);
  geoms.push(trunk);
  const nLobes = randInt(7, 10);
  for (let i = 0; i < nLobes; i++) {
    const phi = rand(0, Math.PI * 0.55);
    const th = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    const rr = rand(0.11, 0.19);
    const lobe = new THREE.SphereGeometry(rr, 8, 6);
    const b = rand(1.05, 1.3);
    paintY(lobe, -rr, rr, b * 0.9, b);
    lobe.translate(dir.x * 0.17, 0.34 + dir.y * 0.14, dir.z * 0.17);
    geoms.push(lobe);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

/** ブドウのような粒状サンゴ */
function bubbleCoralGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const phi = rand(0, Math.PI * 0.5);
    const th = rand(0, Math.PI * 2);
    const rr = rand(0.045, 0.075);
    const s = new THREE.SphereGeometry(rr, 7, 5);
    paintY(s, -rr, rr, 0.95, 1.2);
    s.translate(
      Math.sin(phi) * Math.cos(th) * 0.13,
      Math.cos(phi) * 0.09 + 0.03,
      Math.sin(phi) * Math.sin(th) * 0.13
    );
    geoms.push(s);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

function anemoneGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.55, 1);
  geoms.push(dome);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 26; i++) {
    const phi = rand(0.12, 0.42) * Math.PI;
    const th = rand(0, Math.PI * 2);
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    const cone = new THREE.ConeGeometry(0.032, 0.4, 5);
    cone.translate(0, 0.2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    cone.applyQuaternion(q);
    cone.translate(dir.x * 0.12, dir.y * 0.12, dir.z * 0.12);
    geoms.push(cone);
  }
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

/** 先端が細くなる草の葉。基部がy=0 */
function taperedBlade(w: number, h: number, taper: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) + h / 2) / h;
    pos.setX(i, pos.getX(i) * (1 - y01 * taper));
    // わずかに湾曲させる
    pos.setZ(i, Math.sin(y01 * Math.PI * 0.5) * h * 0.06);
  }
  g.translate(0, h / 2, 0);
  return g;
}

function tubewormGeometry(): THREE.BufferGeometry {
  const tube = new THREE.CylinderGeometry(0.028, 0.042, 0.7, 5);
  tube.translate(0, 0.35, 0);
  const tip = new THREE.CylinderGeometry(0.02, 0.028, 0.14, 5);
  tip.translate(0, 0.76, 0);
  const paint = (g: THREE.BufferGeometry, c: THREE.Color): void => {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  };
  paint(tube, new THREE.Color('#ded8ca'));
  paint(tip, new THREE.Color('#c03a30'));
  const merged = mergeGeometries([tube, tip]);
  merged.computeVertexNormals();
  return merged;
}

export class Flora {
  anemones: THREE.Vector3[] = [];
  cavePos: THREE.Vector3;
  wreckPos: THREE.Vector3;
  vents: THREE.Vector3[] = [];
  patches: { x: number; z: number }[] = [];
  /** チンアナゴのコロニーに適した砂地 */
  sandFlats: THREE.Vector3[] = [];
  /** カメラめり込み防止用コライダー(大型オブジェクトのみ) */
  colliders: Collider[] = [];
  /** 遺構などの見どころ(デバッグ・検証用) */
  landmarks: { kind: string; pos: THREE.Vector3 }[] = [];
  private rockTex!: THREE.Texture;

  constructor(scene: THREE.Scene) {
    // 実写岩テクスチャ(Poly Haven CC0)
    const rockTex = new THREE.TextureLoader().load('textures/rock.jpg');
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.colorSpace = THREE.SRGBColorSpace;
    rockTex.anisotropy = 8;
    this.rockTex = rockTex;

    // サンゴの根(パッチ)の中心。礁の賑わいはここに集中する
    const patches = this.patches;
    for (let i = 0; i < 44; i++) {
      const r = Math.sqrt(rand(15 * 15, 95 * 95));
      const th = rand(0, Math.PI * 2);
      patches.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
    }

    // 岩(全域)
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    {
      const pos = rockGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const j = 1 + noise2(pos.getX(i) * 2.7, pos.getY(i) * 2.7 + pos.getZ(i)) * 0.28;
        pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j, pos.getZ(i) * j);
      }
      rockGeo.computeVertexNormals();
    }
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    applyTriplanar(rockMat, rockTex, 0.3, 'rock');
    scene.add(makeInstanced(rockGeo, rockMat, placeOnFloor(450, 16, 252), {
      scale: [0.4, 2.8], sink: 0.5, squash: true, palette: ['#5a646c', '#4a545e', '#6a6f66', '#3e4850'],
      collide: { list: this.colliders, r: 0.85 },
    }));

    // 段積みテーブルサンゴ(参考画像の主役)— 礁全域に大量に
    const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.88, vertexColors: true, side: THREE.DoubleSide });
    const platePalette = ['#d9c9a8', '#c8b295', '#dbb8c0', '#b9c9a4', '#e0d4b2', '#c2a9c9', '#a8c9c0'];
    for (let v = 0; v < 3; v++) {
      const spots = [
        ...placeOnPatches(130, patches, 9, 0.55),
        ...placeOnFloor(45, 14, 102, 0.5),
      ];
      scene.add(makeInstanced(plateStackGeometry(), plateMat, spots, {
        scale: [0.8, 2.0], sink: 0.1, palette: platePalette,
        collide: { list: this.colliders, r: 0.55 },
      }));
    }

    // 枝サンゴ(ミドリイシ)— 7割はパッチに密集、3割は散在。枝先は頂点カラーで白く
    const staghornMat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
    const staghornPalette = ['#ff8f6b', '#ffb3a0', '#7adfd4', '#c78cff', '#ffd97a', '#f2a0c8'];
    for (let v = 0; v < 3; v++) {
      const spots = [
        ...placeOnPatches(220, patches, 7, 0.55),
        ...placeOnFloor(70, 13, 102, 0.55),
      ];
      scene.add(makeInstanced(staghornGeometry(), staghornMat, spots, {
        scale: [0.9, 2.0], sink: 0.12, palette: staghornPalette,
      }));
    }

    // 白い樹状サンゴ(参考画像の白い"木")— 礁の高台と断崖上部に群生
    const whiteTreeMat = new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true });
    const whitePalette = ['#e8f0ec', '#dceae8', '#cfe4e2', '#d8e8f0', '#bfe0e4'];
    for (let v = 0; v < 2; v++) {
      const spots = [
        ...placeOnPatches(100, patches, 8, 0.6),
        ...placeOnFloor(70, 85, 165, 2.5),
      ];
      scene.add(makeInstanced(whiteTreeGeometry(), whiteTreeMat, spots, {
        scale: [1.0, 2.4], sink: 0.1, palette: whitePalette,
      }));
    }

    // シャコガイ(青く光る外套膜)— 殻と膜を同じ変換で2メッシュ描画
    {
      const spots = placeOnPatches(90, patches, 8, 0.5);
      const xforms = genTransforms(spots, { scale: [0.7, 1.8], sink: 0.12, palette: ['#c9c0a8', '#b8ae9a', '#a8a290'] });
      const shellMat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
      scene.add(instancedFrom(clamShellGeometry(), shellMat, xforms));
      const mantleXf = xforms.map((x) => ({
        m: x.m,
        s: x.s,
        color: new THREE.Color(pick(['#2a6adf', '#3ab8d8', '#7a5adf', '#20d0b8'])).offsetHSL(0, 0, rand(-0.05, 0.05)),
      }));
      const mantleMat = new THREE.MeshStandardMaterial({
        roughness: 0.4, emissive: '#2a70e0', emissiveIntensity: 0.6,
      });
      scene.add(instancedFrom(clamMantleGeometry(), mantleMat, mantleXf));
    }

    // 樽カイメン(大型の壺)— 礁斜面〜断崖
    const barrelMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
    scene.add(makeInstanced(barrelSpongeGeometry(), barrelMat,
      [...placeOnPatches(45, patches, 10, 0.5), ...placeOnFloor(70, 60, 160, 0.9)],
      { scale: [0.7, 2.2], sink: 0.08, palette: ['#b06858', '#9a5a70', '#c07848', '#8a5a8a'],
        collide: { list: this.colliders, r: 0.62 } }));

    // ムチカラマツ(鞭状)— 斜面から深場へ
    const whipMat = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true });
    applySway(whipMat, 'whip', 0.12, 0.9, 2.4);
    scene.add(makeInstanced(whipCoralGeometry(), whipMat, placeOnFloor(200, 40, 190, 1.5), {
      scale: [0.7, 1.6], sink: 0.05, palette: ['#e0c9a0', '#d8a8b8', '#c0d8c8', '#e8d8b0'],
    }));

    // 管状カイメン(縦シルエット)
    const spongeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    scene.add(makeInstanced(tubeSpongeGeometry(), spongeMat,
      [...placeOnPatches(170, patches, 8, 0.55), ...placeOnFloor(60, 15, 130, 0.8)],
      { scale: [0.8, 1.9], sink: 0.06, palette: ['#8a6bdf', '#5f7ad0', '#d0a05f', '#c8577a', '#4fb8c8'] }));

    // ソフトコーラル(もこもこしたパステルの房)— 画像のピンクの茂み
    const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
    applySway(softMat, 'soft', 0.035, 1.3, 0.5);
    scene.add(makeInstanced(softCoralGeometry(), softMat,
      [...placeOnPatches(200, patches, 7, 0.55), ...placeOnFloor(70, 14, 110, 0.6)],
      { scale: [0.7, 1.7], sink: 0.05, palette: ['#ffb3c8', '#d8a8ff', '#e8c0e0', '#ffd0a8', '#ff9eb8'] }));

    // ブドウサンゴ(粒状の光沢)
    const bubbleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
    scene.add(makeInstanced(bubbleCoralGeometry(), bubbleMat,
      placeOnPatches(150, patches, 6, 0.5),
      { scale: [0.8, 1.9], sink: 0.03, palette: ['#d8e8d0', '#c8e0d8', '#e8e0c0', '#c0e8c8'] }));

    // 脳サンゴ
    scene.add(makeInstanced(brainCoralGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      [...placeOnPatches(110, patches, 8, 0.5), ...placeOnFloor(50, 15, 100, 0.5)],
      { scale: [0.7, 2.2], sink: 0.06, palette: ['#c8b465', '#b09a58', '#98a86a'] }));

    // ウミウチワ(シーファン)
    const fanTex = seafanTexture();
    const fanMat = new THREE.MeshStandardMaterial({
      roughness: 0.9, side: THREE.DoubleSide, alphaMap: fanTex, alphaTest: 0.3, color: '#ffffff',
    });
    applySway(fanMat, 'fan', 0.07, 1.1, 1.6);
    const fanGeo = new THREE.PlaneGeometry(2.2, 1.65);
    fanGeo.translate(0, 0.82, 0);
    scene.add(makeInstanced(fanGeo, fanMat, placeOnFloor(220, 24, 170, 2.0), {
      scale: [0.9, 2.2], palette: ['#ff5f7a', '#b06bff', '#ff9d54', '#e84a6f'],
    }));

    // イソギンチャク(クマノミの巣)
    const aneMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    applySway(aneMat, 'anemone', 0.05, 1.7, 0.55);
    const aneSpots = [...placeOnPatches(10, patches, 10, 0.45), ...placeOnFloor(5, 14, 80, 0.45)];
    scene.add(makeInstanced(anemoneGeometry(), aneMat, aneSpots, {
      scale: [0.9, 1.6], sink: 0.04, palette: ['#e8a0b8', '#d8c890', '#a0d8c0'],
    }));
    this.anemones = aneSpots.map((s) => new THREE.Vector3(s.x, s.y + 0.35, s.z));

    // 海草(浅場の砂地)。3枚の葉を扇状に
    const grassGeo = mergeGeometries([
      taperedBlade(0.12, 0.95, 0.85),
      taperedBlade(0.12, 0.8, 0.85).rotateY(Math.PI / 2.5).rotateZ(0.12),
      taperedBlade(0.12, 1.1, 0.85).rotateY(-Math.PI / 2.2).rotateZ(-0.1),
    ]);
    const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    applySway(grassMat, 'grass', 0.14, 1.4, 0.95);
    scene.add(makeInstanced(grassGeo, grassMat,
      [...placeOnFloor(1000, 10, 82, 0.3), ...placeOnPatches(500, patches, 12, 0.4)], {
      scale: [0.6, 1.6], palette: ['#79bc70', '#65a85f', '#8cc87e', '#5d9a58'],
    }));

    // チンアナゴ用の砂地(平坦な場所)を記録
    for (const s of placeOnFloor(6, 20, 70, 0.16)) {
      this.sandFlats.push(new THREE.Vector3(s.x, s.y, s.z));
    }

    // 海藻(斜面〜断崖の上部)
    const kelpGeo = taperedBlade(0.55, 7.5, 0.6);
    const kelpMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    applySway(kelpMat, 'kelp', 0.6, 0.75, 7.5);
    scene.add(makeInstanced(kelpGeo, kelpMat, placeOnFloor(170, 90, 155, 1.2), {
      scale: [0.6, 1.4], palette: ['#5d7a42', '#4e683e', '#6f8448'],
    }));

    // 深海の発光ポリプ
    const polypGeo = new THREE.IcosahedronGeometry(0.07, 1);
    const polypCyan = new THREE.MeshStandardMaterial({ color: '#0a2028', emissive: '#4fd8f0', emissiveIntensity: 2.0, roughness: 0.6 });
    const polypViolet = new THREE.MeshStandardMaterial({ color: '#140a20', emissive: '#9a6af0', emissiveIntensity: 1.8, roughness: 0.6 });
    scene.add(makeInstanced(polypGeo, polypCyan, placeOnFloor(90, 158, 250), { scale: [0.6, 2.2], sink: 0.02 }));
    scene.add(makeInstanced(polypGeo, polypViolet, placeOnFloor(75, 158, 250), { scale: [0.6, 2.0], sink: 0.02 }));

    // 熱水噴出孔
    const ventMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 });
    const wormMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: '#401512', emissiveIntensity: 0.25 });
    const wormGeo = tubewormGeometry();
    const ventBase = rand(0, Math.PI * 2);
    for (const dth of [0, 1.9, 4.2]) {
      const vp = polar(rand(185, 235), ventBase + dth + rand(-0.15, 0.15));
      this.vents.push(vp.clone());
      const chimney = mergeGeometries([
        new THREE.CylinderGeometry(0.9, 1.6, 2.8, 8).translate(0, 1.4, 0),
        new THREE.CylinderGeometry(0.5, 0.95, 2.4, 7).translate(0, 3.6, 0),
        new THREE.CylinderGeometry(0.28, 0.5, 1.6, 6).translate(0, 5.4, 0),
      ]);
      chimney.computeVertexNormals();
      const cm = new THREE.Mesh(chimney, ventMat);
      cm.position.copy(vp).y -= 0.3;
      scene.add(cm);
      this.colliders.push({ x: vp.x, y: vp.y + 2.5, z: vp.z, r: 1.9 });
      scene.add(this.makeSmoke(vp.clone().add(new THREE.Vector3(0, 6, 0))));
      const wormSpots: FloorSpot[] = [];
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2);
        const rr = rand(1.6, 3.4);
        const wx = vp.x + Math.cos(a) * rr;
        const wz = vp.z + Math.sin(a) * rr;
        wormSpots.push({ x: wx, y: heightAt(wx, wz), z: wz });
      }
      scene.add(makeInstanced(wormGeo, wormMat, wormSpots, { scale: [0.8, 1.6], sink: 0.05 }));
    }

    // 沈没船(ドロップオフの棚)— 位置もシードごとに変わる
    this.wreckPos = polar(rand(118, 138), rand(0, Math.PI * 2));
    scene.add(this.buildWreck(this.wreckPos));
    this.colliders.push(
      { x: this.wreckPos.x, y: this.wreckPos.y + 1.5, z: this.wreckPos.z + 2, r: 3.4 },
      { x: this.wreckPos.x + 1.5, y: this.wreckPos.y + 1.2, z: this.wreckPos.z - 4, r: 3.0 },
    );

    // 海底洞窟(シーラカンスの棲家)
    this.cavePos = polar(rand(160, 178), rand(0, Math.PI * 2));
    scene.add(this.buildCave(this.cavePos, rockGeo, rockMat));
    this.colliders.push(
      { x: this.cavePos.x - 4.4, y: this.cavePos.y + 1.6, z: this.cavePos.z, r: 3.6 },
      { x: this.cavePos.x + 4.4, y: this.cavePos.y + 1.5, z: this.cavePos.z + 0.6, r: 3.6 },
    );

    // 鯨骨(ホエールフォール)
    scene.add(this.buildWhaleFall(polar(rand(195, 220), rand(0, Math.PI * 2))));

    // ─── 神秘の遺構 ───
    // 海底遺跡(柱の環)— 礁の外れ〜ドロップオフに1〜2箇所
    const ruinCount = randInt(1, 2);
    const ruinBase = rand(0, Math.PI * 2);
    for (let i = 0; i < ruinCount; i++) {
      const at = polar(rand(60, 130), ruinBase + i * 2.4 + rand(-0.4, 0.4));
      scene.add(this.buildRuins(at));
      this.landmarks.push({ kind: 'ruins', pos: at.clone() });
    }
    // 発光ルーンのモノリス — 深海に1〜2本
    const monoCount = randInt(1, 2);
    for (let i = 0; i < monoCount; i++) {
      const at = polar(rand(170, 230), rand(0, Math.PI * 2));
      scene.add(this.buildMonolith(at));
      this.landmarks.push({ kind: 'monolith', pos: at.clone() });
    }
    // 石の門 — 海底谷の入り口にそびえる
    {
      const gr = RING_SLOPE_END - 6;
      const gx = Math.cos(CANYON_ANGLE) * gr;
      const gz = Math.sin(CANYON_ANGLE) * gr;
      const at = new THREE.Vector3(gx, heightAt(gx, gz), gz);
      scene.add(this.buildGate(at, CANYON_ANGLE));
      this.landmarks.push({ kind: 'gate', pos: at.clone() });
    }
    // 光るクリスタル群 — 深海の谷底や海山の麓
    const crystalMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.2, metalness: 0.1,
      emissive: '#2ec8dc', emissiveIntensity: 0.75,
      transparent: true, opacity: 0.9,
    });
    scene.add(makeInstanced(crystalGeometry(), crystalMat, placeOnFloor(30, 150, 245), {
      scale: [0.8, 2.6], sink: 0.15, palette: ['#a8e8f0', '#c8b8f0', '#88d8e8'],
    }));
  }

  /** 崩れた石柱の環 + アーチ。淡い光の玉が漂う */
  private buildRuins(at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#9aa096', roughness: 1 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: '#7d827a', roughness: 1 });
    applyTriplanar(stone, this.rockTex, 0.55, 'ruin-stone');
    applyTriplanar(stoneDark, this.rockTex, 0.55, 'ruin-stone-dark');
    const ringR = rand(5.5, 8);
    const n = randInt(6, 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
      const cx = Math.cos(a) * ringR;
      const cz = Math.sin(a) * ringR;
      const cy = heightAt(at.x + cx, at.z + cz) - at.y; // 局所の起伏に沿わせる
      const broken = Math.random() < 0.3;
      const h = broken ? rand(0.8, 1.8) : rand(3.2, 5.2);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), stoneDark);
      base.position.set(cx, cy + 0.25, cz);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, h, 9), stone);
      shaft.position.set(cx, cy + 0.5 + h / 2, cz);
      shaft.rotation.set(rand(-0.05, 0.05), rand(0, Math.PI), rand(-0.05, 0.05));
      g.add(base, shaft);
      if (!broken) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), stoneDark);
        cap.position.set(cx, cy + 0.7 + h, cz);
        g.add(cap);
      }
      this.colliders.push({ x: at.x + cx, y: at.y + cy + h / 2, z: at.z + cz, r: 1.0 });
    }
    // 倒れた柱
    for (let i = 0; i < 2; i++) {
      const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, rand(3, 4.5), 9), stone);
      const a = rand(0, Math.PI * 2);
      fall.position.set(Math.cos(a) * ringR * 0.5, 0.45, Math.sin(a) * ringR * 0.5);
      fall.rotation.set(Math.PI / 2, 0, a + rand(-0.4, 0.4));
      g.add(fall);
    }
    // 漂う光(なにかの残滓)
    const orbMat = new THREE.MeshStandardMaterial({
      color: '#0c1620', emissive: '#8ad8ff', emissiveIntensity: 1.8,
    });
    for (let i = 0; i < 5; i++) {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), orbMat);
      orb.position.set(rand(-ringR, ringR) * 0.7, rand(1, 4), rand(-ringR, ringR) * 0.7);
      g.add(orb);
    }
    g.position.copy(at);
    return g;
  }

  /** 黒曜石のモノリス。刻まれたルーンが青く明滅する */
  private buildMonolith(at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    const slabMat = new THREE.MeshStandardMaterial({ color: '#0d1015', roughness: 0.35, metalness: 0.45 });
    const H = rand(8, 12);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, H, 1.1), slabMat);
    slab.position.y = H / 2 - 0.4;
    slab.rotation.set(rand(-0.06, 0.06), rand(0, Math.PI), rand(-0.04, 0.04));
    g.add(slab);
    // ルーン(発光する筋)
    const runeMat = new THREE.MeshStandardMaterial({
      color: '#0a1418', emissive: '#5ad8ff', emissiveIntensity: 1.7,
    });
    for (let i = 0; i < 7; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.1, rand(0.6, 2.2), 0.03), runeMat);
      rune.position.set(rand(-0.9, 0.9), rand(1, H - 1.5), 0.57);
      rune.rotation.z = rand(-0.1, 0.1);
      slab.add(rune);
      if (i < 4) {
        const back = rune.clone();
        back.position.z = -0.57;
        slab.add(back);
      }
    }
    // 根本の瓦礫
    const rubbleMat = new THREE.MeshStandardMaterial({ color: '#3a4046', roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.3, 0.8), 0), rubbleMat);
      rk.position.set(rand(-2.2, 2.2), 0.15, rand(-1.6, 1.6));
      g.add(rk);
    }
    g.position.copy(at);
    this.colliders.push({ x: at.x, y: at.y + H / 2, z: at.z, r: 2.1 });
    return g;
  }

  /** 海底谷の入り口にそびえる石の門 */
  private buildGate(at: THREE.Vector3, canyonAng: number): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#8b928c', roughness: 1 });
    applyTriplanar(stone, this.rockTex, 0.4, 'gate-stone');
    const H = 13;
    const HALF = 4.2;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.8, H, 1.8), stone);
      pillar.position.set(side * HALF, H / 2 - 0.5, 0);
      pillar.rotation.y = rand(-0.06, 0.06);
      g.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 3, 2.0, 2.4), stone);
    lintel.position.y = H - 0.2;
    lintel.rotation.z = rand(-0.02, 0.02);
    g.add(lintel);
    // 門に刻まれた印(表裏)
    const glyphMat = new THREE.MeshStandardMaterial({
      color: '#0a1418', emissive: '#66e0c8', emissiveIntensity: 1.4,
    });
    for (const zz of [1.25, -1.25]) {
      const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 6, 20), glyphMat);
      glyph.position.set(0, 0, zz);
      lintel.add(glyph);
    }
    // 通路が海底谷に沿う向きに回す
    g.rotation.y = Math.PI / 2 - canyonAng;
    g.position.copy(at);
    for (const side of [-1, 1]) {
      const px = at.x + Math.sin(canyonAng) * side * HALF;
      const pz = at.z - Math.cos(canyonAng) * side * HALF;
      this.colliders.push({ x: px, y: at.y + H / 2, z: pz, r: 1.7 });
    }
    return g;
  }

  private makeSmoke(top: THREE.Vector3): THREE.Points {
    const N = 50;
    const H = 10;
    const posArr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      posArr[i * 3] = rand(-0.4, 0.4);
      posArr[i * 3 + 1] = rand(0, H);
      posArr[i * 3 + 2] = rand(-0.4, 0.4);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.85, color: '#5a6470', transparent: true, opacity: 0.22, depthWrite: false,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader =
        'uniform float uTime;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `vec3 p = position;
          p.y = mod(position.y + uTime * 1.1, ${H.toFixed(1)});
          p.x += sin(uTime * 0.6 + position.y * 2.0) * (0.2 + p.y * 0.12);
          p.z += cos(uTime * 0.5 + position.y * 1.7) * (0.2 + p.y * 0.1);
          vec3 transformed = p;`
        );
    };
    mat.customProgramCacheKey = () => 'vent-smoke';
    const pts = new THREE.Points(geom, mat);
    pts.position.copy(top).y -= 4.5;
    pts.frustumCulled = false;
    return pts;
  }

  private buildWreck(at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#41453a', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#33362e', roughness: 1 });
    const bow = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 10), mat);
    bow.position.set(0, 1.1, 3.5);
    bow.rotation.set(0.28, 0, 0.34);
    const stern = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 7), mat);
    stern.position.set(1.8, 0.7, -5.5);
    stern.rotation.set(-0.14, 0.35, -0.42);
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.6), dark);
    house.position.set(1.6, 2.6, -5.2);
    house.rotation.copy(stern.rotation);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9, 6), dark);
    mast.position.set(-2.6, 0.6, -1);
    mast.rotation.set(0, 0, 1.35);
    g.add(bow, stern, house, mast);
    g.position.copy(at).y += 0.4;
    g.rotation.y = rand(0, Math.PI * 2);
    return g;
  }

  private buildCave(at: THREE.Vector3, rockGeo: THREE.BufferGeometry, rockMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const mk = (sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = rand(0, Math.PI);
      return m;
    };
    g.add(mk(3.4, 5.2, 3.2, -4.4, 1.6, 0));
    g.add(mk(3.2, 5.0, 3.4, 4.4, 1.5, 0.6));
    g.add(mk(6.2, 2.6, 4.4, 0, 5.6, 0.2));
    const glow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.09, 1),
      new THREE.MeshStandardMaterial({ color: '#101828', emissive: '#7a5af0', emissiveIntensity: 1.6 })
    );
    for (let i = 0; i < 7; i++) {
      const p = glow.clone();
      p.position.set(rand(-3, 3), rand(0.3, 4.6), rand(-1.6, 1.6));
      g.add(p);
    }
    g.position.copy(at);
    return g;
  }

  private buildWhaleFall(at: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    const bone = new THREE.MeshStandardMaterial({ color: '#cfc9b8', roughness: 0.85 });
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 6), bone);
      seg.position.set(0, 0.25, i * 0.85 - 3.4);
      seg.rotation.x = Math.PI / 2;
      g.add(seg);
      if (i < 7) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(1.15 - i * 0.06, 0.05, 5, 10, Math.PI), bone);
        rib.position.set(0, 1.0, i * 0.85 - 3.2);
        rib.rotation.y = Math.PI / 2;
        rib.rotation.z = Math.PI;
        rib.scale.y = 1.25;
        g.add(rib);
      }
    }
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.9), bone);
    skull.position.set(0, 0.35, 4.4);
    skull.rotation.y = 0.1;
    g.add(skull);
    const glowMat = new THREE.MeshStandardMaterial({ color: '#0a1620', emissive: '#48e0c8', emissiveIntensity: 1.4 });
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), glowMat);
      p.position.set(rand(-2.4, 2.4), 0.1, rand(-3.6, 4.6));
      g.add(p);
    }
    g.position.copy(at).y += 0.1;
    g.rotation.y = rand(0, Math.PI);
    return g;
  }
}
