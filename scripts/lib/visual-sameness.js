/**
 * visual-sameness.js — how alike two FILMS look, frame for frame, the way a frame embedding sees a channel
 * (2026-11-23, YPP "inauthentic content"; S-CTS reads "Pulsar visual embeddings" next to the transcript).
 *
 * No model, no GPU: every sampled frame gets
 *   - a perceptual hash (pHash: grey → 32×32 box-average → DCT-II → the 8×8 low band without DC, median threshold →
 *     64 bits) — the frame's LAYOUT, robust to small moves and colour;
 *   - a colour histogram (4×4×4 RGB bins, L1-normalised) — the frame's PALETTE;
 *   - its dark share (pixels under 48/255) — the channel's black frames and cards.
 * Film against film: for each frame of A the nearest frame of B by Hamming distance (0…64 → 1…0), averaged both ways
 * ("layout"), and the mean histogram cosine over the same nearest pairs ("palette"). `alike` = (layout + palette) / 2.
 * Pure given decoded frames; the stills come from scripts/visual-sameness.js (render-stills on GitHub Actions).
 */
const PNG = require("./png-lite");

const N = 32;
const COS = (() => { const t = []; for (let u = 0; u < N; u++) { t[u] = []; for (let x = 0; x < N; x++) t[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)); } return t; })();

/** decoded image → { gray: Float64Array(32*32), hist: Float64Array(64), dark: number } */
function features(img) {
  const { width, height, channels, data } = img;
  const gray = new Float64Array(N * N), count = new Float64Array(N * N), hist = new Float64Array(64);
  let dark = 0;
  for (let y = 0; y < height; y++) {
    const by = Math.min(N - 1, Math.floor((y * N) / height));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = channels >= 3 ? data[i + 1] : r, b = channels >= 3 ? data[i + 2] : r;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const bx = Math.min(N - 1, Math.floor((x * N) / width)), k = by * N + bx;
      gray[k] += l; count[k] += 1;
      hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1;
      if (l < 48) dark++;
    }
  }
  for (let k = 0; k < N * N; k++) gray[k] = count[k] ? gray[k] / count[k] : 0;
  const px = width * height || 1;
  for (let k = 0; k < 64; k++) hist[k] /= px;
  return { gray, hist, dark: dark / px };
}

/** 64-bit pHash as an array of 64 bits (0/1) */
function phash(gray) {
  // DCT-II rows then columns, only the 8×8 low band is needed
  const tmp = new Float64Array(N * 8);
  for (let y = 0; y < N; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < N; x++) s += gray[y * N + x] * COS[u][x]; tmp[y * 8 + u] = s; }
  const low = new Float64Array(64);
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < N; y++) s += tmp[y * 8 + u] * COS[v][y]; low[v * 8 + u] = s; }
  const vals = Array.from(low).slice(1); // without DC
  const sorted = vals.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  return Array.from(low).map((v, i) => (i === 0 ? 0 : v > med ? 1 : 0));
}
const hamming = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; };

/** PNG buffer → one frame record */
function frameOf(buf) { const f = features(PNG.decode(buf)); return { hash: phash(f.gray), hist: f.hist, dark: f.dark }; }

/** two films (arrays of frame records) → { layout, palette, alike } */
function compareFilms(A, B) {
  if (!A.length || !B.length) return { layout: 0, palette: 0, alike: 0 };
  const oneWay = (X, Y) => {
    let lay = 0, pal = 0;
    for (const x of X) { let best = 65, who = Y[0]; for (const y of Y) { const d = hamming(x.hash, y.hash); if (d < best) { best = d; who = y; } } lay += 1 - best / 64; pal += cosine(x.hist, who.hist); }
    return { lay: lay / X.length, pal: pal / X.length };
  };
  const ab = oneWay(A, B), ba = oneWay(B, A);
  const layout = (ab.lay + ba.lay) / 2, palette = (ab.pal + ba.pal) / 2;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { layout: r3(layout), palette: r3(palette), alike: r3((layout + palette) / 2) };
}

/** films: { id: [frames] } → { pairs: [{a, b, layout, palette, alike}], nearest: { id: {to, alike} }, dark: { id } } */
function compareAll(films) {
  const ids = Object.keys(films), pairs = [], nearest = {}, dark = {};
  for (const id of ids) { nearest[id] = { to: null, alike: 0 }; dark[id] = films[id].length ? Math.round((films[id].reduce((s, f) => s + f.dark, 0) / films[id].length) * 1000) / 1000 : 0; }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const r = compareFilms(films[ids[i]], films[ids[j]]);
    pairs.push({ a: ids[i], b: ids[j], ...r });
    if (r.alike > nearest[ids[i]].alike) nearest[ids[i]] = { to: ids[j], alike: r.alike };
    if (r.alike > nearest[ids[j]].alike) nearest[ids[j]] = { to: ids[i], alike: r.alike };
  }
  return { pairs: pairs.sort((x, y) => y.alike - x.alike), nearest, dark };
}

module.exports = { features, phash, hamming, cosine, frameOf, compareFilms, compareAll, N };
