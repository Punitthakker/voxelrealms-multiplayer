import { World, mkPart } from './world.js';
import { fmtClock, fmtTime } from './hud.js';
import { Modes, registerGames } from './game.js';

/* ---------- 12c. Base rule sets and the Forge Park starter world ---------- */
// Mode hooks (all optional). G is Game.
//   setup(G)                    world loaded, player spawned: set up HUD, actions, bots
//   update(dt, G)               every frame after physics
//   onTouch(part, G, collider)  player started touching a part with a behavior or tag; return true to skip the built-in behavior
//   onCoin(part, G) · onCheckpoint(part, G) · onFinish(part, G) (return true to skip the default finish card)
//   onDeath(G, why)             return true if the mode will call G.respawn() itself
//   onRespawn(G) · onEnd(G, result) · teardown(G)
//   onBotHit(bot, n, from, G) · onBotDown(bot, why, G)
//   hostState(G)                host only, ~5 times a second: small JSON shared with everyone in the room
//   onShared(state, G)          non-hosts, when the host's state changes
//   onAct(from, kind, data, G)  every client, for every Shared.act() in the room (including your own)
// Mode properties: camera ('follow' | 'shoulder'), hp (show health), board (scores leaderboard), boardAsc, boardTitle, hint, defaults.
Modes.free = {
  label: 'Explore',
  setup(G) { G.hud.objective(G.modeOpts.objective || 'Explore and have fun'); },
};

// Studio games: part behaviors carry the rules. Shows time, coins, and an optional time limit (modeOpts.timeLimit seconds).
Modes.custom = {
  label: 'Custom',
  board: true,
  setup(G) {
    const hasFinish = World.parts.some(p => p.behavior === 'finish');
    const lim = Number(G.modeOpts.timeLimit) || 0;
    G.hud.objective(G.modeOpts.objective || (hasFinish ? 'Reach the finish' : G.coinsTotal ? 'Collect the coins' : 'Explore and have fun'));
    if (G.coinsTotal) G.hud.stat('coins', `0 / ${G.coinsTotal}`, { icon: 'coin', label: 'Coins' });
    G.hud.stat('time', lim ? fmtClock(lim) : fmtTime(0), { icon: 'clock', label: 'Time' });
  },
  update(dt, G) {
    const lim = Number(G.modeOpts.timeLimit) || 0;
    if (lim) {
      const left = lim - G.time; G.hud.stat('time', fmtClock(left), { icon: 'clock', warn: left < 10 });
      if (left <= 0 && !G.ended) G.end({ win: G.score > 0, title: "Time's up!", stats: [['Score', G.score], ['Falls', G.deaths]] });
    } else G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
  },
  onCoin(p, G) {
    G.hud.stat('coins', `${G.score} / ${G.coinsTotal}`, { icon: 'coin' });
    if (G.coinsTotal && G.score >= G.coinsTotal && !World.parts.some(q => q.behavior === 'finish')) G.end({ win: true, title: 'All coins collected!', stats: [['Time', fmtTime(G.time)], ['Falls', G.deaths]] });
  },
};

