export const CERTIFICATE_RENDERER_ROLE = 'certificate-status-renderer';

export function certificateRendererMetadata(options = {}) {
  return {
    renderer: CERTIFICATE_RENDERER_ROLE,
    mode: options.mode || 'finite-capture',
    arithmetic: 'binary64',
    proof_status: 'exploratory',
    limitations: 'A sampled floating-point status layer is not a mathematical certificate for every displayed point.'
  };
}
