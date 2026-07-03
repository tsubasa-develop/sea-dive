import * as THREE from 'three';
import { rand } from '../core/noise';
import { applySwim, fishMesh, makeFishGeometry, makeFishMaterial, resolveParams } from './FishFactory';
import { attachModel } from './ModelLibrary';
import type { SpeciesDef } from './SpeciesData';

export interface SpecialCreature {
  object: THREE.Object3D;
  /** 内部アニメーション(ひれの羽ばたき、発光の明滅など) */
  update?: (dt: number, t: number, playerDist: number) => void;
}

/**
 * 生物を生成する。まず手続き生成モデルを返し、
 * manifest にGLBモデルが登録されていれば読み込み完了時に差し替える。
 */
export function buildSpecial(def: SpeciesDef): SpecialCreature {
  const base = buildProcedural(def);
  const group = new THREE.Group();
  group.add(base.object);
  let mixer: THREE.AnimationMixer | null = null;
  let swapped = false;
  attachModel(def, (loaded) => {
    group.remove(base.object);
    group.add(loaded.object);
    mixer = loaded.mixer ?? null;
    swapped = true;
  });
  return {
    object: group,
    update: (dt, t, playerDist) => {
      if (swapped) mixer?.update(dt);
      else base.update?.(dt, t, playerDist);
    },
  };
}

function buildProcedural(def: SpeciesDef): SpecialCreature {
  switch (def.builder) {
    case 'fish': return { object: fishMesh(def) };
    case 'ray': return buildRay(def);
    case 'turtle': return buildTurtle(def);
    case 'jelly': return buildMoonJelly(def);
    case 'comb': return buildCombJelly(def);
    case 'angler': return buildAngler(def);
    case 'oarfish': return buildOarfish(def);
    case 'isopod': return buildIsopod(def);
    case 'mendako': return buildMendako(def);
    case 'octopus': return buildOctopus(def);
    case 'sunfish': return buildSunfish(def);
    case 'whale': return buildWhale(def);
    case 'gardenEel': return buildGardenEel(def);
    case 'clione': return buildClione(def);
    case 'squid': return buildSquid(def);
    case 'shadow': return buildShadow(def);
  }
}

/** ダイオウイカ。外套膜を先頭に、長い触腕を引いて泳ぐ */
function buildSquid(def: SpeciesDef): SpecialCreature {
  const L = def.length;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#9a3226', roughness: 0.55, metalness: 0.05 });
  const pale = new THREE.MeshStandardMaterial({ color: '#c8705a', roughness: 0.6 });

  // 外套膜(前方へ伸びる円錐)
  const mantle = new THREE.Mesh(new THREE.ConeGeometry(L * 0.075, L * 0.5, 12), mat);
  mantle.rotation.x = Math.PI / 2;
  mantle.position.z = L * 0.28;
  g.add(mantle);
  // 先端のひれ(菱形)
  const fins = new THREE.Mesh(new THREE.CircleGeometry(L * 0.13, 4), mat);
  fins.rotation.z = Math.PI / 4;
  fins.position.z = L * 0.44;
  g.add(fins);
  // 頭部
  const head = new THREE.Mesh(new THREE.SphereGeometry(L * 0.06, 10, 8), mat);
  head.position.z = L * 0.02;
  head.scale.set(1, 1, 1.2);
  g.add(head);
  // 巨大な目(動物界最大)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#101418', emissive: '#3a5868', emissiveIntensity: 0.5, roughness: 0.2,
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.026, 10, 8), eyeMat);
    eye.position.set(side * L * 0.052, 0, L * 0.03);
    g.add(eye);
  }
  // 8本の腕(後方へ)
  const armsGroup = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * L * 0.03, dy * L * 0.03, -L * 0.02),
      new THREE.Vector3(dx * L * 0.06, dy * L * 0.06, -L * 0.16),
      new THREE.Vector3(dx * L * 0.045, dy * L * 0.045, -L * 0.3),
      new THREE.Vector3(dx * L * 0.02, dy * L * 0.02, -L * 0.4),
    ]);
    armsGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, L * 0.011, 6), pale));
  }
  // 2本の長い触腕(先端にクラブ)
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * L * 0.02, -L * 0.01, -L * 0.02),
      new THREE.Vector3(side * L * 0.07, -L * 0.05, -L * 0.28),
      new THREE.Vector3(side * L * 0.05, -L * 0.02, -L * 0.52),
      new THREE.Vector3(side * L * 0.06, L * 0.01, -L * 0.62),
    ]);
    armsGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, L * 0.007, 6), pale));
    const club = new THREE.Mesh(new THREE.SphereGeometry(L * 0.018, 8, 6), pale);
    club.position.set(side * L * 0.06, L * 0.01, -L * 0.62);
    club.scale.set(1, 1, 2.2);
    armsGroup.add(club);
  }
  g.add(armsGroup);

  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      armsGroup.rotation.z = Math.sin(t * 0.7 + phase) * 0.12;
      armsGroup.rotation.x = Math.cos(t * 0.55 + phase) * 0.06;
      mantle.scale.x = mantle.scale.y = 1 + Math.sin(t * 1.6 + phase) * 0.05; // 外套膜の脈動
    },
  };
}

