# slackwater-engine

The open, offline tide & current engine behind **Slackwater** — *Offline Tides & Currents*.

Tide prediction is deterministic astronomy, not a live feed. Given a station's harmonic
constituents you can compute heights and the high/low turns for any minute, years ahead,
with **zero network**. This package is a pure-Swift harmonic engine that does exactly that.

**It's all open — the engine MIT, the app GPL v3.** If you sail somewhere our numbers are
off, read the code, check it against your home waters, and send a fix.

## Status

- **Tides** — validated against the Neaps reference (floating-point agreement across every
  layer) and NOAA's own published predictions (**Friday Harbor: max 7.9 min / 3.5 cm**).
  See [`docs/validation/phase0-report.md`](docs/validation/phase0-report.md).
- **Currents** — US NOAA current stations (harmonic + subordinate), constituents sourced
  straight from NOAA CO-OPS, computed offline. Validated against NOAA's own current
  predictions: **PUG1741 (Bellingham Channel) 9.7 min / 0.055 kn**, subordinate reduction
  **6.1 min / 0.05 kn**, and the Salish Sea passes (Deception Pass, Rosario, San Juan
  Channel, Turn Point, Admiralty, Race Rocks) directly. See
  [`docs/validation/currents-report.md`](docs/validation/currents-report.md).

## Use

### Tides

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

### Currents

Signed major-axis velocity (knots), plus slack / max-flood / max-ebb events. US NOAA
current stations are bundled (`Resources/currents.json`, from NOAA `harcon`); look one up
by id, or build a station directly:

```swift
import TideEngine

// Bundled US station (e.g. Deception Pass Narrows).
if let station = CurrentCatalog.shared.station("PUG1701") {
    let events = station.events(from: start, to: end)  // [CurrentEvent]: .slack / .maxFlood / .maxEbb
}

// Or construct one directly:
let dp = CurrentStation(
    constituents: [HarmonicConstituent(name: "M2", amplitude: 5.21, phase: 241.2) /* … */],
    floodDirection: 92.9,   // NOAA `azi`
    ebbDirection: 272.9,
    offset: -0.62           // NOAA `majorMeanSpeed` (mean flow), optional
)
let speeds = dp.speeds(from: start, to: end)   // [CurrentPoint], signed knots (+flood / -ebb)
let slacks = dp.slacks(from: start, to: end)   // slack water (velocity value-zeros)
let maxima = dp.maxima(from: start, to: end)   // max flood / max ebb, labeled by velocity sign
```

Subordinate stations (`SubordinateStation`) warp a reference station's events by NOAA's
two-slack / speed-ratio offsets; `CurrentCatalog` resolves them automatically.

## Develop

```sh
swift test                    # golden + NOAA-oracle validation (offline; bundled fixtures)
node tools/gen-golden.mjs      # regenerate tide golden fixtures from @neaps/tide-predictor
node tools/gen-catalog.mjs     # regenerate the bundled tide constituent catalog
node tools/gen-realworld.mjs   # refresh the NOAA tide real-world fixture
node tools/gen-currents.mjs Sources/TideEngine/Resources/currents.json 15 -180 72 -64  # rebuild the US currents bundle from NOAA
node tools/gen-currents-golden.mjs <station> <currbin> <start> <end> <out>  # a NOAA currents oracle fixture
```

> Currents tools query NOAA's mdapi and must run from a residential IP with a browser
> User-Agent (both handled) — NOAA 404s the default fetch UA. See
> [`docs/research/2026-07-18-noaa-currents-api.md`](docs/research/2026-07-18-noaa-currents-api.md).

## Credit & licence

The harmonic algorithm is a faithful Swift port of
[openwatersio/neaps](https://github.com/openwatersio/tide-predictor), and station data
comes from [`@neaps/tide-database`](https://github.com/openwatersio/tide-database). Huge
thanks to that project.

MIT — see [LICENSE](LICENSE).

> **Not for navigation.** Predictions are astronomical estimates and do not account for
> weather, surge, or local effects. Carry official tables and charts.
