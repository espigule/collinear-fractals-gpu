import { sampleHistogramAttractor } from '../src/renderers/attractor_histogram.mjs';

self.addEventListener('message', event => {
  const job = event.data || {};
  try {
    const points = [];
    const metadata = sampleHistogramAttractor(job, (re, im, piece) => {
      points.push({ re, im, piece });
    });
    self.postMessage({
      ok: true,
      id: job.id,
      metadata: { ...metadata, renderer: 'seeded-histogram-worker' },
      points
    });
  } catch (error) {
    self.postMessage({ ok: false, id: job.id, error: error.message || String(error) });
  }
});
