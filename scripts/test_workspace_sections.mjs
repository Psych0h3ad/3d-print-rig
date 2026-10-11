import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {workspaceSectionCategory,isPrimaryWorkspaceLink} from '../site/viewer/workspace-sections.mjs';
import {translate} from '../site/viewer/i18n.mjs';
for(const [text,expected]of [['Colors and materials','appearance'],['Inspect motion','inspect'],['Disco / lighting','appearance'],['Display','appearance'],['Configuration','configuration'],['Additional mods','configuration']]){
 assert.equal(workspaceSectionCategory(text),expected,text+' English initial markup');
 assert.equal(workspaceSectionCategory(translate(text,'ja')),expected,text+' Japanese controller');
}
for(const text of ['Monolithガントリーを組む','ツールヘッド単体を組む','ホットエンド・押出機のCADを確認']){assert(isPrimaryWorkspaceLink(text));assert(isPrimaryWorkspaceLink(translate(text,'en')));}
// Use the shipped community printer markup, including the reported 247zero page.
// Its source/license section belongs to References rather than Configuration.
const community=await readFile(new URL('../site/viewer/community.html',import.meta.url),'utf8');
const summaries=[...community.matchAll(/<summary>([^<]+)<\/summary>/g)].map(match=>match[1]);
assert(summaries.includes('Official data'),'Community source panel is exercised');
const expected=['configuration','inspect','appearance','appearance','reference'];
assert.deepEqual(summaries.map(workspaceSectionCategory),expected,'Native HTML sections enter their intended setting tabs');
assert.deepEqual(summaries.map(text=>workspaceSectionCategory(translate(text,'ja'))),expected,'Canonical Japanese labels retain the same tabs');
assert(!isPrimaryWorkspaceLink('Load configuration'));
console.log('Native community sections preserve setting/source tabs across English and canonical labels.');
