"""Floating-point inverse search for the expanding parameter c (|c| > 1).

``Interior`` is an in-lens trap hit; ``Interior-offLens`` is exploratory.
Results are numerical evidence, not outward-rounded or exact certificates.
"""

from __future__ import annotations

import math
from numbers import Complex, Integral, Real
from typing import Any, Dict, List, Tuple

DEFAULT_K_MAX = 37
DEFAULT_L_MAX = 1000
DEFAULT_TOL = 1e-8
_MAX_SAFE_INTEGER = 2**53 - 1
_MAX_ORDER = _MAX_SAFE_INTEGER // 2


def _finite_real(value: Real, name: str) -> None:
    try:
        valid = isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)
    except OverflowError:
        valid = False
    if not valid:
        raise TypeError(f"{name} must be a finite real number")


def _integer(value: int, name: str, minimum: int, maximum: int = _MAX_SAFE_INTEGER) -> None:
    _finite_real(value, name)
    if not isinstance(value, Integral) or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer from {minimum} to {maximum}")


def _parameter(c: complex, name: str = "c") -> None:
    if not isinstance(c, Complex) or isinstance(c, bool):
        raise TypeError(f"{name} must be a finite complex number")
    _finite_real(c.real, f"Re({name})")
    _finite_real(c.imag, f"Im({name})")


def _order(n: int) -> None:
    _integer(n, "n", 2, _MAX_ORDER)


def _tolerance(tol: float) -> None:
    _finite_real(tol, "tol")
    if tol <= 0:
        raise ValueError("tol must be positive")


def get_canonical_coordinates(u: complex, c: complex) -> Tuple[float, float]:
    """Return finite slanted and vertical coordinates ``(ls, lv)`` of ``u``."""
    _parameter(u, "u")
    _parameter(c)
    rho = math.hypot(c.real, c.imag)
    if rho == 0 or not math.isfinite(rho):
        raise ValueError("c must have a finite, nonzero modulus")
    ls = (c.real / rho) * u.imag + (c.imag / rho) * u.real
    if not math.isfinite(ls):
        raise ValueError("canonical coordinate exceeds numerical range")
    return ls, u.imag


def in_lens(c: complex, n: int) -> bool:
    """Test the non-real parameter lens; ``c`` uses the expanding convention."""
    _parameter(c)
    _order(n)
    rho = math.hypot(c.real, c.imag)
    return rho > 1 and c.imag != 0 and rho * rho + 2 * abs(c.real) < 2 * n - 1


def choose_tail_depth(rho: float, tol: float = DEFAULT_TOL, min_m: int = 30, max_m: int = 2000) -> Tuple[int, bool]:
    """Choose M for ``rho**(-M)/(rho-1) <= tol``, subject to a finite cap."""
    _finite_real(rho, "rho")
    _tolerance(tol)
    _integer(min_m, "min_m", 0)
    _integer(max_m, "max_m", min_m)
    if rho <= 1:
        raise ValueError("rho must be greater than 1")
    # Separate logarithms avoid underflow of tol * (rho - 1).
    target = -(math.log(tol) + math.log(rho - 1)) / math.log(rho)
    if target > max_m:
        return max_m, True
    M = max(min_m, math.ceil(target))
    while M < max_m and (rho ** -M) / (rho - 1) > tol:
        M += 1
    return M, (rho ** -M) / (rho - 1) > tol


def compute_enclosure_details(c: complex, n: int, tol: float = DEFAULT_TOL) -> Dict[str, Any]:
    """Compute numerical enclosure half-widths, retaining the entire tail."""
    _parameter(c)
    _order(n)
    _tolerance(tol)
    rho = math.hypot(c.real, c.imag)
    if not math.isfinite(rho) or rho <= 1 or c.imag == 0:
        raise ValueError("c must have finite |c| > 1 and Im(c) != 0 for enclosure bounds")
    theta = math.atan2(c.imag, c.real)
    multiplier = 2 * n - 2
    M, capped = choose_tail_depth(rho, tol)
    val_sum = sum((rho ** -k) * abs(math.sin(k * theta)) for k in range(1, M + 1))
    tail = (rho ** -M) / (rho - 1)
    ve = multiplier * (val_sum + tail)
    se = multiplier * (abs(c.imag) / rho) + ve / rho
    if not math.isfinite(se) or not math.isfinite(ve):
        raise ValueError("enclosure exceeds numerical range")
    return {
        "se": se, "ve": ve, "truncation_depth": M, "tail": tail,
        "tail_certified_to_tol": tail <= tol, "tail_cap_hit": capped,
    }


def compute_enclosure(c: complex, n: int, tol: float = DEFAULT_TOL) -> Tuple[float, float]:
    """Return floating-point evaluations of the analytic enclosure bounds."""
    details = compute_enclosure_details(c, n, tol)
    return details["se"], details["ve"]


