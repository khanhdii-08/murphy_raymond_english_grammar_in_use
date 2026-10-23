#!/usr/bin/env node
/* Test runtime cho một file unit bằng jsdom (chạy toàn bộ UI: 2 chế độ,
   chấm điểm, localStorage, làm lại câu sai, reset, trộn câu).
   Dùng:  node tools/test.js                    → test toàn bộ units/*.html
          node tools/test.js units/unit3.html   → test 1 file                 */
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.error('Thiếu jsdom — chạy:  npm install'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const files = args.length ? args
  : fs.readdirSync(path.join(ROOT, 'units')).filter(f => f.endsWith('.html'))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
      .map(f => path.join('units', f));

function findFirst(QUESTIONS, type) { return QUESTIONS.find(q => q.type === type); }

function answerAll(doc, byId) {
  doc.querySelectorAll('.qcard').forEach(card => {
    const q = byId[card.getAttribute('data-card')];
    if (!q) return;
    if (q.type === 'mcq') {
      const labels = card.querySelectorAll('.opt');
      const idx = [...labels].findIndex(l => l.querySelector('span').textContent === q.opts[q.a]);
      labels[idx].querySelector('input').checked = true;
    } else if (q.type === 'fill') {
      card.querySelector('.ans-input').value = q.acc[0];
    } else if (q.type === 'order') {
      const pool = card.querySelector('.pool');
      for (const w of q.acc[0].split(' ')) {
        const tok = [...pool.querySelectorAll('.tok')].find(t => t.getAttribute('data-w').toLowerCase() === w);
        if (tok) tok.click();
      }
    } else if (q.type === 'match') {
      card.querySelectorAll('.msel').forEach((sel, i) => {
        const opt = [...sel.options].find(o => o.textContent.indexOf(q.items[i].letter + '.') === 0);
        if (opt) sel.value = opt.value;
      });
    } else if (q.type === 'self') {
      card.querySelector('.sk').click();
    }
  });
}

function runOne(rel) {
  return new Promise(resolve => {
    const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    const html = fs.readFileSync(file, 'utf8');
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const s = script.indexOf('var QUESTIONS = [');
    const e = script.indexOf('\n  ];', s);
    const QUESTIONS = eval(script.slice(s + 'var QUESTIONS = '.length, e + 5));
    const byId = {}; QUESTIONS.forEach(q => byId[q.id] = q);
    const ss = script.indexOf('var SECTIONS = [');
    const SECTIONS = eval(script.slice(ss + 'var SECTIONS = '.length, script.indexOf('\n  ];', ss) + 5));
    const KEY = script.match(/var KEY = '([^']+)'/)[1];

    let scored = 0, selfN = 0;
    QUESTIONS.forEach(q => { if (q.type === 'self') selfN++; else scored += (q.type === 'match' ? q.w : 1); });
    const N = QUESTIONS.length;

    const errs = [];
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
    const { window } = dom;
    const doc = window.document;
    window.addEventListener('error', x => errs.push('window error: ' + x.message));
    const assert = (cond, msg) => { if (!cond) errs.push('FAIL: ' + msg); else console.log('  ok - ' + msg); };

    setTimeout(() => {
      // 1. Render ban đầu
      assert(doc.querySelectorAll('.qcard').length === N, 'rendered ' + N + ' questions (got ' + doc.querySelectorAll('.qcard').length + ')');
      assert(doc.querySelectorAll('.sec').length === SECTIONS.length, 'rendered ' + SECTIONS.length + ' sections');
      assert(doc.body.getAttribute('data-mode') === 'study', 'default mode = study');

      // 2. Chế độ kiểm tra
      doc.getElementById('mTest').click();
      assert(doc.body.getAttribute('data-mode') === 'test', 'switched to test mode');
      assert(!doc.body.classList.contains('revealed'), 'answers hidden after entering test mode');

      // 3. Trả lời: 1 câu fill ĐÚNG, 1 câu order ĐÚNG, 1 câu mcq SAI
      let correctDone = 0;
      const fillQ = findFirst(QUESTIONS, 'fill');
      if (fillQ) {
        const card = doc.querySelector('[data-card="' + fillQ.id + '"]');
        card.querySelector('.ans-input').value = fillQ.acc[0];
        card.querySelector('.check-one').click();
        assert(card.classList.contains('ok'), 'correct fill answer marked ok');
        correctDone++;
      }
      const mcqQ = findFirst(QUESTIONS, 'mcq');
      if (mcqQ) {
        const card = doc.querySelector('[data-card="' + mcqQ.id + '"]');
        const labels = card.querySelectorAll('.opt');
        const wrongIdx = [...labels].findIndex(l => l.querySelector('span').textContent !== mcqQ.opts[mcqQ.a]);
        labels[wrongIdx].querySelector('input').checked = true;
        card.querySelector('.check-one').click();
        assert(card.classList.contains('bad'), 'wrong MCQ marked bad');
        assert(card.querySelectorAll('.opt.correct').length === 1, 'MCQ shows the correct option');
      }
      const orderQ = findFirst(QUESTIONS, 'order');
      if (orderQ) {
        const card = doc.querySelector('[data-card="' + orderQ.id + '"]');
        const pool = card.querySelector('.pool');
        for (const w of orderQ.acc[0].split(' ')) {
          const tok = [...pool.querySelectorAll('.tok')].find(t => t.getAttribute('data-w').toLowerCase() === w);
          if (tok) tok.click(); else errs.push('FAIL: token not found ' + w);
        }
        const built = [...card.querySelectorAll('.line .tok')].map(t => t.getAttribute('data-w')).join(' ');
        assert(built.toLowerCase().replace(/\s+/g, ' ') === orderQ.acc[0], 'order question built: ' + built);
        correctDone++;
      }

      // 4. Nộp bài → điểm giữa chừng
      doc.getElementById('btnSubmit').click();
      assert(!doc.getElementById('result').hidden, 'result panel shown after submit');
      const pct = doc.getElementById('rPct').textContent;
      assert(/^\d+%$/.test(pct), 'percentage displayed: ' + pct);
      const p = parseInt(pct);
      assert(p < 100, 'partial run -> pct < 100 (' + pct + ')');
      assert(p > 0, 'partial run -> pct > 0 (' + pct + ')');
      const nonSelf = N - selfN;   // số thẻ có chấm điểm (match tính 1 thẻ)
      const expectedWrong = nonSelf - correctDone;
      const wrongCount = doc.querySelectorAll('.qcard.bad').length;
      assert(wrongCount === expectedWrong, wrongCount + ' wrong cards marked (expected ' + expectedWrong + ')');

      // 5. localStorage
      const saved = JSON.parse(window.localStorage.getItem(KEY));
      assert(saved && saved.attempts === 1, 'attempts saved = ' + (saved && saved.attempts));
      assert(saved && saved.best === p, 'best score saved = ' + (saved && saved.best));
      assert(saved && saved.wrong.length === expectedWrong, 'wrong list saved: ' + (saved && saved.wrong.length));
      assert(doc.getElementById('stAttempts').textContent.indexOf('1 lần') > -1, 'header attempts updated');

      // 6. Làm lại câu sai
      doc.getElementById('btnWrong').click();
      assert(doc.querySelectorAll('.qcard').length === expectedWrong,
        'retake-wrong renders ' + expectedWrong + ' questions (got ' + doc.querySelectorAll('.qcard').length + ')');
      assert(doc.getElementById('result').hidden, 'result hidden after retake');

      // 7. Trả lời đúng hết → 100%
      answerAll(doc, byId);
      doc.getElementById('btnSubmit').click();
      assert(doc.getElementById('rPct').textContent === '100%', 'all-correct run scores 100% (got ' + doc.getElementById('rPct').textContent + ')');
      assert(doc.getElementById('rPct').classList.contains('ok'), 'score badge is green at 100%');
      assert(doc.getElementById('rWrong').hidden, 'no wrong list at 100%');
      assert(doc.getElementById('rSelf').textContent === '', 'no self questions in wrong-only subset');

      // 8. Full set có phần tự chấm
      doc.getElementById('btnAgain').click();
      assert(doc.querySelectorAll('.qcard').length === N, 'full set rendered again: ' + doc.querySelectorAll('.qcard').length);
      answerAll(doc, byId);
      doc.getElementById('btnSubmit').click();
      assert(doc.getElementById('rPct').textContent === '100%', 'full-set all-correct = 100%');
      if (selfN) assert(doc.getElementById('rSelf').textContent.indexOf(selfN + '/' + selfN) > -1,
        'self-graded line ' + selfN + '/' + selfN + ': "' + doc.getElementById('rSelf').textContent + '"');
      const s2 = JSON.parse(window.localStorage.getItem(KEY));
      assert(s2.attempts === 3, 'attempts = 3 after third submit (got ' + s2.attempts + ')');
      assert(s2.best === 100, 'best = 100');
      assert(s2.wrong.length === 0, 'wrong list cleared');

      // 9. Trộn câu
      const idsA = [...doc.querySelectorAll('.qcard')].map(c => c.getAttribute('data-card')).join(',');
      doc.getElementById('btnAgain').click();
      const idsB = [...doc.querySelectorAll('.qcard')].map(c => c.getAttribute('data-card')).join(',');
      assert(idsA !== idsB, 'question order is shuffled on retake');

      // 10. Reset
      window.confirm = () => true;
      doc.getElementById('btnReset').click();
      const s3 = JSON.parse(window.localStorage.getItem(KEY));
      assert(s3.attempts === 0 && s3.best === 0 && s3.wrong.length === 0, 'reset clears progress');
      assert(doc.querySelectorAll('.qcard').length === N, 'reset renders full set again');

      // 11. Chế độ học
      doc.getElementById('mStudy').click();
      assert(doc.body.getAttribute('data-mode') === 'study', 'back to study mode');
      doc.getElementById('btnAgain').click();
      const box0 = doc.querySelector('.qcard .answer-box');
      assert(box0 && window.getComputedStyle(box0).display === 'none', 'study mode hides answers before checking');
      if (mcqQ) {
        const card = doc.querySelector('[data-card="' + mcqQ.id + '"]');
        const labels = card.querySelectorAll('.opt');
        const wrongIdx = [...labels].findIndex(l => l.querySelector('span').textContent !== mcqQ.opts[mcqQ.a]);
        labels[wrongIdx].querySelector('input').checked = true;
        card.querySelector('.check-one').click();
        assert(card.classList.contains('bad'), 'study mode check works');
        assert(window.getComputedStyle(card.querySelector('.answer-box')).display === 'block', 'study mode shows answer after checking');
        assert(card.querySelector('.vtag').textContent.indexOf('Sai') > -1, 'vtag shows Sai');
      }

      // 12. Không lỗi JS
      assert(errs.filter(x => x.indexOf('FAIL') !== 0).length === 0,
        'no runtime JS errors: ' + JSON.stringify(errs.filter(x => x.indexOf('FAIL') !== 0)));

      const fails = errs.filter(x => x.indexOf('FAIL') === 0);
      console.log(fails.length ? '  TEST FAILED (' + fails.length + ')' : '  ALL RUNTIME TESTS PASSED');
      fails.forEach(f => console.log('    ' + f));
      resolve(fails.length);
    }, 400);
  });
}

(async () => {
  let bad = 0;
  for (const f of files) { console.log('\n=== ' + f + ' ==='); bad += await runOne(f); }
  console.log('\n' + (bad ? 'TỔNG LỖI: ' + bad : 'OK — ' + files.length + ' file(s) PASS'));
  process.exit(bad ? 1 : 0);
})();
