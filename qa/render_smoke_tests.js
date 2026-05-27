#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeCanvasContext() {
  return {
    calls: [],
    fillStyle: '#000000',
    globalAlpha: 1,
    save() {
      this.calls.push(['save']);
    },
    restore() {
      this.calls.push(['restore']);
    },
    beginPath() {
      this.calls.push(['beginPath']);
    },
    arc(x, y, r) {
      this.calls.push(['arc', x, y, r]);
    },
    fill() {
      this.calls.push(['fill', this.fillStyle, this.globalAlpha]);
    },
    fillRect(x, y, w, h) {
      this.calls.push(['fillRect', x, y, w, h, this.fillStyle, this.globalAlpha]);
    }
  };
}

(async () => {
  const { choosePrefixDepth, prefixMetadata } = await import('../src/math/prefix_cylinders.mjs');
  const { renderPrefixAttractor } = await import('../src/renderers/attractor_prefix.mjs');
  const { makeLcg, renderHistogramAttractor } = await import('../src/renderers/attractor_histogram.mjs');

  const c = { re: 1.5, im: 1.6583123951777 };
  const choice = choosePrefixDepth(c, 5, 8, 60000);
  assert(choice.depth <= 8, 'Prefix depth exceeds requested depth.');
  assert(choice.estimatedPrefixes <= 60000, 'Prefix work cap was not enforced.');

  const metadata = prefixMetadata(c, 5, 8, 0.01, 60000);
  assert(metadata.renderer === 'prefix-cylinder', 'Prefix metadata has wrong renderer type.');
  assert(metadata.proof_status === 'visual-approximation', 'Prefix metadata overclaims proof status.');
  assert(metadata.tail_radius > 0, 'Prefix metadata should record a positive tail radius.');

  const ctx = fakeCanvasContext();
  const prefixResult = renderPrefixAttractor(ctx, {
    c,
    m: 4,
    requestedDepth: 4,
    maxPrefixes: 10000,
    pixelRadius: 0.02,
    project: (x, y) => ({ x, y }),
    opacity: 0.5,
    firstLevelPieces: true
  });
  assert(prefixResult.rendered_prefixes > 0, 'Prefix renderer produced no centers.');
  assert(ctx.calls.some(call => call[0] === 'arc'), 'Prefix renderer did not draw prefix cylinders.');

  const rngA = makeLcg(123456);
  const rngB = makeLcg(123456);
  const rngC = makeLcg(654321);
  const seqA = Array.from({ length: 8 }, () => rngA());
  const seqB = Array.from({ length: 8 }, () => rngB());
  const seqC = Array.from({ length: 8 }, () => rngC());
  assert(JSON.stringify(seqA) === JSON.stringify(seqB), 'Histogram RNG is not repeatable for a fixed seed.');
  assert(JSON.stringify(seqA) !== JSON.stringify(seqC), 'Histogram RNG does not respond to seed changes.');

  const histCtx = fakeCanvasContext();
  const histResult = renderHistogramAttractor(histCtx, {
    c,
    m: 5,
    seed: 123456,
    samples: 64,
    burnIn: 4,
    project: (x, y) => ({ x, y }),
    opacity: 0.5
  });
  assert(histResult.renderer === 'seeded-histogram', 'Histogram metadata has wrong renderer type.');
  assert(histCtx.calls.some(call => call[0] === 'fillRect'), 'Histogram renderer did not draw samples.');

  const explorer = fs.readFileSync(path.join(__dirname, '..', 'explorer.js'), 'utf8');
  assert(!explorer.includes('r = 255 - r'), 'Legacy color inversion remains in explorer.js.');
  assert(!explorer.includes('dilatedGrid'), 'Legacy dilation grid remains in explorer.js.');
  assert(!explorer.includes('3x3'), 'Legacy dilation wording remains in explorer.js.');
  assert(explorer.includes("rendererMode: 'prefix'"), 'Prefix-cylinder mode is not the default.');
  assert(explorer.includes("state.rendererMode === 'survival'"), 'Survival renderer is not explicit.');

  const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'examples.json'), 'utf8'));
  const ids = new Set(examples.examples.map(item => item.id));
  for (const id of ['e_c4_overlap', 'e_c5_plane_filling', 'hole_zoom_n13']) {
    assert(ids.has(id), `Missing renderer smoke example metadata for ${id}.`);
  }

  console.log('Renderer smoke tests passed.');
})();
