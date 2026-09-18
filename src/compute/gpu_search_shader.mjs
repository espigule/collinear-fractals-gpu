/**
 * A bounded binary32 visual preview of the binary64 inverse search.
 *
 * The shader retains every admitted branch until a declared resource limit is
 * reached. Expanded enclosures, shrunken traps and propagated arithmetic error
 * make uncertain pixels unresolved. This is not an interval certificate; the
 * selected record and idle refinement continue to use the binary64 kernel.
 *
 * The numeric RGBA8 target stores (primary code, depth, secondary code, depth).
 * Parameter comparison uses M_n then M_n0. Dynamical mode uses half-difference
 * then full E(c,n); a disabled layer receives DOMAIN with depth zero. A second
 * RGBA8 target stores primary/secondary first-piece index+1 in R/G; zero means
 * no piece. Depth bytes therefore retain their original meaning.
 */
export const GPU_SEARCH_LIMITS = Object.freeze({
  frontier: 32,
  depth: 64,
  work: 2048,
  boundaryWork: 4096,
  tail: 48,
  alphabet: 63,
  minModulusGap: 1e-3,
  maxModulus: 64,
  minRelativeImaginary: 2 ** -12
});

export const GPU_SEARCH_CODES = Object.freeze({
  EXTERIOR: 0,
  INTERIOR: 1,
  OFF_LENS: 2,
  DEPTH_CAP: 3,
  NODE_CAP: 4,
  DOMAIN: 5,
  NUMERICAL: 6,
  WORK_CAP: 7,
  PRECISION_GUARD: 8
});

export const GPU_SEARCH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;

uniform int u_kind;
uniform vec2 u_center;
uniform vec2 u_span;
uniform vec2 u_resolution;
uniform vec2 u_c;
uniform int u_n;
uniform int u_kMax;
uniform int u_lMax;
uniform bool u_showDifference;
uniform bool u_showOriginal;
uniform vec4 u_fixedEnclosure;
uniform vec2 u_fixedTrap;
uniform bool u_fixedLens;
uniform vec2 u_fixedOriginalTrap;
uniform bool u_fixedOriginalLens;
uniform bool u_originalBoundary;
uniform bool u_firstLevelPieces;
uniform int u_escapeDepth;
uniform int u_boundaryWork;
uniform float u_pixelRadius;
layout(location = 0) out vec4 outClassification;
layout(location = 1) out vec4 outPieces;

const int FRONTIER = ${GPU_SEARCH_LIMITS.frontier};
const int MAX_DEPTH = ${GPU_SEARCH_LIMITS.depth};
const int MAX_WORK = ${GPU_SEARCH_LIMITS.work};
const int MAX_BOUNDARY_WORK = ${GPU_SEARCH_LIMITS.boundaryWork};
const int TAIL_TERMS = ${GPU_SEARCH_LIMITS.tail};
const int MAX_ALPHABET = ${GPU_SEARCH_LIMITS.alphabet};
const float UNIT = 1.1920928955078125e-7;
// This also covers legal flush-to-zero of binary32 subnormal intermediates.
const float TINY_ERROR = 1.0e-35;
const float MIN_GAP = 0.001;
const float MAX_MODULUS = 64.0;
const float MIN_RELATIVE_Y = 0.000244140625;

struct Parameter {
  vec2 c;
  vec2 dc;
  float rho;
  float drho;
  float a;
  float da;
  vec2 unitC;
  vec2 dUnitC;
  int errorCode;
};

bool invalidFloat(float x) {
  return isnan(x) || isinf(x) || abs(x) > 1.0e30;
}

bool invalidPair(vec2 x) {
  return invalidFloat(x.x) || invalidFloat(x.y);
}

