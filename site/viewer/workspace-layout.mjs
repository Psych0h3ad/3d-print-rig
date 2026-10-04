export function setupMobileLayout({workspace, heading, make}) {
  const controls = make('div', 'mobile-layout');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '画面の使い方');
  const choices = [['preview', '3Dビュー'], ['split', '構成画面'], ['settings', '設定画面']];
  const buttons = [];
  const setLayout = layout => {
    workspace.dataset.layout = layout;
    try { sessionStorage.setItem('3d-print-rig-layout', layout); } catch {}
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
  };
  for (const [value, label] of choices) {
    const button = make('button', '', label); button.type = 'button'; button.dataset.layout = value;
    button.setAttribute('aria-controls', 'stage inspectorContent');
    button.onclick = () => setLayout(value);
    controls.append(button); buttons.push(button);
  }
  heading.append(controls);
  let previous; try { previous = sessionStorage.getItem('3d-print-rig-layout'); } catch {}
  setLayout(['preview','split','settings'].includes(previous) ? previous : 'split');
  // Keyboard access to settings also reopens a hidden inspector.
  document.querySelector('.skip-link')?.addEventListener('click', () => setLayout('settings'));
  return controls;
}
