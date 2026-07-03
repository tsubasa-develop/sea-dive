import * as THREE from 'three';
import { SPECIES, ZONE_RADIUS, type SpeciesDef } from './SpeciesData';
import { fishInstanced } from './FishFactory';
import { buildSpecial, type SpecialCreature } from './SpecialFactory';
import { heightAt } from '../world/Terrain';
import { clamp, fbm2, pick, rand, randInt } from '../core/noise';

export interface Subject {
  def: SpeciesDef;
  pos: THREE.Vector3;
  forward: THREE.Vector3;
  radius: number;
}

export interface Anchors {
  anemones: THREE.Vector3[];
  cavePos: THREE.Vector3;
  wreckPos: THREE.Vector3;
  patches: { x: number; z: number }[];
}

interface Member {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

interface School {
  def: SpeciesDef;
  mesh: THREE.InstancedMesh;
  start: number;
  members: Member[];
  anchor: THREE.Vector3;
  home?: THREE.Vector3;   // イソギンチャク等の固定巣
  seed: number;
  radius: number;         // 群れの広がり
  panic: number;
}

interface Single {
  def: SpeciesDef;
  special: SpecialCreature;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  target: THREE.Vector3;
  retarget: number;
  burst: number;
  home?: THREE.Vector3;
  hover: number;          // 底生種の浮上量
  event?: { curve: THREE.QuadraticBezierCurve3; t: number; dur: number };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _mtx = new THREE.Matrix4();
const _sc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _lookM = new THREE.Matrix4();
const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ALT_UP = new THREE.Vector3(0, 0, 1);

function quatFromDir(dir: THREE.Vector3, out: THREE.Quaternion): void {
  if (dir.lengthSq() < 1e-8) return;
  _v3.copy(dir).normalize();
  const up = Math.abs(_v3.y) > 0.93 ? ALT_UP : UP;
  _lookM.lookAt(_v3, ZERO, up);
  out.setFromRotationMatrix(_lookM);
}

function habitatPoint(def: SpeciesDef, out: THREE.Vector3): THREE.Vector3 {
  const [rMin, rMax] = ZONE_RADIUS[def.zone];
  for (let i = 0; i < 20; i++) {
    const r = Math.sqrt(rand(rMin * rMin, rMax * rMax));
    const th = rand(0, Math.PI * 2);
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const floor = heightAt(x, z);
    const yTop = -def.depth[0];
    const yBot = Math.max(-def.depth[1], floor + 1.5);
    if (yBot >= yTop - 0.5) continue;
    return out.set(x, rand(yBot, yTop), z);
  }
  return out.set(rand(-50, 50), -10, rand(-50, 50));
}

export class CreatureManager {
  private scene: THREE.Scene;
  private schools: School[] = [];
  private singles: Single[] = [];
  private eventActive: Single | null = null;
  private eventTimer = 15;
  private eventCooldown = 30;
  /** デバッグ: イベント種(クジラ等)を高頻度で出現させる */
  debugMode = false;
  private eventCycle = 0;
  onEvent?: (def: SpeciesDef) => void;

