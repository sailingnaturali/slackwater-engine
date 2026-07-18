import Foundation
import Testing
@testable import TideEngine

private struct CurrentGoldenFixture: Decodable {
    let station: String
    let floodDirection: Double
    let ebbDirection: Double
    let offset: Double
    let start: String
    let end: String
    let constituents: [C]
    let events: [E]
    struct C: Decodable { let name: String; let amplitude: Double; let phase: Double }
    struct E: Decodable { let time: String; let speed: Double; let kind: String }
}

/// Reproduce NOAA's OWN currents_predictions for a harmonic station (PUG1741,
/// Bellingham Channel). This RESOLVES THE PHASE-CONVENTION GATE: the fixture's
/// `phase` is `majorPhaseGMT`; if the max flood/ebb times match NOAA within
/// tolerance, that field is correct. Skips if the fixture/oracle is absent.
/// Tolerances: ±20 min on event time, ±0.3 kn on peak speed.
@Test func harmonicCurrentMatchesNOAA() throws {
    let fx: CurrentGoldenFixture
    do { fx = try loadFixture("currents-golden-harmonic", as: CurrentGoldenFixture.self) }
    catch { return }
    guard !fx.events.isEmpty else { return }

    let station = CurrentStation(
        constituents: fx.constituents.map { HarmonicConstituent(name: $0.name, amplitude: $0.amplitude, phase: $0.phase) },
        floodDirection: fx.floodDirection, ebbDirection: fx.ebbDirection, offset: fx.offset
    )
    // Cover the actual span of oracle events (NOAA returns through end-of-day of
    // end_date, which can extend past the fixture's nominal `end`).
    let times = fx.events.map { parseISO($0.time) }
    let computed = station.events(from: times.min()!.addingTimeInterval(-3600),
                                  to: times.max()!.addingTimeInterval(3600))
    #expect(!computed.isEmpty)

    var maxTimeErr = 0.0, maxSpeedErr = 0.0, checked = 0
    for e in fx.events where e.kind != "slack" {  // max flood/ebb — robust; slacks noisier at weak stations
        let t = parseISO(e.time)
        // Nearest computed event by TIME (avoids cross-cycle mis-match at weak,
        // mostly-single-direction stations), then require kind + tolerance.
        let m = try #require(
            computed.min { abs($0.time.timeIntervalSince1970 - t.timeIntervalSince1970) < abs($1.time.timeIntervalSince1970 - t.timeIntervalSince1970) },
            "no computed event near \(e.time)")
        let kind: CurrentEventKind = e.kind == "maxFlood" ? .maxFlood : .maxEbb
        let timeErr = abs(m.time.timeIntervalSince1970 - t.timeIntervalSince1970) / 60
        let speedErr = abs(abs(m.speed) - abs(e.speed))
        maxTimeErr = max(maxTimeErr, timeErr); maxSpeedErr = max(maxSpeedErr, speedErr); checked += 1
        #expect(m.kind == kind, "\(e.kind) at \(e.time): engine labeled \(m.kind) (\(m.speed) kn)")
        #expect(timeErr < 20, "\(e.kind) at \(e.time): time off \(timeErr) min (phase field wrong?)")
        #expect(speedErr < 0.3, "\(e.kind) at \(e.time): speed \(m.speed) vs \(e.speed)")
    }
    #expect(checked > 0)
    print("PUG1741 vs NOAA — \(checked) max events, max time err \(maxTimeErr) min, max speed err \(maxSpeedErr) kn")
}
