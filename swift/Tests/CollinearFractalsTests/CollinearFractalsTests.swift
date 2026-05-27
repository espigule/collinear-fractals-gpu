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

    func testAlphabetParity() {
        XCTAssertEqual(CollinearFractals.firstAlphabetDigitAtOrAbove(-3.1, m: 5), -2)
        XCTAssertEqual(CollinearFractals.firstAlphabetDigitAtOrAbove(-3.1, m: 4), -3)
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
}