  constructor(scene: THREE.Scene, anchors: Anchors) {
    this.scene = scene;
    let anemoneIdx = 0;
    for (const def of SPECIES) {
      if (def.mode === 'school' || def.mode === 'anemone') {
        const sizes: number[] = [];
        for (let gi = 0; gi < def.groups; gi++) sizes.push(randInt(def.groupSize[0], def.groupSize[1]));
        const total = sizes.reduce((a, b) => a + b, 0);
        const mesh = fishInstanced(def, total);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        let start = 0;
        for (const size of sizes) {
          const anchor = new THREE.Vector3();
          let home: THREE.Vector3 | undefined;
          if (def.mode === 'anemone' && anchors.anemones.length > 0) {
            home = anchors.anemones[anemoneIdx % anchors.anemones.length].clone();
            anemoneIdx++;
            anchor.copy(home).y += 0.4;
          } else if (def.zone === 'reef' && anchors.patches.length > 0) {
            // 礁の魚はサンゴの根の周りに群れる
            const p = pick(anchors.patches);
            const x = p.x + rand(-5, 5);
            const z = p.z + rand(-5, 5);
            const floor = heightAt(x, z);
            anchor.set(x, Math.min(floor + rand(1.5, 4.5), -def.depth[0]), z);
          } else {
            habitatPoint(def, anchor);
          }
          const spread = def.mode === 'anemone' ? 0.8 : 1.5 + size * 0.12;
          const members: Member[] = [];
          for (let i = 0; i < size; i++) {
            members.push({
              pos: anchor.clone().add(new THREE.Vector3(rand(-spread, spread), rand(-spread, spread) * 0.5, rand(-spread, spread))),
              vel: new THREE.Vector3(rand(-0.5, 0.5), 0, rand(-0.5, 0.5)),
              quat: new THREE.Quaternion(),
              scale: rand(0.82, 1.18),
            });
          }
          this.schools.push({
            def, mesh, start, members, anchor, home,
            seed: rand(0, 100), radius: spread * 1.4, panic: 0,
          });
          start += size;
        }
      } else if (def.mode !== 'event') {
        for (let gi = 0; gi < def.groups; gi++) {
          const special = buildSpecial(def);
          const single: Single = {
            def, special,
            pos: new THREE.Vector3(), vel: new THREE.Vector3(),
            quat: new THREE.Quaternion(),
            target: new THREE.Vector3(), retarget: 0, burst: 0,
            hover: def.builder === 'mendako' ? 0.7 : def.builder === 'isopod' ? 0.1 : 0.06,
          };
          if (def.mode === 'cave') {
            single.home = anchors.cavePos.clone().add(new THREE.Vector3(0, 1.6, 0));
            single.pos.copy(single.home).add(new THREE.Vector3(rand(-3, 3), rand(0, 2), rand(-3, 3)));
          } else if (def.mode === 'floor') {
            habitatPoint(def, single.pos);
            single.pos.y = heightAt(single.pos.x, single.pos.z) + single.hover;
          } else {
            habitatPoint(def, single.pos);
          }
          single.target.copy(single.pos);
          special.object.position.copy(single.pos);
          scene.add(special.object);
          this.singles.push(single);
        }
      }
    }
  }

  update(dt: number, t: number, playerPos: THREE.Vector3, playerSpeed: number): void {
    for (const school of this.schools) this.updateSchool(school, dt, t, playerPos);
    for (const single of this.singles) this.updateSingle(single, dt, t, playerPos, playerSpeed);
    this.updateEvent(dt, playerPos);
    this.rollEvents(dt, playerPos);
  }

