import { inverseSearchKernel } from '../src/compute/inverse_search_kernel.mjs';
import { buildCertificatePayload } from '../src/compute/certificate_builder.mjs';

self.addEventListener('message', event => {
  const job = event.data || {};
  try {
    // A certificate requires the actual witness, even if a caller requests a
    // verdict-only kernel for other jobs.
    const result = inverseSearchKernel({ ...job, details: true });
    const certificate = buildCertificatePayload(result, {
      n: job.n,
      c: { re: job.x, im: job.y },
      kMax: job.kMax ?? 37,
      LMax: job.LMax ?? 1000,
      tol: job.tol ?? 1e-8,
      softwareVersion: job.softwareVersion || '0.2.0-alpha'
    });
    self.postMessage({ ok: true, id: job.id, result, certificate });
  } catch (error) {
    self.postMessage({ ok: false, id: job.id, error: error.message || String(error) });
  }
});
