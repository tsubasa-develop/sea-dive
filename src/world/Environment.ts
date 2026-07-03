import * as THREE from 'three';
import { clamp, smoothstep } from '../core/noise';
import { uTime } from '../core/uniforms';

const _aimTmp = new THREE.Vector3();
const FLASHLIGHT_INTENSITY = 15;

// 深度帯ごとの水の色
const WATER_SHALLOW = new THREE.Color('#15628c');
const WATER_MID = new THREE.Color('#0b3d63');
const WATER_DEEP = new THREE.Color('#041625');
const WATER_ABYSS = new THREE.Color('#02070d');
const SUN_WARM = new THREE.Color('#fff2dd');
const SUN_COOL = new THREE.Color('#9cc8e8');

export class Environment {
  readonly fog: THREE.FogExp2;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  readonly flashlight: THREE.SpotLight;
  private scene: THREE.Scene;
  private surface: THREE.Mesh;
  private surfaceMat: THREE.ShaderMaterial;
  private godrayMat: THREE.ShaderMaterial;
  private bgColor = new THREE.Color();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.fog = new THREE.FogExp2(WATER_SHALLOW.getHex(), 0.012);
    scene.fog = this.fog;

    // やや暖色の太陽光(青すぎると暖色のサンゴが死ぬ)
    this.sun = new THREE.DirectionalLight('#fff2dd', 1.7);
    this.sun.position.set(40, 90, 25);
    scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight('#a8dcee', '#3a5a6a', 1.0);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight('#1a3a66', 0.22);
    scene.add(this.ambient);

    // 環境マップ(水中のグラデーション)— 金属質の魚のきらめきに効く
    scene.environment = this.makeEnvMap(renderer);
    scene.environmentIntensity = 0.55;

