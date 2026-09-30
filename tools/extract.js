#!/usr/bin/env node
/* Tách 1 file unit thành 3 phần nguồn dễ quản lý (edit phần nào thì rebuild):
     tools/src/unitN.json    → title + banner của unit
     tools/src/unitN.body.html → phần giao diện (hero + tabs + footer)
     tools/src/unitN.data.js   → SECTIONS + TYPE_LABEL + QUESTIONS
   Dùng:  node tools/extract.js units/unit2.html                          */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const file = process.argv[2];
if (!file) { console.error('Dùng: node tools/extract.js units/unitN.html'); process.exit(2); }
const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
const base = path.basename(abs);
const n = parseInt(base.replace(/\D/g, ''), 10);
if (!n) { console.error('Không đọc được số unit từ tên file: ' + base); process.exit(1); }

const html = fs.readFileSync(abs, 'utf8');
const err = m => { console.error('!! ' + m); process.exit(1); };

const heroIdx = html.indexOf('<header class="hero">');
if (heroIdx < 0) err('không thấy <header class="hero">');
const scriptIdx = html.indexOf('<script>');
if (scriptIdx < 0) err('không thấy <script>');
const scriptEnd = html.indexOf('</script>');
if (scriptEnd < scriptIdx) err('không thấy </script>');

const script = html.slice(scriptIdx, scriptEnd);
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
const banner = (script.match(/\n\/\* =+\n   (UNIT [^\n]*)/) || [])[1];
if (!title) err('không thấy <title>');
if (!banner) err('không thấy banner comment trong engine');

const dataStart = script.indexOf('  var SECTIONS = [');
const dataEnd = script.indexOf('  /* =========================================================', dataStart);
if (dataStart < 0 || dataEnd < 0) err('không tìm thấy khối SECTIONS…QUESTIONS');

const body = html.slice(heroIdx, scriptIdx);
const data = script.slice(dataStart, dataEnd);

fs.mkdirSync(SRC, { recursive: true });
const outJson = path.join(SRC, 'unit' + n + '.json');
const outBody = path.join(SRC, 'unit' + n + '.body.html');
const outData = path.join(SRC, 'unit' + n + '.data.js');
fs.writeFileSync(outJson, JSON.stringify({ n: n, title: title, banner: banner }, null, 2) + '\n');
fs.writeFileSync(outBody, body);
fs.writeFileSync(outData, data);

const count = (data.match(/\{ id:'/g) || []).length;
console.log('Đã tách ' + base + ' →');
console.log('  ' + path.relative(ROOT, outJson));
console.log('  ' + path.relative(ROOT, outBody) + ' (' + body.length + ' ký tự)');
console.log('  ' + path.relative(ROOT, outData) + ' (' + data.length + ' ký tự, ~' + count + ' câu)');
