#!/usr/bin/env node
/* Dựng file unit từ mảnh nguồn (template engine lấy từ units/unit1.html):
     units/unit<N>.html  = head+CSS  +  body  +  engine(data)  +  cuối file
   Dùng:  node tools/build.js 3                    (cần tools/src/unit3.*)
          node tools/build.js 3 --check            (dựng rồi chạy check)
   Các file nguồn:
     tools/src/unitN.json      {"n":3,"title":"...","banner":"UNIT 3 – ..."}
     tools/src/unitN.body.html phần giao diện (bắt đầu bằng <header class="hero">)
     tools/src/unitN.data.js   SECTIONS + TYPE_LABEL + QUESTIONS           */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const argv = process.argv.slice(2);
const n = parseInt((argv.find(a => /^\d+$/.test(a)) || ''), 10);
if (!n) { console.error('Dùng: node tools/build.js <số unit> [--check]'); process.exit(2); }
const doCheck = argv.includes('--check');

const tplPath = path.join(ROOT, 'units', 'unit1.html');
const metaPath = path.join(SRC, 'unit' + n + '.json');
const bodyPath = path.join(SRC, 'unit' + n + '.body.html');
const dataPath = path.join(SRC, 'unit' + n + '.data.js');
for (const p of [tplPath, metaPath, bodyPath, dataPath])
  if (!fs.existsSync(p)) { console.error('!! Thiếu file: ' + path.relative(ROOT, p)); process.exit(1); }

const tpl = fs.readFileSync(tplPath, 'utf8');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
let body = fs.readFileSync(bodyPath, 'utf8');
const data = fs.readFileSync(dataPath, 'utf8');
const filename = 'unit' + n + '.html';
const key = 'egu4_unit' + n + '_progress';
const fail = m => { console.error('!! ' + m); process.exit(1); };

if (!body.startsWith('<header class="hero">')) fail('body phải bắt đầu bằng <header class="hero">');
if (body.indexOf('<script>') >= 0) fail('body không được chứa <script>');
if (!/^\s*var SECTIONS = \[/.test(data)) fail('data phải bắt đầu bằng "var SECTIONS = ["');
if (data.indexOf('var QUESTIONS = [') < 0) fail('data thiếu var QUESTIONS');

// --- 1. prefix (head + CSS) với title được thay ---
const heroIdx = tpl.indexOf('<header class="hero">');
if (heroIdx < 0) fail('template thiếu <header class="hero">');
let prefix = tpl.slice(0, heroIdx);
if (!/<title>[\s\S]*?<\/title>/.test(prefix)) fail('template thiếu <title>');
prefix = prefix.replace(/<title>[\s\S]*?<\/title>/, '<title>' + meta.title + '</title>');

// --- 2. engine với banner/FILENAME/KEY/data được thay ---
const scriptStart = tpl.indexOf('<script>');
const scriptEnd = tpl.indexOf('</script>') + '</script>'.length;
const suffix = tpl.slice(scriptEnd);
let engine = tpl.slice(scriptStart, scriptEnd);

const dStart = engine.indexOf('  var SECTIONS = [');
const dEnd = engine.indexOf('  /* =========================================================', dStart);
if (dStart < 0 || dEnd < 0) fail('không tìm thấy khối data trong engine');
engine = engine.slice(0, dStart) + data + engine.slice(dEnd);

const bannerLine = engine.match(/\n\/\* =+\n   UNIT [^\n]*/);
if (!bannerLine) fail('không tìm thấy banner comment');
engine = engine.replace(bannerLine[0], '\n/* ============================================================\n   ' + meta.banner);

if (!/var FILENAME = '[^']*';/.test(engine)) fail('engine thiếu var FILENAME');
engine = engine.replace(/var FILENAME = '[^']*';/, "var FILENAME = '" + filename + "';");
if (!/var KEY = '[^']*';/.test(engine)) fail('engine thiếu var KEY');
engine = engine.replace(/var KEY = '[^']*';/, "var KEY = '" + key + "';");

// --- 3. Ghi file ---
const out = path.join(ROOT, 'units', filename);
const html = prefix + body + engine + suffix;
fs.writeFileSync(out, html);
console.log('Đã dựng ' + path.relative(ROOT, out) + ' (' + html.length + ' ký tự)');
if (html.indexOf('unit' + (n === 1 ? 2 : 1) + '.html') >= 0 && n !== 1)
  console.log('  (chú ý: vẫn còn tham chiếu file unit khác trong nội dung — kiểm tra lại)');

// --- 4. Kiểm tra ---
if (doCheck) {
  const { execFileSync } = require('child_process');
  try { execFileSync(process.execPath, [path.join(__dirname, 'check.js'), out], { stdio: 'inherit' }); }
  catch (e) { process.exit(e.status || 1); }
}