/** 「ヌシ」— 霧の向こうを横切る正体不明の巨大な黒い魚影 */
function buildShadow(def: SpeciesDef): SpecialCreature {
  const L = def.length;
  const p = resolveParams({
    base: '#000000', height: 0.24, width: 0.15, noseK: 0.58,
    tailSpan: 0.42, tailLen: 0.22, tailFork: 0.5, dorsalH: 0.13, analH: 0.06,
    scales: false, swimFreq: 0.5, swimAmp: L * 0.028,
  }, L);
  const geo = makeFishGeometry(p);
  // テクスチャなしの漆黒。フォグに溶けてシルエットだけが浮かぶ
  const mat = new THREE.MeshStandardMaterial({ color: '#04070b', roughness: 1, metalness: 0 });
  applySwim(mat, def.id, p, 'sway', false);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  // 微かに光る目だけが見える
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#0a0e12', emissive: '#6a8a96', emissiveIntensity: 0.9, roughness: 0.4,
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.008, 8, 6), eyeMat);
    eye.position.set(side * L * 0.045, L * 0.03, L * 0.42);
    g.add(eye);
  }
  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      // まばたきのように時折光が消える
      const blink = Math.sin(t * 0.35 + phase) > -0.92 ? 0.9 : 0.05;
      eyeMat.emissiveIntensity += (blink - eyeMat.emissiveIntensity) * (1 - Math.exp(-dt * 6));
    },
  };
}

/** チンアナゴのコロニー。近づくと砂に引っ込む */
function buildGardenEel(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  // 白地に黒斑の体
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8e2d2';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#22201c';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(rand(4, 60), rand(4, 124), rand(2, 5), 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });

  const bodyGeo = new THREE.CylinderGeometry(0.012, 0.02, 1, 6, 8);
  {
    // 上部をゆるく前傾させる(潮上を向く姿勢)
    const pos = bodyGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y01 = (pos.getY(i) + 0.5);
      pos.setX(i, pos.getX(i) + y01 * y01 * 0.16);
    }
    bodyGeo.translate(0, 0.5, 0);
    bodyGeo.computeVertexNormals();
  }
  const eels: { pivot: THREE.Object3D; ph: number; h: number; cur: number }[] = [];
  const scl = def.length / 0.35;
  for (let i = 0; i < 14; i++) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(bodyGeo, mat);
    pivot.add(mesh);
    const a = rand(0, Math.PI * 2);
    const rr = rand(0.2, 1.4) * scl;
    pivot.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    pivot.rotation.y = rand(0, Math.PI * 2);
    const h = rand(0.55, 0.95) * scl;
    pivot.scale.setScalar(h);
    g.add(pivot);
    eels.push({ pivot, ph: rand(0, Math.PI * 2), h, cur: h });
  }
  return {
    object: g,
    update: (dt, t, playerDist) => {
      // 接近すると砂に引っ込む(スケールYを縮める)
      const target = playerDist < 3.5 ? 0.05 : 1;
      for (const e of eels) {
        e.cur += (target * e.h - e.cur) * (1 - Math.exp(-dt * (target < 1 ? 8 : 1.6)));
        e.pivot.scale.y = Math.max(e.cur, 0.02);
        e.pivot.rotation.z = Math.sin(t * 1.3 + e.ph) * 0.1;
        e.pivot.rotation.x = Math.cos(t * 1.1 + e.ph * 1.7) * 0.08;
      }
    },
  };
}

