import Foundation

public let defaultKMax = 37
public let defaultLMax = 1000
public let defaultTolerance = 1.0e-8

public struct Complex: Equatable, Sendable {
    public var re: Double
    public var im: Double
    public init(_ re: Double, _ im: Double) { self.re = re; self.im = im }
    public var abs: Double { Foundation.hypot(re, im) }
    public var isFinite: Bool { re.isFinite && im.isFinite }
}

/// Floating-point classifications, not outward-rounded or exact certificates.
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
    public let stopReason: String?

    public init(verdict: Verdict, depth: Int, word: [Int] = [], nodesExplored: Int, trapRegion: String? = nil, reason: String? = nil, stopReason: String? = nil) {
        self.verdict = verdict
        self.depth = depth
        self.word = word
        self.nodesExplored = nodesExplored
        self.trapRegion = trapRegion
        self.reason = reason
        self.stopReason = stopReason
    }
}

public enum CollinearFractalsError: Error, Equatable {
    case invalidParameter(String)
}

public enum CollinearFractals {
    // Keep the same exact integer alphabet range as the JavaScript/Python ports.
    private static let maxSafeInteger = 9_007_199_254_740_991
    private static let maxOrder = maxSafeInteger / 2

    private static func validOrder(_ n: Int) -> Bool { n >= 2 && n <= maxOrder }

    private static func validateOrder(_ n: Int) throws {
        guard validOrder(n) else { throw CollinearFractalsError.invalidParameter("n must be in 2...\(maxOrder)") }
    }

    private static func validateTolerance(_ tol: Double) throws {
        guard tol.isFinite && tol > 0 else { throw CollinearFractalsError.invalidParameter("tol must be finite and positive") }
    }

    public static func canonicalCoordinates(z: Complex, c: Complex) throws -> CanonicalCoordinates {
        let rho = c.abs
        guard z.isFinite && c.isFinite && rho.isFinite && rho > 0 else {
            throw CollinearFractalsError.invalidParameter("coordinates must be finite and c must have a finite, nonzero modulus")
        }
        let ls = (c.re / rho) * z.im + (c.im / rho) * z.re
        guard ls.isFinite else { throw CollinearFractalsError.invalidParameter("canonical coordinate exceeds numerical range") }
        return CanonicalCoordinates(ls: ls, lv: z.im)
    }

    /// Invalid inputs and points outside the non-real expanding lens return false.
    public static func inLens(_ c: Complex, n: Int) -> Bool {
        guard c.isFinite && validOrder(n) else { return false }
        let rho = c.abs
        return rho > 1 && c.im != 0 && rho * rho + 2 * Swift.abs(c.re) < Double(2 * n - 1)
    }

    public static func chooseTailDepth(rho: Double, tol: Double = defaultTolerance, minM: Int = 30, maxM: Int = 2000) throws -> (M: Int, capped: Bool) {
        guard rho.isFinite && rho > 1 else { throw CollinearFractalsError.invalidParameter("rho must be finite and greater than 1") }
        try validateTolerance(tol)
        guard minM >= 0 && maxM >= minM && maxM <= maxSafeInteger else {
            throw CollinearFractalsError.invalidParameter("require 0 <= minM <= maxM <= \(maxSafeInteger)")
        }
        let target = -(Foundation.log(tol) + Foundation.log(rho - 1)) / Foundation.log(rho)
        // Cap before converting Double to Int; near |c| = 1 the target can exceed Int.max.
        if target > Double(maxM) { return (maxM, true) }
        var M = target <= Double(minM) ? minM : Int(Foundation.ceil(target))
        while M < maxM && Foundation.pow(rho, -Double(M)) / (rho - 1) > tol { M += 1 }
        return (M, Foundation.pow(rho, -Double(M)) / (rho - 1) > tol)
    }

