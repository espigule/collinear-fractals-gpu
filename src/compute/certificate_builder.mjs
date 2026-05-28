export function buildCertificatePayload(result, options) {
  const N = 2 * options.n - 1;
  return {
    schema_version: '0.2.0',
    software_version: options.softwareVersion || '0.2.0-alpha-candidate',
    mode: 'finite-capture',
    n: options.n,
    N,
    c: { re: options.c.re, im: options.c.im },
    k_max: options.kMax,
    L_max: options.LMax,
    verdict: result.verdict,
    word: result.word || [],
    depth: result.depth,
    nodes_explored: result.nodesExplored || 0,
    renderer: 'canvas-cpu',
    proof_status: result.verdict === 'Undetermined'
      ? 'bounded-search-undetermined'
      : 'finite-search-certificate',
    limitations: 'The theorem-level proof remains in the cited papers/thesis.'
  };
}