/** クリオネ(流氷の天使)。翼足をはばたかせて浮遊する */
function buildClione(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: '#e8ecf2', transparent: true, opacity: 0.55, roughness: 0.3,
    emissive: '#b8c8e0', emissiveIntensity: 0.25, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), bodyMat);
  body.scale.set(0.7, 1.5, 0.7);
  g.add(body);
  // 内臓の赤橙の光(クリオネの象徴)
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#8a2a10', emissive: '#ff5a28', emissiveIntensity: 1.6 })
  );
  core.position.y = -0.008;
  g.add(core);
  // 頭の小さな角
  const hornMat = new THREE.MeshStandardMaterial({ color: '#d8dee8', transparent: true, opacity: 0.7 });
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.02, 5), hornMat);
    horn.position.set(side * 0.01, 0.055, 0);
    horn.rotation.z = side * -0.4;
    g.add(horn);
  }
  // 翼足
  const wingGeo = new THREE.CircleGeometry(0.03, 8);
  wingGeo.scale(1.4, 0.7, 1);
  const wingMat = new THREE.MeshStandardMaterial({
    color: '#f0f4f8', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
  });
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.028, 0.008, 0);
    g.add(wing);
    wings.push(wing);
  }
  g.scale.setScalar(def.length / 0.08);
  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      const flap = Math.sin(t * 4.2 + phase);
      wings[0].rotation.y = -0.5 - flap * 0.75;
      wings[1].rotation.y = 0.5 + flap * 0.75;
      g.position.y += Math.sin(t * 2.1 + phase) * 0.0006;
    },
  };
}

function buildWhale(def: SpeciesDef): SpecialCreature {
  const L = def.length;
  const isBlue = def.id === 'blue_whale';
  const p = resolveParams({
    base: isBlue ? '#5e7486' : '#39434f',
    belly: isBlue ? '#c4ced6' : '#e2e9ed',
    height: isBlue ? 0.2 : 0.26, width: isBlue ? 0.17 : 0.2, noseK: isBlue ? 0.48 : 0.6,
    tailSpan: 0.36, tailLen: 0.16, dorsalH: isBlue ? 0.018 : 0.035,
    eyeScale: isBlue ? 0.28 : 0.4, eyeX: 0.13, scales: false,
    pattern: isBlue ? { kind: 'speckle', color: '#8ba2b2' } : undefined,
    finColor: '#dfe8ec', swimFreq: isBlue ? 0.6 : 0.85, swimAmp: L * 0.035,
    roughness: 0.6, metalness: 0.05,
  }, L);
  p.flukeH = true;
  p.longPectorals = isBlue ? 0.11 : 0.3;
  const mesh = new THREE.Mesh(makeFishGeometry(p), makeFishMaterial(p, def.id, 'vsway', false));
  return { object: mesh };
}

function buildRay(def: SpeciesDef): SpecialCreature {
  const p = resolveParams({ ...def.fish!, tailSpan: 0.07, tailLen: 0.3, dorsalH: 0, analH: 0 }, def.length);
  const geo = makeFishGeometry(p);
  const mat = makeFishMaterial(p, def.id, 'flap', false);
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  const darkMat = new THREE.MeshStandardMaterial({ color: p.base, roughness: 0.6 });
  // 鞭状の尾
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * def.length, 0.012 * def.length, def.length * 0.85, 5), darkMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, -def.length * 0.85);
  group.add(tail);
  if (def.id === 'manta') {
    // 頭鰭(セファリックフィン)
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(def.length * 0.05, def.length * 0.025, def.length * 0.16), darkMat);
      fin.position.set(side * def.length * 0.12, -def.length * 0.01, def.length * 0.52);
      fin.rotation.y = side * 0.25;
      group.add(fin);
    }
  }
  return { object: group };
}

