// Word filter for names, titles, descriptions and chat. The same list and rules as WordFilter in
// playforge/engine/core.js, so the server and the browser agree on what gets masked.
// Stored as ROT13 so the list doesn't sit in plain text. A leading * means whole-word match only.
const rot = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 84) % 26 + 97));
const RAW = rot('shpx fuvg ovgpu phag nffubyr chffl avttre avttn snttbg jnaxre ergneq qvyqb cbea obyybpxf qbhpuront ' +
  '*qvpx *pbpx *cevpx *snt *fyhg *jubzer *gjng *cvff *onfgneq *encr *encvfg *xlf *frk *gvgf *nff');
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' };
const collapse = s => s.replace(/(.)\1+/g, '$1');
const norm = s => s.toLowerCase().replace(/[0-9@$!|]/g, c => LEET[c] || c).replace(/[^a-z]/g, '');
const WORDS = RAW.split(' ').map(w => (w[0] === '*' ? { w: w.slice(1), whole: true } : { w: collapse(w), whole: false }));

function isBad(token) {
  const t = norm(token); if (!t) return false; const tc = collapse(t);
  for (const x of WORDS) {
    if (x.whole) { if (t === x.w || t === x.w + 's' || (collapse(x.w) === x.w && tc === x.w)) return true; }
    else if (tc.includes(x.w)) return true;
  }
  return false;
}
const clean = text => String(text).replace(/[A-Za-z0-9@$!|]+/g, m => (isBad(m) ? '###' : m));
const hasBad = text => clean(text) !== String(text);

module.exports = { clean, hasBad };
