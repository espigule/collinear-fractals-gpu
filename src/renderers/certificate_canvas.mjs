export const CERTIFICATE_RENDERER_ROLE = 'certificate-status-renderer';

export function certificateRendererMetadata(options = {}) {
  return {
    renderer: CERTIFICATE_RENDERER_ROLE,
    mode: options.mode || 'finite-capture',
    proof_status: 'finite-search-certificate',
    limitations: 'The theorem-level proof remains in the cited papers/thesis.'
  };
}