function buildTurtle(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: '#5a6b3f', roughness: 0.7, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: '#d8cf9a', roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#7a8a5a', roughness: 0.75 });

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), shellMat);
  shell.scale.set(0.85, 0.42, 1.15);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), bellyMat);
  belly.scale.set(0.78, 0.3, 1.05);
  belly.position.y = -0.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skinMat);
  head.scale.set(0.85, 0.8, 1.1);
  head.position.set(0, 0.03, 0.58);
  g.add(shell, belly, head);

  const flippers: THREE.Group[] = [];
  const mkFlipper = (x: number, z: number, len: number): THREE.Group => {
    const pivot = new THREE.Group();
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMat);
    f.scale.set(len, 0.14, 0.55);
    f.position.x = Math.sign(x) * len * 0.17;
    pivot.add(f);
    pivot.position.set(x, -0.02, z);
    g.add(pivot);
    return pivot;
  };
  flippers.push(mkFlipper(-0.36, 0.26, 1.7), mkFlipper(0.36, 0.26, 1.7));
  flippers.push(mkFlipper(-0.3, -0.4, 1.0), mkFlipper(0.3, -0.4, 1.0));

  const s = def.length / 1.1;
  g.scale.setScalar(s);
  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      const w = Math.sin(t * 1.9 + phase);
      flippers[0].rotation.z = 0.35 + w * 0.45;
      flippers[1].rotation.z = -(0.35 + w * 0.45);
      flippers[2].rotation.z = 0.2 + Math.sin(t * 1.9 + phase + 1.2) * 0.18;
      flippers[3].rotation.z = -(0.2 + Math.sin(t * 1.9 + phase + 1.2) * 0.18);
    },
  };
}

function buildMoonJelly(def: SpeciesDef): SpecialCreature {
  const r = def.length * 0.5;
  const g = new THREE.Group();
  const bellGroup = new THREE.Group();
  const bellMat = new THREE.MeshStandardMaterial({
    color: '#bcd8ea', transparent: true, opacity: 0.35, roughness: 0.3,
    emissive: '#6a98c0', emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false,
  });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), bellMat);
  bellGroup.add(bell);
  const gonadMat = new THREE.MeshStandardMaterial({
    color: '#d8a0c0', transparent: true, opacity: 0.7, emissive: '#b06890', emissiveIntensity: 0.5, depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const gonad = new THREE.Mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), gonadMat);
    gonad.scale.y = 0.4;
    const a = (i / 4) * Math.PI * 2;
    gonad.position.set(Math.cos(a) * r * 0.32, r * 0.42, Math.sin(a) * r * 0.32);
    bellGroup.add(gonad);
  }
  g.add(bellGroup);

  const tentPts: number[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const x = Math.cos(a) * r * 0.92, z = Math.sin(a) * r * 0.92;
    tentPts.push(x, 0.05, z, x * 1.15, -r * 1.5, z * 1.15);
  }
  const tentGeo = new THREE.BufferGeometry();
  tentGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tentPts), 3));
  const tent = new THREE.LineSegments(tentGeo, new THREE.LineBasicMaterial({ color: '#cfe0ea', transparent: true, opacity: 0.4 }));
  g.add(tent);

  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      const s = 1 + Math.sin(t * 1.8 + phase) * 0.09;
      bellGroup.scale.set(s, 1.12 - (s - 1) * 1.5, s);
      tent.rotation.y = Math.sin(t * 0.4 + phase) * 0.15;
    },
  };
}

