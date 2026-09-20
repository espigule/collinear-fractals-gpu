#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Use --baseline-root=/path/to/an/unchanged/checkout to alternate old/current
// measurements within each scene. --source-root selects the primary checkout.
// No benchmark modules are imported from either external source tree.
const argumentsByName = new Map(process.argv.slice(2).map(argument => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument);
  if (!match) throw new TypeError(`Expected --name=value, received ${argument}`);
  return [match[1], match[2]];
}));
for (const name of argumentsByName.keys()) {
  if (!['source-root', 'baseline-root', 'width', 'runs', 'warmup'].includes(name)) {
    throw new RangeError(`Unknown benchmark option ${name}`);
  }
}
function integerOption(name, fallback, minimum, maximum) {
  const value = Number(argumentsByName.get(name) ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}
const sourceRoot = resolve(argumentsByName.get('source-root')
  ?? fileURLToPath(new URL('../../', import.meta.url)));
const width = integerOption('width', 24, 4, 128);
const runs = integerOption('runs', 5, 1, 20);
const warmup = integerOption('warmup', 2, 0, 10);
const { classifyParameterView } = await import(pathToFileURL(
  resolve(sourceRoot, 'src/compute/parameter_views.mjs')).href);
const baselineRoot = argumentsByName.has('baseline-root') ? resolve(argumentsByName.get('baseline-root')) : null;
const baselineClassifier = baselineRoot ? (await import(pathToFileURL(
  resolve(baselineRoot, 'src/compute/parameter_views.mjs')).href)).classifyParameterView : null;

const scenes = [
  { name: 'unit-circle-real', n: 3, center: [1, 0], span: .2 },
  { name: 'real-axis', n: 3, center: [1.5, 0], span: .1 },
  { name: 'unit-circle-imaginary', n: 3, center: [0, 1], span: .1 },
  { name: 'near-real-unit-circle', n: 3, center: [1.001, .0001], span: .0001 },
  { name: 'off-lens-complex-tree', n: 3, center: [1.419643377607, .606290729207], span: .08 },
  { name: 'off-lens-boundary', n: 4, center: [2, .5], span: .2 },
  { name: 'overview', n: 4, center: [1.5, 1.5], span: 3 }
];

function measure(scene, classifier = classifyParameterView) {
  const outcomes = {}, captureOutcomes = {}, minimumDepths = {};
  let coverageWork = 0, captureWork = 0;
  const parameterRadius = Math.SQRT1_2 * scene.span / width;
  const started = performance.now();
  for (let row = 0; row < width; row++) for (let column = 0; column < width; column++) {
    const x = scene.center[0] + scene.span * ((column + .5) / width - .5);
    const y = scene.center[1] + scene.span * ((row + .5) / width - .5);
    const result = classifier(x, y, scene.n, 37, 1000, 1e-8, 'mn',
      { parameterRadius, escapeDepth: 12 });
    outcomes[result.stopReason] = (outcomes[result.stopReason] ?? 0) + 1;
    coverageWork += result.work ?? 0;
    const sample = result.captureSample ?? result;
    const stop = sample.captureSearchStopReason ?? sample.stopReason;
    captureOutcomes[stop] = (captureOutcomes[stop] ?? 0) + 1;
    captureWork += result.captureSample?.work ?? 0;
    if (sample.minimumCaptureDepth !== null && sample.minimumCaptureDepth !== undefined) {
      minimumDepths[sample.minimumCaptureDepth] = (minimumDepths[sample.minimumCaptureDepth] ?? 0) + 1;
    }
  }
  return {
    milliseconds: performance.now() - started,
    coverage_candidate_maps: coverageWork,
    center_capture_candidate_maps: captureWork,
    coverage_outcomes: outcomes,
    center_capture_outcomes: captureOutcomes,
    minimum_depth_counts: minimumDepths
  };
}

const results = [];
for (const scene of scenes) {
  const current = [], baseline = [];
  for (let run = -warmup; run < runs; run++) {
    const candidates = baselineClassifier
      ? [[classifyParameterView, current], [baselineClassifier, baseline]]
      : [[classifyParameterView, current]];
    if (Math.abs(run % 2) === 1) candidates.reverse();
    for (const [classifier, destination] of candidates) {
      const sample = measure(scene, classifier);
      if (run >= 0) destination.push(sample);
    }
  }
  const summary = measured => {
    const times = measured.map(result => result.milliseconds).sort((a, b) => a - b);
    const { milliseconds: ignored, ...deterministic } = measured[0];
    for (const sample of measured.slice(1)) {
      const { milliseconds: alsoIgnored, ...same } = sample;
      if (JSON.stringify(same) !== JSON.stringify(deterministic)) {
        throw new Error(`Nondeterministic numerical output in scene ${scene.name}`);
      }
    }
    return { ...deterministic,
      median_milliseconds: Number(times[Math.floor(times.length / 2)].toFixed(3)),
      minimum_milliseconds: Number(times[0].toFixed(3)),
      maximum_milliseconds: Number(times.at(-1).toFixed(3)) };
  };
  const currentSummary = summary(current);
  const baselineSummary = baselineClassifier ? summary(baseline) : null;
  results.push({
    ...scene, samples: width * width, parameter_cell_radius: Math.SQRT1_2 * scene.span / width,
    ...currentSummary,
    ...(baselineSummary ? { baseline: baselineSummary,
      speedup: Number((baselineSummary.median_milliseconds / currentSummary.median_milliseconds).toFixed(3)) } : {})
  });
}
function sourceHashes(directory) {
  return Object.fromEntries([
    'src/compute/parameter_views.mjs', 'src/compute/attractor_membership.mjs',
    'src/compute/inverse_search_kernel.mjs', 'src/compute/inverse_search_reference.mjs',
    'src/compute/tree_guidance.mjs', 'src/math/connectedness_regions.mjs',
    'src/math/complex.mjs', 'src/math/validation.mjs'
  ].map(path => [path, existsSync(resolve(directory, path))
    ? createHash('sha256').update(readFileSync(resolve(directory, path))).digest('hex') : null]));
}
console.log(JSON.stringify({
  source_root: sourceRoot,
  source_sha256: sourceHashes(sourceRoot),
  ...(baselineRoot ? { baseline_source_root: baselineRoot, baseline_source_sha256: sourceHashes(baselineRoot),
    comparison_schedule: 'alternating-per-scene' } : {}),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  grid_width: width, measured_runs: runs, warmup_runs: warmup,
  escape_depth: 12, capture_depth: 37, candidate_limit_per_search: 20000,
  notes: [
    'End-to-end binary64 parameter classification includes context construction and independent center capture.',
    'Each pixel covers its complete circumscribed parameter disk; no scene is timed at point-only coverage.',
    'Separate deterministic work and evidence counts distinguish speed changes from omitted numerical work.',
    'Informational local CPU timings; not a GPU or browser performance guarantee.'
  ],
  results
}, null, 2));
