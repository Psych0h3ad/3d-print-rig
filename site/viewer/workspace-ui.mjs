import {ensureWorkspaceEntry} from './workspace-entry.mjs';
ensureWorkspaceEntry(import.meta.url);
import {setupDisplayPreferences,setupHeaderThemeToggle} from './display-preferences.mjs?v=3b735c3e32640589ed26';
import {WorkspaceMutationObserver,workspaceListen} from './workspace-lifecycle.mjs?v=823ad76bd9034ec8d6ff';
// Shared presentation layer. Existing controls, IDs and CAD controllers stay intact.
import {setupLanguage,originalText,messageSource} from './i18n.mjs?v=d6d7a630d8514cd1463d';
import {printerWorkspaceURL,workspaceReturnKey,workspaceKindFor} from './workspace-return.mjs?v=594dc2ce774e58ba761f';
import {setupWorkspaceSharing} from './workspace-share.mjs?v=43727cf619f3a0543d3a';
import {lockInspectorHorizontalScroll} from './workspace-scroll.mjs?v=workspace-belts-1';
import {setupChoiceSearch} from './workspace-choices.mjs?v=3569b4a5b7b7e53db51e';
import {setupMobileLayout} from './workspace-layout.mjs?v=738c040595ec99155ce2';
import {workspaceSectionCategory,isPrimaryWorkspaceLink} from './workspace-sections.mjs?v=3b551c133f4ed3ce2fac';
const $ = selector => document.querySelector(selector);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text?.id) { element.textContent=messageSource(text.id);element.setAttribute('data-i18n-id',text.id); }
  else if (text) element.textContent = text;
  return element;
};

