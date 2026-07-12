import Foundation
import TideEngine

private struct NodeCorrFixture: Decodable {
    let entries: [Entry]
    struct Entry: Decodable { let time: String; let corrections: [String: FU] }
    struct FU: Decodable { let f: Double; let u: Double }
}

func checkNodeCorrections(_ c: Checker) {
    let fixture = loadFixture("node-corrections", as: NodeCorrFixture.self)
    for entry in fixture.entries {
        let a = astro(parseISO(entry.time))
        for (name, expected) in entry.corrections {
            guard let got = ihoCorrection(name, a) else {
                c.check(false, "\(name): no IHO correction implemented"); continue
            }
            c.check(abs(got.f - expected.f) < 1e-6, "\(name) f at \(entry.time): got \(got.f), want \(expected.f)")
            // u is an angle in degrees — compare circularly.
            c.check(angularDiff(got.u, expected.u) < 1e-6, "\(name) u at \(entry.time): got \(got.u), want \(expected.u)")
        }
    }
    c.report("node-corrections")
}
