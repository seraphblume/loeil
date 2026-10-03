// Publish from a computer: the same gate and the same encryption as the app's
// Me → Publish data screen, writing data/catalogue.enc.json for you to commit.
//
//   cd tools && npm install
//   node publish.mjs ~/path/LOEIL_Backend.xlsx ~/path/Catalogue.xlsx
//
// The passcode is asked for (hidden), or read from LOEIL_PASSCODE.

import * as fs from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import XLSX from 'xlsx';
import { ingest, tablesFromWorkbook } from '../src/core/ingest.js';
import { seal } from '../src/core/crypto.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length !== 2) {
  console.error('Usage: node publish.mjs <LOEIL_Backend.xlsx> <Catalogue.xlsx>');
  process.exit(2);
}

const workbooks = files.map((f) => ({ name: basename(f), sheets: tablesFromWorkbook(XLSX, XLSX.readFile(f)) }));
const { bundle, report } = ingest(workbooks);

for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k.padEnd(16)} ${v}`);
const show = (title, list) => { if (list.length) { console.log(`\n${title}`); for (const i of list) console.log(`  [${i.sheet}] ${i.message}`); } };
show('FIX BEFORE PUBLISHING', report.errors);
show('Worth a look', report.warnings);
show('For the record', report.notes);
if (!report.ok) { console.error('\nNot published: the gate found errors.'); process.exit(1); }

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

const passcode = process.env.LOEIL_PASSCODE ?? await ask('\nStore passcode: ');
const envelope = await seal(bundle, passcode);
const out = join(ROOT, 'data', 'catalogue.enc.json');
fs.mkdirSync(join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(out, JSON.stringify(envelope));
console.log(`\nWrote data/catalogue.enc.json · version ${bundle.dataVersion}`);
console.log('Commit and push it; GitHub Pages redeploys and every phone updates on its next launch.');
