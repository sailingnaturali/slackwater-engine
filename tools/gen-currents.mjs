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
const byId = new Map(list.stations.map((s) => [s.id, s]));  // full list, for reference backfill
const inBox = list.stations.filter((s) => s.lat >= S && s.lat <= N && s.lng >= W && s.lng <= E);
const uniq = [...new Map(inBox.map((s) => [s.id, s])).values()];  // list repeats per bin
console.error(`${uniq.length} stations in box [${S},${W},${N},${E}]`);

const stations = [];
const haveHarmonic = new Set();

async function harmonic(s) {
  const hc = await j(`${MD}/stations/${s.id}/harcon.json?units=english&bin=${s.currbin}`);
  const cons = hc.HarmonicConstituents ?? [];
  if (!cons.length) throw new Error('empty harcon');
  haveHarmonic.add(s.id);
  return {
    id: s.id, name: s.name, type: 'harmonic',
    floodDirection: cons[0].azi, ebbDirection: (cons[0].azi + 180) % 360,
    offset: cons[0].majorMeanSpeed ?? 0,
    constituents: cons.map((c) => ({ name: c.constituentName, amplitude: c.majorAmplitude, phase: c.majorPhaseGMT })),
  };
}

let wSkipped = 0;
for (const s of uniq) {
  try {
    if (s.type === 'H') {
      stations.push(await harmonic(s));
    } else if (s.type === 'S') {
      const o = await j(`${MD}/stations/${s.id}_${s.currbin}/currentpredictionoffsets.json`);
      if (!o.refStationId) { console.error(`skip ${s.id}: no refStationId`); continue; }
      stations.push({
        id: s.id, name: s.name, type: 'subordinate', reference: o.refStationId,
        floodDirection: o.meanFloodDir, ebbDirection: o.meanEbbDir,
        slackBeforeFloodOffset: Math.round((o.sbfTimeAdjMin ?? 0) * 60),
        slackBeforeEbbOffset: Math.round((o.sbeTimeAdjMin ?? 0) * 60),
        floodTimeOffset: Math.round((o.mfcTimeAdjMin ?? 0) * 60),
        ebbTimeOffset: Math.round((o.mecTimeAdjMin ?? 0) * 60),
        floodSpeedRatio: o.mfcAmpAdj ?? 1, ebbSpeedRatio: o.mecAmpAdj ?? 1,
      });
    } else { wSkipped++; }  // type W (weak/rotary) — not modeled
  } catch (e) { console.error(`skip ${s.id}: ${e.message}`); }
}

// Backfill reference harmonic stations that subordinates point to but the box missed,
// so the loader can resolve them.
const needed = [...new Set(stations.filter((x) => x.type === 'subordinate').map((x) => x.reference))]
  .filter((r) => !haveHarmonic.has(r));
for (const refId of needed) {
  const rs = byId.get(refId);
  if (!rs) { console.error(`ref ${refId} not in station list`); continue; }
  try { stations.push(await harmonic(rs)); }
  catch (e) { console.error(`ref ${refId}: ${e.message}`); }
}
// Drop subordinates whose reference still isn't harmonic (empty-harcon or type-W ref).
const harmonicIds = new Set(stations.filter((x) => x.type === 'harmonic').map((x) => x.id));
const kept = stations.filter((x) => x.type === 'harmonic' || harmonicIds.has(x.reference));
const dropped = stations.length - kept.length;
stations.length = 0; stations.push(...kept);
console.error(`${stations.filter((x) => x.type === 'harmonic').length} harmonic, `
  + `${stations.filter((x) => x.type === 'subordinate').length} subordinate, `
  + `${needed.length} refs backfilled, ${wSkipped} type-W skipped, ${dropped} unresolvable subs dropped`);
writeFileSync(out, JSON.stringify({ note: 'Generated from NOAA CO-OPS mdapi (harcon@currbin + currentpredictionoffsets). US only.', stations }, null, 0) + '\n');
console.error(`wrote ${out} — ${stations.length} stations`);
