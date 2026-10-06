import {translate} from './i18n.mjs?v=d01a458bbf8c52c2c300';
// Section placement consumes the catalog's canonical labels, independent of
// the initial HTML language or the currently displayed translation.
export function workspaceSectionCategory(source){
 const text=translate(source,'ja');
 if(/組立条件|Mod資料|構成を保存/.test(text))return'reference';
 if(/動作|G-code|接触|交換機構の表示|取付チェック/.test(text))return'inspect';
 if(/色|素材|照明|表示/.test(text))return'appearance';
 if(/原本|出典|使用版|カタログ|選択した構成と部品|部品リスト・共有|マウント・構成/.test(text))return'reference';
 return'configuration';
}
const primaryLinks=['Monolithガントリーを組む','ツールヘッド単体を組む','ホットエンド・押出機のCADを確認'];
export function isPrimaryWorkspaceLink(source){return primaryLinks.some(label=>source.trim().startsWith(label)||source.trim().startsWith(translate(label,'en')));}