    public static func computeEnclosure(_ c: Complex, n: Int, tol: Double = defaultTolerance) throws -> Enclosure {
        try validateOrder(n)
        try validateTolerance(tol)
        let rho = c.abs
        guard c.isFinite && rho.isFinite && rho > 1 && c.im != 0 else {
            throw CollinearFractalsError.invalidParameter("c must have finite |c| > 1 and Im(c) != 0")
        }
        let theta = Foundation.atan2(c.im, c.re)
        let multiplier = Double(2 * n - 2)
        let depth = try chooseTailDepth(rho: rho, tol: tol)
        var valSum = 0.0
        if depth.M > 0 {
            for k in 1...depth.M {
                valSum += Foundation.pow(rho, -Double(k)) * Swift.abs(Foundation.sin(Double(k) * theta))
            }
        }
        // The complete tail remains in the enclosure even when the depth cap is hit.
        let tail = Foundation.pow(rho, -Double(depth.M)) / (rho - 1)
        let ve = multiplier * (valSum + tail)
        let se = multiplier * (Swift.abs(c.im) / rho) + ve / rho
        guard se.isFinite && ve.isFinite else { throw CollinearFractalsError.invalidParameter("enclosure exceeds numerical range") }
        return Enclosure(se: se, ve: ve, truncationDepth: depth.M, tail: tail, tailCertifiedToTolerance: tail <= tol, tailCapHit: depth.capped)
    }

    public static func trapHalfWidths(_ c: Complex, n: Int) throws -> Trap {
        try validateOrder(n)
        let rho = c.abs
        guard c.isFinite && rho.isFinite && rho > 1 && c.im != 0 else {
            throw CollinearFractalsError.invalidParameter("c must have finite |c| > 1 and Im(c) != 0")
        }
        let N = Double(2 * n - 1)
        let normalizedY = Swift.abs(c.im) / rho
        if inLens(c, n: n) {
            return Trap(S: N * normalizedY, V: Swift.max(0, ((N - 2 * Swift.abs(c.re)) / rho) * normalizedY), region: "lens")
        }
        let nPrime = Double(n)
        let kappa = n > 7 ? 1 + Foundation.floor(-2 - 2 * Foundation.sqrt(nPrime) + nPrime) : 1
        return Trap(S: (N - 1) * normalizedY, V: (kappa / rho) * normalizedY, region: "off-lens")
    }

    /// Parity-compatible ceiling; callers must intersect with the finite alphabet.
    public static func firstAlphabetDigitAtOrAbove(_ a: Double, m: Int) throws -> Int {
        guard a.isFinite && m >= 1 && m <= maxSafeInteger else {
            throw CollinearFractalsError.invalidParameter("a must be finite and m a positive safe integer")
        }
        let rounded = Foundation.ceil(a)
        guard rounded >= -Double(maxSafeInteger) && rounded <= Double(maxSafeInteger) else {
            throw CollinearFractalsError.invalidParameter("a must round to a safe integer")
        }
        var t = Int(rounded)
        if ((t % 2) + 2) % 2 != (m - 1) % 2 { t += 1 }
        guard t <= maxSafeInteger else { throw CollinearFractalsError.invalidParameter("next parity-compatible integer exceeds numerical range") }
        return t
    }

