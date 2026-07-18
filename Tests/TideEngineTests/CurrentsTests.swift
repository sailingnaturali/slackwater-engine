import Foundation
import Testing
@testable import TideEngine

// A pure single-M2 current: v(t) = cos(w·t + φ). Slacks are the zeros of cos,
// every half period. M2 speed ≈ 28.9841042°/h → period T ≈ 12.4206 h, slacks
// every T/2 ≈ 6.2103 h. Predict slack instants independent of the engine.
@Test func slackFinderMatchesAnalyticM2() throws {
    let start = parseISO("2026-01-01T00:00:00Z")
    let end = parseISO("2026-01-03T00:00:00Z")
    let cs = [StationConstituent(name: "M2", amplitude: 1.0, phase: Double.pi / 2)]
    let base = astro(start)
    let startMs = start.timeIntervalSince1970 * 1000
    let endHour = (end.timeIntervalSince1970 - start.timeIntervalSince1970) / 3600
    let provider = ParamProvider(constituents: cs, baseAstro: base, catalog: .shared,
                                 startMs: startMs, endHour: endHour)

    let slacks = findSlacks(fromHour: 0, toHour: endHour, provider: provider)

    // ~48 h / (M2 half-period 6.2103 h) ≈ 7–8 zero crossings.
    #expect(slacks.count >= 7 && slacks.count <= 9, "slack count \(slacks.count)")
    for s in slacks {
        #expect(abs(s.speed) < 1e-3, "slack at \(s.time) has speed \(s.speed), not ~0")
    }
    for i in 1..<slacks.count {
        let gap = slacks[i].hour - slacks[i - 1].hour
        #expect(abs(gap - 6.2103) < 0.1, "slack gap \(gap) h at index \(i)")
    }
}

// A reversing current from a couple of constituents. Assert only structural
// invariants true for any correct reversing current — no external oracle needed.
@Test func currentStationStructureIsConsistent() throws {
    let station = CurrentStation(
        constituents: [
            HarmonicConstituent(name: "M2", amplitude: 2.0, phase: 40),
            HarmonicConstituent(name: "K1", amplitude: 0.5, phase: 200)
        ],
        floodDirection: 120, ebbDirection: 300
    )
    let start = parseISO("2026-03-01T00:00:00Z")
    let end = parseISO("2026-03-02T00:00:00Z")

    let speeds = station.speeds(from: start, to: end, step: 600)
    #expect(!speeds.isEmpty)
    let maxAbs = speeds.map { abs($0.speed) }.max()!
    #expect(maxAbs > 1.0, "reversing current should reach real speed, got \(maxAbs)")

    let maxima = station.maxima(from: start, to: end)
    #expect(maxima.allSatisfy { $0.kind == .maxFlood || $0.kind == .maxEbb })
    #expect(maxima.contains { $0.kind == .maxFlood } && maxima.contains { $0.kind == .maxEbb })
    for m in maxima {
        if m.kind == .maxFlood { #expect(m.speed > 0, "flood peak \(m.speed) not positive") }
        if m.kind == .maxEbb { #expect(m.speed < 0, "ebb peak \(m.speed) not negative") }
    }

    let slacks = station.slacks(from: start, to: end)
    #expect(slacks.allSatisfy { $0.kind == .slack && abs($0.speed) < 1e-3 })

    let events = station.events(from: start, to: end)
    for i in 1..<events.count {
        #expect(events[i].time >= events[i - 1].time, "events out of order at \(i)")
    }
}
