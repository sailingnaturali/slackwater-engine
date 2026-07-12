// TideEngine — MIT. Public prediction API.
import Foundation

/// A harmonic constituent for a station: amplitude in metres, phase (K) in degrees.
public struct HarmonicConstituent: Sendable {
    public let name: String
    public let amplitude: Double
    public let phase: Double
    public init(name: String, amplitude: Double, phase: Double) {
        self.name = name
        self.amplitude = amplitude
        self.phase = phase
    }
}

public struct TidePoint: Sendable { public let time: Date; public let height: Double }
public enum ExtremeKind: Sendable { case high, low }
public struct TideExtreme: Sendable { public let time: Date; public let height: Double; public let kind: ExtremeKind }

/// A tide/current station: a set of harmonic constituents plus a datum offset (m).
/// Predictions are fully offline and deterministic — no network, any date.
public struct Station: Sendable {
    private let constituents: [StationConstituent]
    private let offset: Double
    private let catalog: Catalog

    /// - Parameters:
    ///   - constituents: station harmonic constants (unknown names are ignored).
    ///   - offset: constant datum offset added to every height (metres).
    public init(constituents inputs: [HarmonicConstituent], offset: Double = 0) {
        let d2r = Double.pi / 180
        let cat = Catalog.shared
        self.catalog = cat
        self.constituents = inputs
            .filter { cat.entry($0.name) != nil }
            .map { StationConstituent(name: $0.name, amplitude: $0.amplitude, phase: d2r * $0.phase) }
        self.offset = offset
    }

    /// Height series (metres) from `from` to `to`, sampled every `step` seconds.
    /// Timeline is floored/ceiled to `step` (matches the Neaps reference).
    public func heights(from: Date, to: Date, step: TimeInterval = 600) -> [TidePoint] {
        let timeline = makeTimeline(from: from, to: to, step: step)
        guard let first = timeline.items.first else { return [] }
        let base = astro(first)
        let provider = ParamProvider(constituents: constituents, baseAstro: base, catalog: catalog,
                                     startMs: timeline.startMs, endHour: timeline.endHour)
        return zip(timeline.items, timeline.hours).map { item, hour in
            TidePoint(time: item, height: offset + evalH(hour, provider(hour)))
        }
    }
}
