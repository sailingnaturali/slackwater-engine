import Foundation
import TideEngine

private struct AstronomyFixture: Decodable {
    let values: [Entry]
    struct Entry: Decodable { let time: String; let astro: [String: Double] }
}

func checkAstronomy(_ c: Checker) {
    let fixture = loadFixture("astronomy", as: AstronomyFixture.self)
    c.check(fixture.values.count >= 8, "astronomy fixture has \(fixture.values.count) entries, want >= 8")
    for entry in fixture.values {
        let date = parseISO(entry.time)
        let got = astro(date).all
        for (key, expected) in entry.astro {
            let diff = angularDiff(got[key]!, expected)
            c.check(diff < 1e-6, "\(key) at \(entry.time): got \(got[key]!), expected \(expected), diff \(diff)")
        }
    }
    c.report("astronomy")
}
