// Run before styles so a saved dark workspace never opens with a white flash.
try {
  const key = '3d-print-rig-display-v1';
  let saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (typeof saved?.dark !== 'boolean') {
    const page = location.pathname.split('/').pop() || 'index.html';
    const defaults = {'index.html':'siboor_trident_350', 'trident.html':'voron_trident_350', 'v24.html':'siboor_v24_350'};
    const machine = new URL(location.href).searchParams.get('machine') || defaults[page];
    const previous = machine && JSON.parse(localStorage.getItem('3d-print-rig-lighting-' + machine) || 'null');
    if (typeof previous?.night === 'boolean') {
      saved = {dark: previous.night}; localStorage.setItem(key, JSON.stringify(saved));
    }
  }
  if (typeof saved?.dark === 'boolean') document.documentElement.dataset.theme = saved.dark ? 'dark' : 'light';
} catch {}