  // ─────────── 群れ(Boids) ───────────
  private updateSchool(s: School, dt: number, t: number, playerPos: THREE.Vector3): void {
    const def = s.def;
    // 群れの錨(アンカー)がゆっくり生息域を徘徊する
    if (!s.home) {
      const ang = fbm2(t * 0.03 + s.seed, s.seed * 1.7) * Math.PI * 2;
      s.anchor.x += Math.cos(ang) * def.speed * 0.35 * dt;
      s.anchor.z += Math.sin(ang) * def.speed * 0.35 * dt;
      s.anchor.y += fbm2(t * 0.05 + s.seed * 3, s.seed) * def.speed * 0.2 * dt;
      const [rMin, rMax] = ZONE_RADIUS[def.zone];
      const r = Math.hypot(s.anchor.x, s.anchor.z);
      if (r > 1) {
        const k = r < rMin ? 1.02 : r > rMax ? 0.98 : 1;
        s.anchor.x *= k; s.anchor.z *= k;
      }
      const floor = heightAt(s.anchor.x, s.anchor.z);
      s.anchor.y = clamp(s.anchor.y, Math.max(-def.depth[1], floor + 2), -def.depth[0]);
    }

    // 群れ全体の重心と平均速度
    _v1.set(0, 0, 0); _v2.set(0, 0, 0);
    for (const m of s.members) { _v1.add(m.pos); _v2.add(m.vel); }
    const n = s.members.length;
    _v1.divideScalar(n); _v2.divideScalar(n);
    const cx = _v1.x, cy = _v1.y, cz = _v1.z;
    const ax = _v2.x, ay = _v2.y, az = _v2.z;

    const sepR = Math.max(0.25, def.length * 2.0);
    const sepR2 = sepR * sepR;
    const fleeR = 2.5 + def.skittish * 8;
    const maxV = def.speed * (1 + s.panic * 1.1);
    let panicNow = 0;

    for (const m of s.members) {
      _f.set(0, 0, 0);
      // 分離
      for (const o of s.members) {
        if (o === m) continue;
        const dx = m.pos.x - o.pos.x, dy = m.pos.y - o.pos.y, dz = m.pos.z - o.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < sepR2 && d2 > 1e-6) {
          const inv = (1 - Math.sqrt(d2) / sepR) * 3.2 / Math.sqrt(d2);
          _f.x += dx * inv; _f.y += dy * inv; _f.z += dz * inv;
        }
      }
      // 結合・整列
      _f.x += (cx - m.pos.x) * 0.4; _f.y += (cy - m.pos.y) * 0.4; _f.z += (cz - m.pos.z) * 0.4;
      _f.x += (ax - m.vel.x) * 0.7; _f.y += (ay - m.vel.y) * 0.7; _f.z += (az - m.vel.z) * 0.7;
      // アンカーへ
      const adx = s.anchor.x - m.pos.x, ady = s.anchor.y - m.pos.y, adz = s.anchor.z - m.pos.z;
      const aDist = Math.sqrt(adx * adx + ady * ady + adz * adz);
      const ak = aDist > s.radius ? 1.1 : 0.15;
      _f.x += adx * ak; _f.y += ady * ak; _f.z += adz * ak;
      // 地形・水面・深度帯
      const floor = heightAt(m.pos.x, m.pos.z);
      if (m.pos.y < floor + 1.0) _f.y += (floor + 1.0 - m.pos.y) * 8;
      if (m.pos.y > -1.2) _f.y -= 6;
      if (m.pos.y > -def.depth[0]) _f.y -= 1.6;
      if (m.pos.y < -def.depth[1]) _f.y += 1.6;
      // プレイヤーからの逃避
      const pdx = m.pos.x - playerPos.x, pdy = m.pos.y - playerPos.y, pdz = m.pos.z - playerPos.z;
      const pd = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
      if (pd < fleeR && def.skittish > 0) {
        const w = (1 - pd / fleeR) * def.skittish;
        panicNow = Math.max(panicNow, w);
        if (s.home) {
          // クマノミは巣へ逃げ込む
          _f.x += (s.home.x - m.pos.x) * w * 12;
          _f.y += (s.home.y - m.pos.y) * w * 12;
          _f.z += (s.home.z - m.pos.z) * w * 12;
        } else if (pd > 0.01) {
          const inv = (w * 13) / pd;
          _f.x += pdx * inv; _f.y += pdy * inv; _f.z += pdz * inv;
        }
      }

      m.vel.addScaledVector(_f, dt);
      const sp = m.vel.length();
      const lo = def.speed * 0.2;
      if (sp > maxV) m.vel.multiplyScalar(maxV / sp);
      else if (sp < lo && sp > 1e-5) m.vel.multiplyScalar(lo / sp);
      m.pos.addScaledVector(m.vel, dt);

      quatFromDir(m.vel, _q);
      m.quat.slerp(_q, 1 - Math.exp(-6 * dt));
    }
    s.panic = Math.max(panicNow, s.panic * Math.exp(-dt * 1.3));

    // インスタンス行列へ書き出し
    for (let i = 0; i < s.members.length; i++) {
      const m = s.members[i];
      _sc.setScalar(m.scale);
      _mtx.compose(m.pos, m.quat, _sc);
      s.mesh.setMatrixAt(s.start + i, _mtx);
    }
    s.mesh.instanceMatrix.needsUpdate = true;
  }

