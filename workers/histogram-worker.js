import { alphabet } from '../src/math/alphabets.mjs';
import { inv, mul } from '../src/math/complex.mjs';
import { makeLcg } from '../src/renderers/attractor_histogram.mjs';

self.addEventListener('message', event => {
  const {
    c,
    m,
    seed = 20260227,
    samples = 50000,
    burnIn = 64
  } = event.data || {};

  try {
    const digits = alphabet(m);
    const invC = inv(c);
    const random = makeLcg(seed);
    const points = [];
    let z = { re: 0, im: 0 };

    for (let i = 0; i < samples + burnIn; i++) {
      const index = Math.floor(random() * digits.length) % digits.length;
      const digit = digits[index];
      z = mul({ re: z.re + digit, im: z.im }, invC);
      if (i >= burnIn) points.push({ re: z.re, im: z.im, piece: index });
    }

    self.postMessage({
      ok: true,
      metadata: {
        renderer: 'seeded-histogram-worker',
        m,
        seed,
        samples,
        burn_in: burnIn,
        proof_status: 'visual-approximation'
      },
      points
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || String(error) });
  }
});
