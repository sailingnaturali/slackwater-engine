// Extract NOAA current stations → Sources/TideEngine/Resources/currents.json (US only).
// Usage: node tools/gen-currents.mjs <out.json> [south west north east]
//   default box = Salish Sea (47 -125 49.2 -122). Pass a box for other regions.
// Requires a residential IP (NOAA 404s datacenter IPs on the mdapi). Paced.
//
// See docs/research/2026-07-18-noaa-currents-api.md. harcon keys are confirmed
// (constituentName, majorAmplitude, majorPhaseGMT, azi, majorMeanSpeed). The
// currentpredictionoffsets key names below are BEST-GUESS — confirm against one
// real response (open a station's currentpredictionoffsets.json in a browser)
// before trusting subordinate output.
import { writeFileSync } from 'node:fs';

const [out, south = '47', west = '-125', north = '49.2', east = '-122'] = process.argv.slice(2);
if (!out) { console.error('usage: gen-currents.mjs <out.json> [south west north east]'); process.exit(1); }
const S = +south, W = +west, N = +north, E = +east;
const MD = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi';
// NOAA's mdapi returns 404 to the default fetch/curl User-Agent — send a browser UA.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (u) => { await sleep(400); const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

const list = await j(`${MD}/stations.json?type=currentpredictions&units=english`);
const inBox = list.stations.filter((s) => s.lat >= S && s.lat <= N && s.lng >= W && s.lng <= E);
const uniq = [...new Map(inBox.map((s) => [s.id, s])).values()];  // list repeats per bin
console.error(`${uniq.length} stations in box [${S},${W},${N},${E}]`);

// v1: harmonic stations only — covers every Salish pass (all type H). Subordinate
// (type S) needs the two-slack NOAA model (sbfTimeAdjMin / sbeTimeAdjMin, plus
// mfc/mec time+amp adjustments — see docs/research/2026-07-18-noaa-currents-api.md);
// deferred rather than shipped with a single-slack approximation.
const stations = [];
let deferredSub = 0;
for (const s of uniq) {
  if (s.type !== 'H') { if (s.type === 'S') deferredSub++; continue; }
  try {
    const hc = await j(`${MD}/stations/${s.id}/harcon.json?units=english&bin=${s.currbin}`);
    const cons = hc.HarmonicConstituents ?? [];
    if (!cons.length) { console.error(`skip ${s.id}: empty harcon`); continue; }
    stations.push({
      id: s.id, name: s.name, type: 'harmonic',
      floodDirection: cons[0].azi, ebbDirection: (cons[0].azi + 180) % 360,
      offset: cons[0].majorMeanSpeed ?? 0,
      constituents: cons.map((c) => ({ name: c.constituentName, amplitude: c.majorAmplitude, phase: c.majorPhaseGMT })),
    });
  } catch (e) { console.error(`skip ${s.id}: ${e.message}`); }
}
console.error(`${deferredSub} subordinate (type S) stations deferred (needs two-slack model)`);
writeFileSync(out, JSON.stringify({ note: 'Generated from NOAA CO-OPS mdapi (harcon@currbin + currentpredictionoffsets). US only.', stations }, null, 0) + '\n');
console.error(`wrote ${out} — ${stations.length} stations`);
