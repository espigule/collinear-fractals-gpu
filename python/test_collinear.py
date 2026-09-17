import math
import unittest

from collinear_fractals import (
    DEFAULT_K_MAX,
    get_canonical_coordinates,
    in_lens,
    choose_tail_depth,
    compute_enclosure,
    compute_enclosure_details,
    get_trap_half_widths,
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

    def test_interior_trap_hit(self):
        res = inverse_iteration_test(complex(0.5, 1.1), 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Interior")

    def test_exterior_escape(self):
        res = inverse_iteration_test(complex(3.0, 3.0), 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Exterior")

    def test_off_lens_label(self):
        c = complex(1.419643377607, 0.606290729207)
        self.assertFalse(in_lens(c, 3))
        res = inverse_iteration_test(c, 3, k_max=DEFAULT_K_MAX, l_max=1000)
        self.assertEqual(res["verdict"], "Interior-offLens")

    def test_invalid_inputs_are_rejected_before_initial_exit(self):
        for n in (0, 1, -2, 2.5, float("nan"), float("inf"), "3", True, 2**53 - 1):
            with self.subTest(n=n):
                with self.assertRaises((TypeError, ValueError)):
                    inverse_iteration_test(3 + 3j, n)
                with self.assertRaises((TypeError, ValueError)):
                    compute_enclosure(0.7 + 1.4j, n)
        for k, limit, tol in ((-1, 10, 1e-8), (1.5, 10, 1e-8), (1, 0, 1e-8),
                              (1, 1.5, 1e-8), (1, 10, 0), (1, 10, math.nan)):
            with self.assertRaises((TypeError, ValueError)):
                inverse_iteration_test(3 + 3j, 3, k, limit, tol)
        for bad in (math.nan, math.inf, -math.inf):
            with self.assertRaises(TypeError):
                inverse_iteration_test(complex(bad, 1), 3)
            with self.assertRaises(TypeError):
                get_canonical_coordinates(1 + 1j, complex(1, bad))
        with self.assertRaises(ValueError):
            get_trap_half_widths(0j, 3)
        with self.assertRaises(TypeError):
            first_alphabet_digit_at_or_above(math.inf, 5)

    def test_tail_depth_underflow_and_caps(self):
        self.assertEqual(choose_tail_depth(1 + 2**-52, 5e-324), (2000, True))
        self.assertEqual(choose_tail_depth(2, 1, 0, 0), (0, False))
        for lower, upper in ((-1, 10), (30, 29), (1.5, 10)):
            with self.assertRaises((TypeError, ValueError)):
                choose_tail_depth(1.1, 1e-8, lower, upper)
        enc = compute_enclosure_details(1 + 1e-6j, 3)
        self.assertTrue(enc["tail_cap_hit"])
        self.assertFalse(enc["tail_certified_to_tol"])
        self.assertGreaterEqual(enc["ve"], 4 * enc["tail"])

    def test_finite_arithmetic_range(self):
        ls, _ = get_canonical_coordinates(1 + 1j, complex(1e308, 1e308))
        self.assertAlmostEqual(ls, math.sqrt(2), places=12)
        result = inverse_iteration_test(complex(1e308, 1e308), 3)
        self.assertEqual(result["verdict"], "Undetermined")
        self.assertEqual(result["stop_reason"], "numerical-range")

    def test_outside_domain_is_not_reciprocally_normalized(self):
        for c in (0j, 2 + 0j, 1j, 0.2 + 0.3j):
            self.assertEqual(inverse_iteration_test(c, 3)["stop_reason"], "outside-domain")

    def test_search_budgets(self):
        c = complex(1.419643377607, 0.606290729207)
        zero = inverse_iteration_test(c, 3, k_max=0)
        self.assertEqual((zero["stop_reason"], zero["depth"], zero["nodes_explored"]), ("depth-cap", 0, 1))
        capped = inverse_iteration_test(c, 3, l_max=1)
        self.assertEqual((capped["verdict"], capped["stop_reason"], capped["depth"], capped["nodes_explored"]),
                         ("Undetermined", "node-cap", 1, 2))

    def test_infinite_digit_ratios_are_clipped_before_integer_conversion(self):
        result = inverse_iteration_test(complex(1.1, 5e-324), 2, k_max=2, l_max=20)
        self.assertEqual(result["stop_reason"], "depth-cap")
        self.assertEqual(result["depth"], 2)

    def test_witness_replayed_in_cartesian_coordinates(self):
        c = complex(1.419643377607, 0.606290729207)
        result = inverse_iteration_test(c, 3)
        self.assertEqual(result["word"], [4, 0])
        u = 2 * c
        for digit in result["word"]:
            self.assertIn(digit, range(-4, 5, 2))
            u = c * (u - digit)
        ls, lv = get_canonical_coordinates(u, c)
        trap = get_trap_half_widths(c, 3)
        self.assertLess(abs(ls), trap["S"])
        self.assertLess(abs(lv), trap["V"])

    def test_conjugation_preserves_search(self):
        for n in (2, 3, 8):
            for c in (0.5 + 1.1j, 1.2 + 0.9j, 1.6 + 0.4j, 2.2 + 1.2j, 0.01 + 1.05j):
                upper = inverse_iteration_test(c, n, 12, 100)
                lower = inverse_iteration_test(c.conjugate(), n, 12, 100)
                with self.subTest(n=n, c=c):
                    self.assertEqual(lower["verdict"], upper["verdict"])
                    self.assertEqual(lower["depth"], upper["depth"])
                    self.assertEqual(lower["word"], upper["word"])


if __name__ == "__main__":
    unittest.main()
