import Foundation

public let defaultKMax = 37
public let defaultLMax = 1000
public let defaultTolerance = 1.0e-8

public struct Complex: Equatable, Sendable {
    public var re: Double
    public var im: Double

    public init(_ re: Double, _ im: Double) {
        self.re = re
        self.im = im
    }

    public var abs: Double { Foundation.hypot(re, im) }
}

public enum Verdict: String, Sendable {
    case interior = "Interior"
    case interiorOffLens = "Interior-offLens"
    case exterior = "Exterior"
    case undetermined = "Undetermined"
}

public struct CanonicalCoordinates: Equatable, Sendable {
    public let ls: Double
    public let lv: Double
}

public struct Enclosure: Equatable, Sendable {
    public let se: Double
    public let ve: Double
    public let truncationDepth: Int
    public let tail: Double
    public let tailCertifiedToTolerance: Bool
    public let tailCapHit: Bool
}

public struct Trap: Equatable, Sendable {
    public let S: Double
    public let V: Double
    public let region: String
}

public struct SearchResult: Equatable, Sendable {
    public let verdict: Verdict
    public let depth: Int
    public let word: [Int]
    public let nodesExplored: Int
    public let trapRegion: String?
    public let reason: String?

    public init(verdict: Verdict, depth: Int, word: [Int] = [], nodesExplored: Int, trapRegion: String? = nil, reason: String? = nil) {
        self.verdict = verdict
        self.depth = depth
        self.word = word
        self.nodesExplored = nodesExplored
        self.trapRegion = trapRegion
        self.reason = reason
    }
}

public enum CollinearFractalsError: Error, Equatable {
    case invalidParameter(String)
}

public enum CollinearFractals {
    public static func canonicalCoordinates(z: Complex, c: Complex) throws -> CanonicalCoordinates {
        let rho = c.abs
        guard rho != 0.0 else { throw CollinearFractalsError.invalidParameter("c must be nonzero") }
        let lv = z.im
        let ls = (c.re * z.im + c.im * z.re) / rho
        return CanonicalCoordinates(ls: ls, lv: lv)
    }

    public static func inLens(_ c: Complex, n: Int) -> Bool {
        let rho = c.abs
        let N = 2 * n - 1
        return rho > 1.0 && c.im != 0.0 && (rho * rho + 2.0 * Swift.abs(c.re) < Double(N))
    }

    public static func chooseTailDepth(rho: Double, tol: Double = defaultTolerance, minM: Int = 30, maxM: Int = 2000) throws -> (M: Int, capped: Bool) {
        guard rho > 1.0 else { throw CollinearFractalsError.invalidParameter("rho must be greater than 1") }
        guard tol > 0.0 else { throw CollinearFractalsError.invalidParameter("tol must be positive") }
        let target = -Foundation.log(tol * (rho - 1.0)) / Foundation.log(rho)
        var M = Swift.max(minM, Int(Foundation.ceil(target)))
        let capped = M > maxM
        if capped { M = maxM }
        return (M, capped)
    }

    public static func computeEnclosure(_ c: Complex, n: Int, tol: Double = defaultTolerance) throws -> Enclosure {
        let rho = c.abs
        guard rho > 1.0 && c.im != 0.0 else {
            throw CollinearFractalsError.invalidParameter("c must satisfy |c| > 1 and Im(c) != 0")
        }
        let theta = Foundation.atan2(c.im, c.re)
        let nMinus1ForDifference = 2 * n - 2
        let depth = try chooseTailDepth(rho: rho, tol: tol)
        let M = depth.M

        var valSum = 0.0
        for k in 1...M {
            valSum += Foundation.pow(rho, -Double(k)) * Swift.abs(Foundation.sin(Double(k) * theta))
        }

        let tail = Foundation.pow(rho, -Double(M)) / (rho - 1.0)
        let ve = Double(nMinus1ForDifference) * (valSum + tail)
        let se = Double(nMinus1ForDifference) * Swift.abs(c.im) / rho + ve / rho
        return Enclosure(se: se, ve: ve, truncationDepth: M, tail: tail, tailCertifiedToTolerance: tail <= tol, tailCapHit: depth.capped)
    }

