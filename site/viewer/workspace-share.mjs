import {workspaceTask,WorkspaceMutationObserver} from './workspace-lifecycle.mjs';
import {embedURL,iframeMarkup} from './embed-contract.mjs?v=4fc89f7f6f11001e30f4';
export const siteLinks = Object.freeze({
  github: 'https://github.com/Psych0h3ad/3d-print-rig',
  x: 'https://www.x.com/YuTR0N',
});

export function pageShareData(href, title, headPalette) {
  const url = new URL(href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported page URL');
  if (url.hash === '#inspectorTabs') url.hash = '';
  // The head controller already restores these two URL parameters. Other
  // controllers own their own query state; preserve it without inventing fields.
  if (url.pathname.endsWith('/toolheads.html') && headPalette) {
    for (const key of ['base', 'accent']) {
      if (/^#[0-9a-f]{6}$/iu.test(headPalette[key] || '')) url.searchParams.set(key, headPalette[key].slice(1));
    }
  }
  return {title: title || '3D Print Rig', url: url.href};
}

export function xShareURL(data) {
  const intent = new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text', data.title);
  intent.searchParams.set('url', data.url);
  return intent.href;
}

export function setupWorkspaceSharing({navigation, actions, menu}) {
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const social = make('span', '', 'workspace-social');
  for (const [label, href, description] of [
    ['GitHub', siteLinks.github, 'GitHubリポジトリを開く'],
    ['X', siteLinks.x, '作者のXプロフィールを開く'],
  ]) {
    const link = make('a', label);
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', description); link.title = description;
    social.append(link);
  }
  navigation.append(social);
  const trigger = make('button', '共有');
  trigger.id = 'openShare';
  trigger.setAttribute('aria-haspopup', 'dialog');
  actions.insertBefore(trigger, actions.querySelector('.workspace-more'));

  const dialog = make('dialog', '', 'share-dialog');
  dialog.id = 'pageShareDialog'; dialog.setAttribute('aria-labelledby', 'pageShareTitle');
  const heading = make('div', '', 'dialog-head'), title = make('h2', 'このページを共有');
  title.id = 'pageShareTitle';
  const close = make('button', '', 'close'); close.setAttribute('aria-label', '閉じる');
  heading.append(title, close);
  const body = make('div', '', 'dialog-body');
  const selected = make('p', '', 'share-page-title');
  const label = make('label', '共有リンク'); label.htmlFor = 'pageShareURL';
  const input = make('input'); input.id = 'pageShareURL'; input.type = 'url'; input.readOnly = true;
  const controls = make('div', '', 'share-actions');
  const copy = make('button', 'リンクをコピー', 'primary'); copy.id = 'copyPageLink';
  const x = make('a', 'Xで共有'); x.target = '_blank'; x.rel = 'noopener noreferrer';
  const native = make('button', '端末で共有'); native.hidden = typeof navigator.share !== 'function';
  const status = make('p', '', 'foot'); status.id = 'pageShareStatus'; status.setAttribute('role', 'status');
  controls.append(copy, x, native); body.append(selected, label, input, controls, status); dialog.append(heading, body);
  const embed=make('section','','share-embed'),embedTitle=make('h3','サイトに埋め込む · テスト機能');
  const embedNote=make('p','テスト公開中です。機種・構成を維持して更新を自動反映します。開発中のため、表示や操作が変わる場合があります。','foot');
  const themeLabel=make('label','埋め込みの配色');themeLabel.htmlFor='embedTheme';
  const theme=make('select');theme.id='embedTheme';
  for(const[value,text]of [['light','ライト'],['dark','ダーク'],['auto','端末に合わせる']]){const option=make('option',text);option.value=value;theme.append(option);}
  theme.value=document.documentElement.dataset.theme==='dark'?'dark':'light';
  const codeLabel=make('label','埋め込みコード');codeLabel.htmlFor='embedCode';
  const code=make('textarea');code.id='embedCode';code.rows=4;code.readOnly=true;code.spellcheck=false;
  const embedActions=make('div','','share-actions'),copyEmbed=make('button','コードをコピー'),preview=make('a','埋め込みをプレビュー');
  copyEmbed.id='copyEmbedCode';preview.id='previewEmbed';preview.target='_blank';preview.rel='noopener';
  const embedStatus=make('p','','foot');embedStatus.setAttribute('role','status');
  embedActions.append(copyEmbed,preview);embed.append(embedTitle,embedNote,themeLabel,theme,codeLabel,code,embedActions,embedStatus);body.append(embed);
  document.body.append(dialog);
  const current = () => pageShareData(location.href, document.title, {
    base: document.querySelector('#baseColor')?.value,
    accent: document.querySelector('#accentColor')?.value,
  });
  function refresh() {
    const data = current(); input.value = data.url; selected.textContent = document.querySelector('.inspector-heading h1')?.textContent || data.title;
    x.href = xShareURL(data); return data;
  }
  function refreshEmbed(){
    const data=current(),url=embedURL(data.url,{theme:theme.value,machine:document.body.dataset.machineId});
    code.value=iframeMarkup(url,data.title);preview.href=url;return code.value;
  }
  theme.onchange=refreshEmbed;code.onclick=()=>code.select();preview.onclick=refreshEmbed;
  copyEmbed.onclick=()=>workspaceTask(async()=>{
    const value=refreshEmbed();
    try{await navigator.clipboard.writeText(value);embedStatus.textContent='コードをコピーしました。';}
    catch{code.focus();code.select();embedStatus.textContent='コードを選択しました。コピーしてサイトに貼り付けてください。';}
  });
  trigger.onclick = () => { refresh();refreshEmbed(); status.textContent = '';embedStatus.textContent=''; dialog.showModal(); };
  close.onclick = () => dialog.close();
  input.onclick = () => input.select();
  copy.onclick = async () => {return workspaceTask(async()=>{
    const data = refresh();
    try {
      await navigator.clipboard.writeText(data.url);
      status.textContent = 'リンクをコピーしました。';
    } catch {
      input.focus(); input.select();
      status.textContent = 'リンクを選択しました。コピーして共有してください。';
    }
  });};
  // Refresh at activation time so a changed page state is never shared stale.
  x.onclick = refresh;
  native.onclick = async () => {return workspaceTask(async()=>{
    const data = refresh(); status.textContent = '';
    try { await navigator.share(data); }
    catch (error) {
      if (error.name !== 'AbortError') status.textContent = '共有メニューを開けませんでした。リンクをコピーしてください。';
    }
  });};

  // Keep the narrow header small while retaining image export in its menu.
  const exportButton = document.querySelector('#openRender');
  if (exportButton) {
    const exportShortcut = make('button', '画像を書き出す', 'mobile-export-shortcut');
    exportShortcut.disabled = exportButton.disabled;
    exportShortcut.onclick = () => exportButton.click();
    new WorkspaceMutationObserver(() => { exportShortcut.disabled = exportButton.disabled; }).observe(exportButton, {attributes: true, attributeFilter: ['disabled']});
    menu.prepend(exportShortcut);
  }
}
