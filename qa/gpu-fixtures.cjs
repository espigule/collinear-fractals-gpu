'use strict';

// Static inputs for the production WebGL fragment shader, not a second search
// implementation. A 1 x 1 job samples its center exactly. Most jobs use a broad
// span; the explicitly focused off-lens fixture reduces camera roundoff.
// Dedicated integration tests cover the deep-zoom fallback.
// Classification channels are (primary code, depth, secondary code, depth):
// 0 exterior; 1 lens trap; 2 exploratory off-lens trap; 3 depth cap;
// 4 queue cap; 5 unsupported domain; 6 numerical range; 7 work cap;
// 8 precision uncertainty. These are display results, never certificates.
const PARAMETER_JOB = {
  kind: 'parameter', width: 1, height: 1, spanX: 12,
  n: 3, cx: 0, cy: 2, kMax: 12, LMax: 32, tol: 1e-8,
  escapeDepth: 12, boundaryWork: 20000,
  parameterMode: 'compare', showDifference: true,
  showOriginalSurvival: true, showEscapeStrata: true, survivalOpacity: 0.45
};

const DYNAMICAL_JOB = {
  ...PARAMETER_JOB, kind: 'dynamical', n: 4, cx: 0, cy: 2, originalRenderer: 'survival'
};

// Surviving branches can meet subdivision boundaries even when the queried
// point is well inside the full attractor. A conservative precision response
// is allowed there. The shader's bounded queue/work can also stop before the
// requested depth. None of these outcomes asserts membership or permits an
// opposed decisive classification.
const SURVIVAL_CODES = [3, 4, 7, 8];