function buildCombJelly(def: SpeciesDef): SpecialCreature {
  const mat = new THREE.MeshStandardMaterial({
    color: '#26333d', transparent: true, opacity: 0.6, roughness: 0.25,
    emissive: '#40c0d0', emissiveIntensity: 0.9, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.length * 0.5, 12, 16), mat);
  mesh.scale.set(0.55, 1, 0.55);
  mesh.rotation.x = Math.PI / 2; // 長軸を進行方向に
  const g = new THREE.Group();
  g.add(mesh);
  const phase = rand(0, 1);
  return {
    object: g,
    update: (dt, t) => {
      mat.emissive.setHSL((t * 0.13 + phase) % 1, 0.8, 0.45);
    },
  };
}

function buildAngler(def: SpeciesDef): SpecialCreature {
  const p = resolveParams({
    base: '#191114', belly: '#261a1e', height: 0.58, width: 0.32, scales: false,
    noseK: 0.5, tailSpan: 0.28, tailFork: 0.15, eyeScale: 1.2, eyeColor: '#8898a8',
    swimFreq: 2.2, roughness: 0.8, metalness: 0,
  }, def.length);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(makeFishGeometry(p), makeFishMaterial(p, def.id, 'sway', false)));

  const L = def.length;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, L * 0.22, L * 0.18),
    new THREE.Vector3(0, L * 0.55, L * 0.5),
    new THREE.Vector3(0, L * 0.38, L * 0.72),
  );
  const rod = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, L * 0.014, 5),
    new THREE.MeshStandardMaterial({ color: '#241a1e', roughness: 0.9 })
  );
  g.add(rod);
  const tipPos = curve.getPoint(1);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(L * 0.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#dffaff', emissive: '#9ef0ff', emissiveIntensity: 3 })
  );
  bulb.position.copy(tipPos);
  g.add(bulb);
  const glowMat = new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: '#aef2ff', blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0.85,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(tipPos);
  glow.scale.setScalar(L * 0.9);
  g.add(glow);

  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      glowMat.opacity = 0.55 + 0.35 * Math.sin(t * 2.3 + phase);
      glow.scale.setScalar(L * (0.8 + 0.18 * Math.sin(t * 2.3 + phase)));
    },
  };
}

function buildOarfish(def: SpeciesDef): SpecialCreature {
  const L = def.length;
  const p = resolveParams({
    base: '#c2cedd', belly: '#eef4f8', height: 0.13, width: 0.035, noseK: 0.5,
    metalness: 0.55, roughness: 0.3, swimFreq: 1.7, swimAmp: L * 0.045,
    pattern: { kind: 'speckle', color: '#3a4450' },
  }, L);
  const phaseRef = { value: rand(0, Math.PI * 2) };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(makeFishGeometry(p), makeFishMaterial(p, def.id, 'sway', false, phaseRef)));

  // 全身を貫く紅の背びれ(体と同じ位相でうねらせる)
  const finMat = new THREE.MeshStandardMaterial({
    color: '#ff5060', emissive: '#c02040', emissiveIntensity: 0.5,
    side: THREE.DoubleSide, transparent: true, opacity: 0.9, roughness: 0.6,
  });
  applySwim(finMat, 'oarfish-fin', p, 'sway', false, phaseRef);
  const finGeo = new THREE.PlaneGeometry(L * 0.94, L * 0.032, 24, 1);
  finGeo.rotateY(Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.y = p.height! * L * 0.5 + L * 0.012;
  g.add(fin);
  // 頭部の冠(長く伸びる鰭条)
  for (let i = 0; i < 3; i++) {
    const streamer = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.006, L * 0.14), finMat);
    streamer.position.set(0, L * 0.09 + i * L * 0.045, L * 0.44 - i * L * 0.02);
    streamer.rotation.x = -0.5 - i * 0.15;
    g.add(streamer);
  }
  return { object: g };
}