  // ─────────── 単独個体 ───────────
  private updateSingle(s: Single, dt: number, t: number, playerPos: THREE.Vector3, playerSpeed: number): void {
    if (s.event) return; // イベント個体は別経路
    const def = s.def;
    const pd = s.pos.distanceTo(playerPos);
    s.retarget -= dt;
    s.burst = Math.max(0, s.burst - dt);

    const isFloor = def.mode === 'floor';
    const isDrift = def.mode === 'drift';

    if (isDrift) {
      // クラゲ: 潮流に漂う
      const ang = fbm2(t * 0.02 + s.pos.x * 0.01, s.pos.z * 0.01) * Math.PI * 2;
      s.vel.x += (Math.cos(ang) * 0.18 - s.vel.x) * dt * 0.5;
      s.vel.z += (Math.sin(ang) * 0.18 - s.vel.z) * dt * 0.5;
      s.vel.y = Math.sin(t * 0.5 + s.pos.x) * 0.12;
      const floor = heightAt(s.pos.x, s.pos.z);
      if (s.pos.y < floor + 2) s.vel.y += 0.3;
      if (s.pos.y > -def.depth[0]) s.vel.y -= 0.2;
      if (s.pos.y < -def.depth[1]) s.vel.y += 0.2;
      s.pos.addScaledVector(s.vel, dt);
    } else {
      // 目的地の再設定
      if (s.retarget <= 0 || s.pos.distanceTo(s.target) < 1.2) {
        s.retarget = isFloor ? rand(10, 30) : rand(5, 13);
        if (s.home) {
          s.target.copy(s.home).add(_v1.set(rand(-9, 9), rand(-2, 3), rand(-9, 9)));
        } else if (isFloor) {
          s.target.set(s.pos.x + rand(-5, 5), 0, s.pos.z + rand(-5, 5));
        } else {
          habitatPoint(def, s.target);
          // 遠すぎる目的地は近場に丸める
          if (s.target.distanceTo(s.pos) > 40) {
            s.target.sub(s.pos).setLength(25).add(s.pos);
          }
        }
      }
      // 好奇心: 静かにしているダイバーへ寄ってくる
      if (def.curious && pd < 16 && pd > 3.5 && playerSpeed < 1.0) {
        _v1.copy(playerPos).sub(s.pos).setLength(pd - 3);
        s.target.copy(s.pos).add(_v1);
        s.retarget = Math.max(s.retarget, 1.5);
      }
      // 逃避
      if (def.skittish > 0.3 && pd < 2.5 + def.skittish * 6) {
        _v1.copy(s.pos).sub(playerPos).setLength(12);
        if (_v1.lengthSq() < 1e-6) _v1.set(1, 0, 0);
        s.target.copy(s.pos).add(_v1);
        s.burst = 1.6;
        s.retarget = 2.5;
      }

      const speed = def.speed * (s.burst > 0 ? (def.builder === 'mendako' ? 8 : 2.6) : 1);
      _v1.copy(s.target).sub(s.pos);
      if (isFloor) _v1.y = 0;
      if (_v1.lengthSq() > 0.01) {
        _v1.setLength(speed);
        s.vel.lerp(_v1, 1 - Math.exp(-dt * (isFloor ? 1.2 : 2.2)));
      } else {
        s.vel.multiplyScalar(Math.exp(-dt * 2));
      }
      s.pos.addScaledVector(s.vel, dt);

      const floor = heightAt(s.pos.x, s.pos.z);
      if (isFloor) {
        s.pos.y = floor + s.hover + (def.builder === 'mendako' ? Math.sin(t * 1.1) * 0.25 + 0.3 : 0);
      } else {
        if (s.pos.y < floor + 0.8) s.pos.y = floor + 0.8;
        if (s.pos.y > -1.5) s.pos.y = -1.5;
      }
    }

    // 向きの更新
    if (isDrift) {
      // クラゲは直立のままゆらぐ
      _q.setFromEuler(new THREE.Euler(Math.sin(t * 0.6 + s.pos.z) * 0.12, 0, Math.cos(t * 0.5 + s.pos.x) * 0.12));
      s.quat.slerp(_q, 1 - Math.exp(-dt * 2));
    } else if (s.vel.lengthSq() > 0.001) {
      if (isFloor) {
        _v1.copy(s.vel); _v1.y = 0;
        quatFromDir(_v1, _q);
      } else {
        quatFromDir(s.vel, _q);
      }
      s.quat.slerp(_q, 1 - Math.exp(-dt * (isFloor ? 1.5 : 4)));
    }

    s.special.object.position.copy(s.pos);
    s.special.object.quaternion.copy(s.quat);
    s.special.update?.(dt, t, pd);
  }

  // ─────────── レア遭遇イベント ───────────
  private rollEvents(dt: number, playerPos: THREE.Vector3): void {
    this.eventCooldown = Math.max(0, this.eventCooldown - dt);
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = this.debugMode ? 5 : 11;
    if (this.eventActive || this.eventCooldown > 0) return;

    if (this.debugMode) {
      // デバッグ: 深度や確率を無視してイベント種を順番に出す
      const events = SPECIES.filter((d) => d.mode === 'event');
      if (events.length > 0) {
        this.spawnEvent(events[this.eventCycle++ % events.length], playerPos, true);
      }
      return;
    }

    const playerDepth = -playerPos.y;
    for (const def of SPECIES) {
      if (def.mode !== 'event' || !def.eventChance) continue;
      if (playerDepth < def.depth[0] * 0.55 || playerDepth > def.depth[1] + 20) continue;
      if (Math.random() > def.eventChance) continue;
      this.spawnEvent(def, playerPos);
      return;
    }
  }

