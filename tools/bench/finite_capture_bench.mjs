#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import {
  createAttractorMembershipContext, classifyAttractorParameterCell, classifyAttractorCapture
} from '../../src/compute/attractor_membership.mjs';

const widthArgument = process.argv.slice(2).find(value => value.startsWith('--width='));
const width = widthArgument ? Number(widthArgument.slice('--width='.length)) : 48;
if (!Number.isInteger(width) || width < 4 || width > 256) {
  throw new RangeError('--width must be an integer from 4 to 256');
}
const escapeDepth = 12, captureDepth = 37, maxWork = 20000, warmupRuns = 2, measuredRuns = 3;

function compute(samples, kind) {
  const counts = {}, depths = {};
  let work = 0, maximumWork = 0;
  const started = performance.now();
  for (const sample of samples) {
    const result = kind === 'coverage'
      ? classifyAttractorParameterCell(sample.context, escapeDepth, sample.options)
      : classifyAttractorCapture(sample.context,
        sample.scale * sample.context.x, sample.scale * sample.context.y, captureDepth, sample.options);
    const key = kind === 'coverage' ? result.status : result.captureSearchStopReason;
    counts[key] = (counts[key] ?? 0) + 1;
    work += result.work;
    maximumWork = Math.max(maximumWork, result.work);
    if (kind === 'capture' && result.minimumCaptureDepth !== null) {
      depths[result.minimumCaptureDepth] = (depths[result.minimumCaptureDepth] ?? 0) + 1;
    }
  }
  return {
    milliseconds: performance.now() - started,
    total_candidate_maps: work,
    mean_candidate_maps: work / samples.length,
    maximum_candidate_maps: maximumWork,
    outcomes: counts,
    ...(kind === 'capture' ? { minimum_depth_counts: depths } : {})
  };
}

const results = [];
for (const [n, layer] of [[4, 'mn'], [4, 'mn0'], [4, 'mn1'], [4, 'digit:3'], [32, 'mn']]) {
  const samples = [], upper = Math.sqrt(n), scale = layer === 'mn' ? 2 : 1;
  const parameterRadius = Math.SQRT1_2 * upper / width;
  for (let i = 0; i < width; i++) for (let j = 0; j < width; j++) {
    const x = (i + .5) * upper / width;
    const y = 1 + (j + .5) * (upper - 1) / width;
    samples.push({
      context: createAttractorMembershipContext(x, y, layer === 'mn' ? 2 * n - 1 : n),
      scale,
      options: {
        markedPointScale: scale, parameterRadius, maxWork, minimumCapture: false,
        firstLevelPieces: false,
        firstStep: layer === 'mn1' ? 'complement' : 'original',
        firstDigit: layer === 'digit:3' ? 3 : null
      }
    });
  }
  for (let run = 0; run < warmupRuns; run++) {
    compute(samples, 'coverage');
    compute(samples, 'capture');
  }
  const measured = { coverage: [], capture: [] };
  for (let run = 0; run < measuredRuns; run++) {
    for (const kind of ['coverage', 'capture']) measured[kind].push(compute(samples, kind));
  }
  const summary = {};
  for (const kind of ['coverage', 'capture']) {
    const times = measured[kind].map(result => result.milliseconds).sort((a, b) => a - b);
    const { milliseconds: ignored, ...deterministic } = measured[kind][0];
    summary[kind] = {
      ...deterministic,
      median_milliseconds: Number(times[Math.floor(times.length / 2)].toFixed(3))
    };
  }
  results.push({
    n, layer, samples: samples.length, marked_point_scale: scale,
    parameter_domain: { real: [0, upper], imaginary: [1, upper] },
    parameter_cell_radius: parameterRadius,
    ...summary
  });
}

console.log(JSON.stringify({
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  architecture: 'shared binary64 contexts; whole-parameter-cell DFS coverage; independent point-center minimum-capture IDDFS',
  grid_width: width,
  escape_depth: escapeDepth,
  capture_depth: captureDepth,
  max_candidate_maps_per_search: maxWork,
  warmup_runs: warmupRuns,
  measured_runs: measuredRuns,
  notes: [
    'Context construction is excluded: coverage and capture reuse the same geometry.',
    'Capture and coverage have independent work budgets; color style does not change either result.',
    'A minimum is returned only after all smaller depth limits finish; unavailable strict traps are skipped.',
    'The parameter-cell radius covers the larger coordinate pitch of the rectangular sample grid.',
    'Timings are informational local CPU measurements, not GPU or browser performance guarantees.'
  ],
  results
}, null, 2));
