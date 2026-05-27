"""
Collinear Fractals GPU: Companion Software
Core inverse-iteration search utilities in Python.

This module separates theorem-level in-lens trap hits (``Interior``) from
exploratory off-lens trap hits (``Interior-offLens``).  Exterior verdicts are
produced by enclosure escape or enclosure-admissible tree exhaustion.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

DEFAULT_K_MAX = 37
DEFAULT_L_MAX = 1000
DEFAULT_TOL = 1e-8


def get_canonical_coordinates(u: complex, c: complex) -> Tuple[float, float]:
    """Return the slanted and vertical coordinates ``(ls, lv)`` of ``u``."""
    rho = abs(c)
    if rho == 0.0:
        raise ValueError("c must be nonzero")
    lv = u.imag
    ls = (c.real * u.imag + c.imag * u.real) / rho
    return ls, lv


def in_lens(c: complex, n: int) -> bool:
    """Return whether ``c`` lies in the non-real parameter lens ``X_n \\ R``."""
    rho = abs(c)
    N = 2 * n - 1
    return rho > 1.0 and c.imag != 0.0 and (rho * rho + 2.0 * abs(c.real) < N)


def choose_tail_depth(rho: float, tol: float = DEFAULT_TOL, min_m: int = 30, max_m: int = 2000) -> Tuple[int, bool]:
    """Choose ``M`` so that ``rho**(-M)/(rho-1) <= tol`` when the cap allows it."""
    if rho <= 1.0:
        raise ValueError("rho must be greater than 1")
    if tol <= 0.0:
        raise ValueError("tol must be positive")
    target = -math.log(tol * (rho - 1.0)) / math.log(rho)
    M = max(min_m, math.ceil(target))
    capped = M > max_m
    if capped:
        M = max_m
    return int(M), capped


def compute_enclosure_details(c: complex, n: int, tol: float = DEFAULT_TOL) -> Dict[str, Any]:
    """Return enclosure half-widths and truncation metadata."""
    rho = abs(c)
    if rho <= 1.0 or c.imag == 0.0:
        raise ValueError("c must satisfy |c| > 1 and Im(c) != 0 for enclosure bounds.")

    theta = math.atan2(c.imag, c.real)
    n_minus_1_for_difference = 2 * n - 2
    M, capped = choose_tail_depth(rho, tol)

    val_sum = 0.0
    for k in range(1, M + 1):
        val_sum += (rho ** -k) * abs(math.sin(k * theta))

    tail = (rho ** -M) / (rho - 1.0)
    ve = n_minus_1_for_difference * (val_sum + tail)
    se = n_minus_1_for_difference * abs(c.imag) / rho + ve / rho

    return {
        "se": se,
        "ve": ve,
        "truncation_depth": M,
        "tail": tail,
        "tail_certified_to_tol": tail <= tol,
        "tail_cap_hit": capped,
    }


def compute_enclosure(c: complex, n: int, tol: float = DEFAULT_TOL) -> Tuple[float, float]:
    """Return rigorous upper bounds ``(se, ve)`` for the canonical enclosure."""
    d = compute_enclosure_details(c, n, tol)
    return d["se"], d["ve"]


def get_trap_half_widths(c: complex, n: int) -> Dict[str, Any]:
    """Return trap half-widths and whether the in-lens or off-lens rule was used."""
    rho = abs(c)
    N = 2 * n - 1
    if in_lens(c, n):
        return {
            "S": (N * abs(c.imag)) / rho,
            "V": max(0.0, ((N - 2.0 * abs(c.real)) * abs(c.imag)) / (rho * rho)),
            "region": "lens",
        }
    n_prime = (N + 1) / 2.0
    kappa = 1 + math.floor(-2.0 - 2.0 * math.sqrt(n_prime) + n_prime) if n_prime > 7 else 1
    return {
        "S": ((N - 1) * abs(c.imag)) / rho,
        "V": (kappa * abs(c.imag)) / (rho * rho),
        "region": "off-lens",
    }


def first_alphabet_digit_at_or_above(a: float, m: int) -> int:
    """First digit in ``A_m={-m+1,-m+3,...,m-1}`` greater than or equal to ``a``."""
    parity = (m - 1) % 2
    t = math.ceil(a)
    if (t - parity) % 2 != 0:
        t += 1
    return int(t)


def _interior_verdict(is_lens_parameter: bool) -> str:
    return "Interior" if is_lens_parameter else "Interior-offLens"


def inverse_iteration_test(
    c: complex,
    n: int,
    k_max: int = DEFAULT_K_MAX,
    l_max: int = DEFAULT_L_MAX,
    tol: float = DEFAULT_TOL,
) -> Dict[str, Any]:
    """Perform the inverse-iteration test for the marked point ``2c``."""
    rho = abs(c)
    if rho <= 1.0 or c.imag == 0.0:
        return {
            "verdict": "Undetermined",
            "depth": 0,
            "nodes_explored": 0,
            "reason": "c outside domain (|c| > 1 and Im(c) != 0)",
        }

    N = 2 * n - 1
    is_lens_parameter = in_lens(c, n)

    try:
        se, ve = compute_enclosure(c, n, tol)
    except ValueError as exc:
        return {"verdict": "Undetermined", "depth": 0, "nodes_explored": 0, "reason": str(exc)}

    trap = get_trap_half_widths(c, n)
    S = trap["S"]
    V = trap["V"]
    trap_region = "lens" if is_lens_parameter else "off-lens"

    s0 = (4.0 * c.real * c.imag) / rho
    v0 = 2.0 * c.imag

    if abs(s0) > se or abs(v0) > ve:
        return {"verdict": "Exterior", "depth": 0, "nodes_explored": 1}

    if abs(s0) < S and abs(v0) < V:
        return {
            "verdict": _interior_verdict(is_lens_parameter),
            "depth": 0,
            "nodes_explored": 1,
            "trap_region": trap_region,
        }

    W: List[Tuple[float, float, List[int]]] = [(s0, v0, [])]
    total_nodes = 1

    for k in range(1, k_max + 1):
        W_prime: List[Tuple[float, float, List[int]]] = []
        for s, v, word in W:
            t1 = (rho * s - ve) / c.imag
            t2 = (rho * s + ve) / c.imag
            t_min = min(t1, t2)
            t_max = max(t1, t2)

            a = max(-N + 1, math.ceil(t_min))
            b = min(N - 1, math.floor(t_max))

            if a <= b:
                t_start = first_alphabet_digit_at_or_above(a, N)
                for t in range(t_start, b + 1, 2):
                    v_prime = rho * s - c.imag * t
                    s_prime = (2.0 * c.real / rho) * v_prime - rho * v

                    if abs(s_prime) <= se:
                        next_word = word + [t]
                        if abs(s_prime) < S and abs(v_prime) < V:
                            return {
                                "verdict": _interior_verdict(is_lens_parameter),
                                "depth": k,
                                "word": next_word,
                                "nodes_explored": total_nodes + len(W_prime) + 1,
                                "trap_region": trap_region,
                            }
                        W_prime.append((s_prime, v_prime, next_word))
                        if len(W_prime) >= l_max:
                            return {
                                "verdict": "Undetermined",
                                "depth": k,
                                "nodes_explored": total_nodes + len(W_prime),
                            }

        total_nodes += len(W_prime)
        if not W_prime:
            return {"verdict": "Exterior", "depth": k, "nodes_explored": total_nodes}
        W = W_prime

    return {"verdict": "Undetermined", "depth": k_max, "nodes_explored": total_nodes}
