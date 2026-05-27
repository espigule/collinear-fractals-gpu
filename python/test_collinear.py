import unittest

from collinear_fractals import (
    DEFAULT_K_MAX,
    get_canonical_coordinates,
    in_lens,
    compute_enclosure,
    compute_enclosure_details,
    first_alphabet_digit_at_or_above,
    inverse_iteration_test,
)


class TestCollinearFractals(unittest.TestCase):
    def test_default_k_max(self):
        self.assertEqual(DEFAULT_K_MAX, 37)

    def test_canonical_coordinates(self):
        ls, lv = get_canonical_coordinates(complex(1.0, 1.0), complex(0.6, 0.8))
        self.assertAlmostEqual(lv, 1.0, places=12)
        self.assertAlmostEqual(ls, 1.4, places=12)

    def test_in_lens(self):
        self.assertTrue(in_lens(complex(0.5, 1.2), 3))
        self.assertFalse(in_lens(complex(2.0, 2.0), 3))

    def test_compute_enclosure(self):
        c = complex(0.7, 1.4)
        se, ve = compute_enclosure(c, 3)
        details = compute_enclosure_details(c, 3)
        self.assertTrue(se > 0.0)
        self.assertTrue(ve > 0.0)
        self.assertTrue(details["tail_certified_to_tol"])
        self.assertAlmostEqual(se, 6.876046013381387, places=9)
        self.assertAlmostEqual(ve, 5.162714411636048, places=9)

    def test_alphabet_parity(self):
        self.assertEqual(first_alphabet_digit_at_or_above(-3.1, 5), -2)
        self.assertEqual(first_alphabet_digit_at_or_above(-3.1, 4), -3)

    def test_interior_certification(self):
        res = inverse_iteration_test(complex(0.5, 1.1), 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Interior")

    def test_exterior_certification(self):
        res = inverse_iteration_test(complex(3.0, 3.0), 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Exterior")

    def test_off_lens_label(self):
        c = complex(1.419643377607, 0.606290729207)
        self.assertFalse(in_lens(c, 3))
        res = inverse_iteration_test(c, 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Interior-offLens")


if __name__ == "__main__":
    unittest.main()
