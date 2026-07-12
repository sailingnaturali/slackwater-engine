import Foundation

/// Minimal assert harness — no XCTest on Command Line Tools toolchains.
final class Checker {
    private(set) var passed = 0
    private(set) var failed = 0
    private var reportedPassed = 0
    private var reportedFailed = 0
    private var firstFailures: [String] = []

    func check(_ condition: Bool, _ message: @autoclosure () -> String) {
        if condition { passed += 1 } else {
            failed += 1
            if firstFailures.count < 20 { firstFailures.append(message()) }
        }
    }

    func report(_ section: String) {
        let p = passed - reportedPassed, f = failed - reportedFailed
        reportedPassed = passed; reportedFailed = failed
        print("  \(section): \(p) passed, \(f) failed")
    }

    func finish() -> Never {
        print("\n=== tide-check: \(passed) passed, \(failed) failed ===")
        for f in firstFailures { print("  FAIL: \(f)") }
        exit(failed == 0 ? 0 : 1)
    }
}

func loadFixture<T: Decodable>(_ name: String, as: T.Type) -> T {
    let url = Bundle.module.url(forResource: name, withExtension: "json")!
    // swiftlint:disable:next force_try
    return try! JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

func parseISO(_ s: String) -> Date {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: s)!
}

/// Circular degree difference — avoids false failures at the 0/360 wrap.
func angularDiff(_ a: Double, _ b: Double) -> Double {
    let d = abs(a - b).truncatingRemainder(dividingBy: 360)
    return min(d, 360 - d)
}
