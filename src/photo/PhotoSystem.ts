import * as THREE from 'three';
import { clamp } from '../core/noise';
import { isOccludedByTerrain } from '../world/Terrain';
import type { CreatureManager, Subject } from '../creatures/CreatureManager';
import type { SpeciesDef } from '../creatures/SpeciesData';
import type { Progress } from '../state/Progress';
import type { AlbumStore, PhotoRecord } from '../state/AlbumStore';

export interface BonusLine {
  label: string;
  value: number;
}

export interface ShotResult {
  score: number;
  rank: 'S' | 'A' | 'B' | 'C' | '-';
  subjectDef: SpeciesDef | null;
  bonuses: BonusLine[];
  newSpecies: SpeciesDef[];
  unlocked: { limit: number; label: string } | null;
  photo: PhotoRecord;
}

interface VisibleSubject {
  sub: Subject;
  dist: number;
  projR: number;   // 画面高さ(半分)に対する被写体半径の割合
  ndcX: number;
  ndcY: number;
  subjScore: number;
  bonuses: BonusLine[];
}

const BASE_FOV = 70;

export class PhotoSystem {
  active = false;
  zoomFov = 50;

  enter(camera: THREE.PerspectiveCamera): void {
    this.active = true;
    camera.fov = this.zoomFov;
    camera.updateProjectionMatrix();
  }

  exit(camera: THREE.PerspectiveCamera): void {
    this.active = false;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
  }

  wheel(dy: number, camera: THREE.PerspectiveCamera): void {
    if (!this.active) return;
    this.zoomFov = clamp(this.zoomFov + dy * 0.03, 16, 75);
    camera.fov = this.zoomFov;
    camera.updateProjectionMatrix();
  }

  get zoomRatio(): number {
    return (75 - this.zoomFov) / (75 - 16);
  }

  private collectVisible(camera: THREE.PerspectiveCamera, subjects: Subject[]): VisibleSubject[] {
    const camPos = camera.position;
    const toCam = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const out: VisibleSubject[] = [];
    for (const sub of subjects) {
      const dist = sub.pos.distanceTo(camPos);
      if (dist > 65 || dist < 0.2) continue;
      ndc.copy(sub.pos).project(camera);
      if (ndc.z > 1 || ndc.z < -1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) continue;
      const projR = sub.radius / (dist * tanHalf);
      if (projR < 0.012) continue;
      if (isOccludedByTerrain(camPos, sub.pos)) continue;

      const sizeScore = 30 * clamp(projR / 0.1, 0, 1) * clamp((1.1 - projR) / 0.45, 0.15, 1);
      const center = Math.hypot(ndc.x, ndc.y);
      const centerScore = 20 * (1 - clamp(center / 1.1, 0, 1));
      toCam.copy(camPos).sub(sub.pos).normalize();
      const facing = sub.forward.dot(toCam);
      const faceScore = 15 * Math.max(Math.max(0, facing), (1 - Math.abs(facing)) * 0.8);
      const proxScore = 10 * clamp(1 - dist / 45, 0, 1);
      out.push({
        sub, dist, projR, ndcX: ndc.x, ndcY: ndc.y,
        subjScore: 10 + sizeScore + centerScore + faceScore + proxScore,
        bonuses: [
          { label: '大きさ', value: Math.round(sizeScore) },
          { label: '構図', value: Math.round(centerScore) },
          { label: '向き', value: Math.round(faceScore) },
          { label: '距離', value: Math.round(proxScore) },
        ],
      });
    }
    return out;
  }

  /** ファインダー中央付近の被写体(名前表示用) */
  reticleTarget(camera: THREE.PerspectiveCamera, manager: CreatureManager): Subject | null {
    const visible = this.collectVisible(camera, manager.getSubjects());
    let best: VisibleSubject | null = null;
    for (const v of visible) {
      const center = Math.hypot(v.ndcX, v.ndcY);
      if (center > 0.45) continue;
      if (!best || center - v.projR < Math.hypot(best.ndcX, best.ndcY) - best.projR) best = v;
    }
    return best?.sub ?? null;
  }

  async shoot(
    renderer: THREE.WebGLRenderer,
    renderFrame: () => void,
    camera: THREE.PerspectiveCamera,
    manager: CreatureManager,
    progress: Progress,
    album: AlbumStore,
  ): Promise<ShotResult> {
    const visible = this.collectVisible(camera, manager.getSubjects());

    // 主役の決定
    let subject: VisibleSubject | null = null;
    for (const v of visible) {
      if (!subject || v.subjScore > subject.subjScore) subject = v;
    }

    let score = 5;
    const bonuses: BonusLine[] = [];
    if (subject) {
      score = subject.subjScore;
      bonuses.push(...subject.bonuses);
      const rarityBonus = (subject.sub.def.rarity - 1) * 7;
      if (rarityBonus > 0) bonuses.push({ label: `希少種 ${'★'.repeat(subject.sub.def.rarity)}`, value: rarityBonus });
      score += rarityBonus;

      const others = new Set<string>();
      let crowd = 0;
      for (const v of visible) {
        if (v === subject) continue;
        crowd++;
        if (v.sub.def.id !== subject.sub.def.id && v.projR > 0.02) others.add(v.sub.def.id);
      }
      const otherBonus = Math.min(others.size * 4, 12);
      const crowdBonus = Math.min(crowd, 10) * 0.7;
      if (otherBonus > 0) bonuses.push({ label: '多種共演', value: otherBonus });
      if (crowdBonus >= 1) bonuses.push({ label: '群れ', value: Math.round(crowdBonus) });
      score += otherBonus + crowdBonus;
    }
    score = Math.round(clamp(score, 0, 100));
    const rank: ShotResult['rank'] =
      !subject ? '-' : score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';

    // キャプチャ(レンダリング直後に同期で読み出す)
    renderFrame();
    const src = renderer.domElement;
    const scale = Math.min(1, 1280 / src.width);
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(src.width * scale);
    cnv.height = Math.round(src.height * scale);
    cnv.getContext('2d')!.drawImage(src, 0, 0, cnv.width, cnv.height);
    const dataUrl = cnv.toDataURL('image/jpeg', 0.85);

    const photo: PhotoRecord = {
      id: `p${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      dataUrl,
      at: Date.now(),
      score,
      rank,
      subject: subject?.sub.def.name ?? '海の風景',
      speciesIds: [],
      depth: Math.round(-camera.position.y),
    };

    // 図鑑登録(十分な大きさで写った種すべて)
    const newSpecies: SpeciesDef[] = [];
    let unlocked: ShotResult['unlocked'] = null;
    const seen = new Set<string>();
    for (const v of visible) {
      if (v.projR < 0.022 || seen.has(v.sub.def.id)) continue;
      seen.add(v.sub.def.id);
      photo.speciesIds.push(v.sub.def.id);
      const res = progress.register(v.sub.def.id, score, photo.id);
      if (res.isNew) newSpecies.push(v.sub.def);
      if (res.unlocked) unlocked = res.unlocked;
    }

    await album.add(photo);

    return { score, rank, subjectDef: subject?.sub.def ?? null, bonuses, newSpecies, unlocked, photo };
  }
}
