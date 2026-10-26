import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceCreditPresentation,sourceRepositoryTerms,groupedSourceCredits} from '../site/viewer/source-credit-format.mjs';
import {sourceCreditRecords} from '../site/viewer/source-assembly-references.mjs';
import {sourceCreditNote,sourceCreditLabel} from '../site/viewer/source-assembly-ui-text.mjs';
import {sourceText} from '../site/viewer/source-assembly-messages.mjs';
const base=new URL('../',import.meta.url),read=url=>JSON.parse(fs.readFileSync(url,'utf8'));
const catalog=read(new URL('site/PUBLIC_CATALOG.json',base));
for(const rule of sourceRepositoryTerms){
 const source=catalog.sources.find(s=>s.repository===rule.owner+'/'+rule.repo&&s.commit===rule.commit);assert(source);assert.equal(source.license,rule.license);assert.equal(source.license_sha256,rule.license_sha256);
 const file=new URL(source.license_url,new URL('site/viewer/',base));assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),rule.license_sha256);
}
const expected='a8628f48546948ce1fc15511b7765b7f31f80722',url='https://raw.githubusercontent.com/VoronDesign/Voron-Trident/'+expected+'/CAD/trident_assembly.step.zip';
const records=groupedSourceCredits([{url,revision:'Exact executed143 source; postprocessed145 technical format',license:'GPL-3.0'},{url,revision:'Exact source-only approved packet',license:'No license stated in the public CAD download.'}]);
assert.equal(records.length,1);assert.deepEqual(records[0].license_variants,['GPL-3.0','No license stated in the public CAD download.']);
assert.equal(sourceCreditLabel(records[0]),'VoronDesign/Voron-Trident / trident_assembly.step.zip');assert.equal(sourceCreditPresentation(records[0]).revision,expected);
for(const language of ['en','ja','es','ko','ru','de']){const note=sourceCreditNote(records[0],k=>sourceText(k,language));assert(note.includes(expected)&&note.includes('GPL-3.0'));assert(!/executed143|postprocessed145|approved packet/.test(note));assert(!/unknownRevision|repositoryLicense|componentLicense/.test(note));}
assert.equal(sourceCreditPresentation({url:'https://example.test/component.step',revision:'Exact source-only approved packet'}).revision,null);
assert.equal(sourceCreditPresentation({url:'https://www.aspenfasteners.com/',revision:'2026-10-12T14:53:37.122493+00:00'}).revision,null,'An acquisition timestamp is not a product version');
for(const item of read(new URL('site/SOURCE_ASSEMBLIES.json',base)).models){
 const packet=read(new URL(item.packet.url,new URL('site/viewer/',base))),before=JSON.stringify(packet),sources=sourceCreditRecords(packet);
 assert.deepEqual(new Set(sources.map(s=>s.url)),new Set([packet.public_author_source,...packet.public_sources].map(s=>s.url)));
 for(const s of sources){assert(sourceCreditLabel(s));assert(!/executed\d|postprocessed\d|source-only approved packet/i.test(sourceCreditNote(s,k=>sourceText(k,'en'))));}
 assert.equal(JSON.stringify(packet),before,'Formatting leaves primary metadata unchanged');
}
console.log('Actual source credits: URL-derived owner/repository/file, pinned revision, scoped license evidence, unknown terms retained, all primary URLs preserved and no packet mutation.');
