# Slackwater Currents — Design

**Date:** 2026-07-17
**Status:** Approved, pending implementation plan
**Repo:** `slackwater-engine`

## Goal

Extend the validated offline tide engine to predict **tidal currents** — slack
water, max flood, max ebb — for the same class of stations XTide covers, fully
offline and deterministic. The app is named for its money output: **slack water.**

## Scope

- **US NOAA current stations only.** XTide's redistributable data
  (`harmonics-dwf-*-free`) is US-only; David Flater dropped non-US data years ago
  over licensing. This covers the US Salish Sea — San Juan Channel, Rosario Strait,
  Admiralty Inlet, Deception Pass, the US approaches to Boundary Pass — but **not
  the CHS/Canadian passes** (Active Pass, Porlier, the BC side). That gap is XTide's
  gap; no reimplementation moves it. Real offline BC currents would mean deriving
  constituents from CHS observations (harmgen-style) — a separate, larger project,
  deferred. The US/Canada asymmetry is a deliberate content hook ("why doesn't
  Canada have this?"), not a defect.
- **Match XTide's US current-station list** — both harmonic and subordinate stations.
- Runtime stays **zero-network**, like the tide engine.

## Non-goals

- CHS / Canadian current stations (deferred; see above).
- Rotary-current modeling (Salish Sea passes are reversing; revisit only if a
  target station demands it).
- Reconstructing the warped continuous velocity *curve* for subordinate stations
  beyond what the app's graph needs — the **event list is the primary deliverable**
  (see Stage 2).

## Data source

Station data (per-location constituents, offsets, flood/ebb directions) does not
exist anywhere in the current stack — `catalog.json` is only constituent
*definitions*, and `@neaps/tide-database` is heights-only. It must come from XTide.

- **Source:** XTide's **Harmbase2 SQL dump** (`harmonics-dwf-*-SQL.tar.xz`) —
  relational stations/constituents/offsets — in preference to parsing the binary
  `libtcd`. Filter to NOAA-sourced US stations (public domain regardless of the
  dump's overall contents).
- **Tool:** a build-time extractor `tools/gen-currents.mjs`, sibling to
  `gen-catalog.mjs`, emitting a bundled `Sources/TideEngine/Resources/currents.json`.
- **Bundle:** `currents.json` is a separate resource from the tide `catalog.json`
  (approved). Hundreds of US stations with constituents; expected tens–low-hundreds
  of KB.

## Engine additions

The harmonic core (`ParamProvider`, `evalH`, `evalHPrime`, `Extremes.swift`) is
already built and validated. A current harmonic station is the **identical**
sum-of-cosines; the result is signed velocity (knots) along a flood axis instead
of height in metres. Therefore:

- **Max flood / max ebb** = velocity peaks = slope-zeros of the curve →
  **reuse `Extremes.swift` unchanged.** Semantics map: `high` → max flood,
  `low` → max ebb.
- **Slack** = velocity *value*-zeros → **one new finder** (same bracket + bisect
  structure as `Extremes.swift`, but rooted on `evalH` instead of `evalHPrime`).
  This is the only genuinely new prediction math.
- **`CurrentStation`** type wrapping the existing prediction core, carrying
  `floodDirection` / `ebbDirection` (true degrees) and knots units. Public API:
  - `speeds(from:to:step:)` → signed velocity series (knots)
  - `slacks(from:to:)` → slack-water events (value-zeros)
  - `maxima(from:to:)` → max flood / max ebb events (reuses extremes)

## Subordinate / offset stations

Most current stations are subordinate: no own constituents, they reference a
harmonic station plus offsets.

```
SubordinateStation {
  reference: StationID
  slackTimeOffset, floodTimeOffset, ebbTimeOffset   // time shifts
  floodSpeedRatio, ebbSpeedRatio                     // amplitude scales
  floodDirection, ebbDirection
}
```

**Reduction (NOAA Current-Tables method):** compute the reference station's events
over the window; shift each event time by its offset; scale flood peaks by
`floodSpeedRatio` and ebb peaks by `ebbSpeedRatio`. The **event list**
(slack + max times/speeds) is the primary deliverable — it is what "slack window"
and the app need. Warped continuous-curve reconstruction (for a graph) is
secondary and where exact XTide parity gets fiddly; deferred to what the app graph
actually requires.

## Validation

Mirrors the Phase-0 discipline (validated tides to 7.9 min / 3.5 cm vs NOAA).

- Golden fixtures generated from XTide's own `tide -m c -l "<station>"` for a
  handful of US stations — one harmonic + several subordinate (Deception Pass,
  Rosario Strait, Admiralty Inlet).
- Agreement bar comparable to Phase 0: minutes on event times, ~0.1 kn on speeds.
- Fixture generation needs the `xtide` binary + free harmonics installed **at
  fixture-gen time only** (a `tools/gen-currents-golden.mjs`, like
  `gen-realworld.mjs`) — never at runtime.

## Staging

**Stage 1 — harmonic stations.**
Extractor for harmonic current stations → `CurrentStation` + slack finder +
flood/ebb directions + validation. Small, fast, fully validatable. Ships real US
harmonic-station currents offline.

**Stage 2 — subordinate stations.**
Subordinate reduction + full-list extraction (harmonic + subordinate) +
subordinate validation. The bulk of stations; the real "match XTide" payoff.

## Reuse summary (what already exists)

- Harmonic evaluation, node corrections, astronomy — done, validated.
- `Extremes.swift` slope-zero finder — reused as-is for max flood/ebb.
- Build-time extractor pattern (`gen-catalog.mjs`, `gen-realworld.mjs`) — the
  currents extractor and golden generator follow it.

New code is small: a `CurrentStation` wrapper, a slack (value-zero) finder, a
subordinate reduction, and two build-time tools.
