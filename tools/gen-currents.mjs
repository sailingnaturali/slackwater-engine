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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (u) => { await sleep(400); const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

const list = await j(`${MD}/stations.json?type=currentpredictions&units=english`);
const inBox = list.stations.filter((s) => s.lat >= S && s.lat <= N && s.lng >= W && s.lng <= E);
const uniq = [...new Map(inBox.map((s) => [s.id, s])).values()];  // list repeats per bin
console.error(`${uniq.length} stations in box [${S},${W},${N},${E}]`);

const stations = [];
for (const s of uniq) {
  try {
    if (s.type === 'H') {
      const hc = await j(`${MD}/stations/${s.id}/harcon.json?units=english&bin=${s.currbin}`);
      const cons = hc.HarmonicConstituents ?? [];
      if (!cons.length) { console.error(`skip ${s.id}: empty harcon`); continue; }
      stations.push({
        id: s.id, name: s.name, type: 'harmonic',
        floodDirection: cons[0].azi, ebbDirection: (cons[0].azi + 180) % 360,
        offset: cons[0].majorMeanSpeed ?? 0,
        constituents: cons.map((c) => ({ name: c.constituentName, amplitude: c.majorAmplitude, phase: c.majorPhaseGMT })),
      });
    } else if (s.type === 'S') {
      const o = (await j(`${MD}/stations/${s.id}/currentpredictionoffsets.json`)).currentpredictionoffsets ?? {};
      stations.push({
        id: s.id, name: s.name, type: 'subordinate',
        reference: o.refStationId ?? o.referenceStationId,
        floodDirection: o.floodDir ?? o.maxFloodDir, ebbDirection: o.ebbDir ?? o.maxEbbDir,
        slackTimeOffset: Math.round((o.slackWaterTimeOffset ?? 0) * 60),
        floodTimeOffset: Math.round((o.floodTimeOffset ?? 0) * 60),
        ebbTimeOffset: Math.round((o.ebbTimeOffset ?? 0) * 60),
        floodSpeedRatio: o.floodSpeedRatio ?? 1, ebbSpeedRatio: o.ebbSpeedRatio ?? 1,
      });
    }
  } catch (e) { console.error(`skip ${s.id}: ${e.message}`); }
}
writeFileSync(out, JSON.stringify({ note: 'Generated from NOAA CO-OPS mdapi (harcon@currbin + currentpredictionoffsets). US only.', stations }, null, 0) + '\n');
console.error(`wrote ${out} — ${stations.length} stations`);
