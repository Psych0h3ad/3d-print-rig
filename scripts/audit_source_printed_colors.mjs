// Release gate: neither reviewed family may be omitted or silently skipped.
// Uses exactly the same explicit-path plan as audit_printed_color_leaks.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditPrintedColorLeaks} from './audit_printed_color_leaks.mjs';
import {assertPrintedColorSourceCoverage} from './printed-color-source-contracts.mjs';
export async function auditSourcePrintedColors(plan,reportPath){
 assertPrintedColorSourceCoverage(plan.assets);
 return auditPrintedColorLeaks(plan,reportPath);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await auditSourcePrintedColors(JSON.parse(await fs.readFile(process.argv[2],'utf8')),process.argv[3]);
 process.exitCode=report.passed?0:1;
}
