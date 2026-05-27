import { inverseSearchKernel } from '../src/compute/inverse_search_kernel.mjs';
import { buildCertificatePayload } from '../src/compute/certificate_builder.mjs';

self.addEventListener('message', event => {
  const job = event.data || {};
  try {
    const result = inverseSearchKernel(job);
    const certificate = buildCertificatePayload(result, {
      n: job.n,
      c: { re: job.x, im: job.y },
      kMax: job.kMax || 37,
      LMax: job.LMax || 1000,
      softwareVersion: job.softwareVersion || '0.2.0-alpha-candidate'
    });
    self.postMessage({ ok: true, result, certificate });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || String(error) });
  }
});
