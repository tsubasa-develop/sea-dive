import * as THREE from 'three';
import { smoothstep } from '../core/noise';
import { uTime } from '../core/uniforms';

/** プレイヤー周囲でラップする浮遊粒子(マリンスノー/プランクトン) */
function makeWrapPoints(
  count: number, box: number, size: number, color: string, sink: number, key: string
): { points: THREE.Points; mat: THREE.PointsMaterial; center: { value: THREE.Vector3 } } {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * box;
    positions[i * 3 + 1] = (Math.random() - 0.5) * box;
    positions[i * 3 + 2] = (Math.random() - 0.5) * box;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const center = { value: new THREE.Vector3() };
  const mat = new THREE.PointsMaterial({
    size, color, transparent: true, opacity: 0.5,
    depthWrite: false, sizeAttenuation: true,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uCenter = center;
    sh.vertexShader =
      'uniform float uTime;\nuniform vec3 uCenter;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 p = position;
        p.y -= uTime * ${sink.toFixed(3)};
        p.x += sin(uTime * 0.3 + position.y * 0.7) * 0.6;
        p = mod(p - uCenter + ${(box / 2).toFixed(1)}, ${box.toFixed(1)}) - ${(box / 2).toFixed(1)} + uCenter;
        vec3 transformed = p;`
      );
  };
  mat.customProgramCacheKey = () => 'wrap-points-' + key;
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  return { points, mat, center };
}

export class Particles {
  private snow: ReturnType<typeof makeWrapPoints>;
  private motes: ReturnType<typeof makeWrapPoints>;
  private bubbleGeom: THREE.BufferGeometry;
  private bubblePos: Float32Array;
  private bubbles: { x: number; y: number; z: number; vy: number; life: number; active: boolean }[] = [];

  constructor(scene: THREE.Scene) {
    this.snow = makeWrapPoints(1700, 70, 0.06, '#dfeeff', 0.22, 'snow');
    this.motes = makeWrapPoints(850, 46, 0.035, '#c9ecd2', 0.02, 'motes');
    scene.add(this.snow.points, this.motes.points);

    // 泡(ダイバーの呼気)
    const MAX = 64;
    this.bubblePos = new Float32Array(MAX * 3).fill(9999);
    this.bubbleGeom = new THREE.BufferGeometry();
    this.bubbleGeom.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3));
    for (let i = 0; i < MAX; i++) this.bubbles.push({ x: 0, y: 9999, z: 0, vy: 0, life: 0, active: false });
    const mat = new THREE.PointsMaterial({
      size: 0.11, map: makeBubbleTexture(), transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.05,
    });
    const pts = new THREE.Points(this.bubbleGeom, mat);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  emitBubbles(origin: THREE.Vector3, n: number): void {
    let emitted = 0;
    for (const b of this.bubbles) {
      if (b.active) continue;
      b.x = origin.x + (Math.random() - 0.5) * 0.25;
      b.y = origin.y + (Math.random() - 0.5) * 0.15;
      b.z = origin.z + (Math.random() - 0.5) * 0.25;
      b.vy = 0.9 + Math.random() * 0.6;
      b.life = 0;
      b.active = true;
      if (++emitted >= n) break;
    }
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.snow.center.value.copy(playerPos);
    this.motes.center.value.copy(playerPos);
    const d = Math.max(0, -playerPos.y);
    this.snow.mat.opacity = 0.06 + 0.66 * smoothstep(28, 70, d);
    this.motes.mat.opacity = 0.5 * Math.exp(-d / 22) + 0.04;

    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (b.active) {
        b.life += dt;
        b.y += b.vy * dt;
        b.x += Math.sin(b.life * 7 + i) * 0.25 * dt;
        if (b.y > -0.2 || b.life > 7) { b.active = false; b.y = 9999; }
      }
      this.bubblePos[i * 3] = b.x;
      this.bubblePos[i * 3 + 1] = b.y;
      this.bubblePos[i * 3 + 2] = b.z;
    }
    (this.bubbleGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

function makeBubbleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(220,240,255,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(16, 16, 11, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(11, 11, 3, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