const CORE_GPU_FIXTURES = [
  {
    name: 'parameter: wide-margin lens trap',
    job: { ...PARAMETER_JOB, center: { x: 0.5, y: 1.1 } },
    primary: [1], secondary: [1], cpuRole: 'compare',
    rationale: 'Both the Mn trap and the independent canonical original-alphabet trap capture this point at depth zero.'
  },
  {
    name: 'parameter: exact M30 finite expansion stays a finite survivor',
    job: { ...PARAMETER_JOB, center: { x: 1, y: 1 }, kMax: 8 },
    primary: [1], secondary: SURVIVAL_CODES, cpuRole: 'compare',
    rationale: 'c=1+i=2-2/c gives digits [2,-2,0,...] in A3. Mn reaches its lens trap; original DFS survival does not assert interior without the canonical original trap.'
  },
  {
    name: 'parameter: Mn and Rn have distinct outcomes',
    job: { ...PARAMETER_JOB, center: { x: 1.2, y: 0.9 }, n: 2 },
    primary: [2, 8], secondary: [0], cpuRole: 'compare',
    rationale: 'Mn reaches an exploratory off-lens trap at depth 7; a span-12 camera rounding allowance may grow to precision uncertainty before that hit. Independent Cartesian inverse enumeration exhausts Rn.'
  },
  {
    name: 'parameter: conjugation preserves the separating outcomes',
    job: { ...PARAMETER_JOB, center: { x: 1.2, y: -0.9 }, n: 2 },
    primary: [2, 8], secondary: [0], cpuRole: 'compare',
    rationale: 'Conjugation preserves the real digit alphabet and exercises negative-imaginary digit intervals without changing either classification.'
  },
  {
    name: 'parameter: focused off-lens trap',
    job: { ...PARAMETER_JOB, center: { x: 1.2, y: 0.9 }, n: 2, spanX: 0.1 },
    primary: [2], secondary: [0], cpuRole: 'compare',
    rationale: 'A focused camera reduces the coordinate rounding allowance enough to distinguish the depth-seven off-lens trap from uncertainty.'
  },
  {
    name: 'parameter: exterior beyond the independent disk bound',
    job: { ...PARAMETER_JOB, center: { x: 3, y: 3 } },
    primary: [0], secondary: [0], cpuRole: 'compare',
    rationale: 'For n=3 and rho=sqrt(18), rho exceeds 2*rho/(rho-1), so c lies outside E(c,3); the doubled marked point likewise lies outside E(c,5).'
  },
  {
    name: 'parameter: finite tree exhaustion away from the initial bound',
    job: { ...PARAMETER_JOB, center: { x: 2.0719, y: 3.0537 }, n: 13 },
    primary: [0, 8], secondary: [0, 8], cpuRole: 'compare',
    rationale: 'Both CPU searches exhaust at depth 5 with fewer than 10 explored nodes. The wide camera float32 allowance can grow to uncertainty; neither channel may invent a trap hit.'
  },
  {
    name: 'parameter: reciprocal input normalizes both marked points',
    job: { ...PARAMETER_JOB, center: { x: 0.5, y: -0.5 }, kMax: 8 },
    primary: [1], secondary: SURVIVAL_CODES, cpuRole: 'compare',
    rationale: '1/(0.5-0.5i)=1+i exactly. Both parameter sets must use the expanding effective parameter and its correctly scaled marked point.'
  },

  // For c=2i, independent even/odd radix -4 expansions give the exact original
  // rectangle E(c,4)=[-4,4] x [-2,2]. E(c,7)/2 has the same rectangle.
  // Dynamical primary tests 2z in E(c,7); secondary tests z in E(c,4).
  // An accidental extra factor 1/c would shrink the original x bound to 1.
  {
    name: 'dynamical: original-scale positive interior',
    job: { ...DYNAMICAL_JOB, center: { x: 3, y: 0.75 } },
    primary: [1], secondary: SURVIVAL_CODES, cpuRole: 'dynamical',
    rationale: 'z=(3,0.75) lies inside the exact rectangle. The half-difference query 2z has strict trap margins 1 and 2; original-E survival remains unresolved.'
  },
  {
    name: 'dynamical: original-scale negative interior',
    job: { ...DYNAMICAL_JOB, center: { x: -3, y: -0.75 } },
    primary: [1], secondary: SURVIVAL_CODES, cpuRole: 'dynamical',
    rationale: 'Negation preserves the symmetric digit alphabet and the exact rectangle, exercising the opposite quadrant with the same strict trap margins.'
  },
  {
    name: 'dynamical: independent imaginary support',
    job: { ...DYNAMICAL_JOB, center: { x: 0, y: 1.5 } },
    primary: [1], secondary: SURVIVAL_CODES, cpuRole: 'dynamical',
    rationale: 'The imaginary interval is [-2,2], so z=1.5i survives in the original rectangle and 2z lies strictly inside the half-difference trap.'
  },
  {
    name: 'dynamical: beyond the real rectangle boundary',
    job: { ...DYNAMICAL_JOB, center: { x: 4.25, y: 0.75 } },
    primary: [0], secondary: [0], cpuRole: 'dynamical',
    rationale: 'The real coordinate exceeds the original and half-difference support by 0.25. Omitting the half-difference factor two would incorrectly accept this point.'
  },
  {
    name: 'dynamical: beyond the imaginary rectangle boundary',
    job: { ...DYNAMICAL_JOB, center: { x: 0, y: 2.25 } },
    primary: [0], secondary: [0], cpuRole: 'dynamical',
    rationale: 'The imaginary coordinate exceeds both displayed supports by 0.25; neither output may report survival or a trap hit.'
  },

  // Budget and domain controls are semantic assertions, not visual tolerances.
  {
    name: 'budget: zero depth is retained',
    job: { ...PARAMETER_JOB, center: { x: 1.2, y: 0.9 }, n: 2, kMax: 0, escapeDepth: 0 },
    primary: [3], secondary: [3], cpuRole: 'compare',
    rationale: 'Both initial points lie inside their enclosures but outside their applicable traps. Both independent depth budgets are explicitly zero.'
  },
  {
    name: 'budget: one-node queue cap is not exhaustion',
    job: { ...PARAMETER_JOB, center: { x: 1, y: 1 }, kMax: 8, LMax: 1 },
    primary: [4], secondary: [3, 8], cpuRole: 'compare',
    rationale: 'Mn reaches its one-node frontier cap, while original DFS retains its independent depth/work budget and may finish a branch; it has no frontier cap.'
  },
  {
    name: 'mode: legacy Rn alias uses canonical M_n0 without a false trap',
    job: { ...PARAMETER_JOB, center: { x: 1, y: 1 }, kMax: 8, parameterMode: 'rn' },
    primary: SURVIVAL_CODES, cpuRole: 'rn',
    rationale: 'Rn-only mode places its unresolved survival result in the primary channel and never borrows the Mn lens trap.'
  },
  {
    name: 'mode: Mn-only output retains the lens trap',
    job: { ...PARAMETER_JOB, center: { x: 0.5, y: 1.1 }, parameterMode: 'mn' },
    primary: [1], cpuRole: 'mn',
    rationale: 'Mn-only mode places the same wide-margin depth-zero lens trap in the primary channel.'
  },
  {
    name: 'domain: zero parameter remains unsupported',
    job: { ...PARAMETER_JOB, center: { x: 0, y: 0 } },
    primary: [5], secondary: [5], cpuRole: 'compare',
    rationale: 'The origin has no reciprocal and is outside the inverse-search domain; it must not become an exterior pixel.'
  },
  {
    name: 'domain: real expanding parameter remains unsupported',
    job: { ...PARAMETER_JOB, center: { x: 2, y: 0 } },
    primary: [5], secondary: [5], cpuRole: 'compare',
    rationale: 'The canonical two-coordinate search explicitly excludes real parameters, even when their modulus exceeds one.'
  },
  {
    name: 'domain: exact unit modulus remains unsupported',
    job: { ...PARAMETER_JOB, center: { x: 0, y: 1 } },
    primary: [5, 8], secondary: [5, 8], cpuRole: 'compare',
    rationale: 'At c=i the IFS does not contract. The float32 guard may report coordinate uncertainty across the unit circle, but neither channel may classify it decisively.'
  }
];

module.exports = { CORE_GPU_FIXTURES };