vec2 complexProduct(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

Parameter prepareParameter(vec2 c, vec2 dc) {
  Parameter p;
  p.c = c;
  p.dc = dc;
  p.rho = 0.0;
  p.drho = 0.0;
  p.a = 0.0;
  p.da = 0.0;
  p.unitC = vec2(0.0);
  p.dUnitC = vec2(0.0);
  p.errorCode = 0;
  if (invalidPair(c) || invalidPair(dc)) {
    p.errorCode = 6;
    return p;
  }
  if (c.y == 0.0 || (c.x == 0.0 && c.y == 0.0)) {
    p.errorCode = 5;
    return p;
  }
  p.rho = length(c);
  p.drho = length(dc) + 8.0 * UNIT * p.rho;
  float rhoLower = p.rho - p.drho;
  if (invalidFloat(p.rho) || invalidFloat(p.drho)) {
    p.errorCode = 6;
    return p;
  }
  if (rhoLower - 1.0 < MIN_GAP || p.rho + p.drho > MAX_MODULUS ||
      abs(c.y) - dc.y < MIN_RELATIVE_Y * (p.rho + p.drho)) {
    p.errorCode = 8;
    return p;
  }
  p.unitC = c / p.rho;
  p.dUnitC = dc / rhoLower + abs(c) * p.drho / (rhoLower * p.rho)
    + 8.0 * UNIT * abs(p.unitC) + vec2(TINY_ERROR);
  p.a = 2.0 * p.unitC.x;
  p.da = 2.0 * p.dUnitC.x;
  return p;
}

Parameter parameterAtPixel(vec2 raw, vec2 dRaw) {
  if (invalidPair(raw) || invalidPair(dRaw)) {
    Parameter bad = prepareParameter(vec2(0.0), vec2(0.0));
    bad.errorCode = 6;
    return bad;
  }
  float rhoRaw = length(raw);
  if (rhoRaw == 0.0 || raw.y == 0.0) {
    return prepareParameter(raw, dRaw);
  }
  float dNorm = length(dRaw) + 8.0 * UNIT * rhoRaw;
  if (rhoRaw < 0.0078125 || rhoRaw > 128.0 ||
      abs(rhoRaw - 1.0) <= dNorm) {
    Parameter bad = prepareParameter(vec2(0.0), vec2(0.0));
    bad.errorCode = 8;
    return bad;
  }
  if (rhoRaw < 1.0) {
    // The gate above prevents a tiny divisor or an uncertain reciprocal choice.
    vec2 c = vec2(raw.x, -raw.y) / dot(raw, raw);
    float e = dNorm / (rhoRaw * (rhoRaw - dNorm));
    vec2 dc = vec2(e) + 16.0 * UNIT * abs(c) + vec2(TINY_ERROR);
    return prepareParameter(c, dc);
  }
  return prepareParameter(raw, dRaw);
}

// Enclosure for one unit of digit radius. No trigonometric functions are used:
// GLSL does not specify sufficient sin/atan accuracy for an enclosure bound.
vec2 baseEnclosure(Parameter p) {
  float rhoLower = p.rho - p.drho;
  float qUpper = (1.0 + 8.0 * UNIT) / rhoLower;
  vec2 q = vec2(p.c.x, -p.c.y) / dot(p.c, p.c);
  float dq = length(p.dc) / (rhoLower * rhoLower)
    + 16.0 * UNIT * (abs(q.x) + abs(q.y)) + TINY_ERROR;
  vec2 power = vec2(1.0, 0.0);
  float powerError = 0.0;
  float sum = 0.0;
  float sumError = 0.0;
  float tailPower = 1.0;
  for (int k = 0; k < TAIL_TERMS; ++k) {
    vec2 previous = power;
    power = complexProduct(previous, q);
    float products = (abs(previous.x) + abs(previous.y)) *
      (abs(q.x) + abs(q.y));
    powerError = qUpper * powerError +
      dq * (abs(previous.x) + abs(previous.y) + powerError) +
      8.0 * UNIT * products + TINY_ERROR;
    sumError += powerError + 4.0 * UNIT * (sum + abs(power.y)) + TINY_ERROR;
    sum += abs(power.y);
    tailPower = tailPower * qUpper * (1.0 + 8.0 * UNIT) + TINY_ERROR;
  }
  float tail = tailPower / (rhoLower - 1.0) * (1.0 + 8.0 * UNIT) + TINY_ERROR;
  float ve = (sum + sumError + tail) * (1.0 + 8.0 * UNIT);
  float se = ((abs(p.c.y) + p.dc.y) / rhoLower + ve / rhoLower)
    * (1.0 + 8.0 * UNIT);
  return vec2(se, ve);
}

// Exact integer evaluation avoids a sqrt/floor discontinuity at square n.
int offLensKappa(int n) {
  if (n <= 7) return 1;
  int ceilTwiceRoot = 12;
  for (int j = 1; j <= 12; ++j) {
    if (j * j >= 4 * n) {
      ceilTwiceRoot = j;
      break;
    }
  }
  return n - 1 - ceilTwiceRoot;
}

vec2 parameterTrap(Parameter p, int m, out bool isLens, out bool reliable) {
  float lensValue = p.rho * p.rho + 2.0 * abs(p.c.x) - float(m);
  float lensError = 2.0 * dot(abs(p.c), p.dc) + dot(p.dc, p.dc)
    + 2.0 * p.dc.x + 16.0 * UNIT *
      (p.rho * p.rho + 2.0 * abs(p.c.x) + float(m) + 1.0);
  isLens = lensValue < -lensError;
  reliable = abs(lensValue) > lensError;
  float rhoUpper = p.rho + p.drho;
  float yLower = max(0.0, abs(p.c.y) - p.dc.y);
  float S;
  float V;
  if (isLens) {
    S = float(m) * yLower / rhoUpper;
    V = max(0.0, float(m) - 2.0 * (abs(p.c.x) + p.dc.x)) *
      yLower / (rhoUpper * rhoUpper);
  } else {
    S = float(m - 1) * yLower / rhoUpper;
    V = float(offLensKappa(u_n)) * yLower / (rhoUpper * rhoUpper);
  }
  return max(vec2(0.0), vec2(S, V) * (1.0 - 32.0 * UNIT) - vec2(TINY_ERROR));
}

// The original alphabet has its own canonical lens and trap. In particular,
// neither the difference-set lens nor its exploratory off-lens trap applies.
vec2 originalTrap(Parameter p, int m, out bool enabled) {
  float lensValue = p.rho * p.rho + 2.0 * abs(p.c.x) - float(m);
  float lensError = 2.0 * dot(abs(p.c), p.dc) + dot(p.dc, p.dc)
    + 2.0 * p.dc.x + 16.0 * UNIT *
      (p.rho * p.rho + 2.0 * abs(p.c.x) + float(m) + 1.0);
  enabled = lensValue < -lensError;
  if (!enabled) return vec2(0.0);
  float rhoUpper = p.rho + p.drho;
  float yLower = max(0.0, abs(p.c.y) - p.dc.y);
  vec2 trap = vec2(float(m) * yLower / rhoUpper,
    max(0.0, float(m) - 2.0 * (abs(p.c.x) + p.dc.x)) * yLower / (rhoUpper * rhoUpper));
  return max(vec2(0.0), trap * (1.0 - 32.0 * UNIT) - vec2(TINY_ERROR));
}

vec4 initialNode(Parameter p, vec2 z, vec2 dz) {
  float s = p.unitC.x * z.y + p.unitC.y * z.x;
  float es = abs(p.unitC.x) * dz.y + abs(p.unitC.y) * dz.x
    + p.dUnitC.x * (abs(z.y) + dz.y)
    + p.dUnitC.y * (abs(z.x) + dz.x)
    + 4.0 * UNIT * (abs(p.unitC.x * z.y) + abs(p.unitC.y * z.x))
    + TINY_ERROR;
  return vec4(s, z.y, es, dz.y);
}

vec4 inverseNode(Parameter p, vec4 node, float t) {
  float v = p.rho * node.x - p.c.y * t;
  float ev = p.rho * node.z + p.drho * (abs(node.x) + node.z)
    + abs(t) * p.dc.y
    + 4.0 * UNIT * (abs(p.rho * node.x) + abs(p.c.y * t)) + TINY_ERROR;
  float s = p.a * v - p.rho * node.y;
  float es = abs(p.a) * ev + p.da * (abs(v) + ev)
    + p.rho * node.w + p.drho * (abs(node.y) + node.w)
    + 4.0 * UNIT * (abs(p.a * v) + abs(p.rho * node.y)) + TINY_ERROR;
  // Inflate the nonnegative error arithmetic itself against rounding down.
  return vec4(s, v, es * (1.0 + 16.0 * UNIT), ev * (1.0 + 16.0 * UNIT));
}

bool outsideEnclosure(vec4 node, vec2 enclosure) {
  return abs(node.x) - node.z > enclosure.x || abs(node.y) - node.w > enclosure.y;
}

bool insideTrap(vec4 node, vec2 trap) {
  return abs(node.x) + node.z < trap.x && abs(node.y) + node.w < trap.y;
}

ivec2 search(Parameter p, vec2 z, vec2 dz, int m, vec2 enclosure,
             vec2 trap, bool useTrap, bool isLens) {
  if (p.errorCode != 0) return ivec2(p.errorCode, 0);
  if (m < 2 || m > MAX_ALPHABET) return ivec2(8, 0);
  if (invalidPair(enclosure) || any(lessThanEqual(enclosure, vec2(0.0))) ||
      invalidPair(trap) || invalidPair(z) || invalidPair(dz)) return ivec2(6, 0);
  vec4 root = initialNode(p, z, dz);
  if (outsideEnclosure(root, enclosure)) return ivec2(0, 0);
  if (useTrap && insideTrap(root, trap)) return ivec2(isLens ? 1 : 2, 0);
  if (u_kMax == 0) return ivec2(3, 0);

  // Two banks avoid a whole-frontier copy between depths. Only initialized
  // slots below the current count are ever read.
  vec4 queue[FRONTIER * 2];
  queue[0] = root;
  int offset = 0;
  int count = 1;
  int work = 0;
  int limit = min(u_lMax, FRONTIER);
  for (int depth = 1; depth <= MAX_DEPTH; ++depth) {
    int nextOffset = FRONTIER - offset;
    int nextCount = 0;
    for (int parent = 0; parent < FRONTIER; ++parent) {
      if (parent >= count) break;
      vec4 node = queue[offset + parent];
      // Enumerating the bounded alphabet avoids rounded floor/ceil endpoints
      // and division by Im(c) silently dropping an admissible digit.
      for (int digit = 0; digit < MAX_ALPHABET; ++digit) {
        if (digit >= m) break;
        if (work >= MAX_WORK) return ivec2(7, depth);
        ++work;
        float t = float(2 * digit - (m - 1));
        vec4 child = inverseNode(p, node, t);
        if (invalidPair(child.xy) || invalidPair(child.zw)) return ivec2(6, depth);
        if (outsideEnclosure(child, enclosure)) continue;
        if (useTrap && insideTrap(child, trap)) return ivec2(isLens ? 1 : 2, depth);
        // At this uncertainty scale the preview has ceased to resolve geometry.
        if (max(child.z, child.w) > 0.25 * max(enclosure.x, enclosure.y)) {
          return ivec2(8, depth);
        }
        ++nextCount;
        // Reaching either the requested or physical width cap is unresolved.
        // Check before writing so no frontier entry is ever replaced or lost.
        if (nextCount >= limit) return ivec2(4, depth);
        queue[nextOffset + nextCount - 1] = child;
      }
    }
    if (nextCount == 0) return ivec2(0, depth);
    if (depth >= u_kMax) return ivec2(3, depth);
    offset = nextOffset;
    count = nextCount;
  }
  // A renderer-imposed depth ceiling is not a completed user depth request.
  return ivec2(7, MAX_DEPTH);
}

// Depth-first original-attractor search retains the current path and each
// ancestor's next digit. It never discards a frontier to manufacture escape.
// The third component is a zero-based first-piece index, or -1 if unavailable.
vec4 originalInverseNode(Parameter p, vec4 node, float digit) {
  vec2 shifted = node.xy - vec2(digit, 0.0);
  // Store a Euclidean error radius, not a repeatedly boxed component interval.
  // Complex multiplication expands a disk by |c|; component boxes would grow
  // by |Re(c)|+|Im(c)| and lose useful precision artificially at every step.
  float shiftedError = node.z + 4.0 * UNIT *
    (abs(node.x) + abs(digit) + abs(node.y)) + TINY_ERROR;
  vec2 point = complexProduct(p.c, shifted);
  vec2 products = vec2(abs(p.c.x) * abs(shifted.x) + abs(p.c.y) * abs(shifted.y),
    abs(p.c.x) * abs(shifted.y) + abs(p.c.y) * abs(shifted.x));
  float error = (p.rho + p.drho) * shiftedError + length(p.dc) * length(shifted)
    + 8.0 * UNIT * length(products) + TINY_ERROR;
  return vec4(point, error * (1.0 + 16.0 * UNIT), 0.0);
}

bool outsideOriginal(vec4 cartesian, vec4 canonical, vec2 enclosure, float disk, float radius) {
  return outsideEnclosure(canonical, enclosure + vec2(radius)) ||
    length(cartesian.xy) - length(cartesian.zw) > disk + radius;
}

ivec3 originalSearch(Parameter p, vec2 z, vec2 dz, int m, vec2 enclosure,
                     vec2 trap, bool useTrap, bool complement) {
  if (p.errorCode != 0) return ivec3(p.errorCode, 0, -1);
  if (m < 2 || m > MAX_ALPHABET) return ivec3(8, 0, -1);
  if (invalidPair(enclosure) || any(lessThanEqual(enclosure, vec2(0.0))) ||
      invalidPair(trap) || invalidPair(z) || invalidPair(dz)) return ivec3(6, 0, -1);
  vec4 root = initialNode(p, z, dz);
  float rootRadius = u_kind == 3 ? u_pixelRadius : 0.0;
  float disk = float(m - 1) * (p.rho + p.drho) / (p.rho - p.drho - 1.0) * (1.0 + 16.0 * UNIT);
  if (outsideOriginal(vec4(z, dz), root, enclosure, disk, rootRadius)) return ivec3(0, 0, -1);
  if (!complement && !u_firstLevelPieces && useTrap && insideTrap(root, trap - vec2(rootRadius))) return ivec3(1, 0, -1);
  if (u_escapeDepth == 0) return ivec3(3, 0, -1);
  vec4 path[MAX_DEPTH + 1];
  int nextDigit[MAX_DEPTH + 1];
  float radii[MAX_DEPTH + 1];
  path[0] = vec4(z, length(dz) * (1.0 + 8.0 * UNIT), 0.0);
  nextDigit[0] = 0;
  radii[0] = rootRadius;
  int level = 0;
  int firstPiece = -1;
  int work = 0;
  int deepest = 0;
  int workLimit = min(u_boundaryWork, MAX_BOUNDARY_WORK);
  // Each candidate push can cause at most one later pop; the independent loop
  // bound is a safety ceiling, separate from the requested candidate budget.
  for (int step = 0; step < 2 * MAX_BOUNDARY_WORK + MAX_DEPTH + 1; ++step) {
    int alphabet = level == 0 && complement ? m - 1 : m;
    int digit = nextDigit[level];
    if (digit >= alphabet) {
      if (level == 0) return ivec3(0, deepest, -1);
      --level;
      continue;
    }
    if (work >= workLimit) return ivec3(7, deepest, -1);
    ++work;
    nextDigit[level] = digit + 1;
    float t = float(2 * digit - (alphabet - 1));
    vec4 childCartesian = originalInverseNode(p, path[level], t);
    vec4 child = initialNode(p, childCartesian.xy, vec2(childCartesian.z));
    float radius = radii[level] == 0.0 ? 0.0 :
      radii[level] * (p.rho + p.drho) * (1.0 + 8.0 * UNIT) + TINY_ERROR;
    int depth = level + 1;
    deepest = max(deepest, depth);
    if (invalidPair(childCartesian.xy) || invalidPair(childCartesian.zw) ||
        invalidPair(child.xy) || invalidPair(child.zw) || invalidFloat(radius)) return ivec3(6, depth, -1);
    if (outsideOriginal(childCartesian, child, enclosure, disk, radius)) continue;
    int piece = level == 0 ? digit : firstPiece;
    if (useTrap && insideTrap(child, trap - vec2(radius))) return ivec3(1, depth, piece);
    if (max(child.z, child.w) > 0.25 * (max(enclosure.x, enclosure.y) + radius)) return ivec3(8, depth, -1);
    if (depth >= u_escapeDepth) return ivec3(3, depth, piece);
    if (depth >= MAX_DEPTH) return ivec3(7, depth, -1);
    if (level == 0) firstPiece = digit;
    level = depth;
    path[level] = childCartesian;
    nextDigit[level] = 0;
    radii[level] = radius;
  }
  return ivec3(7, deepest, -1);
}

void main() {
  ivec2 primary = ivec2(5, 0);
  ivec2 secondary = ivec2(5, 0);
  ivec2 pieces = ivec2(0);
  outPieces = vec4(0.0);
  if (u_n < 2 || u_n > 32 || u_kMax < 0 || u_lMax < 1 ||
      any(lessThanEqual(u_resolution, vec2(0.0)))) {
    outClassification = vec4(6.0, 0.0, 6.0, 0.0) / 255.0;
    return;
  }
  // gl_FragCoord has an upward y axis, as do the mathematical world coordinates.
  vec2 offset = (gl_FragCoord.xy / u_resolution - vec2(0.5)) * u_span;
  vec2 world = u_center + offset;
  vec2 dWorld = 8.0 * UNIT *
    (abs(u_center) + abs(offset) + abs(u_span) + vec2(1.0));
  if (u_kind == 3) {
    Parameter p = prepareParameter(u_c, 4.0 * UNIT * (abs(u_c) + vec2(1.0)));
    vec2 trap = max(vec2(0.0), u_fixedTrap - 16.0 * UNIT *
      max(vec2(1.0), abs(u_fixedTrap)));
    if (u_showDifference) {
      vec2 enclosure = u_fixedEnclosure.xy + 16.0 * UNIT *
        max(vec2(1.0), abs(u_fixedEnclosure.xy));
      primary = search(p, 2.0 * world, 2.0 * dWorld, 2 * u_n - 1,
        enclosure, trap, true, u_fixedLens);
    }
    if (u_showOriginal) {
      vec2 enclosure = u_fixedEnclosure.zw + 16.0 * UNIT *
        max(vec2(1.0), abs(u_fixedEnclosure.zw));
      if (u_originalBoundary) {
        vec2 originalTrapBounds = max(vec2(0.0), u_fixedOriginalTrap - 16.0 * UNIT *
          max(vec2(1.0), abs(u_fixedOriginalTrap)));
        bool originalLensReliable;
        originalTrapBounds = min(originalTrapBounds, originalTrap(p, u_n, originalLensReliable));
        ivec3 original = originalSearch(p, world, dWorld, u_n, enclosure,
          originalTrapBounds, u_fixedOriginalLens && originalLensReliable, false);
        secondary = original.xy;
        pieces.y = original.z + 1;
      } else {
        secondary = search(p, world, dWorld, u_n, enclosure, vec2(0.0), false, false);
      }
    }
  } else if ((u_kind >= 0 && u_kind <= 2) || u_kind == 4) {
    Parameter p = parameterAtPixel(world, dWorld);
    if (p.errorCode != 0) {
      primary = ivec2(p.errorCode, 0);
      if (u_kind == 2) secondary = primary;
    } else {
      vec2 base = baseEnclosure(p);
      if (u_kind == 0 || u_kind == 2) {
        bool isLens;
        bool reliable;
        vec2 trap = parameterTrap(p, 2 * u_n - 1, isLens, reliable);
        primary = search(p, 2.0 * p.c, 2.0 * p.dc, 2 * u_n - 1,
          float(2 * u_n - 2) * base * (1.0 + 8.0 * UNIT),
          trap, reliable, isLens);
      }
      if (u_kind == 1 || u_kind == 2 || u_kind == 4) {
        bool originalLens;
        vec2 originalTrapBounds = originalTrap(p, u_n, originalLens);
        ivec3 original = originalSearch(p, p.c, p.dc, u_n,
          float(u_n - 1) * base * (1.0 + 8.0 * UNIT), originalTrapBounds, originalLens, u_kind == 4);
        if (u_kind == 1 || u_kind == 4) { primary = original.xy; pieces.x = original.z + 1; }
        else { secondary = original.xy; pieces.y = original.z + 1; }
      }
    }
  } else {
    primary = ivec2(6, 0);
  }
  outClassification = vec4(vec2(primary), vec2(secondary)) / 255.0;
  outPieces = vec4(vec2(pieces), 0.0, 0.0) / 255.0;
}
`;
