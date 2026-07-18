# NOAA CO-OPS Currents API — findings (2026-07-18)

How to get US tidal-current **harmonic constituents** and **predictions** from
NOAA, and the dead-ends we ruled out. This is why `slackwater-engine` currents
are NOAA-sourced (no XTide). Recorded so it isn't re-litigated.

## TL;DR

- **Current constituents ARE available from NOAA** — via the metadata API
  `harcon.json`, but **only when queried with the station's `currbin`**. With the
  wrong bin (e.g. `bin=0`) the constituent list comes back empty, which earlier
  led us to wrongly conclude NOAA didn't publish current constituents.
- **XTide is unnecessary.** NOAA covers our Salish passes directly (378 harmonic
  current stations in the Salish box), public-domain.
- **`currents_predictions` IS live** — the earlier "not available"/404 wall was
  (a) NOAA's default-User-Agent block, (b) transient rate-limiting from probing
  volume, and (c) querying observation/survey stations at the wrong bin. With a
  browser UA + a served station + its `currbin`, it returns data. Our exact passes
  (PUG1701/PUG1717) are *survey* stations NOAA doesn't serve predictions for, but
  hundreds of other harmonic stations are served (e.g. PUG1741 Bellingham Channel,
  PUG1612 Clinton Ferry, SFB1222).
- **NOAA 404s the default fetch/curl User-Agent** (not the IP — same residential
  box works in a browser but not plain curl). Send a browser `User-Agent` header;
  both tools do.

## Phase-convention gate — RESOLVED

`majorPhaseGMT` is the correct phase field. Validated the engine against NOAA's own
`currents_predictions` for PUG1741 (Bellingham Channel, a clean 2.8 kn reversing
station): **max flood/ebb match to 9.7 min / 0.055 kn** across 11 events — on par
with the tide engine's Phase-0 (7.9 min). Fixture captured at
`Tests/TideEngineTests/Fixtures/currents-golden-harmonic.json` so the check runs
offline.

**Labeling (fixed):** classify a velocity extremum by the SIGN of velocity, not
slope high/low — a relaxation extremum that never reverses stays flood/ebb per its
sign. This matches NOAA's max_slack exactly (e.g. a −0.3 kn relaxation peak during
a long ebb is `maxEbb`, not `maxFlood`).

## Endpoints

Base: `https://api.tidesandcurrents.noaa.gov`

| Purpose | Endpoint |
|---|---|
| Current-station list | `/mdapi/prod/webapi/stations.json?type=currentpredictions&units=english` |
| Harmonic constituents | `/mdapi/prod/webapi/stations/<id>/harcon.json?units=english&bin=<currbin>` |
| Subordinate offsets | `/mdapi/prod/webapi/stations/<id>/currentpredictionoffsets.json` |
| Predictions (down 07-18) | `/api/prod/datagetter?...&product=currents_predictions&interval=max_slack&bin=<currbin>` |

Station list record carries: `id`, `name`, `lat`, `lng`, `type` (H=harmonic,
S=subordinate, W=weak/rotary), **`currbin`** (the reference bin — required for
harcon/predictions), and links to harcon/offsets. The list repeats each station
once per bin; de-dupe by `id`.

## harcon.json per-constituent fields (confirmed)

```
constituentName, description,
majorAmplitude (knots), majorPhase (local °), majorPhaseGMT (Greenwich °),
minorAmplitude, minorPhase, minorPhaseGMT,
majorMeanSpeed (mean flow, knots), minorMeanSpeed,
azi (major-axis azimuth, ° true), binNbr, binDepth, constNum
```

Engine mapping: amplitude=`majorAmplitude`, phase=`majorPhaseGMT` (pairs with the
engine's Greenwich V₀ — **verify empirically**, see the plan's phase-convention
gate), flood dir=`azi`, ebb dir=`azi`+180, Z₀=`majorMeanSpeed`. Minor axis retained
for a future 2D/rotary mode.

## Our Salish target stations (type H, with currbin)

| id | currbin | station |
|---|---|---|
| PUG1701 | 18 | Deception Pass (Narrows) |
| PUG1702 | 9  | Rosario Strait |
| PUG1703 | 13 | San Juan Channel, south entrance |
| PUG1717 | 28 | Turn Point, Boundary Pass |
| PUG1616 | 6  | Admiralty Inlet (off Bush Point) |
| PUG1640 | 9  | Race Rocks, 4.5 mi. S of |
| PUG1629 | 3  | Yokeko Point, Deception Pass |
| PUG1617 | 14 | Bush Point Light, 0.5 mile NW of |

PUG1701 sample: M2 majorAmplitude 5.418 kn @ majorPhaseGMT 241.2°, azi 92.9°,
majorMeanSpeed −0.619 kn, 26 constituents total.

## Subordinate offsets schema (confirmed, `stations/<id>_<currbin>/currentpredictionoffsets.json`)

```
refStationId, refStationBin, meanFloodDir, meanEbbDir,
mfcTimeAdjMin (max flood current, min),  mecTimeAdjMin (max ebb current, min),
sbfTimeAdjMin (slack before flood, min), sbeTimeAdjMin (slack before ebb, min),
mfcAmpAdj (flood speed ratio),           mecAmpAdj (ebb speed ratio)
```

Note the **two** slack offsets (before-flood vs before-ebb). The engine's
`SubordinateStation` models both (a slack takes the offset for the phase it
precedes). **Validated** against NOAA `currents_predictions` for PCT0236 (ref
SFB1201): 6.1 min / 0.05 kn over 11 events. Endpoint needs the `_<currbin>`
composite id. Amp adjustments (`mfcAmpAdj`/`mecAmpAdj`) are speed *ratios* on the
reference peak (confirmed by the validation). The extractor backfills reference
harmonic stations that fall outside the extraction box so subordinates resolve.

## Weak/mixed-station labeling — FIXED

Earlier a relaxation extremum that never crossed zero was mislabeled (a positive
local-max during ebb → "maxFlood"). Fixed by classifying on velocity sign (see the
phase-gate section); confirmed against NOAA at PUG1741.

## Dead-ends ruled out

- **XTide `harcon`/Harmbase2 as the constituent source** — unnecessary; NOAA has it.
- **`harcon.json?bin=0`** — returns empty for currents; must use `currbin`.
- **`currents_predictions` for observation/survey stations** (`cb0102` real-time
  buoy; `PUG1701` treated as survey) — "not available"; predictions are a
  published-current-tables product, and the product itself was down on 07-18.
- **`MAX_SLACK` uppercase** — the API wants lowercase `max_slack` (though the
  product was down regardless).
- **Datacenter-IP mdapi access** — 404s; use a residential IP for the extractor.

## Reference

- Verified against the Perigee-Tides MCP (`RyanCardin15/Perigee-Tides`,
  `src/services/data-api.ts` / `metadata-api.ts`) — its request format is identical
  to ours, confirming the format was never the issue.
- Retry the predictions oracle when `stations.json?type=currentpredictions` serves
  again: `tools/gen-currents-golden.mjs <id> <currbin> <start> <end> <out>`.
