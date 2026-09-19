/** Accessible controls shared by the immersive and detailed exploration flows. */
import { normalizeParameterDigits, normalizeParameterLayers, parameterLayersForMode } from '../state/explorer_state.mjs';
import { parameterDigitColor, parameterLayerColor } from '../renderers/palettes.mjs';

export function createExplorerChrome({ state, changeArity, changeView, changeScene, changeParameterMode, changeParameterLayers, changeParameterDigits, zoom }) {
  const byId = id => document.getElementById(id);
  const drawer = byId('sidebar-panel');
  const toggle = byId('btn-toggle-controls');
  const close = byId('btn-close-controls');
  const backdrop = byId('controls-backdrop');
  const mobile = window.matchMedia('(max-width: 960px)');
  const background = [byId('explorer-toolbar'), byId('workspace'), byId('footer-status')].filter(Boolean);
  const fullscreen = byId('btn-fullscreen');
  const quickArity = byId('quick-arity');
  const digitSettings = byId('parameter-digit-settings');
  const notice = document.createElement('div');
  notice.id = 'explorer-notice';
  notice.className = 'explorer-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.appendChild(notice);
  let noticeTimer;
  let digitArity;

  const selectedLayers = () => normalizeParameterLayers(state.parameterLayers, parameterLayersForMode(state.parameterMode));
  const selectedDigits = () => normalizeParameterDigits(state.parameterDigits, state.n);
  const layerNames = { mn: 'Mₙ', mn0: 'Mₙ⁰', mn1: 'Mₙ¹' };

  function setParameterLayers(layers) {
    if (changeParameterLayers) changeParameterLayers(layers);
    else changeParameterMode?.(layers.length === 1 ? layers[0] : 'compare');
  }

  function syncDigitPopoverSize() {
    if (!digitSettings?.open) return;
    const card = digitSettings.querySelector('.parameter-digit-card');
    const panel = digitSettings.closest('.canvas-panel');
    if (!card || !panel || !panel.getClientRects().length) return;
    // Bound the popup by its actual panel, including wrapped toolbars and split
    // layouts. Viewport-only subtraction can clip its final controls and border.
    const available = Math.max(0, Math.min(panel.getBoundingClientRect().bottom, window.innerHeight)
      - card.getBoundingClientRect().top - 8);
    card.style.setProperty('--parameter-digit-available-height', `${available}px`);
  }

  digitSettings?.addEventListener('toggle', syncDigitPopoverSize);
  window.addEventListener('resize', syncDigitPopoverSize);
  if (typeof ResizeObserver === 'function' && digitSettings) {
    const observer = new ResizeObserver(syncDigitPopoverSize);
    observer.observe(digitSettings.closest('.canvas-panel'));
    observer.observe(digitSettings.closest('.panel-mode-switch'));
  }

  function syncDigitControls() {
    const groups = [byId('parameter-original-digits'), byId('parameter-complement-digits')];
    if (groups.some(group => !group)) return;
    if (digitArity !== state.n) {
      for (const group of groups) group.replaceChildren();
      for (let digit = 1 - state.n; digit < state.n; digit++) {
        const original = (digit + state.n - 1) % 2 === 0;
        const label = document.createElement('label');
        label.className = 'parameter-digit-option';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.parameterDigit = String(digit);
        input.setAttribute('aria-label', `First digit ${digit}: ${original ? 'original' : 'complementary'} subset`);
        input.addEventListener('change', () => {
          const digits = selectedDigits().filter(value => value !== digit);
          if (input.checked) digits.push(digit);
          changeParameterDigits?.(normalizeParameterDigits(digits, state.n));
        });
        const swatch = document.createElement('span');
        swatch.className = 'parameter-digit-swatch';
        swatch.style.backgroundColor = parameterDigitColor(digit, state.n);
        swatch.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = digit < 0 ? `−${Math.abs(digit)}` : String(digit);
        label.append(input, swatch, text);
        groups[original ? 0 : 1].appendChild(label);
      }
      digitArity = state.n;
    }
    const digits = selectedDigits();
    for (const group of groups) {
      for (const input of group.querySelectorAll('input')) input.checked = digits.includes(Number(input.dataset.parameterDigit));
    }
    const total = 2 * state.n - 1;
    if (byId('parameter-digit-count')) byId('parameter-digit-count').textContent = `${digits.length}/${total}`;
    byId('parameter-digit-settings')?.querySelector('summary')?.setAttribute('aria-label', `First-digit subsets: ${digits.length} of ${total} visible`);
    if (byId('btn-digits-all')) byId('btn-digits-all').disabled = digits.length === total;
    if (byId('btn-digits-none')) byId('btn-digits-none').disabled = digits.length === 0;
  }

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
    if (open && digitSettings) digitSettings.open = false;
    syncDrawer();
    if (open) close?.focus({ preventScroll: true });
    else if (restoreFocus) toggle?.focus({ preventScroll: true });
  }

  toggle?.addEventListener('click', () => setControlsOpen(drawer.hidden));
  close?.addEventListener('click', () => setControlsOpen(false));
  backdrop?.addEventListener('click', () => setControlsOpen(false));
  mobile.addEventListener('change', syncDrawer);
  document.addEventListener('pointerdown', event => {
    if (digitSettings?.open && !digitSettings.closest('.parameter-set-switch')?.contains(event.target)) {
      digitSettings.open = false;
    }
  });

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
  for (const layer of ['mn', 'mn0', 'mn1']) {
    bind(`btn-locus-${layer}`, () => {
      const layers = selectedLayers();
      setParameterLayers(layers.includes(layer) ? layers.filter(value => value !== layer) : [...layers, layer]);
    });
  }
  bind('btn-locus-compare', () => {
    if (selectedLayers().length !== 3) setParameterLayers(['mn', 'mn0', 'mn1']);
  });
  bind('btn-digits-all', () => changeParameterDigits?.(Array.from({ length: 2 * state.n - 1 }, (_, index) => index + 1 - state.n)));
  bind('btn-digits-none', () => changeParameterDigits?.([]));
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
    if (state.focusedPanel === 'dynamical' && digitSettings) digitSettings.open = false;
    if (quickArity) quickArity.value = state.n;
    if (byId('btn-arity-decrease')) byId('btn-arity-decrease').disabled = state.n <= 2;
    if (byId('btn-arity-increase')) byId('btn-arity-increase').disabled = state.n >= 100;
    for (const [id, view] of [['btn-view-param', 'parameter'], ['btn-view-dyn', 'dynamical'], ['btn-view-split', 'both']]) {
      byId(id)?.setAttribute('aria-pressed', String(state.focusedPanel === view));
    }
    const layers = selectedLayers(), digits = selectedDigits();
    for (const layer of ['mn', 'mn0', 'mn1']) {
      byId(`btn-locus-${layer}`)?.setAttribute('aria-pressed', String(layers.includes(layer)));
      byId(`btn-locus-${layer}`)?.style.setProperty('--parameter-layer-color', parameterLayerColor(layer));
    }
    byId('btn-locus-compare')?.setAttribute('aria-pressed', String(layers.length === 3));
    syncDigitControls();
    const scene = state.showEscapeStrata ? null : state.showCollinear && state.showDifference ? 'overlay'
      : state.showCollinear ? 'collinear' : state.showDifference ? 'difference' : null;
    for (const mode of ['collinear', 'difference', 'overlay']) byId(`btn-layer-${mode}`)?.setAttribute('aria-pressed', String(scene === mode));
    const active = [...layers.map(layer => layerNames[layer]), ...(digits.length ? [`${digits.length} digit subset${digits.length === 1 ? '' : 's'}`] : [])];
    const title = active.length ? active.join(' + ') : 'Parameter plane · No sets selected';
    if (byId('parameter-plane-title')) byId('parameter-plane-title').textContent = title;
    if (byId('parameter-plane-title')) byId('parameter-plane-title').title = title;
    if (byId('btn-view-param')) byId('btn-view-param').textContent = layers.length === 1 && !digits.length ? layerNames[layers[0]] : 'Parameter';
    const parameterNote = byId('parameter-view-note');
    if (parameterNote) {
      parameterNote.hidden = layers.length === 1 && layers[0] === 'mn' && !digits.length;
      parameterNote.textContent = active.length
        ? `Visible: ${active.join(', ')}. Each first-digit subset tests c ∈ t + c⁻¹E(c,n). Mₙ⁰ combines t ∈ Aₙ; Mₙ¹ combines the complementary first digits. All subsequent digits use Aₙ. The selected Mₙ search record remains in the bottom strip.`
        : 'No parameter sets are selected. Toggle a set above or open Digits to choose individual first-digit subsets.';
    }
    syncDrawer();
    syncFullscreen();
    syncDigitPopoverSize();
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
      for (const id of ['parameter-digit-settings', 'toolbar-more', 'result-details']) {
        const details = byId(id);
        if (details?.open && details.getClientRects().length) {
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
