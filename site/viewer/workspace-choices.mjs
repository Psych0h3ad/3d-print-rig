import {WorkspaceMutationObserver,workspaceListen} from './workspace-lifecycle.mjs';
import {translate,originalText,originalAttribute} from './i18n.mjs?v=9ad852831c88771612b5';

const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
export function matchingChoices(rows, query) {
  const terms = normalize(query).split(' ').filter(Boolean);
  return rows.filter(row => terms.every(term => normalize(`${row.label} ${row.field} ${row.detail}`).includes(term)));
}
export function applyChoice(select, value) {
  const option = [...select.options].find(option => option.value === value);
  if (select.disabled || select.hidden || select.closest?.('[hidden]') || !option || option.hidden || option.disabled || option.parentElement?.disabled || option.parentElement?.hidden) return false;
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  }
  return true;
}

export function setupChoiceSearch(panel) {
  const t = text => translate(text, document.documentElement.lang);
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const entry = make('div', '', 'configuration-search');
  const open = make('button', '部品を探す', 'find-component');
  open.type = 'button'; open.id = 'findComponent';
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-controls', 'choiceDialog');
  entry.append(open); panel.prepend(entry);
  const dialog = make('dialog', '', 'choice-dialog');
  dialog.id = 'choiceDialog'; dialog.setAttribute('aria-labelledby', 'choiceTitle');
  const head = make('div', '', 'dialog-head');
  const title = make('h2', '部品を探す'); title.id = 'choiceTitle';
  const close = make('button', '', 'close'); close.setAttribute('aria-label', '閉じる');
  head.append(title, close);
  const body = make('div', '', 'dialog-body');
  const hint = make('p', '候補を選ぶと構成に反映します。関連部品が変わる場合は候補に表示します。', 'foot');
  const controls = make('div', '', 'choice-filters');
  const fieldLabel = make('label', '項目'); fieldLabel.htmlFor = 'choiceField';
  const field = make('select'); field.id = 'choiceField';
  const queryLabel = make('label', '部品名・仕様で検索'); queryLabel.htmlFor = 'choiceQuery';
  const query = make('input'); query.id = 'choiceQuery'; query.type = 'search';
  query.placeholder = '例：Sphinx、Rapido、9 mm'; query.autocomplete = 'off';
  const count = make('p', '', 'choice-count'); count.setAttribute('role', 'status');
  const list = make('div', '', 'choice-results');
  list.id = 'choiceResults'; query.setAttribute('aria-controls', list.id);
  controls.append(fieldLabel, field, queryLabel, query);
  body.append(hint, controls, count, list); dialog.append(head, body); document.body.append(dialog);
  const fields = () => [...panel.querySelectorAll('select[id]')].filter(select => {
    const hidden = select.closest('[hidden]');
    // An inactive tab does not change which controls this panel contains.
    return (!hidden || hidden === panel) && !select.closest('.builder-search') && select.options.length;
  });
  const caption = select => originalText(select.labels?.[0]).trim() || originalAttribute(select,'aria-label') || select.id;
  function refreshFields() {
    const selects = fields(), previous = field.value;
    if (entry.hidden !== !selects.length) entry.hidden = !selects.length;
    const disabled = !selects.some(select => !select.disabled);
    if (open.disabled !== disabled) open.disabled = disabled;
    if (!dialog.open) return;
    const all = make('option', t('すべての項目')); all.value = '*';
    field.replaceChildren(all, ...selects.map(select => {
      const option = make('option', t(caption(select))); option.value = select.id; return option;
    }));
    field.value = [...field.options].some(option => option.value === previous) ? previous : '*';
  }
  function render() {
    const rows = fields().filter(select => field.value === '*' || field.value === select.id).flatMap(select =>
      [...select.options].filter(option => !option.hidden && !option.parentElement.hidden).map(option => ({
        select, value: option.value, label: t(originalText(option)), field: t(caption(select)), detail: t(originalAttribute(option,'title')||''),
        disabled: select.disabled || option.disabled || option.parentElement.disabled,
        selected: select.value === option.value,
      })));
    const matches = matchingChoices(rows, query.value);
    count.textContent = t('{0}件の候補').replace('{0}', matches.length);
    list.replaceChildren(...matches.map(row => {
      const button = make('button', '', 'choice-result'); button.type = 'button'; button.disabled = row.disabled;
      const meta = make('span', row.field + (row.selected ? ` · ${t('選択中')}` : ''), 'choice-meta');
      const name = make('strong', row.label);
      button.append(meta, name);
      if (row.detail) button.append(make('span', row.detail, 'choice-detail'));
      if (row.selected) button.classList.add('is-selected');
      button.addEventListener('click', () => {
        // Recheck the live option; asynchronous CAD loads can replace this list.
        if (row.select.isConnected && applyChoice(row.select, row.value)) dialog.close();
        else { refreshFields(); render(); }
      });
      return button;
    }));
    if (!matches.length) {
      list.append(make('p', '候補が見つかりません。項目を変えるか、短い部品名で検索してください。', 'choice-empty'));
      const clear = make('button', '検索をクリア');
      clear.onclick = () => { query.value = ''; render(); query.focus(); };
      list.append(clear);
    }
  }
  open.onclick = () => {
    hint.textContent=document.getElementById('configurationDraft')?'候補を選ぶと変更案に追加します。「変更を3Dに反映」でまとめて反映できます。':'候補を選ぶと構成に反映します。関連部品が変わる場合は候補に表示します。';
    dialog.showModal(); query.value = ''; refreshFields();
    // Search across dependent choices too: a head can be offered by switching
    // its gantry even when it is absent from the current head dropdown.
    field.value = '*';
    render(); query.focus();
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => open.focus({preventScroll: true}));
  field.onchange = render; query.oninput = render;
  new WorkspaceMutationObserver(() => { refreshFields(); if (dialog.open) render(); }).observe(panel, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'title'],
  });
  workspaceListen(window,'rig-language-change', () => { if (dialog.open) { refreshFields(); render(); } });
  refreshFields();
  return entry;
}
