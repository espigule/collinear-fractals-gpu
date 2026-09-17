/** Accessible controls shared by the immersive and detailed exploration flows. */
export function createExplorerChrome({ state, changeArity, changeView, changeScene, changeParameterMode, zoom }) {
  const byId = id => document.getElementById(id);
  const drawer = byId('sidebar-panel');
  const toggle = byId('btn-toggle-controls');
  const close = byId('btn-close-controls');
  const backdrop = byId('controls-backdrop');
  const mobile = window.matchMedia('(max-width: 960px)');
  const background = [byId('explorer-toolbar'), byId('workspace'), byId('footer-status')].filter(Boolean);
  const fullscreen = byId('btn-fullscreen');
  const quickArity = byId('quick-arity');
  const notice = document.createElement('div');
  notice.id = 'explorer-notice';
  notice.className = 'explorer-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.appendChild(notice);
  let noticeTimer;

  function announce(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
  }

  function syncDrawer() {
    if (!drawer) return;
    const open = !drawer.hidden;
    const modal = open && mobile.matches;
    if (backdrop) backdrop.hidden = !modal;
    toggle?.setAttribute('aria-expanded', String(open));
    if (modal) {
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
    } else {
      drawer.removeAttribute('role');
      drawer.removeAttribute('aria-modal');
    }
    const informationModal = byId('modal-backdrop') && !byId('modal-backdrop').hidden;
    for (const element of background) element.inert = modal || informationModal;
    document.body.classList.toggle('controls-open', open);
  }

  function setControlsOpen(open, restoreFocus = true) {
    if (!drawer) return;
    drawer.hidden = !open;
    syncDrawer();
    if (open) close?.focus({ preventScroll: true });
    else if (restoreFocus) toggle?.focus({ preventScroll: true });
  }

  toggle?.addEventListener('click', () => setControlsOpen(drawer.hidden));
  close?.addEventListener('click', () => setControlsOpen(false));
  backdrop?.addEventListener('click', () => setControlsOpen(false));
  mobile.addEventListener('change', syncDrawer);

  const bind = (id, action) => byId(id)?.addEventListener('click', action);
  bind('btn-arity-decrease', () => changeArity(state.n - 1));
  bind('btn-arity-increase', () => changeArity(state.n + 1));
  quickArity?.addEventListener('change', () => {
    const number = quickArity.value.trim() ? Number(quickArity.value) : state.n;
    changeArity(Number.isFinite(number) ? number : state.n);
  });
  for (const [id, view] of [['btn-view-param', 'parameter'], ['btn-view-dyn', 'dynamical'], ['btn-view-split', 'both']]) {
    bind(id, () => changeView(view));
  }
  for (const mode of ['mn', 'rn', 'compare']) bind(`btn-locus-${mode}`, () => changeParameterMode(mode));
  for (const scene of ['collinear', 'difference', 'overlay']) bind(`btn-layer-${scene}`, () => changeScene(scene));
  for (const panel of ['param', 'dyn']) {
    bind(`btn-zoom-in-${panel}`, () => zoom(panel, 0.8));
    bind(`btn-zoom-out-${panel}`, () => zoom(panel, 1.25));
  }

  function syncFullscreen() {
    const active = Boolean(document.fullscreenElement);
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreen?.setAttribute('aria-label', label);
    fullscreen?.setAttribute('title', label);
    fullscreen?.setAttribute('aria-pressed', String(active));
  }
  fullscreen?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else announce('Fullscreen is unavailable here. You can continue exploring in this window.');
    } catch {
      announce('Fullscreen is unavailable here. You can continue exploring in this window.');
    }
    syncFullscreen();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);

  function sync() {
    if (quickArity) quickArity.value = state.n;
    if (byId('btn-arity-decrease')) byId('btn-arity-decrease').disabled = state.n <= 2;
    if (byId('btn-arity-increase')) byId('btn-arity-increase').disabled = state.n >= 100;
    for (const [id, view] of [['btn-view-param', 'parameter'], ['btn-view-dyn', 'dynamical'], ['btn-view-split', 'both']]) {
      byId(id)?.setAttribute('aria-pressed', String(state.focusedPanel === view));
    }
    for (const mode of ['mn', 'rn', 'compare']) byId(`btn-locus-${mode}`)?.setAttribute('aria-pressed', String(state.parameterMode === mode));
    const scene = state.showEscapeStrata ? null : state.showCollinear && state.showDifference ? 'overlay'
      : state.showCollinear ? 'collinear' : state.showDifference ? 'difference' : null;
    for (const mode of ['collinear', 'difference', 'overlay']) byId(`btn-layer-${mode}`)?.setAttribute('aria-pressed', String(scene === mode));
    const names = { mn: 'Mₙ · Connectedness', rn: 'Rₙ · Marked-point set', compare: 'Rₙ ⊆ Mₙ · Comparison' };
    if (byId('parameter-plane-title')) byId('parameter-plane-title').textContent = names[state.parameterMode] || names.mn;
    if (byId('btn-view-param')) byId('btn-view-param').textContent = state.parameterMode === 'rn' ? 'Rₙ' : state.parameterMode === 'compare' ? 'Parameter' : 'Mₙ';
    const parameterNote = byId('parameter-view-note');
    if (parameterNote) {
      parameterNote.hidden = state.parameterMode === 'mn';
      parameterNote.textContent = 'Rₙ tests c ∈ E(c,n). Teal marks survival through the chosen depth; amber marks an unfinished search. Neither proves membership. The Mₙ search record remains separate.';
    }
    syncDrawer();
    syncFullscreen();
  }

  function handleKeydown(event) {
    if (drawer && !drawer.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setControlsOpen(false);
        return true;
      }
      if (mobile.matches && event.key === 'Tab') {
        const focusable = [...drawer.querySelectorAll('button, input, select, summary, a[href]')]
          .filter(element => !element.disabled && element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return true;
      }
    }
    if (event.key === 'Escape') {
      for (const id of ['toolbar-more', 'result-details']) {
        const details = byId(id);
        if (details?.open) {
          details.open = false;
          details.querySelector('summary')?.focus();
          event.preventDefault();
          return true;
        }
      }
    }
    return false;
  }

  sync();
  return { sync, setControlsOpen, handleKeydown, announce };
}
