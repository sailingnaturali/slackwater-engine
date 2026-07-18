// TideEngine — MIT. Tidal current prediction: velocity, max flood/ebb, and slack.
// Max flood/ebb are slope-zeros (reuses Extremes.findExtremes). Slack is the
// value-zero of velocity — the one genuinely new finder here.
import Foundation

private let slackToleranceHours = 1.0 / 3600  // 1 second

struct RawSlack { let hour: Double; let time: Date; let speed: Double }

/// Root of v(t) in [a, b] where v(a), v(b) have opposite signs. Bisection on evalH.
private func bisectZero(_ a0: Double, _ b0: Double, _ fa0: Double, _ params: [PreparedParam]) -> Double {
    var a = a0, b = b0, fa = fa0
    while true {
        let mid = (a + b) / 2
        if b - a < slackToleranceHours { return mid }
        let fMid = evalH(mid, params)
        if fMid == 0 { return mid }
        if fa > 0 ? fMid > 0 : fMid < 0 { a = mid; fa = fMid } else { b = mid }
    }
}

/// Slack instants (velocity value-zeros) in [fromHour, toHour]. Mirrors the
/// bracket-and-bisect structure of findExtremes, but roots evalH not evalHPrime.
func findSlacks(fromHour: Double, toHour: Double, provider: ParamProvider) -> [RawSlack] {
    var params = provider(max(0, fromHour))
    var lastGen = provider.generation
    if params.isEmpty { return [] }

    var maxSpeed = 0.0
    for p in params where p.w > maxSpeed { maxSpeed = p.w }
    if maxSpeed == 0 { return [] }
    let bracket = Double.pi / (2 * maxSpeed)

    var results: [RawSlack] = []
    var tPrev = fromHour
    var vPrev = evalH(tPrev, params)
    var tNext = tPrev + bracket
    while tNext <= toHour + bracket {
        let newParams = provider(tPrev)
        if provider.generation != lastGen { params = newParams; lastGen = provider.generation; vPrev = evalH(tPrev, params) }
        let tBound = min(tNext, toHour)
        let vNext = evalH(tBound, params)
        if vPrev != 0 && vNext != 0 && (vPrev > 0 ? vNext < 0 : vNext > 0) {
            let tRoot = bisectZero(tPrev, tBound, vPrev, params)
            if tRoot >= fromHour && tRoot <= toHour {
                results.append(RawSlack(hour: tRoot,
                                        time: Date(timeIntervalSince1970: provider.startMs / 1000 + tRoot * 3600),
                                        speed: evalH(tRoot, params)))
            }
        }
        if tBound >= toHour { break }
        tPrev = tBound
        vPrev = vNext
        tNext += bracket
    }
    return results
}
