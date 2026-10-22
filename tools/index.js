#!/usr/bin/env node
/* Cập nhật danh sách unit trong index.html từ tools/src/unitN.json + units/unitN.html.
   Dùng:  node tools/index.js
   Chỉ thay phần giữa <!-- UNITS:START --> và <!-- UNITS:END -->, cùng 2 badge số liệu. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const indexPath = path.join(ROOT, 'index.html');

// Nhóm chủ đề theo mục lục sách
const GROUPS = [
  [1, 'Present and past'], [7, 'Present perfect and past'], [19, 'Future'], [26, 'Modals'],
  [38, 'If and wish'], [42, 'Passive'], [47, 'Reported speech'], [49, 'Questions and auxiliary verbs'],
  [53, '-ing and to …'], [69, 'Articles and nouns'], [82, 'Pronouns and determiners'],
  [92, 'Relative clauses'], [98, 'Adjectives and adverbs'], [113, 'Conjunctions and prepositions'],
  [121, 'Prepositions'], [137, 'Phrasal verbs']
];

const esc = s => String(s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;');

function countQuestions(html) {
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  const s = m[1].indexOf('var QUESTIONS = [');
  const e = m[1].indexOf('\n  ];', s);
  const Q = eval(m[1].slice(s + 'var QUESTIONS = '.length, e + 5));
  let pts = 0;
  Q.forEach(q => { if (q.type !== 'self') pts += (q.type === 'match' ? q.w : 1); });
  return { n: Q.length, pts };
}

let built = 0, totalQ = 0;
let out = '\n';
for (let g = 0; g < GROUPS.length; g++) {
  const from = GROUPS[g][0], to = g + 1 < GROUPS.length ? GROUPS[g + 1][0] - 1 : 145;
  out += '  <h3 class="group">' + esc(GROUPS[g][1]) + ' <small>Unit ' + from + '–' + to + '</small></h3>\n';
  out += '  <div class="grid">\n';
  for (let n = from; n <= to; n++) {
    const metaPath = path.join(SRC, 'unit' + n + '.json');
    const htmlPath = path.join(ROOT, 'units', 'unit' + n + '.html');
    if (!fs.existsSync(metaPath) || !fs.existsSync(htmlPath)) {
      out += '    <div class="unit soon"><span class="num">UNIT ' + n + '</span><h3>Sắp ra mắt</h3>' +
             '<div class="meta"><b>Chưa có</b></div></div>\n';
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const c = countQuestions(fs.readFileSync(htmlPath, 'utf8'));
    built++; totalQ += c.n;
    const name = meta.name || meta.title.replace(/^Unit \d+ – /, '').replace(/ \|.*$/, '');
    out += '    <a class="unit" href="units/unit' + n + '.html">\n' +
           '      <span class="num">UNIT ' + n + '</span>\n' +
           '      <h3>' + esc(name) + '</h3>\n' +
           '      <p>' + esc(meta.desc || '') + '</p>\n' +
           '      <div class="meta"><b>' + c.n + ' câu</b><b>' + c.pts + ' điểm</b>' +
           (meta.ex ? '<b>' + esc(meta.ex) + '</b>' : '') + '</div>\n' +
           '    </a>\n';
  }
  out += '  </div>\n';
}

let html = fs.readFileSync(indexPath, 'utf8');
const A = '<!-- UNITS:START -->', B = '<!-- UNITS:END -->';
const a = html.indexOf(A), b = html.indexOf(B);
if (a < 0 || b < a) { console.error('!! index.html thiếu marker ' + A + ' … ' + B); process.exit(1); }
html = html.slice(0, a + A.length) + out + '  ' + html.slice(b);
html = html.replace(/<span id="bUnits">[^<]*<\/span>/, '<span id="bUnits">' + built + ' / 145 unit</span>');
html = html.replace(/<span id="bQs">[^<]*<\/span>/, '<span id="bQs">' + totalQ.toLocaleString('en-US') + ' câu hỏi có giải thích</span>');
fs.writeFileSync(indexPath, html);
console.log('index.html: ' + built + ' unit, ' + totalQ + ' câu hỏi');
