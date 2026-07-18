// TideEngine — MIT. Bundled US current-station catalog (from NOAA CO-OPS mdapi).
import Foundation

public enum AnyCurrentStation: Sendable {
    case harmonic(CurrentStation)
    case subordinate(SubordinateStation)
    public func events(from: Date, to: Date) -> [CurrentEvent] {
        switch self {
        case .harmonic(let s): return s.events(from: from, to: to)
        case .subordinate(let s): return s.events(from: from, to: to)
        }
    }
}

public struct CurrentCatalog: Sendable {
    private let stations: [String: StationRecord]

    public static let shared = CurrentCatalog()

    private struct StationRecord: Decodable, Sendable {
        let id: String; let name: String; let type: String
        let floodDirection: Double?; let ebbDirection: Double?
        let offset: Double?
        let constituents: [Con]?
        let reference: String?
        let slackTimeOffset: Double?; let floodTimeOffset: Double?; let ebbTimeOffset: Double?
        let floodSpeedRatio: Double?; let ebbSpeedRatio: Double?
        struct Con: Decodable, Sendable { let name: String; let amplitude: Double; let phase: Double }
    }
    private struct File: Decodable { let stations: [StationRecord] }

    private init() {
        guard let url = Bundle.module.url(forResource: "currents", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(File.self, from: data) else {
            // ponytail: empty catalog if the bundle isn't generated yet — never crash.
            stations = [:]
            return
        }
        stations = Dictionary(decoded.stations.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    public func ids() -> [String] { Array(stations.keys) }

    public func station(_ id: String) -> AnyCurrentStation? {
        guard let r = stations[id] else { return nil }
        if r.type == "harmonic" {
            return .harmonic(CurrentStation(
                constituents: (r.constituents ?? []).map { HarmonicConstituent(name: $0.name, amplitude: $0.amplitude, phase: $0.phase) },
                floodDirection: r.floodDirection ?? 0, ebbDirection: r.ebbDirection ?? 0, offset: r.offset ?? 0))
        }
        guard let refId = r.reference, let ref = stations[refId], ref.type == "harmonic" else { return nil }
        let reference = CurrentStation(
            constituents: (ref.constituents ?? []).map { HarmonicConstituent(name: $0.name, amplitude: $0.amplitude, phase: $0.phase) },
            floodDirection: ref.floodDirection ?? 0, ebbDirection: ref.ebbDirection ?? 0, offset: ref.offset ?? 0)
        return .subordinate(SubordinateStation(
            reference: reference,
            slackTimeOffset: r.slackTimeOffset ?? 0, floodTimeOffset: r.floodTimeOffset ?? 0, ebbTimeOffset: r.ebbTimeOffset ?? 0,
            floodSpeedRatio: r.floodSpeedRatio ?? 1, ebbSpeedRatio: r.ebbSpeedRatio ?? 1,
            floodDirection: r.floodDirection ?? 0, ebbDirection: r.ebbDirection ?? 0))
    }
}
