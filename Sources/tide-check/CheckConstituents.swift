import Foundation
import TideEngine

private struct ConstituentFixture: Decodable {
    let entries: [Entry]
    struct Entry: Decodable { let time: String; let constituents: [String: VFU] }
    struct VFU: Decodable { let v0: Double; let f: Double; let u: Double }
}

func checkConstituents(_ c: Checker) {
    let fixture = loadFixture("constituents", as: ConstituentFixture.self)
    let catalog = Catalog.shared
    c.check(catalog.byName.count >= 300, "catalog has \(catalog.byName.count) constituents, want >= 300")
    for entry in fixture.entries {
        let a = astro(parseISO(entry.time))
        for (name, expected) in entry.constituents {
            c.check(angularDiff(catalog.v0(name, a), expected.v0) < 1e-6,
                    "\(name) V0 at \(entry.time): got \(catalog.v0(name, a)), want \(expected.v0)")
            let corr = catalog.correction(name, a)
            c.check(abs(corr.f - expected.f) < 1e-6, "\(name) f at \(entry.time): got \(corr.f), want \(expected.f)")
            c.check(angularDiff(corr.u, expected.u) < 1e-6, "\(name) u at \(entry.time): got \(corr.u), want \(expected.u)")
        }
    }
    c.report("constituents")
}
