import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inverseIterationTestDetailed } from '../src/compute/inverse_search_reference.mjs';
import { buildCertificatePayload } from '../src/compute/certificate_builder.mjs';

const require = createRequire(import.meta.url);
const { inverseIterationTest } = require('../javascript/index.js');
const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = relative => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const index = readJSON('examples/examples.json');
const verdicts = new Set(['Interior', 'Interior-offLens', 'Exterior', 'Undetermined']);
let checked = 0;

// Replay only the fields that specify a search outcome. Transcendental enclosure
// coordinates can differ in their last bits between JavaScript runtimes.
for (const item of index.examples) {
  const directory = path.join(root, item.path);
  for (const filename of readdirSync(directory).filter(name => /^certificate.*\.json$/.test(name)).sort()) {
    const relative = `${item.path}/${filename}`;
    const record = readJSON(relative);
    const input = record.input_parameter ?? record.c;
    const computed = inverseIterationTestDetailed(
      input.re, input.im, record.n, record.k_max, record.L_max, record.tol
    );
    const replay = buildCertificatePayload(computed, {
      n: record.n, c: input, kMax: record.k_max, LMax: record.L_max,
      tol: record.tol, softwareVersion: record.software_version
    });
    for (const key of ['n', 'N', 'c', 'verdict', 'depth', 'word', 'stop_reason', 'in_lens', 'proof_status']) {
      assert.deepEqual(replay[key], record[key], `${relative}: ${key} changed`);
    }
    // Package calls use the exported effective c, not reciprocal browser input.
    if (record.c !== null) {
      const packageResult = inverseIterationTest(
        record.c.re, record.c.im, record.n, record.k_max, record.L_max, record.tol
      );
      for (const key of ['verdict', 'depth', 'word']) {
        assert.deepEqual(packageResult[key], record[key], `${relative}: package ${key} differs`);
      }
      assert.equal(packageResult.stopReason, record.stop_reason, `${relative}: package termination differs`);
    } else {
      assert.equal(record.verdict, 'Undetermined', `${relative}: null c cannot be decisive`);
      assert.equal(record.stop_reason, 'numerical-range', `${relative}: null c requires a numerical-range limit`);
    }
    checked++;
  }

  const config = readJSON(item.config);
  const metadata = readJSON(item.metadata);
  const cases = config.cases ?? [{
    parameter: config.parameter,
    expected_verdict: metadata.expected_verdict,
    expected_depth: metadata.expected_depth,
    expected_word: metadata.expected_word
  }];
  for (const entry of cases) {
    if (!verdicts.has(entry.expected_verdict)) continue;
    const result = inverseIterationTest(
      entry.parameter.re, entry.parameter.im, config.n, config.k_max, config.l_max, config.tol ?? 1e-8
    );
    const label = `${item.id}/${entry.id ?? 'default'}`;
    assert.equal(result.verdict, entry.expected_verdict, `${label}: expected verdict changed`);
    if (entry.expected_depth !== undefined) assert.equal(result.depth, entry.expected_depth, `${label}: depth changed`);
    if (entry.expected_word !== undefined) assert.deepEqual(result.word, entry.expected_word, `${label}: inverse word changed`);
    checked++;
  }
}

console.log(`Replayed ${checked} curated records and preset expectations successfully.`);
console.log('Floating-point reproducibility checks do not provide interval verification.');