export function setupWorkspace() {
  const aside = $('.workspace > aside'), stage = $('#stage'), header = $('body > header');
  if (!aside || !stage || !header || document.body.classList.contains('ui-workspace')) return;
  document.body.classList.add('ui-workspace');
  aside.setAttribute('aria-label', '構成と表示の設定');
  const background = node('div', 'cad-background');
  background.setAttribute('aria-hidden', 'true');
  stage.append(background);
  const sponsor = node('details', 'project-sponsor');
  const sponsorSummary = node('summary');
  sponsorSummary.append(node('span', 'sponsor-label', {id:'ui.project_sponsor'}));
  const sponsorName = node('strong', '', 'Watchtower by YGK3D');
  sponsorName.setAttribute('data-i18n', 'off');
  sponsorSummary.append(sponsorName);
  const sponsorMenu = node('div', 'sponsor-menu');
  sponsorMenu.append(node('p', '', {id:'ui.watchtower_description'}));
  for (const [id, title, href] of [
    ['ui.sponsor_website', '', 'https://watchtower3d.com'],
    [null, 'Kickstarter', 'https://www.kickstarter.com/projects/watchtower3d/watchtower-3d-printer-dashboard-and-farm-management'],
    ['ui.sponsor_channel', '', 'https://youtube.com/@ygk3d'],
    ['ui.sponsor_video', '', 'https://youtu.be/sXo3FI5NJ7Y'],
  ]) {
    const link = node('a', '', id ? {id} : title);
    if (!id) link.setAttribute('data-i18n', 'off');
    link.href = href;
    link.target = '_blank';
    link.rel = 'sponsored noopener noreferrer';
    sponsorMenu.append(link);
  }
  sponsor.append(sponsorSummary, sponsorMenu);
  stage.append(sponsor);
  workspaceListen(document, 'click', event => { if (!sponsor.contains(event.target)) sponsor.open = false; });
  sponsor.addEventListener('keydown', event => {
    if (event.key === 'Escape') { sponsor.open = false; sponsorSummary.focus(); }
  });
  const skip = node('a', 'skip-link', '設定へスキップ');
  skip.href = '#inspectorTabs';
  document.body.prepend(skip);

  const page = location.pathname.split('/').pop() || 'index.html';
  const kind = workspaceKindFor(page), machinePage = kind === 'printer';
  document.body.dataset.workspaceKind = kind;
  const navigation = node('nav', 'workspace-nav');
  navigation.setAttribute('aria-label', 'ワークスペース');
  const destinations = [
    ['ui.printer', './', machinePage], ['ui.toolhead', './toolheads.html', page === 'toolheads.html'],
    ['ui.gantry', './gantries.html', page === 'gantries.html'],
    ['ui.just_for_fun', '../fun/', false],
    ['ui.support_index', '../support/', false],
  ];
  for (const [id, href, current] of destinations) {
    const link = node('a', '', {id});
    link.href = href;
    if (current) link.setAttribute('aria-current', 'page');
    // Preserve links to the currently selected head, including controller updates.
    if (id === 'ui.toolhead' && $('#toolheadLink')) {
      const original = $('#toolheadLink');
      link.href = original.href;
      new WorkspaceMutationObserver(() => { link.href = original.href; }).observe(original, { attributes: true, attributeFilter: ['href'] });
    }
    if (id === 'ui.printer') link.id = 'workspacePrinterLink';
    if (id === 'ui.support_index') link.id = 'workspaceSupportLink';
    navigation.append(link);
  }
  header.insertBefore(navigation, $('.header-actions'));
  if ($('.brand small')) $('.brand small').hidden = true;
  function rememberPrinter() {
    let remembered;
    try {
      if (machinePage && document.body.dataset.machineId) sessionStorage.setItem(workspaceReturnKey, location.href);
      remembered = sessionStorage.getItem(workspaceReturnKey);
    } catch {}
    const href = printerWorkspaceURL(location.href, remembered), link = $('#workspacePrinterLink');
    if (link.href !== href) link.href = href;
    const support = $('#workspaceSupportLink'), supportURL = new URL('../support/', location.href);
    const supportMachine = machinePage ? document.body.dataset.machineId : page === 'gantries.html' ? 'gantries' : 'toolheads';
    if (supportMachine) supportURL.searchParams.set('machine', supportMachine);
    supportURL.searchParams.set('lang', new URL(location.href).searchParams.get('lang') || document.documentElement.lang || 'en');
    if (support.href !== supportURL.href) support.href = supportURL.href;
  }
  rememberPrinter();
  workspaceListen(window, 'rig-language-change', rememberPrinter);
  new WorkspaceMutationObserver(rememberPrinter).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['data-machine-id','data-variant']});
  for (const link of header.querySelectorAll('.mode-link')) link.hidden = true;
  for (const link of aside.querySelectorAll(':scope > .workbench-link')) {
    if (isPrimaryWorkspaceLink(originalText(link))) link.hidden = true;
  }

  const actions = $('.header-actions');
  let downloadEntry = $('#openDownloads');
  if (!downloadEntry) { downloadEntry = node('button'); downloadEntry.id = 'openDownloads'; actions.append(downloadEntry); }
  downloadEntry.hidden = false; downloadEntry.disabled = true; downloadEntry.textContent = 'STEP';
  downloadEntry.setAttribute('aria-label', messageSource('ui.step_downloads'));
  downloadEntry.setAttribute('aria-haspopup', 'dialog');
  const more = node('details', 'workspace-more');
  more.append(node('summary', '', '資料'));
  if (['components.html','toolchangers.html','e3ng.html'].includes(page)) more.classList.add('current-reference');
  const menu = node('div', 'workspace-menu');
  more.append(menu);
  actions.append(more);
  for (const [label, href] of [['部品CAD','./components.html'],['交換機構','./toolchangers.html'],['E3NG · 交換機構','./e3ng.html']]) {
    const link = node('a', '', label); link.href = href;
    if (href.endsWith(page)) link.setAttribute('aria-current', 'page');
    menu.append(link);
  }
  menu.append(node('hr'));
  const moveActions = () => {
    for (const button of actions.querySelectorAll(':scope > button:not(#openRender):not(#openShare):not(#themeToggle):not(#openDownloads)')) menu.append(button);
  };
  moveActions();
  new WorkspaceMutationObserver(moveActions).observe(actions, { childList: true });
  menu.addEventListener('click', event => { if (event.target.closest('button')) more.open = false; });
  workspaceListen(document,'click', event => { if (!more.contains(event.target)) more.open = false; });
  more.addEventListener('keydown', event => { if (event.key === 'Escape') { more.open = false; more.querySelector('summary').focus(); } });
  if ($('#openRender')) $('#openRender').textContent = '画像を書き出す';
  setupWorkspaceSharing({navigation, actions, menu});

  const heading = node('div', 'inspector-heading');
  const title = aside.querySelector('h1');
  const description = title?.nextElementSibling;
  // The page title and selected model identify the current workspace.
  if (title) heading.append(title);
  if (description?.matches('p.foot')) heading.append(description);
  for (const eyebrow of aside.querySelectorAll(':scope > .eyebrow')) eyebrow.hidden = true;
  aside.prepend(heading);
  if (machinePage) {
    const downloads = node('button', 'machine-step-downloads', {id:'ui.step_downloads'});
    downloads.id = 'machineStepDownloads'; downloads.hidden = true;
    heading.append(downloads);
  }

  const machineSelect = $('#machineConfig');
  if (machineSelect) {
    const dialog = node('dialog', 'machine-dialog');
    dialog.id = 'machineDialog';
    dialog.setAttribute('aria-labelledby', 'machineDialogTitle');
    const dialogHead = node('div', 'dialog-head');
    const dialogTitle = node('h2', '', 'マシンを選ぶ');
    dialogTitle.id = 'machineDialogTitle';
    const close = node('button', 'close', '');
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
  const resetHorizontalScroll = lockInspectorHorizontalScroll(content);
  const footer = node('div', 'inspector-footer');
  const groups = new Map();
  let active = 'configuration', userSelectedTab = false;
  let displayed = active;
  const scrollPositions = new Map();
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
    tab.onclick = () => { userSelectedTab = true; activate(key); };
  }
  heading.after(tabs, content, footer);
  function activate(key, focus = false) {
    scrollPositions.set(displayed, content.scrollTop);
    active = key;
    for (const [id, { tab, panel }] of groups) {
      tab.setAttribute('aria-selected', String(id === key));
      tab.tabIndex = id === key ? 0 : -1;
      panel.hidden = id !== key;
    }
    content.scrollTop = scrollPositions.get(key) || 0;
    displayed = key;
    resetHorizontalScroll();
    if (focus) groups.get(key).tab.focus();
  }
  tabs.addEventListener('keydown', event => {
    const available = [...groups].filter(([, group]) => !group.tab.hidden);
    const index = available.findIndex(([id]) => id === active);
    const next = event.key === 'ArrowRight' ? (index + 1) % available.length : event.key === 'ArrowLeft' ? (index - 1 + available.length) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    userSelectedTab = true;
    activate(available[next][0], true);
  });
  function category(element) {
    if (element.matches('a.workbench-link') && !['buildMonolith','monolithPrinterLink'].includes(element.id)) return 'reference';
    return workspaceSectionCategory(originalText(element.querySelector(':scope > summary')));
  }
  function organize() {
    const candidates = [...aside.children, ...heading.children].filter(element => ![heading, tabs, content, footer].includes(element) && !element.matches('h1, .inspector-eyebrow, .change-machine, .mobile-layout, .machine-step-downloads') && !(heading.contains(element) && element.matches('p.foot')));
    for (const element of candidates) {
      if (element.hidden && element.matches('.eyebrow, .workbench-link')) continue;
      if (element.id === 'toolheadLink') { element.hidden = true; continue; }
      const key = category(element);
      groups.get(key).panel.append(element);
      if (element.tagName === 'DETAILS') {
        element.classList.add('panel-section');
        if (element.classList.contains('builder-search')) element.open = false;
        else if (key !== 'reference' && !groups.get(key).panel.querySelector('details[open]')) element.open = true;
      }
    }
    prioritizeConfiguration();
    // Keep file controls available without opening technical conditions.
    const save = $('#saveConfiguration'), load = $('#loadConfiguration');
    if (save && load && save.parentElement !== footer) {
      footer.append(save, load);
      save.textContent = '構成を保存';
      load.textContent = '読み込む';
    }
    const draft = $('#configurationDraft');
    if (draft && draft.parentElement !== footer) footer.prepend(draft);
    for (const id of ['printerLink','monolithPrinterLink']) {
      const link = $('#'+id);
      if (link && link.parentElement !== footer) { link.classList.add('workspace-apply'); footer.prepend(link); }
    }
    footer.hidden = !footer.children.length;
    for (const { tab, panel } of groups.values()) tab.hidden = ![...panel.children].some(element => !element.hidden);
    if (machinePage && !userSelectedTab) {
      const configurable = groups.get('configuration').panel.querySelector('select, input:not([type=hidden])');
      active = configurable ? 'configuration' : 'inspect';
    }
    if (groups.get(active).tab.hidden) active = [...groups].find(([, group]) => !group.tab.hidden)?.[0] || 'configuration';
    activate(active);
  }
  function prioritizeConfiguration() {
    const panel = groups.get('configuration').panel, primary = $('#configurationControls');
    const searchEntry = panel.querySelector(':scope > .configuration-search');
    if (machinePage && primary?.parentElement === panel) {
      if (searchEntry && searchEntry.nextElementSibling !== primary) searchEntry.after(primary);
      else if (!searchEntry && panel.firstElementChild !== primary) panel.prepend(primary);
    }
    const bank = $('#changerBank');
    if (primary?.parentElement === panel && bank?.parentElement === panel && primary.nextElementSibling !== bank) primary.after(bank);
    if (machinePage && primary?.tagName === 'DETAILS') primary.open = true;
    const search = panel.querySelector(':scope > .builder-search');
    if (search && panel.lastElementChild !== search) panel.append(search);
  }
  organize();
  new WorkspaceMutationObserver(prioritizeConfiguration).observe(groups.get('configuration').panel, {childList:true});
  // New machine-head and G-code panels arrive after asynchronous CAD loading.
  new WorkspaceMutationObserver(organize).observe(aside, { childList: true });
  new WorkspaceMutationObserver(organize).observe(heading, { childList: true });
  // Hidden dynamic sections should expose their category when installed.
  const visibility = new WorkspaceMutationObserver(() => {
    for (const { tab, panel } of groups.values()) tab.hidden = ![...panel.children].some(element => !element.hidden);
  });
  visibility.observe(content, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  function organizeAdvancedFields() {
    const configuration = $('#configurationControls');
    if (configuration) {
      const fields = ['carriageConfig', 'boardConfig', 'coolingConfig']
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
  new WorkspaceMutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(element => element.nodeType === 1 && element.matches('select, label, fieldset, #configurationControls')))) organizeAdvancedFields();
  }).observe(aside, { childList: true, subtree: true });

  content.id = 'inspectorContent';
  setupMobileLayout({workspace: $('.workspace'), heading, make: node});
  setupChoiceSearch(groups.get('configuration').panel);

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
  guide.innerHTML = '<div class="dialog-head"><h2 id="guideTitle">3Dビューの操作</h2><button class="close" aria-label="閉じる"></button></div><div class="dialog-body"><dl class="guide-keys"><dt>回転</dt><dd>左ドラッグ / 1本指でドラッグ</dd><dt>移動</dt><dd>右ドラッグ / 2本指でドラッグ</dd><dt>拡大・縮小</dt><dd>ホイール / ピンチ</dd><dt>視点を切り替える</dt><dd><kbd>1</kbd> 斜め　<kbd>2</kbd> 正面　<kbd>3</kbd> 上面・側面</dd><dt>ヘッドを拡大</dt><dd><kbd>4</kbd> 対応するマシンで使用</dd></dl><p class="foot">構成・外観・動作は設定タブから。スマートフォンでは「3Dビュー」でモデルを広く、「構成画面」で3Dと設定を同時に表示できます。</p></div>';
  document.body.append(guide);
  const credits = node('a', 'cad-credits', 'CAD credits');
  credits.href = './art/credits.html';
  credits.target = '_blank';
  credits.rel = 'noopener';
  guide.querySelector('.dialog-body').append(credits);
  help.onclick = () => guide.showModal();
  guide.querySelector('.close').onclick = () => guide.close();
  workspaceListen(document,'keydown', event => {
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
  new WorkspaceMutationObserver(nameDialogs).observe(document.body, { childList: true });
  setupDisplayPreferences();
  setupHeaderThemeToggle(actions);
  setupLanguage();
}
