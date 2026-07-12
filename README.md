# slackwater-engine

The open, offline tide & current engine behind **Slackwater** — *Offline Tides & Currents*.

Tide prediction is deterministic astronomy, not a live feed. Given a station's harmonic
constituents you can compute heights and the high/low turns for any minute, years ahead,
with **zero network**. This package is a pure-Swift harmonic engine that does exactly that.

The app is ours; **the correctness is everyone's.** If you sail somewhere our numbers are
off, read the code, check it against your home waters, and send a fix.

## Status

Phase 0 complete — the engine is validated against the Neaps reference (floating-point
agreement across every layer) and against NOAA's own published predictions
(**Friday Harbor: max 7.9 min / 3.5 cm**). See [`docs/validation/phase0-report.md`](docs/validation/phase0-report.md).

## Use

```swift
import TideEngine

let station = Station(
    constituents: [HarmonicConstituent(name: "M2", amplitude: 0.96, phase: 128) /* … */],
    offset: 1.387  // datum offset (e.g. MSL → MLLW), optional
)
let heights  = station.heights(from: start, to: end, step: 600)   // [TidePoint]
let extremes = station.extremes(from: start, to: end)             // [TideExtreme] high/low
```

Harmonic constants come from public sources — NOAA (public domain, bundled) and, online,
CHS/IWLS for Canadian waters.

## Develop

```sh
swift test                 # golden validation against the Neaps reference
node tools/gen-golden.mjs   # regenerate golden fixtures from @neaps/tide-predictor
node tools/gen-catalog.mjs  # regenerate the bundled constituent catalog
node tools/gen-realworld.mjs # refresh the NOAA real-world fixture
```

## Credit & licence

The harmonic algorithm is a faithful Swift port of
[openwatersio/neaps](https://github.com/openwatersio/tide-predictor), and station data
comes from [`@neaps/tide-database`](https://github.com/openwatersio/tide-database). Huge
thanks to that project.

MIT — see [LICENSE](LICENSE).

> **Not for navigation.** Predictions are astronomical estimates and do not account for
> weather, surge, or local effects. Carry official tables and charts.