    public static func trapHalfWidths(_ c: Complex, n: Int) -> Trap {
        let rho = c.abs
        let N = 2 * n - 1
        if inLens(c, n: n) {
            return Trap(
                S: Double(N) * Swift.abs(c.im) / rho,
                V: Swift.max(0.0, (Double(N) - 2.0 * Swift.abs(c.re)) * Swift.abs(c.im) / (rho * rho)),
                region: "lens"
            )
        }
        let nPrime = Double(N + 1) / 2.0
        let kappa = nPrime > 7.0 ? 1.0 + Foundation.floor(-2.0 - 2.0 * Foundation.sqrt(nPrime) + nPrime) : 1.0
        return Trap(
            S: Double(N - 1) * Swift.abs(c.im) / rho,
            V: kappa * Swift.abs(c.im) / (rho * rho),
            region: "off-lens"
        )
    }

    public static func firstAlphabetDigitAtOrAbove(_ a: Double, m: Int) -> Int {
        let parity = ((m - 1) % 2 + 2) % 2
        var t = Int(Foundation.ceil(a))
        if ((t - parity) % 2 + 2) % 2 != 0 { t += 1 }
        return t
    }

    private static func interiorVerdict(_ isLensParameter: Bool) -> Verdict {
        isLensParameter ? .interior : .interiorOffLens
    }

    public static func inverseIterationTest(_ c: Complex, n: Int, kMax: Int = defaultKMax, lMax: Int = defaultLMax, tol: Double = defaultTolerance) -> SearchResult {
        let rho = c.abs
        guard rho > 1.0 && c.im != 0.0 else {
            return SearchResult(verdict: .undetermined, depth: 0, nodesExplored: 0, reason: "c outside domain")
        }

        let N = 2 * n - 1
        let isLensParameter = inLens(c, n: n)
        let enclosure: Enclosure
        do {
            enclosure = try computeEnclosure(c, n: n, tol: tol)
        } catch {
            return SearchResult(verdict: .undetermined, depth: 0, nodesExplored: 0, reason: "failed to compute enclosure")
        }

        let trap = trapHalfWidths(c, n: n)
        let s0 = (4.0 * c.re * c.im) / rho
        let v0 = 2.0 * c.im

        if Swift.abs(s0) > enclosure.se || Swift.abs(v0) > enclosure.ve {
            return SearchResult(verdict: .exterior, depth: 0, nodesExplored: 1)
        }
        if Swift.abs(s0) < trap.S && Swift.abs(v0) < trap.V {
            return SearchResult(verdict: interiorVerdict(isLensParameter), depth: 0, nodesExplored: 1, trapRegion: trap.region)
        }

        var queue: [(s: Double, v: Double, word: [Int])] = [(s0, v0, [])]
        var totalNodes = 1

        for k in 1...kMax {
            var nextQueue: [(s: Double, v: Double, word: [Int])] = []
            for node in queue {
                let t1 = (rho * node.s - enclosure.ve) / c.im
                let t2 = (rho * node.s + enclosure.ve) / c.im
                let tMin = Swift.min(t1, t2)
                let tMax = Swift.max(t1, t2)
                let a = Swift.max(-N + 1, Int(Foundation.ceil(tMin)))
                let b = Swift.min(N - 1, Int(Foundation.floor(tMax)))

                if a <= b {
                    let tStart = firstAlphabetDigitAtOrAbove(Double(a), m: N)
                    if tStart <= b {
                        var t = tStart
                        while t <= b {
                            let vPrime = rho * node.s - c.im * Double(t)
                            let sPrime = (2.0 * c.re / rho) * vPrime - rho * node.v
                            if Swift.abs(sPrime) <= enclosure.se {
                                let nextWord = node.word + [t]
                                if Swift.abs(sPrime) < trap.S && Swift.abs(vPrime) < trap.V {
                                    return SearchResult(
                                        verdict: interiorVerdict(isLensParameter),
                                        depth: k,
                                        word: nextWord,
                                        nodesExplored: totalNodes + nextQueue.count + 1,
                                        trapRegion: trap.region
                                    )
                                }
                                nextQueue.append((sPrime, vPrime, nextWord))
                                if nextQueue.count >= lMax {
                                    return SearchResult(verdict: .undetermined, depth: k, nodesExplored: totalNodes + nextQueue.count)
                                }
                            }
                            t += 2
                        }
                    }
                }
            }

            totalNodes += nextQueue.count
            if nextQueue.isEmpty {
                return SearchResult(verdict: .exterior, depth: k, nodesExplored: totalNodes)
            }
            queue = nextQueue
        }

        return SearchResult(verdict: .undetermined, depth: kMax, nodesExplored: totalNodes)
    }
}
