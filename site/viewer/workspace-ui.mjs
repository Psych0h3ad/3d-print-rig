// Shared presentation layer. Existing controls, IDs and CAD controllers stay intact.
import {setupLanguage,originalText} from './i18n.mjs?v=public-v18-probe1';
const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

function setupWorkspace() {
  const aside = $('.workspace > aside'), stage = $('#stage'), header = $('body > header');
  if (!aside || !stage || !header || document.body.classList.contains('ui-workspace')) return;
  document.body.classList.add('ui-workspace');
  aside.setAttribute('aria-label', '構成と表示の設定');

  const skip = node('a', 'skip-link', '設定へスキップ');
  skip.href = '#inspectorTabs';
  document.body.prepend(skip);

  const page = location.pathname.split('/').pop() || 'index.html';
  const machinePage = !['toolheads.html', 'gantries.html', 'cleaning.html', 'components.html', 'toolchangers.html'].includes(page);
  const navigation = node('nav', 'workspace-nav');
  navigation.setAttribute('aria-label', 'ワークスペース');
  const destinations = [
    ['マシン', './', machinePage], ['ヘッド', './toolheads.html', page === 'toolheads.html'],
    ['ガントリー', './gantries.html', page === 'gantries.html'], ['清掃Mod', './cleaning.html', page === 'cleaning.html'],
    ['部品CAD', './components.html', page === 'components.html'], ['交換機構', './toolchangers.html', page === 'toolchangers.html'],
  ];
  for (const [label, href, current] of destinations) {
    const link = node('a', '', label);
    link.href = href;
    if (current) link.setAttribute('aria-current', 'page');
    // Preserve links to the currently selected head, including controller updates.
    if (label === 'ヘッド' && $('#toolheadLink')) {
      const original = $('#toolheadLink');
      link.href = original.href;
      new MutationObserver(() => { link.href = original.href; }).observe(original, { attributes: true, attributeFilter: ['href'] });
    }
    navigation.append(link);
  }
  header.after(navigation);
  $('.brand small')?.replaceChildren(document.createTextNode('COMMUNITY CAD WORKSPACE'));
  for (const link of header.querySelectorAll('.mode-link')) link.hidden = true;
  for (const link of aside.querySelectorAll(':scope > .workbench-link')) {
    if (/^(清掃・パージModを比較|Monolithガントリーを組む|ツールヘッド単体を組む|ホットエンド・押出機のCADを確認)/.test(link.textContent)) link.hidden = true;
  }

  const actions = $('.header-actions');
  const more = node('details', 'workspace-more');
  more.append(node('summary', '', '資料・その他'));
  const menu = node('div', 'workspace-menu');
  more.append(menu);
  actions.append(more);
  const moveActions = () => {
    for (const button of actions.querySelectorAll(':scope > button:not(#openRender)')) menu.append(button);
  };
  moveActions();
  new MutationObserver(moveActions).observe(actions, { childList: true });
  menu.addEventListener('click', event => { if (event.target.closest('button')) more.open = false; });
  document.addEventListener('click', event => { if (!more.contains(event.target)) more.open = false; });
  more.addEventListener('keydown', event => { if (event.key === 'Escape') { more.open = false; more.querySelector('summary').focus(); } });
  if ($('#openRender')) $('#openRender').textContent = '画像を書き出す';

  const heading = node('div', 'inspector-heading');
  const title = aside.querySelector('h1');
  const description = title?.nextElementSibling;
  heading.append(node('span', 'inspector-eyebrow', machinePage ? 'MACHINE CONFIGURATOR' : 'CAD WORKBENCH'));
  if (title) heading.append(title);
  if (description?.matches('p.foot')) heading.append(description);
  for (const eyebrow of aside.querySelectorAll(':scope > .eyebrow')) eyebrow.hidden = true;
  aside.prepend(heading);

  const machineSelect = $('#machineConfig');
  if (machineSelect) {
    const dialog = node('dialog', 'machine-dialog');
    dialog.id = 'machineDialog';
    dialog.setAttribute('aria-labelledby', 'machineDialogTitle');
    const dialogHead = node('div', 'dialog-head');
    const dialogTitle = node('h2', '', 'マシンを選ぶ');
    dialogTitle.id = 'machineDialogTitle';
    const close = node('button', 'close', '×');
    close.setAttribute('aria-label', '閉じる');
    dialogHead.append(dialogTitle, close);
    const content = node('div', 'dialog-body');
    content.append(node('p', 'foot', '機種・ベンダー・サイズを選び、表示する仕様を確認してください。'));
    // The machine controller may initialize before or after this module.
    // It inserts its dependent fields relative to machineConfig in either case.
    const nodes = [...aside.children];
    const start = nodes.findIndex(element => element.matches('label[for="machineFamily"], label[for="machineConfig"]'));
    if (start >= 0) {
      for (const element of nodes.slice(start)) {
        if (element === title || element.tagName === 'DETAILS' || element.querySelector('summary')) break;
        if (element.matches('label, select, #showMachine, #machineProductLinks, p.foot, p.notice')) content.append(element);
      }
    }
    if (!content.contains(machineSelect)) content.append(machineSelect);
    dialog.append(dialogHead, content);
    document.body.append(dialog);
    const choose = node('button', 'change-machine', '機種を変更');
    heading.append(choose);
    choose.onclick = () => dialog.showModal();
    close.onclick = () => dialog.close();
  }

  const tabs = node('div', 'inspector-tabs');
  tabs.id = 'inspectorTabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '設定カテゴリ');
  tabs.tabIndex = -1;
  const content = node('div', 'inspector-content');
  const footer = node('div', 'inspector-footer');
  const groups = new Map();
  let active = 'configuration';
  const labels = { configuration: '構成', appearance: '外観', inspect: machinePage ? '動作' : 'チェック', reference: '資料' };
  for (const [key, label] of Object.entries(labels)) {
    const tab = node('button', '', label);
    tab.id = `tab-${key}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `panel-${key}`);
    const panel = node('div', 'inspector-panel');
    panel.id = `panel-${key}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    groups.set(key, { tab, panel });
    tabs.append(tab);
    content.append(panel);
    tab.onclick = () => activate(key);
  }
  heading.after(tabs, content, footer);
  function activate(key, focus = false) {
    active = key;
    for (const [id, { tab, panel }] of groups) {
      tab.setAttribute('aria-selected', String(id === key));
      tab.tabIndex = id === key ? 0 : -1;
      panel.hidden = id !== key;
    }
    content.scrollTop = 0;
    if (focus) groups.get(key).tab.focus();
  }
  tabs.addEventListener('keydown', event => {
    const available = [...groups].filter(([, group]) => !group.tab.hidden);
    const index = available.findIndex(([id]) => id === active);
    const next = event.key === 'ArrowRight' ? (index + 1) % available.length : event.key === 'ArrowLeft' ? (index - 1 + available.length) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    activate(available[next][0], true);
  });
  function category(element) {
    const text = originalText(element.querySelector(':scope > summary'));
    if (/動作|G-code|接触|交換機構の表示|取付チェック/.test(text)) return 'inspect';
    if (/色|素材|照明|表示/.test(text)) return 'appearance';
    if (/原本|出典|使用版|カタログ|選択した構成と部品|マウント・構成/.test(text)) return 'reference';
    return 'configuration';
  }
  function organize() {
    const candidates = [...aside.children, ...heading.children].filter(element => ![heading, tabs, content, footer].includes(element) && !element.matches('h1, .inspector-eyebrow, .change-machine, .mobile-panel-toggle') && !(heading.contains(element) && element.matches('p.foot')));
    for (const element of candidates) {
      if (element.hidden && element.matches('.eyebrow, .workbench-link')) continue;
      const key = category(element);
      groups.get(key).panel.append(element);
      if (element.tagName === 'DETAILS') {
        element.classList.add('panel-section');
        if (element.classList.contains('builder-search')) element.open = false;
        else if (key !== 'reference' && !groups.get(key).panel.querySelector('details[open]')) element.open = true;
      }
    }
    // Keep file controls available without opening technical conditions.
    const save = $('#saveConfiguration'), load = $('#loadConfiguration');
    if (save && load && save.parentElement !== footer) {
      footer.append(save, load);
      save.textContent = '構成を保存';
      load.textContent = '読み込む';
    }
    footer.hidden = !footer.children.length;
    for (const { tab, panel } of groups.values()) tab.hidden = ![...panel.children].some(element => !element.hidden);
    if (groups.get(active).tab.hidden) active = [...groups].find(([, group]) => !group.tab.hidden)?.[0] || 'configuration';
    activate(active);
  }
  organize();
  // New machine-head and G-code panels arrive after asynchronous CAD loading.
  new MutationObserver(organize).observe(aside, { childList: true });
  new MutationObserver(organize).observe(heading, { childList: true });
  // Hidden dynamic sections should expose their category when installed.
  const visibility = new MutationObserver(() => {
    for (const { tab, panel } of groups.values()) tab.hidden = ![...panel.children].some(element => !element.hidden);
  });
  visibility.observe(content, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  function organizeAdvancedFields() {
    const configuration = $('#configurationControls');
    if (configuration) {
      const fields = ['mountConfig', 'carriageConfig', 'boardConfig', 'coolingConfig']
        .map(id => $(`#${id}`)).filter(element => element?.parentElement === configuration);
      if (fields.length) {
        let advanced = $('#advancedConfiguration');
        if (!advanced) {
          advanced = node('details', 'advanced-configuration');
          advanced.id = 'advancedConfiguration';
          advanced.append(node('summary', '', '取付・交換機構・電子部品'));
          configuration.insertBefore(advanced, $('#configStatus'));
        }
        for (const field of fields) {
          const caption = document.querySelector(`label[for="${field.id}"]`);
          if (caption?.parentElement === configuration) advanced.append(caption);
          advanced.append(field);
        }
      }
    }
    for (const fieldset of content.querySelectorAll('fieldset.builder-step')) {
      const legend = fieldset.querySelector('legend');
      if (!legend?.textContent.startsWith('2')) continue;
      const advanced = node('details', 'panel-section advanced-configuration');
      advanced.append(node('summary', '', originalText(legend)));
      legend.remove();
      advanced.append(...fieldset.childNodes);
      fieldset.replaceWith(advanced);
    }
  }
  organizeAdvancedFields();
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(element => element.nodeType === 1 && element.matches('select, label, fieldset, #configurationControls')))) organizeAdvancedFields();
  }).observe(aside, { childList: true, subtree: true });

  const mobileToggle = node('button', 'mobile-panel-toggle', 'たたむ');
  mobileToggle.setAttribute('aria-expanded', 'true');
  mobileToggle.setAttribute('aria-controls', 'inspectorTabs inspectorContent');
  content.id = 'inspectorContent';
  heading.append(mobileToggle);
  mobileToggle.onclick = () => {
    const collapsed = $('.workspace').classList.toggle('controls-collapsed');
    mobileToggle.textContent = collapsed ? '設定を開く' : 'たたむ';
    mobileToggle.setAttribute('aria-expanded', String(!collapsed));
  };

  const tools = stage.querySelector('.view-tools');
  if (tools) {
    tools.setAttribute('aria-label', 'カメラの視点');
    for (const button of tools.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.id === 'iso'));
    tools.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      for (const item of tools.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    });
    stage.addEventListener('pointerdown', event => {
      if (event.target.tagName === 'CANVAS') for (const button of tools.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
    });
  }
  const help = node('button', 'viewer-help', '操作ガイド');
  stage.append(help);
  const guide = node('dialog', 'guide-dialog');
  guide.setAttribute('aria-labelledby', 'guideTitle');
  guide.innerHTML = '<div class="dialog-head"><h2 id="guideTitle">3Dビューの操作</h2><button class="close" aria-label="閉じる">×</button></div><div class="dialog-body"><dl class="guide-keys"><dt>回転</dt><dd>左ドラッグ / 1本指でドラッグ</dd><dt>移動</dt><dd>右ドラッグ / 2本指でドラッグ</dd><dt>拡大・縮小</dt><dd>ホイール / ピンチ</dd><dt>視点を切り替える</dt><dd><kbd>1</kbd> 斜め　<kbd>2</kbd> 正面　<kbd>3</kbd> 上面・側面</dd><dt>ヘッドを拡大</dt><dd><kbd>4</kbd> 対応するマシンで使用</dd></dl><p class="foot">構成・外観・動作は左のタブから。スマートフォンでは画面下の設定をたたむと、3Dを広く表示できます。</p></div>';
  document.body.append(guide);
  help.onclick = () => guide.showModal();
  guide.querySelector('.close').onclick = () => guide.close();
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.target.closest('input, select, textarea, [contenteditable="true"]') || $('dialog[open]')) return;
    const id = { '1': 'iso', '2': 'front', '3': $('#top') ? 'top' : 'side', '4': 'focusHead' }[event.key];
    if (id && $(`#${id}`) && !$(`#${id}`).disabled) { event.preventDefault(); $(`#${id}`).click(); }
  });
  // Give generated dialogs accessible titles too.
  const nameDialogs = () => {
    for (const dialog of document.querySelectorAll('dialog')) {
      const title = dialog.querySelector('h2');
      if (title && !dialog.hasAttribute('aria-labelledby')) {
        title.id ||= `${dialog.id || 'viewer'}Title`;
        dialog.setAttribute('aria-labelledby', title.id);
      }
    }
  };
  nameDialogs();
  new MutationObserver(nameDialogs).observe(document.body, { childList: true });
}

setupWorkspace();
setupLanguage();
