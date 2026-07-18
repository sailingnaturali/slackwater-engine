// Build a currents validation fixture from NOAA CO-OPS.
// Usage: node tools/gen-currents-golden.mjs <stationId> <currbin> <startISO> <endISO> <out.json>
// Requires a residential IP (NOAA 404s datacenter IPs on the mdapi).
//
// Constituents come from harcon.json@currbin (always available). The validation
// target comes from the currents_predictions product — which was migrating/down
// on 2026-07-18; if it errors, the fixture is written with empty events and the
// oracle test (CurrentsRealWorldTests) skips until you re-run and capture it.
import { writeFileSync } from 'node:fs';

const [station, currbin, start, end, out] = process.argv.slice(2);
if (!out) { console.error('usage: gen-currents-golden.mjs <station> <currbin> <startISO> <endISO> <out.json>'); process.exit(1); }
const MD = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi';
const DA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const ymd = (iso) => iso.slice(0, 10).replace(/-/g, '');

const hc = await j(`${MD}/stations/${station}/harcon.json?units=english&bin=${currbin}`);
const cons = hc.HarmonicConstituents;
const constituents = cons.map((c) => ({ name: c.constituentName, amplitude: c.majorAmplitude, phase: c.majorPhaseGMT }));
const azi = cons[0]?.azi ?? 0;
const offset = cons[0]?.majorMeanSpeed ?? 0;

let events = [];
try {
  const cp = await j(`${DA}?begin_date=${ymd(start)}&end_date=${ymd(end)}&station=${station}`
    + `&product=currents_predictions&time_zone=gmt&interval=max_slack&units=english&format=json&bin=${currbin}`);
  const rows = Array.isArray(cp.current_predictions) ? cp.current_predictions : (cp.current_predictions?.cp ?? []);
  events = rows.map((r) => {
    const t = (r.Time || r.t).replace(' ', 'T') + ':00Z';
    const type = (r.Type || r.type || '').toLowerCase();
    const vel = Number(r.Velocity_Major ?? r.velocity ?? 0);
    const kind = type.startsWith('slack') ? 'slack' : (type.startsWith('flood') ? 'maxFlood' : 'maxEbb');
    return { time: t, speed: kind === 'slack' ? 0 : vel, kind };
  });
} catch (e) {
  console.error(`WARNING: currents_predictions unavailable (${e.message}). Empty events; re-run when NOAA's product recovers.`);
}

writeFileSync(out, JSON.stringify({
  station, name: hc.self ?? station,
  floodDirection: azi, ebbDirection: (azi + 180) % 360, offset,
  start, end, constituents, events,
}, null, 2) + '\n');
console.error(`wrote ${out} — ${constituents.length} constituents, ${events.length} events`);
