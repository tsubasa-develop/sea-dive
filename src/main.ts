import './style.css';
import { Game } from './core/Game';

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

try {
  new Game(app);
} catch (e) {
  app.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
      <p style="font-size:18px;">WebGLの初期化に失敗しました</p>
      <p style="opacity:0.7;font-size:13px;">ハードウェアアクセラレーションが有効なブラウザでお試しください。</p>
    </div>`;
  console.error(e);
}
