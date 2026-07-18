# Slackwater Currents — Design

**Date:** 2026-07-17 (revised 2026-07-18: data source moved from XTide to NOAA)
**Status:** Approved, pending implementation plan
**Repo:** `slackwater-engine`

## Goal

Extend the validated offline tide engine to predict **tidal currents** — slack
water, max flood, max ebb — for NOAA's current stations, fully offline and
deterministic. The app is named for its money output: **slack water.**

## Scope

- **US NOAA current stations.** Constituents come directly from NOAA CO-OPS
  (public domain). This covers the US Salish Sea — Deception Pass, Rosario
  Strait, San Juan Channel, Turn Point (Boundary Pass), Admiralty Inlet, Race
  Rocks — **378 harmonic current stations in the Salish box alone**, plus the
  rest of US waters. It does **not** cover CHS/Canadian passes (Active Pass,
  Porlier, the BC side); NOAA has no data there and CHS publishes no comparable
  open corpus. That gap is a deliberate content hook ("why doesn't Canada have
  this?"), not a defect.
- Both **harmonic** (NOAA type H) and **subordinate** (type S) stations.
- Runtime stays **zero-network**, like the tide engine.

## Non-goals

- CHS / Canadian current stations (deferred — would need CHS observations +
  own harmonic analysis).
- Rotary-current modeling. NOAA gives a minor axis (`minorAmplitude`/
  `minorPhase`) per constituent; the Salish passes are reversing, so v1 uses only
  the **major axis**. Minor axis is retained in the data model for a future 2D mode.
- Continuous warped-curve reconstruction for subordinate stations — the **event
  list** (slack/max times + speeds) is the primary deliverable.

## Data source — NOAA CO-OPS Metadata API

Discovered 2026-07-18 (see `docs/research/2026-07-18-noaa-currents-api.md`): NOAA
exposes current-station harmonic constituents through the metadata API, keyed on
the station's **`currbin`** (the reference depth bin). The earlier belief that
"NOAA doesn't publish current constituents" was wrong — `harcon.json` returns
empty only when queried with the wrong bin (`bin=0`).

**Endpoints (build-time only):**
- Station list: `mdapi/prod/webapi/stations.json?type=currentpredictions&units=english`
  — every current station with `id`, `name`, `lat`/`lng`, `type` (H/S/W),
  `currbin`, and links to `harcon` / `currentpredictionoffsets`.
- Harmonic constituents (type H): `mdapi/prod/webapi/stations/<id>/harcon.json?units=english&bin=<currbin>`
- Subordinate offsets (type S): `mdapi/prod/webapi/stations/<id>/currentpredictionoffsets.json`

**`harcon.json` per-constituent fields we use:**
| Field | Meaning | Engine use |
|---|---|---|
| `constituentName` | e.g. "M2" | constituent name |
| `majorAmplitude` | major-axis amplitude (knots) | amplitude |
| `majorPhaseGMT` | Greenwich-referenced phase (deg) | phase K (see convention gate below) |
| `majorMeanSpeed` | mean flow along major axis (knots) | Z₀ / offset term |
| `azi` | major-axis azimuth (deg true) | flood/ebb axis direction |
| `minorAmplitude`, `minorPhase` | minor (rotary) axis | retained, unused in v1 |

**Phase-convention gate (must verify, do not assume):** the tide engine consumes
a Greenwich-referenced phase (the Friday Harbor fixture uses NOAA's GMT epoch,
M2 = 10.6°). Currents therefore use `majorPhaseGMT`, **but** this must be
confirmed empirically (see Validation) before trusting predictions — `majorPhase`
(local) vs `majorPhaseGMT` differ by the station-longitude term, and picking the
wrong one silently shifts every event.

**Operational note:** NOAA **404s datacenter IPs** on the mdapi (confirmed from
two independent datacenter egresses; a normal residential browser works). The
extractor is a **run-once, build-time** tool — run it from a residential IP with
polite pacing (NOAA throttles heavy volume). Its output (`currents.json`) is
committed, so nothing about this touches runtime.

**XTide is fully dropped** — no Harmbase2 data, no `tide` binary, at build or
runtime. Everything comes from NOAA.

## Engine additions

The harmonic core (`ParamProvider`, `evalH`, `evalHPrime`, `Extremes.swift`) is
built and validated. A current harmonic station is the **identical**
sum-of-cosines; the result is signed major-axis velocity (knots) instead of
height. Therefore:

- **Max flood / max ebb** = velocity peaks = slope-zeros → **reuse
  `Extremes.swift`** (`high` → max flood, `low` → max ebb).
- **Slack** = velocity value-zeros → **one new finder** (bracket + bisect on
  `evalH`, mirroring `Extremes.swift`). The only genuinely new prediction math.
- **`CurrentStation`** wraps the prediction core, carrying `floodDirection` (=`azi`),
  `ebbDirection` (=`azi`+180), knots units, and the `majorMeanSpeed` offset.
  Public API: `speeds(from:to:step:)`, `slacks(from:to:)`, `maxima(from:to:)`,
  `events(from:to:)`.

## Subordinate / offset stations

NOAA type-S stations reference a harmonic station with time/speed offsets, served
by `currentpredictionoffsets.json`. Reduction (NOAA Current-Tables method):
compute the reference station's events, shift each event time by its offset, scale
flood peaks by the flood ratio and ebb peaks by the ebb ratio. Event list only.

## Validation

Two-tier, mirroring the tide engine's Phase-0 discipline (validated to 7.9 min /
3.5 cm vs NOAA):

1. **Structural / analytic (available now, no oracle):** single-constituent slack
   times are analytic; reversing-current invariants (flood peaks positive, ebb
   negative, slack between, events time-ordered) hold for any correct station.
   Covers the slack finder, `CurrentStation`, and subordinate reduction.
2. **NOAA `currents_predictions` oracle (when available):** NOAA's own predicted
   max/slack events for a station — the independent authority check, and the test
   that **resolves the phase-convention gate**. As of 2026-07-18 the
   `currents_predictions` product returns "not available" for all stations (NOAA
   cloud migration); the golden generator is written and ready, and the fixture is
   captured when the product recovers. Until then, the phase convention is pinned
   by matching NOAA's *tide* harcon field semantics and re-confirmed at first
   opportunity.

XTide is **not** used as an oracle (its constituents may differ from NOAA's
latest, which would conflate constituent and engine differences).

## Staging

**Stage 1 — harmonic stations.** Slack finder + `CurrentStation` (azi direction,
mean-flow offset) + structural validation. Ships real NOAA harmonic currents
offline for the Salish passes.

**Stage 2 — subordinate + bundle.** Subordinate reduction + the NOAA extractor
(`stations.json` → per-station `harcon.json`@`currbin` / `currentpredictionoffsets.json`
→ bundled `currents.json`) + catalog loader. v1 bundles the Salish Sea box; the
extractor is region-parameterized so all-US is the same tool run longer.

## Reuse summary

- Harmonic evaluation, node corrections, astronomy — done, validated.
- `Extremes.swift` slope-zero finder — reused for max flood/ebb.
- Build-time extractor + golden-generator patterns (`gen-catalog.mjs`,
  `gen-realworld.mjs`) — the currents extractor and NOAA golden generator follow them.

New code: a `CurrentStation`/`SubordinateStation`, a slack (value-zero) finder, a
subordinate reduction, and two build-time Node tools (NOAA extractor + NOAA golden
generator). No XTide anywhere.