export function forgeParkBuild() {
  const parts = [], P = (...a) => parts.push(mkPart(...a));
  P('block', [0, -1, 0], [260, 2, 260], '#6CC38A', 'grass', { name: 'Baseplate' });
  P('spawn', [0, 0.2, 0], [6, 0.4, 6], '#FF6A2B', 'plastic', { name: 'Spawn' });
  P('block', [-4, 3, -10], [1.5, 6, 1.5], '#FFC53A');
  P('block', [4, 3, -10], [1.5, 6, 1.5], '#FFC53A');
  P('block', [0, 6.5, -10], [10, 1, 1.5], '#FF6A2B', 'plastic', { name: 'Arch' });
  for (let i = 0; i < 4; i++) for (const sx of [-2.4, 2.4]) P('block', [sx, 0.1, -3.5 - i * 1.8], [0.4, 0.2, 0.8], '#4CF0FF', 'neon', { name: 'Path light', canCollide: false });
  for (let i = 0; i < 10; i++) { const h = (i + 1) * 0.3; P('block', [8.5 + i, h / 2, 6], [1, h, 4], i % 2 ? '#4B7BFF' : '#2D62F0', 'plastic', { name: 'Stair' }); }
  P('block', [21.5, 1.5, 6], [6, 3, 6], '#2D62F0', 'plastic', { name: 'Blue deck' });
  const hops = [[21.5, 3.5, -1.5, 3], [18, 4.5, -6, 3], [13, 5.5, -10, 3], [8, 6.5, -13, 3], [3, 7.5, -16, 2.5], [-2, 8.5, -18, 2.5], [-7, 9.5, -19.5, 3]];
  const cols = ['#FF6A2B', '#FFC53A', '#17A39C', '#E23E62', '#7A4FD0', '#FF6A2B', '#FFC53A'];
  hops.forEach(([x, y, z, s], i) => P('block', [x, y, z], [s, 1, s], cols[i], 'plastic', { name: 'Hop ' + (i + 1) }));
  P('block', [-13, 5.25, -21], [5, 10.5, 5], '#9AA5B1', 'stone', { name: 'Flag tower' });
  P('cylinder', [-13, 13, -21], [0.3, 5, 0.3], '#EDEFF2', 'metal', { name: 'Flag pole' });
  P('block', [-12.05, 14.7, -21], [1.6, 1, 0.12], '#FF6A2B', 'plastic', { name: 'Flag', canCollide: false });
  P('wedge', [-16, 1.5, 14], [4, 3, 8], '#C08A55', 'wood', { name: 'Ramp' });
  P('block', [-16, 1.5, 7], [6, 3, 6], '#B07A50', 'wood', { name: 'Ramp deck' });
  P('block', [-25, 2.85, 7], [12, 0.3, 0.8], '#8A5A35', 'wood', { name: 'Balance beam' });
  P('block', [-34, 1.5, 7], [6, 3, 6], '#B07A50', 'wood', { name: 'Beam deck' });
  P('block', [-33, 2, -10], [1, 4, 14], '#B9A08A', 'brick', { name: 'Tunnel wall' });
  P('block', [-27, 2, -10], [1, 4, 14], '#B9A08A', 'brick', { name: 'Tunnel wall' });
  P('block', [-30, 4.5, -10], [7, 1, 14], '#9AA5B1', 'stone', { name: 'Tunnel roof' });
  P('block', [8, 1, 18], [2, 2, 2], '#FF6A2B');
  P('block', [10.4, 1, 18.4], [2, 2, 2], '#FFC53A');
  P('block', [9.2, 3, 18.2], [2, 2, 2], '#2D62F0', 'plastic', { rot: [0, 25, 0] });
  P('sphere', [13.5, 1.5, 15], [3, 3, 3], '#E23E62', 'plastic', { name: 'Ball' });
  P('block', [28, 0.15, 22], [8, 0.3, 8], '#BFE7F2', 'ice', { name: 'Ice rink' });
  P('block', [-8, 0.1, 26], [10, 0.2, 7], '#E6D3A3', 'sand', { name: 'Sandbox' });
  P('block', [20, 0.4, -24], [4, 0.8, 4], '#7CFF6B', 'neon', { name: 'Bounce pad', behavior: 'bounce', bp: { power: 30 } });
  P('block', [26, 3, -26], [6, 0.6, 3], '#FFC53A', 'plastic', { name: 'Moving platform', behavior: 'move', bp: { offset: [0, 0, 10], period: 5 } });
  P('block', [-20, 2.5, -40], [12, 0.6, 1], '#E23E62', 'plastic', { name: 'Spinner', behavior: 'spin', bp: { axis: 'y', speed: 60 } });
  P('cylinder', [-20, 1, -40], [2, 2, 2], '#4E5B74', 'metal', { name: 'Spinner hub' });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P('cylinder', [Math.cos(a) * 16, 1.2, 30 + Math.sin(a) * 6], [1, 1, 0.2], '#FFD24A', 'neon', { name: 'Coin', rot: [90, 0, 0], canCollide: false, behavior: 'coin', bp: { respawn: 20 } }); }
  const trees = [[14, 26], [22, 16], [-6, 18], [30, -12], [-24, -28], [34, 34], [-38, 24], [6, -30], [38, 4], [-42, -6], [-22, 30], [24, -32]];
  trees.forEach(([x, z], i) => {
    P('cylinder', [x, 2, z], [0.9, 4, 0.9], '#8A5A35', 'wood', { name: 'Trunk' });
    if (i % 3 === 2) P('block', [x, 5.2, z], [4, 3.2, 4], '#3F9E57', 'grass', { name: 'Leaves' });
    else P('sphere', [x, 5.3, z], [4.6, 4.2, 4.6], i % 2 ? '#4DB06A' : '#3F9E57', 'grass', { name: 'Leaves' });
  });
  return { parts, spawn: [0, 0.4, 0], spawnYaw: Math.PI };
}
registerGames([{
  id: 'forge-park', title: 'Forge Park', cat: 'explore', mode: 'free', env: { sky: 'day' }, build: forgeParkBuild,
  desc: 'A starter park for testing movement: stairs, a ramp, a balance beam, a tunnel, an ice rink, a bounce pad, moving parts, coins and a jump course up to the flag tower.',
  thumb: { pos: [30, 21, 30], look: [-2, 3, -4] }, accent: '#6CC38A', icon: 'flag',
}]);
