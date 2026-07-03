import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, slopeAt } from './Terrain';
import { noise2, rand, randInt, pick } from '../core/noise';
import { uTime } from '../core/uniforms';

interface FloorSpot { x: number; y: number; z: number }

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
    if (r < 11 || r > 100) continue;
    if (slopeAt(x, z) > slopeMax) continue;
    spots.push({ x, y: heightAt(x, z), z });
  }
  return spots;
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

function makeInstanced(
  geom: THREE.BufferGeometry, mat: THREE.Material, spots: FloorSpot[],
  opts: { scale?: [number, number]; sink?: number; palette?: string[]; squash?: boolean } = {}
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geom, mat, spots.length);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const [s0, s1] = opts.scale ?? [0.8, 1.3];
  spots.forEach((spot, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
    const sc = rand(s0, s1);
    if (opts.squash) s.set(sc * rand(0.7, 1.3), sc * rand(0.6, 1.2), sc * rand(0.7, 1.3));
    else s.set(sc, sc, sc);
    p.set(spot.x, spot.y - (opts.sink ?? 0.08), spot.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (opts.palette) {
      col.set(pick(opts.palette)).offsetHSL(0, 0, rand(-0.04, 0.04));
      mesh.setColorAt(i, col);
    }
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
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

function staghornGeometry(): THREE.BufferGeometry {
  const geoms: THREE.BufferGeometry[] = [];
  // 枝先ほど明るく(実際のミドリイシの成長端の白)
  const bright = (d: number): number => 0.5 + 0.85 * Math.pow(d / 5, 1.3);
  const branch = (m: THREE.Matrix4, len: number, r: number, depth: number): void => {
    const cyl = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1);
    paintY(cyl, -len / 2, len / 2, bright(depth), bright(depth + 1));
    cyl.translate(0, len / 2, 0);
    cyl.applyMatrix4(m);
    geoms.push(cyl);
    if (depth >= 4) return;
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const child = new THREE.Matrix4()
        .multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, len * rand(0.7, 0.95), 0))
        .multiply(new THREE.Matrix4().makeRotationY(rand(0, Math.PI * 2)))
        .multiply(new THREE.Matrix4().makeRotationX(rand(0.5, 1.05)));
      branch(child, len * rand(0.58, 0.72), r * 0.66, depth + 1);
    }
  };
  branch(new THREE.Matrix4(), 0.42, 0.085, 0);
  const merged = mergeGeometries(geoms);
  merged.computeVertexNormals();
  return merged;
}

function brainCoralGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.55, 16, 12);
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

  constructor(scene: THREE.Scene) {
    // サンゴの根(パッチ)の中心。礁の賑わいはここに集中する
    const patches = this.patches;
    for (let i = 0; i < 16; i++) {
      const r = Math.sqrt(rand(16 * 16, 88 * 88));
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
    scene.add(makeInstanced(rockGeo, rockMat, placeOnFloor(150, 16, 252), {
      scale: [0.4, 2.6], sink: 0.5, squash: true, palette: ['#5a646c', '#4a545e', '#6a6f66', '#3e4850'],
    }));

    // 枝サンゴ(ミドリイシ)— 7割はパッチに密集、3割は散在。枝先は頂点カラーで白く
    const staghornMat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true });
    const staghornPalette = ['#ff8f6b', '#ffb3a0', '#7adfd4', '#c78cff', '#ffd97a', '#f2a0c8'];
    for (let v = 0; v < 2; v++) {
      const spots = [
        ...placeOnPatches(80, patches, 7, 0.55),
        ...placeOnFloor(30, 13, 95, 0.55),
      ];
      scene.add(makeInstanced(staghornGeometry(), staghornMat, spots, {
        scale: [0.9, 2.1], sink: 0.12, palette: staghornPalette,
      }));
    }

    // 管状カイメン(MHWの陸珊瑚風の縦シルエット)
    const spongeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    scene.add(makeInstanced(tubeSpongeGeometry(), spongeMat,
      [...placeOnPatches(48, patches, 8, 0.55), ...placeOnFloor(20, 15, 120, 0.8)],
      { scale: [0.8, 1.8], sink: 0.06, palette: ['#8a6bdf', '#5f7ad0', '#d0a05f', '#c8577a', '#4fb8c8'] }));

    // ソフトコーラル(もこもこしたパステルの房)
    const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
    applySway(softMat, 'soft', 0.035, 1.3, 0.5);
    scene.add(makeInstanced(softCoralGeometry(), softMat,
      [...placeOnPatches(46, patches, 7, 0.55), ...placeOnFloor(12, 14, 96, 0.5)],
      { scale: [0.7, 1.5], sink: 0.05, palette: ['#ffb3c8', '#d8a8ff', '#e8c0e0', '#ffd0a8', '#ff9eb8'] }));

    // ブドウサンゴ(粒状の光沢)
    const bubbleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
    scene.add(makeInstanced(bubbleCoralGeometry(), bubbleMat,
      placeOnPatches(30, patches, 6, 0.5),
      { scale: [0.8, 1.8], sink: 0.03, palette: ['#d8e8d0', '#c8e0d8', '#e8e0c0', '#c0e8c8'] }));

    // テーブルサンゴ
    const tableGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.09, 0.13, 0.55, 6).translate(0, 0.27, 0),
      new THREE.CylinderGeometry(0.95, 0.8, 0.13, 12).translate(0, 0.6, 0),
    ]);
    tableGeo.computeVertexNormals();
    scene.add(makeInstanced(tableGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      [...placeOnPatches(22, patches, 9, 0.5), ...placeOnFloor(10, 18, 90, 0.5)],
      { scale: [0.9, 2.1], palette: ['#c9b78a', '#a8b87a', '#d8a878'] }));

    // 脳サンゴ
    scene.add(makeInstanced(brainCoralGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      [...placeOnPatches(26, patches, 8, 0.5), ...placeOnFloor(12, 15, 92, 0.5)],
      { scale: [0.7, 2.2], sink: 0.06, palette: ['#c8b465', '#b09a58', '#98a86a'] }));

    // ウミウチワ(シーファン)
    const fanTex = seafanTexture();
    const fanMat = new THREE.MeshStandardMaterial({
      roughness: 0.9, side: THREE.DoubleSide, alphaMap: fanTex, alphaTest: 0.3, color: '#ffffff',
    });
    applySway(fanMat, 'fan', 0.07, 1.1, 1.6);
    const fanGeo = new THREE.PlaneGeometry(2.2, 1.65);
    fanGeo.translate(0, 0.82, 0);
    scene.add(makeInstanced(fanGeo, fanMat, placeOnFloor(60, 24, 150, 2.0), {
      scale: [0.9, 2.0], palette: ['#ff5f7a', '#b06bff', '#ff9d54', '#e84a6f'],
    }));

    // イソギンチャク(クマノミの巣)
    const aneMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    applySway(aneMat, 'anemone', 0.05, 1.7, 0.55);
    const aneSpots = [...placeOnPatches(8, patches, 10, 0.45), ...placeOnFloor(4, 14, 78, 0.45)];
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
    scene.add(makeInstanced(grassGeo, grassMat, placeOnFloor(320, 10, 74, 0.3), {
      scale: [0.6, 1.5], palette: ['#79bc70', '#65a85f', '#8cc87e', '#5d9a58'],
    }));

    // 海藻(斜面〜断崖の上部)
    const kelpGeo = taperedBlade(0.55, 7.5, 0.6);
    const kelpMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    applySway(kelpMat, 'kelp', 0.6, 0.75, 7.5);
    scene.add(makeInstanced(kelpGeo, kelpMat, placeOnFloor(90, 92, 150, 1.2), {
      scale: [0.6, 1.3], palette: ['#5d7a42', '#4e683e', '#6f8448'],
    }));

    // 深海の発光ポリプ
    const polypGeo = new THREE.IcosahedronGeometry(0.07, 1);
    const polypCyan = new THREE.MeshStandardMaterial({ color: '#0a2028', emissive: '#4fd8f0', emissiveIntensity: 2.0, roughness: 0.6 });
    const polypViolet = new THREE.MeshStandardMaterial({ color: '#140a20', emissive: '#9a6af0', emissiveIntensity: 1.8, roughness: 0.6 });
    scene.add(makeInstanced(polypGeo, polypCyan, placeOnFloor(48, 162, 250), { scale: [0.6, 2.2], sink: 0.02 }));
    scene.add(makeInstanced(polypGeo, polypViolet, placeOnFloor(40, 162, 250), { scale: [0.6, 2.0], sink: 0.02 }));

    // 熱水噴出孔
    const ventMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 });
    const wormMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: '#401512', emissiveIntensity: 0.25 });
    const wormGeo = tubewormGeometry();
    for (const th of [1.4, 2.6, 5.1]) {
      const vp = polar(rand(185, 235), th + rand(-0.15, 0.15));
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

    // 沈没船(ドロップオフの棚)
    this.wreckPos = polar(128, 0.8);
    scene.add(this.buildWreck(this.wreckPos));

    // 海底洞窟(シーラカンスの棲家)
    this.cavePos = polar(168, 3.9);
    scene.add(this.buildCave(this.cavePos, rockGeo, rockMat));

    // 鯨骨(ホエールフォール)
    scene.add(this.buildWhaleFall(polar(205, 2.2)));
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
    g.rotation.y = 0.7;
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
