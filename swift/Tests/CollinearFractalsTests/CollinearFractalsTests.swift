import XCTest
@testable import CollinearFractals

final class CollinearFractalsTests: XCTestCase {
    func testDefaultKMax() throws {
        XCTAssertEqual(defaultKMax, 37)
    }

    func testCanonicalCoordinates() throws {
        let coords = try CollinearFractals.canonicalCoordinates(z: Complex(1.0, 1.0), c: Complex(0.6, 0.8))
        XCTAssertEqual(coords.lv, 1.0, accuracy: 1e-12)
        XCTAssertEqual(coords.ls, 1.4, accuracy: 1e-12)
    }

    func testLensPredicate() {
        XCTAssertTrue(CollinearFractals.inLens(Complex(0.5, 1.2), n: 3))
        XCTAssertFalse(CollinearFractals.inLens(Complex(2.0, 2.0), n: 3))
    }

    func testAlphabetParity() throws {
        XCTAssertEqual(try CollinearFractals.firstAlphabetDigitAtOrAbove(-3.1, m: 5), -2)
        XCTAssertEqual(try CollinearFractals.firstAlphabetDigitAtOrAbove(-3.1, m: 4), -3)
    }

    func testEnclosure() throws {
        let enc = try CollinearFractals.computeEnclosure(Complex(0.7, 1.4), n: 3)
        XCTAssertGreaterThan(enc.se, 0.0)
        XCTAssertGreaterThan(enc.ve, 0.0)
        XCTAssertTrue(enc.tailCertifiedToTolerance)
        XCTAssertEqual(enc.se, 6.876046013381387, accuracy: 1e-9)
        XCTAssertEqual(enc.ve, 5.162714411636048, accuracy: 1e-9)
    }

    func testInteriorSearch() {
        let result = CollinearFractals.inverseIterationTest(Complex(0.5, 1.1), n: 3)
        XCTAssertEqual(result.verdict, .interior)
    }

    func testExteriorSearch() {
        let result = CollinearFractals.inverseIterationTest(Complex(3.0, 3.0), n: 3)
        XCTAssertEqual(result.verdict, .exterior)
    }

    func testOffLensLabel() {
        let c = Complex(1.419643377607, 0.606290729207)
        XCTAssertFalse(CollinearFractals.inLens(c, n: 3))
        let result = CollinearFractals.inverseIterationTest(c, n: 3)
        XCTAssertEqual(result.verdict, .interiorOffLens)
    }

    func testInvalidInputsDoNotTrap() {
        for n in [Int.min, -1, 0, 1, Int.max] {
            XCTAssertFalse(CollinearFractals.inLens(Complex(0.5, 1.1), n: n))
            let result = CollinearFractals.inverseIterationTest(Complex(3, 3), n: n)
            XCTAssertEqual(result.verdict, .undetermined)
            XCTAssertEqual(result.stopReason, "invalid-input")
            XCTAssertThrowsError(try CollinearFractals.computeEnclosure(Complex(0.5, 1.1), n: n))
        }
        for c in [Complex(.nan, 1), Complex(1, .infinity)] {
            XCTAssertEqual(CollinearFractals.inverseIterationTest(c, n: 3).stopReason, "invalid-input")
            XCTAssertThrowsError(try CollinearFractals.canonicalCoordinates(z: Complex(1, 1), c: c))
        }
        XCTAssertEqual(CollinearFractals.inverseIterationTest(Complex(3, 3), n: 3, kMax: -1).stopReason, "invalid-input")
        XCTAssertEqual(CollinearFractals.inverseIterationTest(Complex(3, 3), n: 3, lMax: 0).stopReason, "invalid-input")
        XCTAssertEqual(CollinearFractals.inverseIterationTest(Complex(3, 3), n: 3, tol: .nan).stopReason, "invalid-input")
        XCTAssertThrowsError(try CollinearFractals.firstAlphabetDigitAtOrAbove(.infinity, m: 5))
        XCTAssertThrowsError(try CollinearFractals.trapHalfWidths(Complex(0, 0), n: 3))
    }

