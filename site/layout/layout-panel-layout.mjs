// Presentation preferences only. Grid changes reach the renderer's ResizeObserver.
const preferenceKey = '3d-print-rig.layout.panel.v1';
const desktopQuery = '(min-width: 681px)';
const touchQuery = '(hover: none) and (pointer: coarse)';
const fineQuery = '(any-pointer: fine)';
const widthProperty = '--layout-panel-width';

export function layoutPanelSizing(availableWidth, preferredWidth = 400) {
  const available = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  // Reserve 320px for the scene and 10px for the divider, including at 681px.
  const max = Math.max(0, Math.min(640, Math.floor(available - 330)));
  const min = Math.min(300, max);
  const requested = Number.isFinite(preferredWidth) ? preferredWidth : 400;
  return {min, max, width: Math.round(Math.max(min, Math.min(max, requested)))};
}

export function setupLayoutPanel({document, window, t}) {
  const workspace = document.querySelector('.layout-workspace');
  const scene = document.querySelector('#layout-scene');
  const sidebar = document.querySelector('#layout-sidebar');
  if (!workspace || !scene || !sidebar || sidebar.parentNode !== workspace) {
    return {dispose() {}, refreshLanguage() {}, reveal() {return false;}};
  }

  const desktop = window.matchMedia(desktopQuery);
  const touch = window.matchMedia(touchQuery);
  const fine = window.matchMedia(fineQuery);
  const removers = [];
  const attributes = ['data-layout-panel-active', 'data-layout-panel-collapsed', 'data-layout-panel-resizing'];
  const originalAttributes = attributes.map(name => [name, workspace.getAttribute(name)]);
  const originalWidth = workspace.style.getPropertyValue(widthProperty);
  const originalPriority = workspace.style.getPropertyPriority(widthProperty);
  const originalHidden = sidebar.getAttribute('hidden');
  let translate = t;
  let preferredWidth = 400, collapsed = false, enabled = false, disposed = false;
  let sizing = layoutPanelSizing(0), drag = null, previousFocus = null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferenceKey));
    if (saved?.version === 1) {
      if (Number.isFinite(saved.width) && saved.width > 0) preferredWidth = saved.width;
      collapsed = saved.collapsed === true;
    }
  } catch { /* Storage may be blocked, full, or contain an older/invalid value. */ }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'layout-panel-toggle layout-icon-button';
  toggle.setAttribute('aria-controls', sidebar.id);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const outline = document.createElementNS(svg.namespaceURI, 'path');
  outline.setAttribute('d', 'M3 4h18v16H3Z M15 4v16');
  const chevron = document.createElementNS(svg.namespaceURI, 'path');
  svg.append(outline, chevron);
  toggle.append(svg);

  const divider = document.createElement('div');
  divider.className = 'layout-panel-divider';
  divider.tabIndex = 0;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-controls', sidebar.id);
  const help = document.createElement('span');
  help.id = 'layout-panel-resize-help';
  help.className = 'layout-sr-only';
  divider.setAttribute('aria-describedby', help.id);
  divider.append(help);
  workspace.insertBefore(divider, sidebar);
  scene.append(toggle);

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function persist() {
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify({version: 1, width: preferredWidth, collapsed}));
    } catch { /* Resizing and reopening still work without persistence. */ }
  }
  function restoreAttribute(element, name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
  function focus(element) {
    element?.focus({preventScroll: true});
    return document.activeElement === element;
  }
  function labels() {
    const label = translate(collapsed ? 'layout.panel.expand' : 'layout.panel.collapse');
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.setAttribute('aria-expanded', String(!enabled || !collapsed));
    chevron.setAttribute('d', collapsed ? 'm11 9-3 3 3 3' : 'm8 9 3 3-3 3');
    divider.setAttribute('aria-label', translate('layout.panel.resize'));
    divider.title = translate('layout.panel.resizeHelp');
    help.textContent = divider.title;
    divider.setAttribute('aria-valuemin', String(sizing.min));
    divider.setAttribute('aria-valuemax', String(sizing.max));
    divider.setAttribute('aria-valuenow', String(sizing.width));
    divider.setAttribute('aria-valuetext', translate('layout.panel.width', {width: sizing.width}));
  }
  function render() {
    if (disposed) return;
    sizing = layoutPanelSizing(workspace.getBoundingClientRect().width, preferredWidth);
    if (enabled) {
      // Make the toggle focusable before moving focus out of the inspector.
      workspace.setAttribute('data-layout-panel-active', 'true');
      const value = `${sizing.width}px`;
      if (workspace.style.getPropertyValue(widthProperty) !== value) workspace.style.setProperty(widthProperty, value);
    }
    const hideSidebar = enabled && collapsed;
    // Never hide a focused inspector or separator. Keep the toggle in the scene.
    if (hideSidebar && (sidebar.contains(document.activeElement) || divider.contains(document.activeElement))) {
      if (sidebar.contains(document.activeElement)) previousFocus = document.activeElement;
      toggle.hidden = false;
      if (!focus(toggle)) { collapsed = false; return render(); }
    }
    if (hideSidebar) sidebar.hidden = true;
    else restoreAttribute(sidebar, 'hidden', originalHidden);
    if (!enabled && (toggle.contains(document.activeElement) || divider.contains(document.activeElement))) {
      focus(originalHidden === null ? sidebar : scene);
    }
    toggle.hidden = !enabled;
    divider.hidden = !enabled || collapsed;
    if (enabled) {
      workspace.setAttribute('data-layout-panel-collapsed', String(collapsed));
    } else {
      for (const [name, value] of originalAttributes) restoreAttribute(workspace, name, value);
      restoreWidth();
    }
    labels();
  }
  function restoreWidth() {
    if (originalWidth) workspace.style.setProperty(widthProperty, originalWidth, originalPriority);
    else workspace.style.removeProperty(widthProperty);
  }
  function finishGesture(commit) {
    if (!drag) return;
    const ended = drag;
    drag = null; // releasePointerCapture can synchronously emit lostpointercapture.
    if (!commit) preferredWidth = ended.preferredWidth;
    restoreAttribute(workspace, 'data-layout-panel-resizing', originalAttributes[2][1]);
    try { divider.releasePointerCapture(ended.pointerId); } catch { /* Capture may already be lost. */ }
    render();
    if (commit && preferredWidth !== ended.preferredWidth) persist();
  }
  function refreshLayout() {
    if (disposed) return;
    finishGesture(false);
    enabled = desktop.matches && workspace.getBoundingClientRect().width > 680 &&
      window.navigator?.userAgentData?.mobile !== true && !(touch.matches && !fine.matches);
    render();
  }
  function consume(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function reveal() {
    if(disposed)return false;
    if(enabled&&collapsed){finishGesture(false);collapsed=false;render();persist();}
    return !sidebar.hidden;
  }
  const skipLink=document.querySelector('.layout-skip');
  if(skipLink)listen(skipLink,'click',()=>{if(reveal())focus(sidebar);});
  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId || !Number.isFinite(event.clientX)) return;
    consume(event);
    const width = layoutPanelSizing(workspace.getBoundingClientRect().width,
      drag.width + drag.startX - event.clientX).width;
    // A click, a clamped movement, or a drag back to its start must not replace
    // a wider desktop preference with this window's temporary clamp.
    preferredWidth = width === drag.width ? drag.preferredWidth : width;
    render();
  }
  listen(toggle, 'click', event => {
    if (!enabled || disposed) return;
    consume(event);
    finishGesture(false);
    collapsed = !collapsed;
    render();
    if (!collapsed && (!previousFocus || !sidebar.contains(previousFocus) || !focus(previousFocus))) focus(sidebar);
    persist();
  });
  listen(divider, 'keydown', event => {
    if (!enabled || collapsed || drag || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 64 : 16;
    const widths = {ArrowLeft: sizing.width + step, ArrowRight: sizing.width - step, Home: sizing.min, End: sizing.max};
    if (!Object.hasOwn(widths, event.key)) return;
    consume(event);
    const width = layoutPanelSizing(workspace.getBoundingClientRect().width, widths[event.key]).width;
    if (width === sizing.width) return;
    preferredWidth = width;
    render();
    persist();
  });
  listen(divider, 'pointerdown', event => {
    if (!enabled || collapsed || drag || event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.clientX)) return;
    consume(event);
    focus(divider);
    drag = {pointerId: event.pointerId, startX: event.clientX, width: sizing.width, preferredWidth};
    workspace.setAttribute('data-layout-panel-resizing', 'true');
    try { divider.setPointerCapture(event.pointerId); } catch { /* Window listeners also handle uncaptured drags. */ }
  });
  listen(window, 'pointermove', move, true);
  listen(window, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    move(event);
    finishGesture(true);
  }, true);
  const cancelPointer = event => {
    if (drag && event.pointerId === drag.pointerId) { consume(event); finishGesture(false); }
  };
  listen(window, 'pointercancel', cancelPointer, true);
  listen(divider, 'lostpointercapture', cancelPointer);
  listen(window, 'blur', () => finishGesture(false));
  listen(window, 'keydown', event => {
    if (drag && event.key === 'Escape') { consume(event); finishGesture(false); }
  }, true);
  listen(window, 'resize', refreshLayout);
  for (const media of [desktop, touch, fine]) listen(media, 'change', refreshLayout);
  const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(refreshLayout) : null;
  observer?.observe(workspace);
  refreshLayout();

  return {
    reveal,
    // Pass a new translator if the caller replaced its language-bound function.
    refreshLanguage(nextT) {
      if (disposed) return;
      if (typeof nextT === 'function') translate = nextT;
      labels();
    },
    dispose() {
      if (disposed) return;
      finishGesture(false);
      disposed = true;
      observer?.disconnect();
      for (const remove of removers) remove();
      restoreAttribute(sidebar, 'hidden', originalHidden);
      if (toggle.contains(document.activeElement) || divider.contains(document.activeElement)) focus(originalHidden === null ? sidebar : scene);
      toggle.remove();
      divider.remove();
      for (const [name, value] of originalAttributes) restoreAttribute(workspace, name, value);
      restoreWidth();
      previousFocus = null;
    },
  };
}