def get_trap_half_widths(c: complex, n: int) -> Dict[str, Any]:
    """Return trap half-widths and the in-lens or exploratory off-lens rule."""
    _parameter(c)
    _order(n)
    rho = math.hypot(c.real, c.imag)
    if not math.isfinite(rho) or rho <= 1 or c.imag == 0:
        raise ValueError("c must have finite |c| > 1 and Im(c) != 0 for trap bounds")
    N = 2 * n - 1
    normalized_y = abs(c.imag) / rho
    if in_lens(c, n):
        return {
            "S": N * normalized_y,
            "V": max(0, ((N - 2 * abs(c.real)) / rho) * normalized_y),
            "region": "lens",
        }
    kappa = 1 + math.floor(-2 - 2 * math.sqrt(n) + n) if n > 7 else 1
    return {"S": (N - 1) * normalized_y, "V": (kappa / rho) * normalized_y, "region": "off-lens"}


def first_alphabet_digit_at_or_above(a: float, m: int) -> int:
    """Return the first integer >= a with parity m-1 (not clipped to A_m)."""
    _finite_real(a, "a")
    _integer(m, "m", 1)
    t = math.ceil(a)
    if (t - (m - 1)) % 2:
        t += 1
    if not -_MAX_SAFE_INTEGER <= t <= _MAX_SAFE_INTEGER:
        raise ValueError("next parity-compatible integer exceeds numerical range")
    return t


def _result(verdict: str, depth: int, nodes: int, stop_reason: str, **extra: Any) -> Dict[str, Any]:
    return {"verdict": verdict, "depth": depth, "word": [], "nodes_explored": nodes, "stop_reason": stop_reason, **extra}


def inverse_iteration_test(
    c: complex, n: int, k_max: int = DEFAULT_K_MAX, l_max: int = DEFAULT_L_MAX,
    tol: float = DEFAULT_TOL,
) -> Dict[str, Any]:
    """Search inverse images of 2c; invalid arguments raise before any search."""
    _parameter(c)
    _order(n)
    _integer(k_max, "k_max", 0)
    _integer(l_max, "l_max", 1)
    _tolerance(tol)

    def numerical_range(depth: int, nodes: int) -> Dict[str, Any]:
        return _result("Undetermined", depth, nodes, "numerical-range", reason="calculation exceeds finite floating-point range")

    rho = math.hypot(c.real, c.imag)
    if not math.isfinite(rho):
        return numerical_range(0, 0)
    if rho <= 1 or c.imag == 0:
        return _result("Undetermined", 0, 0, "outside-domain", reason="c outside domain (|c| > 1 and Im(c) != 0)")
    N = 2 * n - 1
    is_lens_parameter = in_lens(c, n)
    se, ve = compute_enclosure(c, n, tol)
    trap = get_trap_half_widths(c, n)
    S, V = trap["S"], trap["V"]

    def interior(depth: int, nodes: int, word: List[int]) -> Dict[str, Any]:
        return _result("Interior" if is_lens_parameter else "Interior-offLens", depth, nodes,
                       "trap-hit", word=word, trap_region=trap["region"])

    s0 = (4 * (c.real / rho)) * c.imag
    v0 = 2 * c.imag
    if not all(math.isfinite(value) for value in (s0, v0, S, V)):
        return numerical_range(0, 0)
    if abs(s0) > se or abs(v0) > ve:
        return _result("Exterior", 0, 1, "enclosure-escape")
    if abs(s0) < S and abs(v0) < V:
        return interior(0, 1, [])

    frontier: List[Tuple[float, float, List[int]]] = [(s0, v0, [])]
    total_nodes = 1
    slant_factor = 2 * (c.real / rho)
    for k in range(1, k_max + 1):
        next_frontier: List[Tuple[float, float, List[int]]] = []
        for s, v, word in frontier:
            rho_s = rho * s
            if not math.isfinite(rho_s):
                return numerical_range(k, total_nodes + len(next_frontier))
            t1 = (rho_s - ve) / c.imag
            t2 = (rho_s + ve) / c.imag
            # Ratios may overflow near the real axis. Clip before integer conversion.
            lower = max(-N + 1, min(t1, t2))
            upper = min(N - 1, max(t1, t2))
            if lower > upper:
                continue
            a, b = math.ceil(lower), math.floor(upper)
            for t in range(first_alphabet_digit_at_or_above(a, N), b + 1, 2):
                v_prime = rho_s - c.imag * t
                s_prime = slant_factor * v_prime - rho * v
                if not math.isfinite(s_prime) or not math.isfinite(v_prime):
                    return numerical_range(k, total_nodes + len(next_frontier))
                if abs(s_prime) > se:
                    continue
                next_word = word + [t]
                if abs(s_prime) < S and abs(v_prime) < V:
                    return interior(k, total_nodes + len(next_frontier) + 1, next_word)
                next_frontier.append((s_prime, v_prime, next_word))
                if len(next_frontier) >= l_max:
                    return _result("Undetermined", k, total_nodes + len(next_frontier), "node-cap", reason="frontier reached l_max")
        total_nodes += len(next_frontier)
        if not next_frontier:
            return _result("Exterior", k, total_nodes, "tree-exhausted")
        frontier = next_frontier
    return _result("Undetermined", k_max, total_nodes, "depth-cap", reason="search reached k_max")
