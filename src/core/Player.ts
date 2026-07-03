import * as THREE from 'three';
import { clamp } from './noise';
import { heightAt, WORLD_RADIUS } from '../world/Terrain';
import type { Input } from './Input';

const MAX_SPEED = 5.4;
const ACCEL = 22;
const DRAG = 3.0;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private roll = 0;
  depthLimit = 32;
  onLimitWarn?: () => void;
  onBoundsWarn?: () => void;
  private warnCd = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    camera.position.set(0, -4, 10);
  }

  get position(): THREE.Vector3 {
    return this.camera.position;
  }

  get speed(): number {
    return this.velocity.length();
  }

  update(dt: number, input: Input, controlEnabled: boolean): void {
    this.warnCd = Math.max(0, this.warnCd - dt);
    if (controlEnabled) {
      const { dx, dy } = input.consumeMouse();
      this.yaw -= dx * 0.0022;
      this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
    } else {
      input.consumeMouse();
    }

    const cosP = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * cosP, Math.sin(this.pitch), -Math.cos(this.yaw) * cosP);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let strafe = 0;
    const want = new THREE.Vector3();
    if (controlEnabled) {
      const k = input.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0);
      want.addScaledVector(fwd, f).addScaledVector(right, strafe);
      want.y += up * 0.8;
      if (want.lengthSq() > 1) want.normalize();
    }

    this.velocity.addScaledVector(want, ACCEL * dt);
    this.velocity.multiplyScalar(Math.exp(-DRAG * dt));
    if (this.velocity.length() > MAX_SPEED) this.velocity.setLength(MAX_SPEED);
    this.position.addScaledVector(this.velocity, dt);

    // 地形・水面・可潜深度・ワールド境界
    const floorY = heightAt(this.position.x, this.position.z) + 0.9;
    if (this.position.y < floorY) {
      this.position.y = floorY;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    if (this.position.y > -0.45) {
      this.position.y = -0.45;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }
    if (this.position.y < -this.depthLimit) {
      this.position.y = -this.depthLimit;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.warnCd === 0) {
        this.warnCd = 4;
        this.onLimitWarn?.();
      }
    }
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > WORLD_RADIUS) {
      const k = WORLD_RADIUS / r;
      this.position.x *= k;
      this.position.z *= k;
      if (this.warnCd === 0) {
        this.warnCd = 4;
        this.onBoundsWarn?.();
      }
    }

    // 視点のわずかなロール(遊泳感)
    const targetRoll = -strafe * 0.045;
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 4));
    this.camera.rotation.set(this.pitch, this.yaw, this.roll);
  }
}