    /// Nonthrowing search: malformed input returns Undetermined with invalid-input.
    public static func inverseIterationTest(_ c: Complex, n: Int, kMax: Int = defaultKMax, lMax: Int = defaultLMax, tol: Double = defaultTolerance) -> SearchResult {
        guard c.isFinite && validOrder(n) && kMax >= 0 && kMax <= maxSafeInteger && lMax >= 1 && lMax <= maxSafeInteger && tol.isFinite && tol > 0 else {
            return SearchResult(verdict: .undetermined, depth: 0, nodesExplored: 0, reason: "invalid parameter or search budget", stopReason: "invalid-input")
        }
        func numericalRange(_ depth: Int, _ nodes: Int) -> SearchResult {
            SearchResult(verdict: .undetermined, depth: depth, nodesExplored: nodes, reason: "calculation exceeds finite floating-point range", stopReason: "numerical-range")
        }
        let rho = c.abs
        guard rho.isFinite else { return numericalRange(0, 0) }
        guard rho > 1 && c.im != 0 else {
            return SearchResult(verdict: .undetermined, depth: 0, nodesExplored: 0, reason: "c outside domain", stopReason: "outside-domain")
        }
        let N = 2 * n - 1
        let isLens = inLens(c, n: n)
        let enclosure: Enclosure
        let trap: Trap
        do {
            enclosure = try computeEnclosure(c, n: n, tol: tol)
            trap = try trapHalfWidths(c, n: n)
        } catch { return numericalRange(0, 0) }
        func interior(_ depth: Int, _ nodes: Int, _ word: [Int] = []) -> SearchResult {
            SearchResult(verdict: isLens ? .interior : .interiorOffLens, depth: depth, word: word, nodesExplored: nodes, trapRegion: trap.region, stopReason: "trap-hit")
        }
        let s0 = (4 * (c.re / rho)) * c.im
        let v0 = 2 * c.im
        guard s0.isFinite && v0.isFinite && trap.S.isFinite && trap.V.isFinite else { return numericalRange(0, 0) }
        if Swift.abs(s0) > enclosure.se || Swift.abs(v0) > enclosure.ve {
            return SearchResult(verdict: .exterior, depth: 0, nodesExplored: 1, stopReason: "enclosure-escape")
        }
        if Swift.abs(s0) < trap.S && Swift.abs(v0) < trap.V { return interior(0, 1) }
        var queue: [(s: Double, v: Double, word: [Int])] = [(s0, v0, [])]
        var totalNodes = 1
        let slantFactor = 2 * (c.re / rho)
        // Half-open range includes a valid zero-depth budget without constructing 1...0.
        for level in 0..<kMax {
            let k = level + 1
            var next: [(s: Double, v: Double, word: [Int])] = []
            for node in queue {
                let rhoS = rho * node.s
                guard rhoS.isFinite else { return numericalRange(k, totalNodes + next.count) }
                let t1 = (rhoS - enclosure.ve) / c.im
                let t2 = (rhoS + enclosure.ve) / c.im
                // Bound the real interval before integer conversion, including infinite ratios.
                let lower = Swift.max(Double(-N + 1), Swift.min(t1, t2))
                let upper = Swift.min(Double(N - 1), Swift.max(t1, t2))
                if lower > upper { continue }
                let a = Int(Foundation.ceil(lower))
                let b = Int(Foundation.floor(upper))
                var t = a
                if ((t % 2) + 2) % 2 != (N - 1) % 2 { t += 1 }
                while t <= b {
                    let vPrime = rhoS - c.im * Double(t)
                    let sPrime = slantFactor * vPrime - rho * node.v
                    guard sPrime.isFinite && vPrime.isFinite else { return numericalRange(k, totalNodes + next.count) }
                    if Swift.abs(sPrime) <= enclosure.se {
                        let word = node.word + [t]
                        if Swift.abs(sPrime) < trap.S && Swift.abs(vPrime) < trap.V { return interior(k, totalNodes + next.count + 1, word) }
                        next.append((sPrime, vPrime, word))
                        if next.count >= lMax {
                            return SearchResult(verdict: .undetermined, depth: k, nodesExplored: totalNodes + next.count, reason: "frontier reached lMax", stopReason: "node-cap")
                        }
                    }
                    t += 2
                }
            }
            totalNodes += next.count
            if next.isEmpty { return SearchResult(verdict: .exterior, depth: k, nodesExplored: totalNodes, stopReason: "tree-exhausted") }
            queue = next
        }
        return SearchResult(verdict: .undetermined, depth: kMax, nodesExplored: totalNodes, reason: "search reached kMax", stopReason: "depth-cap")
    }
}
