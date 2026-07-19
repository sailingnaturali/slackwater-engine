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
const byId = new Map();  // first entry per id = primary bin
for (const s of list.stations) if (!byId.has(s.id)) byId.set(s.id, s);
const inBox = list.stations.filter((s) => s.lat >= S && s.lat <= N && s.lng >= W && s.lng <= E);
const seen = new Set();
const uniq = inBox.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));  // keep FIRST (primary bin)
console.error(`${uniq.length} stations in box [${S},${W},${N},${E}]`);

// Harmonic constituents vary by depth BIN. A station may publish several bins with
// different constituents, and a subordinate references a specific (refStationId,
// refStationBin). So key every harmonic entry by (id, bin): a plain id for a
// directly-queryable station at its primary bin, or "id@bin" for a reference at a
// non-primary bin. Subordinates point at that exact key.
const harmonicByKey = new Map();
const directBin = new Map(uniq.filter((s) => s.type === 'H').map((s) => [s.id, s.currbin]));

// Returns true if a non-empty harcon exists at (stationId, bin) and was stored.
// Silent on empty harcon (expected for pure subordinate stations).
async function ensureHarmonic(key, stationId, bin, name) {
  if (harmonicByKey.has(key)) return true;
  try {
    const hc = await j(`${MD}/stations/${stationId}/harcon.json?units=english&bin=${bin}`);
    const cons = hc.HarmonicConstituents ?? [];
    if (!cons.length) return false;
    harmonicByKey.set(key, {
      id: key, name, type: 'harmonic',
      floodDirection: cons[0].azi, ebbDirection: (cons[0].azi + 180) % 360,
      offset: cons[0].majorMeanSpeed ?? 0,
      constituents: cons.map((c) => ({ name: c.constituentName, amplitude: c.majorAmplitude, phase: c.majorPhaseGMT })),
    });
    return true;
  } catch (e) { console.error(`skip ${key}: ${e.message}`); return false; }
}

const subs = [];
let wSkipped = 0;
for (const s of uniq) {
  if (s.type === 'H') {
    if (!await ensureHarmonic(s.id, s.id, s.currbin, s.name)) console.error(`skip ${s.id}: empty harcon`);
  } else if (s.type === 'S') {
    // A type-S station that has its OWN harmonic constituents is predicted
    // harmonically by NOAA — the offset reduction would over/under-shoot it. Prefer
    // own harcon; only fall back to the reduction for stations with none.
    if (await ensureHarmonic(s.id, s.id, s.currbin, s.name)) continue;
    try {
      const o = await j(`${MD}/stations/${s.id}_${s.currbin}/currentpredictionoffsets.json`);
      if (!o.refStationId) { console.error(`skip ${s.id}: no refStationId`); continue; }
      // Reuse the direct plain-id entry when the referenced bin IS the primary bin.
      const refKey = directBin.get(o.refStationId) === o.refStationBin ? o.refStationId : `${o.refStationId}@${o.refStationBin}`;
      subs.push({
        id: s.id, name: s.name, type: 'subordinate', reference: refKey,
        _refId: o.refStationId, _refBin: o.refStationBin,
        floodDirection: o.meanFloodDir, ebbDirection: o.meanEbbDir,
        slackBeforeFloodOffset: Math.round((o.sbfTimeAdjMin ?? 0) * 60),
        slackBeforeEbbOffset: Math.round((o.sbeTimeAdjMin ?? 0) * 60),
        floodTimeOffset: Math.round((o.mfcTimeAdjMin ?? 0) * 60),
        ebbTimeOffset: Math.round((o.mecTimeAdjMin ?? 0) * 60),
        floodSpeedRatio: o.mfcAmpAdj ?? 1, ebbSpeedRatio: o.mecAmpAdj ?? 1,
      });
    } catch (e) { console.error(`skip ${s.id}: ${e.message}`); }
  } else { wSkipped++; }  // type W (weak/rotary) — not modeled
}

// Fetch each referenced (refId, refBin) harmonic set at its exact bin.
for (const sub of subs) {
  if (!harmonicByKey.has(sub.reference)) {
    const rs = byId.get(sub._refId);
    await ensureHarmonic(sub.reference, sub._refId, sub._refBin, rs?.name ?? sub._refId);
  }
}

// Drop subordinates whose reference didn't resolve; strip internal fields.
const kept = subs.filter((x) => harmonicByKey.has(x.reference))
  .map(({ _refId, _refBin, ...x }) => x);
const dropped = subs.length - kept.length;
const stations = [...harmonicByKey.values(), ...kept];
console.error(`${harmonicByKey.size} harmonic entries, ${kept.length} subordinate, `
  + `${wSkipped} type-W skipped, ${dropped} unresolvable subs dropped`);
writeFileSync(out, JSON.stringify({ note: 'Generated from NOAA CO-OPS mdapi (harcon@currbin + currentpredictionoffsets). US only.', stations }, null, 0) + '\n');
console.error(`wrote ${out} — ${stations.length} stations`);
