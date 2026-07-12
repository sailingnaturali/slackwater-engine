// TideEngine — MIT. Constituent model: V₀ and node correction resolution.
// Faithful port of @neaps/tide-predictor constituent value()/correction() logic
// (src/constituents/definition.ts). Members are pre-resolved in the catalog.
import Foundation

/// One catalog constituent. `members` are pre-resolved (IHO Annex-B decomposition
/// done at codegen time) so no name parser is needed at runtime.
public struct CatalogEntry: Decodable, Sendable {
    public let name: String
    public let speed: Double
    public let coefficients: [Int]?
    public let members: [Member]?

    public struct Member: Decodable, Sendable {
        public let name: String
        public let factor: Double
    }
}

/// The constituent catalog, loaded once from the bundled `catalog.json`.
public struct Catalog: Sendable {
    public let byName: [String: CatalogEntry]

    public static let shared: Catalog = {
        let url = Bundle.module.url(forResource: "catalog", withExtension: "json")!
        // swiftlint:disable:next force_try
        let decoded = try! JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        return Catalog(byName: Dictionary(uniqueKeysWithValues: decoded.constituents.map { ($0.name, $0) }))
    }()

    private struct File: Decodable { let constituents: [CatalogEntry] }

    public func entry(_ name: String) -> CatalogEntry? { byName[name] }
    public func speed(_ name: String) -> Double? { byName[name]?.speed }

    /// Equilibrium argument V₀ (degrees) for a constituent at the given astro state.
    /// Uses Doodson coefficients when present, else Σ factor·V₀(member).
    public func v0(_ name: String, _ a: Astro) -> Double {
        guard let e = byName[name] else { return 0 }
        if let coeffs = e.coefficients {
            // Doodson args: [T+h-s, s, h, p, -N, pp, 90]
            let args = [a.ThMinusS, a.s, a.h, a.p, -a.N, a.pp, 90]
            var sum = 0.0
            for i in 0..<7 { sum += Double(coeffs[i]) * args[i] }
            return sum
        }
        var sum = 0.0
        for m in e.members ?? [] { sum += m.factor * v0(m.name, a) }
        return sum
    }

    /// Node correction (f, u°). IHO fundamental if the constituent has one, else
    /// combined from members: f = Π f_memberᵃᵇˢ⁽ᶠᵃᶜᵗᵒʳ⁾, u = Σ factor·u_member.
    public func correction(_ name: String, _ a: Astro) -> (f: Double, u: Double) {
        if let fundamental = ihoCorrection(name, a) { return fundamental }
        guard let e = byName[name] else { return (1, 0) }
        var f = 1.0
        var u = 0.0
        for m in e.members ?? [] {
            let c = correction(m.name, a)
            u += m.factor * c.u
            f *= pow(c.f, abs(m.factor))
        }
        return (f, u)
    }
}