    // 水中ライト(Fキー)。深海探索の必需品。マウスカーソルの方向を照らす
    this.flashlight = new THREE.SpotLight('#e8f4ff', 0, 90, 0.6, 0.5, 0);
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.visible = false;
    camera.add(this.flashlight);
    camera.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -12);

    // 海面(頂点変位によるうねる波)
    this.surfaceMat = this.makeSurfaceMaterial();
    const surfGeo = new THREE.PlaneGeometry(520, 520, 140, 140);
    surfGeo.rotateX(-Math.PI / 2);
    this.surface = new THREE.Mesh(surfGeo, this.surfaceMat);
    this.surface.position.y = 0;
    this.surface.renderOrder = 5;
    this.surface.frustumCulled = false;
    scene.add(this.surface);

    this.godrayMat = this.makeGodrayMaterial();
    scene.add(this.buildGodrays());
  }

  /** 上=明るい水色、下=深い青のグラデーション球からPMREM環境マップを作る */
  private makeEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float t = vDir.y;
          vec3 top = vec3(0.62, 0.85, 0.93);
          vec3 horizon = vec3(0.1, 0.42, 0.58);
          vec3 bottom = vec3(0.015, 0.09, 0.16);
          vec3 c = t > 0.0 ? mix(horizon, top, pow(t, 0.7)) : mix(horizon, bottom, pow(-t, 0.6));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    mat.dispose();
    return rt.texture;
  }

  private makeSurfaceMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime,
        uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
        uCamY: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWp;
        varying vec3 vN;
        varying float vH;
        void main() {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float h = 0.0;
          float dhx = 0.0;
          float dhz = 0.0;
          // 方向・波長・速さの異なる4つの波の重ね合わせ
          #define WAVE(DX, DZ, K, W, A) { \
            vec2 d = normalize(vec2(DX, DZ)); \
            float ph = dot(wp.xz, d) * K + uTime * W; \
            h += A * sin(ph); \
            float c = A * K * cos(ph); \
            dhx += c * d.x; \
            dhz += c * d.y; \
          }
          WAVE(1.0, 0.3, 0.16, 1.0, 0.45)
          WAVE(-0.6, 1.0, 0.31, -1.3, 0.3)
          WAVE(0.8, -0.9, 0.62, 1.9, 0.16)
          WAVE(-1.0, -0.4, 1.35, -2.7, 0.07)
          wp.y = h;
          vH = h;
          vN = normalize(vec3(-dhx, 1.0, -dhz));
          vWp = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uCamY;
        uniform float uTime;
        varying vec3 vWp;
        varying vec3 vN;
        varying float vH;
        void main() {
          vec3 V = normalize(vWp - cameraPosition);
          vec3 N = normalize(vN);
          float fres = pow(1.0 - abs(dot(V, N)), 2.3);
          vec3 col = mix(vec3(0.03, 0.24, 0.38), vec3(0.68, 0.93, 1.0), clamp(fres, 0.0, 1.0));
          // 波頭のきらめき(高い波は白く)
          float crest = smoothstep(0.3, 0.85, vH);
          col += vec3(0.55, 0.8, 0.9) * crest * 0.6;
          // 近距離用の細かいさざ波(真下から見上げたときの表情)
          float rip = sin(vWp.x * 2.2 + uTime * 2.1)
                    + sin(vWp.z * 1.8 - uTime * 1.7)
                    + sin((vWp.x + vWp.z) * 3.1 + uTime * 2.9)
                    + sin((vWp.x - vWp.z) * 4.3 - uTime * 2.2);
          float ripI = smoothstep(1.2, 3.2, rip);
          col += vec3(0.38, 0.62, 0.75) * ripI * 0.55;
          // スネルの窓: 真上が明るく抜ける
          float upness = pow(max(V.y, 0.0), 4.0);
          col += vec3(0.45, 0.75, 0.95) * upness * 0.38;
          // 太陽のグリント(波の法線で揺らめく)
          float glint = pow(max(dot(reflect(-uSunDir, N), -V), 0.0), 120.0) * 1.6
                      + pow(max(dot(V, uSunDir), 0.0), 90.0) * 0.8;
          col += vec3(1.0, 0.97, 0.85) * glint;
          float distFade = exp(-length(vWp.xz - cameraPosition.xz) * 0.008);
          float depthFade = clamp(1.0 + uCamY / 75.0, 0.0, 1.0);
          float a = (0.34 + fres * 0.45 + crest * 0.28 + ripI * 0.14 + upness * 0.18) * distFade * depthFade;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }

  private makeGodrayMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uTime, uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          vUv = uv;
          vSeed = modelMatrix[3].x * 3.7 + modelMatrix[3].z * 2.9;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFade;
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          float horiz = pow(sin(vUv.x * 3.14159), 2.0);
          float vert = pow(vUv.y, 1.6);
          float flicker = 0.55 + 0.45 * sin(uTime * 0.5 + vSeed);
          float a = horiz * vert * flicker * uFade * 0.30;
          gl_FragColor = vec4(0.65, 0.9, 1.0, a);
        }
      `,
    });
  }

  private buildGodrays(): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(9, 46);
    const geoWide = new THREE.PlaneGeometry(16, 60);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(i % 3 === 0 ? geoWide : geo, this.godrayMat);
      const r = 8 + Math.random() * 105;
      const th = Math.random() * Math.PI * 2;
      m.position.set(Math.cos(th) * r, i % 3 === 0 ? -28 : -23, Math.sin(th) * r);
      m.rotation.set(0, Math.random() * Math.PI, 0.1 + Math.random() * 0.08);
      m.frustumCulled = false;
      group.add(m);
    }
    return group;
  }

  /** 深度に応じて光・霧・色を連続的に変化させる */
  update(camPos: THREE.Vector3): THREE.Color {
    const camY = camPos.y;
    const d = Math.max(0, -camY);
    const s1 = smoothstep(22, 55, d);
    const s2 = smoothstep(55, 95, d);
    const s3 = smoothstep(95, 140, d);
    this.bgColor.copy(WATER_SHALLOW).lerp(WATER_MID, s1).lerp(WATER_DEEP, s2).lerp(WATER_ABYSS, s3);
    this.fog.color.copy(this.bgColor);
    this.fog.density = 0.0118 + s1 * 0.0052 + s2 * 0.007 + s3 * 0.006;

    this.sun.intensity = 1.7 * Math.exp(-d / 36) + 0.02;
    this.hemi.intensity = 1.0 * Math.exp(-d / 42) + 0.04;
    this.ambient.intensity = 0.22 * Math.exp(-d / 60) + 0.09;
    // 深くなるほど太陽光は青く冷たく
    this.sun.color.copy(SUN_WARM).lerp(SUN_COOL, smoothstep(5, 55, d));
    this.scene.environmentIntensity = 0.55 * Math.exp(-d / 38) + 0.04;

    // 波はプレイヤーに追従(波形はワールド座標基準なので継ぎ目は出ない)
    this.surface.position.set(camPos.x, 0, camPos.z);
    this.surfaceMat.uniforms.uCamY.value = camY;
    this.godrayMat.uniforms.uFade.value = clamp(Math.exp(-(d - 2) / 16), 0, 1);
    return this.bgColor;
  }

  /** ライトをマウスカーソルの方向へ向ける(カメラローカル、滑らかに追従) */
  aimFlashlight(dt: number, ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    _aimTmp.set(ndcX * tanH * camera.aspect, ndcY * tanH, -1).normalize();
    const target = this.flashlight.target.position;
    target.lerp(_aimTmp.multiplyScalar(12), 1 - Math.exp(-dt * 12));
  }

  toggleFlashlight(): boolean {
    this.flashlight.visible = !this.flashlight.visible;
    this.flashlight.intensity = this.flashlight.visible ? FLASHLIGHT_INTENSITY : 0;
    return this.flashlight.visible;
  }
}
