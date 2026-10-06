import assert from 'node:assert/strict';
import {javascriptLiterals} from './js-ui-literals.mjs';
assert.deepEqual(javascriptLiterals("const x=/[\"']/gu; const title='入力の出典'; // 'comment'\nconst y=a / b; status.textContent='再生';"),['入力の出典','再生']);
assert.deepEqual(javascriptLiterals('const s=`先頭 ${items.map(x=>`${x ? "有効" : "無効"}`).join(" · ")}末尾`;const t="後続";'),['有効','無効','{0}',' · ','先頭 {0}末尾','後続']);
assert.deepEqual(javascriptLiterals('function f(){return /[\"\\/]/.test(x) ? "値" : "なし"}'),['値','なし']);
assert.deepEqual(javascriptLiterals('const s=`${({x:"設定"}).x}終端`; /* "comment" */'),['設定','{0}終端']);
console.log('PASS UI literal extraction with regex quotes, division, comments and nested templates');
