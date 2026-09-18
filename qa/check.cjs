#!/usr/bin/env node
'use strict';

const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON || 'python';

function run(label, executable, args, cwd = root) {
  console.log(`\n${label}`);
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(file);
    return /\.(?:c?js|mjs)$/.test(entry.name) ? [file] : [];
  });
}

for (const file of ['explorer.js', ...['src', 'workers', 'qa'].flatMap(dir => javascriptFiles(path.join(root, dir)))]) {
  run(`Syntax: ${path.relative(root, path.resolve(root, file))}`, process.execPath, ['--check', file]);
}
run('Static bundle and publication checks', python, ['tools/validate_bundle.py']);
run('JSON schemas and curated data', python, ['tools/validate_schemas.py']);
run('Reproducible README attractor figures', process.execPath, ['tools/docs/generate_attractor_examples.mjs', '--check']);
run('Reproducible README parameter lens', python, ['tools/docs/generate_parameter_lens.py', '--check']);
run('Curated finite-search records', process.execPath, ['examples/verify_search_records.mjs']);
run('JavaScript reference package', process.execPath, ['test.js'], path.join(root, 'javascript'));
run('Python reference package and cross-language regressions', python, ['-m', 'unittest', 'discover', '-v'], path.join(root, 'python'));

// Every standalone Node regression in qa is part of the same local/CI command.
for (const file of readdirSync(__dirname).filter(name => /(?:test|tests)\.(?:js|mjs)$/.test(name)).sort()) {
  run(`Regression: ${file}`, process.execPath, [path.join(__dirname, file)]);
}
run('Renderer metadata benchmark', process.execPath, ['tools/bench/render_metadata_bench.js']);
run('Deployment integrity regressions', python, ['tools/test_stage_site.py']);
run('Public staging and deployment manifest integrity', python, ['tools/stage_site.py']);
console.log('\nAll non-browser checks passed.');