  /** デバッグ用: 次のイベント種を即時出現させる */
  forceEvent(playerPos: THREE.Vector3): SpeciesDef | null {
    const events = SPECIES.filter((d) => d.mode === 'event');
    if (events.length === 0) return null;
    if (this.eventActive) this.despawnEvent();
    const def = events[this.eventCycle++ % events.length];
    this.spawnEvent(def, playerPos, true);
    return def;
  }

  private spawnEvent(def: SpeciesDef, playerPos: THREE.Vector3, nearPlayer = false): void {
    const special = buildSpecial(def);
    const y = nearPlayer
      ? playerPos.y + rand(-5, 5)
      : clamp(playerPos.y + rand(-6, 6), -def.depth[1], -def.depth[0]);
    const a = rand(0, Math.PI * 2);
    const enter = new THREE.Vector3(playerPos.x + Math.cos(a) * 70, y, playerPos.z + Math.sin(a) * 70);
    const exitA = a + Math.PI + rand(-0.7, 0.7);
    const exit = new THREE.Vector3(playerPos.x + Math.cos(exitA) * 90, y + rand(-8, 6), playerPos.z + Math.sin(exitA) * 90);
    const midA = a + Math.PI / 2;
    const mid = new THREE.Vector3(
      playerPos.x + Math.cos(midA) * rand(6, 14), y + rand(-3, 3),
      playerPos.z + Math.sin(midA) * rand(6, 14)
    );
    for (const p of [enter, mid, exit]) {
      const floor = heightAt(p.x, p.z);
      p.y = clamp(p.y, floor + 3.5, -2.5);
    }
    const curve = new THREE.QuadraticBezierCurve3(enter, mid, exit);
    const dur = Math.min(curve.getLength() / def.speed, 110);

    const single: Single = {
      def, special,
      pos: enter.clone(), vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      target: exit.clone(), retarget: 0, burst: 0, hover: 0,
      event: { curve, t: 0, dur },
    };
    special.object.position.copy(enter);
    this.scene.add(special.object);
    this.eventActive = single;
    this.onEvent?.(def);
  }

  private despawnEvent(): void {
    const s = this.eventActive;
    if (!s) return;
    this.scene.remove(s.special.object);
    s.special.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else mat?.dispose();
    });
    this.eventActive = null;
    this.eventCooldown = this.debugMode ? 3 : 45;
  }

  private updateEvent(dt: number, playerPos: THREE.Vector3): void {
    const s = this.eventActive;
    if (!s || !s.event) return;
    const ev = s.event;
    ev.t += dt / ev.dur;
    if (ev.t >= 1) {
      this.despawnEvent();
      return;
    }
    ev.curve.getPoint(ev.t, s.pos);
    ev.curve.getTangent(ev.t, _v1);
    quatFromDir(_v1, _q);
    if (s.def.builder === 'oarfish') {
      // リュウグウノツカイは頭を上げた斜めの姿勢で漂う
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.85));
    }
    s.quat.slerp(_q, 1 - Math.exp(-dt * 2));
    s.special.object.position.copy(s.pos);
    s.special.object.quaternion.copy(s.quat);
    s.special.update?.(dt, ev.t * ev.dur, s.pos.distanceTo(playerPos));
  }

  // ─────────── 撮影対象の列挙 ───────────
  getSubjects(): Subject[] {
    const out: Subject[] = [];
    const fwd = new THREE.Vector3();
    for (const s of this.schools) {
      for (const m of s.members) {
        fwd.set(0, 0, 1).applyQuaternion(m.quat);
        out.push({ def: s.def, pos: m.pos, forward: fwd.clone(), radius: Math.max(s.def.length * 0.55, 0.06) });
      }
    }
    const pushSingle = (s: Single): void => {
      fwd.set(0, 0, 1).applyQuaternion(s.quat);
      out.push({ def: s.def, pos: s.pos, forward: fwd.clone(), radius: Math.max(s.def.length * 0.55, 0.1) });
    };
    for (const s of this.singles) pushSingle(s);
    if (this.eventActive) pushSingle(this.eventActive);
    return out;
  }
}
