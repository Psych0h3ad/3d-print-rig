export function setupMobileLayout({workspace, heading, make}) {
  const controls = make('div', 'mobile-layout');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '画面の使い方');
  const choices = [['preview', 'ui.preview'], ['split', 'ui.config_view']];
  const buttons = [];
  const setLayout = layout => {
    workspace.dataset.layout = layout;
    try { sessionStorage.setItem('3d-print-rig-layout', layout); } catch {}
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
  };
  for (const [value, id] of choices) {
    const button = make('button', '', {id}); button.type = 'button'; button.dataset.layout = value;
    button.setAttribute('aria-controls', 'stage inspectorContent');
    button.onclick = () => setLayout(value);
    controls.append(button); buttons.push(button);
  }
  heading.append(controls);
  let previous; try { previous = sessionStorage.getItem('3d-print-rig-layout'); } catch {}
  // Old settings-only sessions reopen with a live preview beside the controls.
  setLayout(['preview','split'].includes(previous) ? previous : 'split');
  // Keyboard access to settings also reopens a hidden inspector.
  document.querySelector('.skip-link')?.addEventListener('click', () => setLayout('split'));
  return controls;
}
