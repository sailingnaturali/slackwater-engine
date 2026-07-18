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
- **The `currents_predictions` product was down** on 2026-07-18 (returns
  "not available" for every station, incl. NOAA's own doc example `EPT0003`) —
  NOAA cloud migration. Not needed for building; only wanted as a validation oracle.
- **NOAA 404s datacenter IPs on the mdapi.** Our Bash and the WebFetch egress both
  got bare Tomcat 404s on the station-list endpoint; a residential browser worked.
  The extractor must run from a residential IP. The Data API (`datagetter`) does
  serve datacenter IPs.

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

Note the **two** slack offsets (before-flood vs before-ebb) — richer than the
engine's single-`slackTimeOffset` `SubordinateStation`. Subordinate stations are
**deferred** in v1 (harmonic covers all target passes); the two-slack model is the
refinement to add before bundling type-S stations. Endpoint needs the `_<currbin>`
composite id.

## Known engine edge (weak/mixed stations)

`maxima` labels slope-extrema high→flood / low→ebb. At weak mixed-tide stations
(e.g. PUG1717 Turn Point) a relaxation minimum that never crosses zero can be
labeled `maxEbb` with a positive speed (observed +0.07 kn). Strong reversing passes
(Deception Pass etc.) are unaffected. Proper fix (a non-reversing extremum is a
relaxation, not a flood/ebb, and has no slack) is calibrated against the NOAA
`currents_predictions` oracle once it recovers.

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
