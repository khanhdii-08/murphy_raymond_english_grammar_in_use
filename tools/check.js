#!/usr/bin/env node
/* Kiểm tra tĩnh cấu trúc file unit (không cần jsdom).
   Dùng:  node tools/check.js                 → kiểm tra toàn bộ units/*.html
          node tools/check.js units/unit3.html → kiểm tra 1 file        */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const files = args.length
  ? args
  : fs.readdirSync(path.join(ROOT, 'units'))
      .filter(f => f.endsWith('.html'))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
      .map(f => path.join('units', f));

let totalErr = 0;

for (const rel of files) {
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const out = s => console.log('  ' + s);
  console.log('\n=== ' + rel + ' ===');
  if (!fs.existsSync(file)) { console.log('  !! file not found'); totalErr++; continue; }
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) { console.log('  !! no <script> block'); totalErr++; continue; }
  const script = m[1];
  let err = 0;

  // 1. Đọc QUESTIONS
  const s = script.indexOf('var QUESTIONS = [');
  const e = script.indexOf('\n  ];', s);
  if (s < 0 || e < 0) { console.log('  !! QUESTIONS not found'); totalErr++; continue; }
  let QUESTIONS;
  try { QUESTIONS = eval(script.slice(s + 'var QUESTIONS = '.length, e + 5)); }
  catch (ex) { console.log('  !! QUESTIONS eval ERROR: ' + ex.message); totalErr++; continue; }
  out('Questions: ' + QUESTIONS.length);

  // 2. Đọc SECTIONS
  const ss = script.indexOf('var SECTIONS = [');
  const se = script.indexOf('\n  ];', ss);
  const SECTIONS = (ss >= 0 && se > ss) ? eval(script.slice(ss + 'var SECTIONS = '.length, se + 5)) : [];
  out('Sections defined: ' + SECTIONS.length);

  // 3. Cấu trúc từng câu
  const ids = new Set();
  let scored = 0, selfN = 0;
  for (const q of QUESTIONS) {
    const bad = msg => { console.log('  !! ' + q.id + ': ' + msg); err++; };
    if (!q.id) bad('missing id');
    if (ids.has(q.id)) bad('duplicate id'); ids.add(q.id);
    if (!q.sec) bad('missing sec');
    if (!q.type) bad('missing type');
    if (!q.q) bad('missing q');
    if (!q.exp) bad('missing exp');
    if (q.type === 'mcq') {
      if (!Array.isArray(q.opts) || q.opts.length < 2) bad('opts < 2');
      if (typeof q.a !== 'number' || q.a < 0 || q.a >= q.opts.length) bad('bad a index');
      if (!q.opts[q.a]) bad('no answer text at a');
    } else if (q.type === 'fill' || q.type === 'order') {
      if (!Array.isArray(q.acc) || !q.acc.length) bad('acc empty');
      if (!q.ans) bad('ans empty');
    } else if (q.type === 'match') {
      if (!Array.isArray(q.items) || !q.items.length) bad('items empty');
      if (!q.w) bad('missing w');
      if (q.items.length !== q.w) bad('items.length ' + q.items.length + ' != w ' + q.w);
      const letters = new Set(q.items.map(i => i.letter));
      if (letters.size !== q.items.length) bad('duplicate letters');
    } else if (q.type === 'self') {
      if (!q.sample) bad('missing sample');
      selfN++;
    } else bad('unknown type ' + q.type);
    if (q.type !== 'self') scored += (q.type === 'match' ? q.w : 1);
  }
  out('Scored points: ' + scored + ' | self-graded: ' + selfN);

  // 4. section dùng có khai báo không
  const secIds = new Set(SECTIONS.map(x => x.id));
  for (const sec of [...new Set(QUESTIONS.map(q => q.sec))])
    if (SECTIONS.length && !secIds.has(sec)) { console.log('  !! section ' + sec + ' not declared in SECTIONS'); err++; }

  // 5. id HTML mà JS gọi phải tồn tại
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]));
  const refs = new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map(x => x[1]));
  [...script.matchAll(/getElementById\('([^']+)'\)/g)].forEach(x => refs.add(x[1]));
  for (const r of refs) if (!htmlIds.has(r)) { console.log('  !! missing HTML id: ' + r); err++; }
  out('ID refs checked: ' + refs.size);

  // 6. id HTML trùng
  const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  const dup = all.filter((x, i) => all.indexOf(x) !== i);
  if (dup.length) { console.log('  !! duplicate HTML ids: ' + [...new Set(dup)].join(',')); err++; }

  // 7. Thẻ chính cân bằng
  for (const tag of ['div', 'section', 'table', 'script', 'style', 'header', 'footer']) {
    const open = (html.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
    const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== close) { console.log('  !! tag imbalance <' + tag + '>: ' + open + '/' + close); err++; }
  }

  // 8. Nút có addEventListener phải có id
  const listeners = [...script.matchAll(/\$\('([^']+)'\)\.addEventListener/g)].map(x => x[1]);
  for (const l of listeners) if (!htmlIds.has(l)) { console.log('  !! listener target missing: ' + l); err++; }

  // 9. Không link ra tài nguyên ngoài (phải offline được)
  const ext = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+|\/\/[^"]+)"/g)].map(x => x[1]);
  if (ext.length) { console.log('  !! external resource: ' + ext.join(', ')); err++; }

  // 10. FILENAME/KEY đúng tên file
  const fn = script.match(/var FILENAME = '([^']+)'/);
  const key = script.match(/var KEY = '([^']+)'/);
  if (!fn || path.basename(fn[1]) !== path.basename(file)) { console.log('  !! FILENAME mismatch: ' + (fn && fn[1])); err++; }
  if (!key) { console.log('  !! missing KEY'); err++; }

  console.log(err ? '  ERRORS: ' + err : '  ALL CHECKS PASSED');
  totalErr += err;
}

console.log('\n' + (totalErr ? 'TỔNG LỖI: ' + totalErr : 'OK — ' + files.length + ' file(s) sạch'));
process.exit(totalErr ? 1 : 0);