function buildIsopod(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b3a6c4', roughness: 0.7, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 7), mat);
    seg.scale.set(1, 0.5, 0.72);
    seg.position.set(0, 0.055 + Math.sin((i / 6) * Math.PI) * 0.015, 0.14 - i * 0.055);
    g.add(seg);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), mat);
  head.scale.set(0.95, 0.6, 0.85);
  head.position.set(0, 0.05, 0.2);
  g.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#15151a', roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), eyeMat);
    eye.position.set(side * 0.055, 0.075, 0.29);
    g.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.24, 4), mat);
    ant.position.set(side * 0.06, 0.05, 0.36);
    ant.rotation.set(Math.PI / 2.6, 0, side * -0.5);
    g.add(ant);
  }
  g.scale.setScalar(def.length / 0.5);
  return { object: g };
}

function buildMendako(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b0453a', roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat);
  body.scale.set(1, 0.6, 1);
  g.add(body);
  // スカート状の腕
  const skirt = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.35), mat);
  skirt.scale.set(1.05, 0.8, 1.05);
  g.add(skirt);
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat);
    ear.scale.set(0.3, 1, 0.55);
    ear.position.y = 0.045;
    pivot.add(ear);
    pivot.position.set(side * 0.11, 0.07, -0.02);
    pivot.rotation.z = side * -0.5;
    g.add(pivot);
    ears.push(pivot);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a0f0f', roughness: 0.2 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), eyeMat);
    eye.position.set(side * 0.07, 0.05, 0.12);
    g.add(eye);
  }
  g.scale.setScalar(def.length / 0.3);
  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t) => {
      ears[0].rotation.z = -0.5 - Math.sin(t * 2.4 + phase) * 0.5;
      ears[1].rotation.z = 0.5 + Math.sin(t * 2.4 + phase) * 0.5;
      body.position.y = Math.sin(t * 1.3 + phase) * 0.012;
    },
  };
}

function buildOctopus(def: SpeciesDef): SpecialCreature {
  const g = new THREE.Group();
  const selfColor = new THREE.Color('#a05838');
  const rockColor = new THREE.Color('#68705f');
  const mat = new THREE.MeshStandardMaterial({ color: selfColor.clone(), roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat);
  head.scale.set(0.9, 1.15, 1.0);
  head.position.y = 0.2;
  g.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#d8c890', roughness: 0.4 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#101010' });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
    eye.position.set(side * 0.1, 0.3, 0.09);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), pupilMat);
    pupil.position.set(side * 0.11, 0.3, 0.125);
    g.add(eye, pupil);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(dx * 0.14, 0.03, dz * 0.14),
      new THREE.Vector3(dx * 0.3, -0.02, dz * 0.3),
      new THREE.Vector3(dx * 0.42, rand(0, 0.09), dz * 0.42),
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.026, 5), mat);
    g.add(arm);
  }
  g.scale.setScalar(def.length / 0.84);
  const phase = rand(0, Math.PI * 2);
  return {
    object: g,
    update: (dt, t, playerDist) => {
      // 擬態: プレイヤーが近いほど岩の色に
      const wSelf = Math.min(1, Math.max(0, (playerDist - 5) / 6));
      const target = rockColor.clone().lerp(selfColor, wSelf);
      mat.color.lerp(target, 1 - Math.exp(-dt * 2.5));
      head.scale.y = 1.15 + Math.sin(t * 2.6 + phase) * 0.05;
    },
  };
}

function buildSunfish(def: SpeciesDef): SpecialCreature {
  const p = resolveParams({
    base: '#9aa4ad', belly: '#d0d6da', height: 0.82, width: 0.13, noseK: 0.6,
    dorsalH: 0.5, analH: 0.5, tailSpan: 0.72, swimFreq: 1.4, swimAmp: def.length * 0.13,
    roughness: 0.45, metalness: 0.25,
  }, def.length);
  p.clavus = true;
  const mesh = new THREE.Mesh(makeFishGeometry(p), makeFishMaterial(p, def.id, 'waggle', false));
  return { object: mesh };
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(190,240,255,0.5)');
  grad.addColorStop(1, 'rgba(150,220,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
