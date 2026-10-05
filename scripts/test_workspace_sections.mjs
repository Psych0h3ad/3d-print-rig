import assert from 'node:assert/strict';
import {workspaceSectionCategory,isPrimaryWorkspaceLink} from '../site/viewer/workspace-sections.mjs';
import {translate} from '../site/viewer/i18n.mjs';
for(const [text,expected]of [['Colors and materials','appearance'],['Inspect motion','inspect'],['Disco / lighting','appearance'],['Display','appearance'],['Configuration','configuration'],['Additional mods','configuration']]){
 assert.equal(workspaceSectionCategory(text),expected,text+' English initial markup');
 assert.equal(workspaceSectionCategory(translate(text,'ja')),expected,text+' Japanese controller');
}
for(const text of ['Monolithガントリーを組む','ツールヘッド単体を組む','ホットエンド・押出機のCADを確認']){assert(isPrimaryWorkspaceLink(text));assert(isPrimaryWorkspaceLink(translate(text,'en')));}
assert(!isPrimaryWorkspaceLink('Load configuration'));
console.log('English initial sections preserve appearance/motion tabs and primary navigation.');
