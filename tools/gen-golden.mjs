// Generate golden-vector fixtures from the Neaps JS reference (@neaps/tide-predictor).
// Neaps is the oracle: TideEngine (Swift) must match these to the tolerances in the plan.
// Usage: node tools/gen-golden.mjs   (writes all fixtures into ../Tests/TideEngineTests/Fixtures)
import { astro, constituents, createTidePredictor } from '@neaps/tide-predictor';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'Tests', 'TideEngineTests', 'Fixtures');
mkdirSync(FIX, { recursive: true });
const write = (name, obj) => { writeFileSync(join(FIX, name), JSON.stringify(obj, null, 2) + '\n'); console.log('wrote', name); };
const iso = (d) => new Date(d).toISOString();
const unwrap = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, (v && typeof v === 'object' && 'value' in v) ? v.value : v]));

// Spread of UTC timestamps across the 18.6-year nodal cycle to exercise corrections.
const TIMES = [
  '2000-01-01T00:00:00Z', '2010-06-15T12:00:00Z', '2020-03-21T06:30:00Z',
  '2026-07-12T00:00:00Z', '2026-07-12T18:45:00Z', '2031-11-02T09:15:00Z',
  '2035-09-23T00:00:00Z', '2040-12-31T23:00:00Z',
];

// ---- Task 1: astronomy ----
write('astronomy.json', {
  note: 'Neaps astro(date) unwrapped to plain degrees; TideEngine must match within 1e-6.',
  times: TIMES,
  values: TIMES.map((t) => ({ time: iso(t), astro: unwrap(astro(new Date(t))) })),
});

console.log('done');