    func testTailDepthUnderflowAndCaps() throws {
        let tiny = try CollinearFractals.chooseTailDepth(rho: Double(1).nextUp, tol: .leastNonzeroMagnitude)
        XCTAssertEqual(tiny.M, 2000)
        XCTAssertTrue(tiny.capped)
        let zero = try CollinearFractals.chooseTailDepth(rho: 2, tol: 1, minM: 0, maxM: 0)
        XCTAssertEqual(zero.M, 0)
        XCTAssertFalse(zero.capped)
        XCTAssertThrowsError(try CollinearFractals.chooseTailDepth(rho: 1.1, minM: -1))
        XCTAssertThrowsError(try CollinearFractals.chooseTailDepth(rho: 1.1, minM: 30, maxM: 29))
        let enc = try CollinearFractals.computeEnclosure(Complex(1, 1e-6), n: 3)
        XCTAssertTrue(enc.tailCapHit)
        XCTAssertFalse(enc.tailCertifiedToTolerance)
        XCTAssertGreaterThanOrEqual(enc.ve, 4 * enc.tail)
    }

    func testNumericalRangeIsNotExterior() throws {
        let coords = try CollinearFractals.canonicalCoordinates(z: Complex(1, 1), c: Complex(1e308, 1e308))
        XCTAssertEqual(coords.ls, Double(2).squareRoot(), accuracy: 1e-12)
        let result = CollinearFractals.inverseIterationTest(Complex(1e308, 1e308), n: 3)
        XCTAssertEqual(result.verdict, .undetermined)
        XCTAssertEqual(result.stopReason, "numerical-range")
    }

    func testZeroDepthAndNodeCap() {
        let c = Complex(1.419643377607, 0.606290729207)
        let zero = CollinearFractals.inverseIterationTest(c, n: 3, kMax: 0)
        XCTAssertEqual(zero.stopReason, "depth-cap")
        XCTAssertEqual(zero.depth, 0)
        XCTAssertEqual(zero.nodesExplored, 1)
        let capped = CollinearFractals.inverseIterationTest(c, n: 3, lMax: 1)
        XCTAssertEqual(capped.verdict, .undetermined)
        XCTAssertEqual(capped.stopReason, "node-cap")
        XCTAssertEqual(capped.depth, 1)
        XCTAssertEqual(capped.nodesExplored, 2)
    }

    func testNearRealDigitBoundsDoNotOverflowInt() {
        let result = CollinearFractals.inverseIterationTest(Complex(1.1, .leastNonzeroMagnitude), n: 2, kMax: 2, lMax: 20)
        XCTAssertEqual(result.stopReason, "depth-cap")
        XCTAssertEqual(result.depth, 2)
    }

    func testOutsideDomain() {
        for c in [Complex(0, 0), Complex(2, 0), Complex(0, 1), Complex(0.2, 0.3)] {
            XCTAssertEqual(CollinearFractals.inverseIterationTest(c, n: 3).stopReason, "outside-domain")
        }
    }

    func testWitnessReplayInCartesianCoordinates() throws {
        let c = Complex(1.419643377607, 0.606290729207)
        let result = CollinearFractals.inverseIterationTest(c, n: 3)
        XCTAssertEqual(result.word, [4, 0])
        var u = Complex(2 * c.re, 2 * c.im)
        for t in result.word {
            XCTAssertTrue((-4...4).contains(t) && t % 2 == 0)
            u = Complex(c.re * (u.re - Double(t)) - c.im * u.im, c.im * (u.re - Double(t)) + c.re * u.im)
        }
        let coords = try CollinearFractals.canonicalCoordinates(z: u, c: c)
        let trap = try CollinearFractals.trapHalfWidths(c, n: 3)
        XCTAssertLessThan(abs(coords.ls), trap.S)
        XCTAssertLessThan(abs(coords.lv), trap.V)
    }

    func testConjugationPreservesSearch() {
        for n in [2, 3, 8] {
            for c in [Complex(0.5, 1.1), Complex(1.2, 0.9), Complex(1.6, 0.4), Complex(2.2, 1.2), Complex(0.01, 1.05)] {
                let upper = CollinearFractals.inverseIterationTest(c, n: n, kMax: 12, lMax: 100)
                let lower = CollinearFractals.inverseIterationTest(Complex(c.re, -c.im), n: n, kMax: 12, lMax: 100)
                XCTAssertEqual(lower.verdict, upper.verdict)
                XCTAssertEqual(lower.depth, upper.depth)
                XCTAssertEqual(lower.word, upper.word)
            }
        }
    }
}
