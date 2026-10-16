import { Profile, SK, STARTERS, ctx2d, defaultStarterIndex, drawPngTo, newSkinCanvas, paintSkin } from './core.js';
import { makeSkinTexture } from './avatar.js';

/* ---------- Skins: the skin you wear, starter skins and the editor palette ---------- */
export const Skins = {
  worn: null, wornTex: null,
  init() {
    if (this.worn) return;
    STARTER_CANVASES.push(...STARTERS.map((s, i) => paintSkin(newSkinCanvas(), s.o, 101 + i)));
    this.worn = newSkinCanvas(); this.wornTex = makeSkinTexture(this.worn);
    paintSkin(this.worn, STARTERS[defaultStarterIndex()].o, 11); this.wornTex.needsUpdate = true;
  },
  async refreshWorn() {
    const src = Profile.wornSkin();
    if (!(src && await drawPngTo(this.worn, src))) paintSkin(this.worn, STARTERS[defaultStarterIndex()].o, 11);
    this.wornTex.needsUpdate = true;
  },
  setFrom(canvas) { const g = ctx2d(this.worn); g.clearRect(0, 0, SK, SK); g.drawImage(canvas, 0, 0); this.wornTex.needsUpdate = true; },
};
// One canvas per starter skin, filled by Skins.init (bots and players without a saved skin wear these).
export const STARTER_CANVASES = [];
export const PALETTE = ['#17223A', '#4E5B74', '#9AA5B1', '#EDEFF2', '#FFFFFF', '#E23E62', '#FF6A2B', '#FFC53A', '#3FA34D', '#17A39C',
  '#2D62F0', '#7A4FD0', '#8A5A2B', '#5A3420', '#F3D2B5', '#D19A6D', '#8A5A3A', '#4CF0FF', '#FF5CA8', '#7CFF6B'];

