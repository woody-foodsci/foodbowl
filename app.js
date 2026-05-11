
// ══════════════════════════════════════════
//  CATEGORY TRACKING (localStorage)
// ══════════════════════════════════════════
const CAT_LABELS = {
  chemistry:    '⚗️ Food Chemistry',
  microbiology: '🦠 Microbiology',
  processing:   '🏭 Processing',
  regulations:  '📋 Regulations',
  sensory:      '👅 Sensory Science',
  nutrition:    '🥗 Nutrition'
};

function loadTracking() {
  try {
    return JSON.parse(localStorage.getItem('foodbowl_tracking') || '{}');
  } catch { return {}; }
}

function saveTracking(data) {
  try { localStorage.setItem('foodbowl_tracking', JSON.stringify(data)); } catch {}
}

function recordAnswer(cat, correct) {
  const data = loadTracking();
  if (!data[cat]) data[cat] = { correct: 0, total: 0 };
  data[cat].total++;
  if (correct) data[cat].correct++;
  saveTracking(data);
}

function clearTracking() {
  localStorage.removeItem('foodbowl_tracking');
}

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let state = {
  category: 'all',
  difficulty: 'all',
  qType: 'mcq',
  qCount: 20,
  timerSec: 30,
  deck: [],
  idx: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  answered: false,
  timerInterval: null,
  adaptiveDiff: 2,
  recentAnswers: [],
  reviewMode: false
};

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function init() {
  // populate counts
  const cats = ['all','chemistry','microbiology','processing','regulations','sensory','nutrition'];
  cats.forEach(c => {
    const count = c === 'all' ? QUESTIONS.length : QUESTIONS.filter(q => q.cat === c).length;
    const el = document.getElementById('cnt-' + c);
    if (el) el.textContent = count + ' questions';
  });

  // category buttons
  document.getElementById('cat-grid').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.category = btn.dataset.cat;
    saveSettings();
  });

  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('quit-btn').addEventListener('click', quitToResult);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('retry-btn').addEventListener('click', () => startQuiz());
  document.getElementById('home-btn').addEventListener('click', goHome);
  document.getElementById('clear-tracking-btn').addEventListener('click', () => {
    clearTracking();
    document.getElementById('tracking-panel').style.display = 'none';
  });

  // timer select (scoped to avoid conflict with diff buttons)
  document.querySelectorAll('#timer-select .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#timer-select .timer-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.timerSec = parseInt(btn.dataset.sec);
      saveSettings();
    });
  });

  // type select (MCQ / SA / Mixed)
  document.querySelectorAll('#type-select .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#type-select .timer-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.qType = btn.dataset.qtype;
      saveSettings();
    });
  });

  // SA submit
  document.getElementById('sa-submit-btn').addEventListener('click', handleSASubmit);
  document.getElementById('sa-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSASubmit();
  });

  // count select
  document.querySelectorAll('#count-select .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#count-select .timer-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.qCount = parseInt(btn.dataset.count);
      saveSettings();
    });
  });

  // difficulty select
  document.querySelectorAll('#diff-select .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#diff-select .timer-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.difficulty = btn.dataset.diff;
      saveSettings();
    });
  });

  // review mode button
  document.getElementById('review-btn').addEventListener('click', startReviewMode);

  // copy result button
  document.getElementById('copy-result-btn').addEventListener('click', () => {
    const btn = document.getElementById('copy-result-btn');
    navigator.clipboard.writeText(state._copyText || '').then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy result'; btn.classList.remove('copied'); }, 1800);
    }).catch(() => {});
  });

  // keyboard shortcuts (quiz screen only)
  document.addEventListener('keydown', e => {
    if (!document.getElementById('quiz').classList.contains('active')) return;
    const focused = document.activeElement;
    const inInput = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA');
    const key = e.key.toUpperCase();

    // A/B/C/D → click MCQ option (not when typing in SA input)
    if (['A','B','C','D'].includes(key) && !inInput && !state.answered) {
      const opts = document.querySelectorAll('.opt');
      const idx = ['A','B','C','D'].indexOf(key);
      if (opts[idx] && !opts[idx].disabled) { e.preventDefault(); opts[idx].click(); }
      return;
    }

    // Space → next question / results (not when typing in SA input)
    if (e.key === ' ' && !inInput) {
      const nextBtn = document.getElementById('next-btn');
      if (nextBtn.classList.contains('show')) { e.preventDefault(); nextBtn.click(); }
      return;
    }
  });

  applySavedSettings();
  updateReviewBtn();
}

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() { stopTimer(); stopSpeech(); show('home'); updateReviewBtn(); }

function quitToResult() {
  stopTimer();
  stopSpeech();
  const answeredCount = state.answered ? state.idx + 1 : state.idx;
  if (answeredCount === 0) { goHome(); return; }
  state.deck = state.deck.slice(0, answeredCount);
  state.idx = answeredCount - 1;
  showResult();
}

// ══════════════════════════════════════════
//  QUIZ LOGIC
// ══════════════════════════════════════════
function normalizeAnswer(str) {
  return str.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}
function checkSAAnswer(input, answers) {
  const n = normalizeAnswer(input);
  return answers.some(a => normalizeAnswer(a) === n);
}

function applyResult(correct) {
  const q = state.deck[state.idx];
  if (correct) {
    state.score++;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;
    recordAnswer(q.cat, true);
    removeWrong(q);
  } else {
    state.streak = 0;
    recordAnswer(q.cat, false);
    addWrong(q);
  }
  state.recentAnswers.push(correct);
  evaluateAdaptive();

  const streakEl = document.getElementById('streak-display');
  if (state.streak >= 2) {
    streakEl.style.display = 'flex';
    document.getElementById('streak-num').textContent = state.streak;
    streakEl.classList.remove('pop');
    void streakEl.offsetWidth;
    streakEl.classList.add('pop');
  } else {
    streakEl.style.display = 'none';
  }

  document.getElementById('live-score').textContent = state.score;
  document.getElementById('exp-box').classList.add('show');
  const nextBtn = document.getElementById('next-btn');
  nextBtn.textContent = state.idx < state.deck.length - 1 ? 'Next question →' : 'See results →';
  nextBtn.classList.add('show');
}

function handleSASubmit() {
  if (state.answered) return;
  const input = document.getElementById('sa-input');
  const answer = input.value.trim();
  if (!answer) return;

  state.answered = true;
  stopTimer();
  stopSpeech();

  const q = state.deck[state.idx];
  const correct = checkSAAnswer(answer, q.answers);

  input.classList.add(correct ? 'correct' : 'wrong');
  input.disabled = true;
  document.getElementById('sa-submit-btn').disabled = true;

  const resultEl = document.getElementById('sa-result');
  resultEl.style.display = 'block';
  const verdictEl = document.getElementById('sa-verdict');
  const correctTextEl = document.getElementById('sa-correct-text');
  if (correct) {
    verdictEl.className = 'sa-verdict ok';
    verdictEl.textContent = '✓ Correct!';
    correctTextEl.textContent = '';
  } else {
    verdictEl.className = 'sa-verdict no';
    verdictEl.textContent = '✗ Answer:';
    correctTextEl.textContent = q.answers[0];
  }

  document.getElementById('exp-text').textContent = q.exp;
  applyResult(correct);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ══════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════
function startTimer() {
  clearInterval(state.timerInterval);
  if (!state.timerSec) {
    document.getElementById('timer-display').style.display = 'none';
    return;
  }
  const display = document.getElementById('timer-display');
  const numEl   = document.getElementById('timer-num');
  const ring    = document.getElementById('timer-ring');
  const total   = state.timerSec;
  const circum  = 94.2;
  display.style.display = 'flex';
  display.classList.remove('urgent');

  let remaining = total;
  const tick = () => {
    numEl.textContent = remaining;
    const offset = circum * (1 - remaining / total);
    ring.style.strokeDashoffset = offset;
    if (remaining <= 5) display.classList.add('urgent');
    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      timeUp();
    }
    remaining--;
  };
  tick();
  state.timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

function timeUp() {
  if (state.answered) return;
  state.answered = true;
  const q = state.deck[state.idx];

  if (q.type === 'sa') {
    const input = document.getElementById('sa-input');
    input.disabled = true;
    input.classList.add('wrong');
    document.getElementById('sa-submit-btn').disabled = true;
    const resultEl = document.getElementById('sa-result');
    resultEl.style.display = 'block';
    document.getElementById('sa-verdict').className = 'sa-verdict no';
    document.getElementById('sa-verdict').textContent = "⏱ Time's up! Answer:";
    document.getElementById('sa-correct-text').textContent = q.answers[0];
    document.getElementById('exp-text').textContent = q.exp;
  } else {
    document.querySelectorAll('.opt').forEach(btn => {
      btn.disabled = true;
      if (parseInt(btn.dataset.orig) === q.ans) btn.classList.add('correct');
    });
    document.getElementById('exp-text').textContent = "⏱ Time's up! — " + q.exp;
  }
  applyResult(false);
}

// ══════════════════════════════════════════
//  TEXT-TO-SPEECH
// ══════════════════════════════════════════
const tts = window.speechSynthesis;
let ttsUtterance = null;

function speakQuestion(text) {
  if (!tts) return;
  tts.cancel();
  ttsUtterance = new SpeechSynthesisUtterance(text);
  ttsUtterance.lang = 'en-US';
  ttsUtterance.rate = 0.92;
  ttsUtterance.pitch = 1;

  const btn = document.getElementById('tts-btn');
  btn.classList.add('speaking');

  ttsUtterance.onend = () => btn.classList.remove('speaking');
  ttsUtterance.onerror = () => btn.classList.remove('speaking');

  tts.speak(ttsUtterance);
}

function stopSpeech() {
  if (tts) tts.cancel();
  const btn = document.getElementById('tts-btn');
  if (btn) btn.classList.remove('speaking');
}

function startQuiz() {
  let pool = state.category === 'all'
    ? [...QUESTIONS]
    : QUESTIONS.filter(q => q.cat === state.category);

  if (state.qType !== 'both') {
    pool = pool.filter(q => q.type === state.qType);
  }

  if (state.difficulty === 'adaptive') {
    const d2 = shuffle(pool.filter(q => q.diff === 2));
    const d1 = shuffle(pool.filter(q => q.diff === 1));
    const d3 = shuffle(pool.filter(q => q.diff === 3));
    state.deck = [...d2, ...d1, ...d3];
    state.adaptiveDiff = 2;
    state.recentAnswers = [];
  } else if (state.difficulty !== 'all') {
    const filtered = pool.filter(q => q.diff === parseInt(state.difficulty));
    state.deck = shuffle(filtered.length ? filtered : pool);
  } else {
    state.deck = shuffle(pool);
  }

  if (state.qCount > 0 && state.deck.length > state.qCount) {
    state.deck = state.deck.slice(0, state.qCount);
  }

  state.idx = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.answered = false;
  state.reviewMode = false;
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.deck[state.idx];
  const total = state.deck.length;

  // progress
  document.getElementById('prog-fill').style.width = (state.idx / total * 100) + '%';
  document.getElementById('q-counter').textContent = `Q ${state.idx + 1} of ${total}`;
  document.getElementById('cat-label').textContent =
    state.reviewMode ? `📝 ${q.cat}` :
    state.difficulty === 'adaptive' ? `🎯 ${'⭐'.repeat(state.adaptiveDiff)}` :
    q.cat;
  document.getElementById('live-score').textContent = state.score;

  // question
  document.getElementById('q-cat-tag').textContent = q.cat.toUpperCase();
  document.getElementById('q-text').textContent = q.q;

  // MCQ or SA display
  const optWrap = document.getElementById('options');
  const saArea  = document.getElementById('sa-area');

  if (q.type === 'sa') {
    optWrap.style.display = 'none';
    saArea.style.display = 'flex';
    const saInput = document.getElementById('sa-input');
    saInput.value = '';
    saInput.className = 'sa-input';
    saInput.disabled = false;
    document.getElementById('sa-submit-btn').disabled = false;
    document.getElementById('sa-result').style.display = 'none';
    setTimeout(() => saInput.focus(), 80);
  } else {
    optWrap.style.display = 'flex';
    saArea.style.display = 'none';
    const letters = ['A','B','C','D'];
    optWrap.innerHTML = '';
    const shuffledOpts = shuffle(q.opts.map((text, i) => ({ text, orig: i })));
    shuffledOpts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.dataset.orig = opt.orig;
      btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${opt.text}</span>`;
      btn.addEventListener('click', () => handleAnswer(btn, opt.orig, q.ans, shuffledOpts, q.exp));
      optWrap.appendChild(btn);
    });
  }

  // reset feedback
  document.getElementById('exp-box').classList.remove('show');
  document.getElementById('next-btn').classList.remove('show');
  state.answered = false;
  startTimer();

  // TTS button
  const ttsBtn = document.getElementById('tts-btn');
  ttsBtn.onclick = () => {
    if (tts.speaking) { stopSpeech(); return; }
    speakQuestion(q.q);
  };
}

function handleAnswer(clickedBtn, chosenOrig, correctOrig, shuffledOpts, exp) {
  if (state.answered) return;
  state.answered = true;
  stopTimer();
  stopSpeech();

  const allBtns = document.querySelectorAll('.opt');

  allBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (shuffledOpts[i].orig === correctOrig) btn.classList.add('correct');
  });

  const correct = chosenOrig === correctOrig;
  if (!correct) clickedBtn.classList.add('wrong');
  document.getElementById('exp-text').textContent = exp;
  applyResult(correct);
}

function nextQuestion() {
  state.idx++;
  if (state.idx >= state.deck.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

function showResult() {
  const total = state.deck.length;
  const pct = Math.round(state.score / total * 100);

  document.getElementById('res-score').textContent = state.score;
  document.getElementById('res-denom').textContent = `out of ${total} correct · ${pct}% · best streak ${state.bestStreak}🔥`;

  // build clipboard copy string
  const catLabel = state.category === 'all' ? 'All Categories' : CAT_LABELS[state.category] || state.category;
  state._copyText = `${catLabel} · ${state.score}/${total} (${pct}%)` +
    (state.bestStreak >= 2 ? ` 🔥${state.bestStreak} streak` : '') +
    ` — Food Science Bowl`;

  let msg, sub;
  if (pct === 100) {
    msg = "Perfect score. Bowl-ready.";
    sub = "You nailed every question. Consider tackling a harder category.";
  } else if (pct >= 80) {
    msg = "Strong performance.";
    sub = "Review the explanations on the ones you missed and drill again.";
  } else if (pct >= 60) {
    msg = "Solid foundation.";
    sub = "Focus on the topics where you hesitated. Repeat the category.";
  } else {
    msg = "Keep drilling.";
    sub = "Read through all the explanations — they're your study notes.";
  }

  document.getElementById('res-msg').textContent = msg;
  document.getElementById('res-sub').textContent = sub;

  // ── render tracking panel ──
  const tracking = loadTracking();
  const panel = document.getElementById('tracking-panel');
  const cats = Object.keys(CAT_LABELS);
  const hasData = cats.some(c => tracking[c] && tracking[c].total > 0);

  if (hasData) {
    let html = '<div class="tracking-title">Cumulative accuracy by category</div>';
    cats.forEach(c => {
      const d = tracking[c];
      if (!d || d.total === 0) return;
      const pct = Math.round(d.correct / d.total * 100);
      const cls = pct >= 75 ? 'tracking-strong' : pct >= 50 ? 'tracking-mid' : 'tracking-weak';
      const color = pct >= 75 ? 'var(--accent)' : pct >= 50 ? '#f0a500' : 'var(--danger)';
      html += `
        <div class="tracking-row">
          <div class="tracking-cat">${CAT_LABELS[c]}</div>
          <div class="tracking-bar-wrap">
            <div class="tracking-bar-fill" style="width:${pct}%; background:${color}"></div>
          </div>
          <div class="tracking-pct ${cls}">${pct}%</div>
        </div>`;
    });
    html += `<div style="font-size:0.68rem;color:var(--muted);margin-top:0.5rem;text-align:left">`;
    html += cats.filter(c => tracking[c] && tracking[c].total > 0)
               .map(c => `${CAT_LABELS[c].split(' ').slice(1).join(' ')}: ${tracking[c].correct}/${tracking[c].total}`)
               .join(' · ');
    html += '</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }

  recordRound(state.score, state.deck.length, state.category, state.difficulty);
  renderHistoryChart();
  updateReviewBtn();

  // re-animate result screen
  const screen = document.getElementById('result');
  screen.querySelectorAll('[style*="animation"]').forEach(el => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });

  const copyBtn = document.getElementById('copy-result-btn');
  copyBtn.textContent = 'Copy result';
  copyBtn.classList.remove('copied');

  show('result');
}

// ══════════════════════════════════════════
//  SCORE HISTORY (localStorage)
// ══════════════════════════════════════════
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('foodbowl_history') || '[]'); } catch { return []; }
}
function saveHistory(data) {
  try { localStorage.setItem('foodbowl_history', JSON.stringify(data.slice(-20))); } catch {}
}
function recordRound(score, total, cat, diff) {
  const history = loadHistory();
  history.push({ ts: Date.now(), score, total, cat, diff, pct: Math.round(score / total * 100) });
  saveHistory(history);
}

// ══════════════════════════════════════════
//  WRONG ANSWER TRACKING (localStorage)
// ══════════════════════════════════════════
function loadWrong() {
  try { return JSON.parse(localStorage.getItem('foodbowl_wrong') || '[]'); } catch { return []; }
}
function saveWrong(data) {
  try { localStorage.setItem('foodbowl_wrong', JSON.stringify(data)); } catch {}
}
function addWrong(q) {
  const wrong = loadWrong();
  if (!wrong.includes(q.q)) { wrong.push(q.q); saveWrong(wrong); }
}
function removeWrong(q) {
  saveWrong(loadWrong().filter(text => text !== q.q));
}

function updateReviewBtn() {
  const wrong = loadWrong();
  const btn = document.getElementById('review-btn');
  if (!btn) return;
  if (wrong.length > 0) {
    btn.textContent = `Review Missed (${wrong.length}) →`;
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

function startReviewMode() {
  const wrongTexts = loadWrong();
  if (!wrongTexts.length) { updateReviewBtn(); return; }
  const pool = QUESTIONS.filter(q => wrongTexts.includes(q.q));
  state.deck = shuffle(pool);
  state.idx = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.answered = false;
  state.reviewMode = true;
  state.recentAnswers = [];
  show('quiz');
  renderQuestion();
}

// ══════════════════════════════════════════
//  SETTINGS PERSISTENCE (localStorage)
// ══════════════════════════════════════════
const SETTINGS_KEY = 'foodbowl_settings';

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      category: state.category,
      timerSec: state.timerSec,
      qType:    state.qType,
      qCount:   state.qCount,
      difficulty: state.difficulty
    }));
  } catch {}
}

function applySavedSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch {}
  if (!saved) return;

  if (saved.category) {
    state.category = saved.category;
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.cat === saved.category);
    });
  }
  if (saved.timerSec !== undefined) {
    state.timerSec = saved.timerSec;
    document.querySelectorAll('#timer-select .timer-btn').forEach(b => {
      b.classList.toggle('selected', parseInt(b.dataset.sec) === saved.timerSec);
    });
  }
  if (saved.qType) {
    state.qType = saved.qType;
    document.querySelectorAll('#type-select .timer-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.qtype === saved.qType);
    });
  }
  if (saved.qCount !== undefined) {
    state.qCount = saved.qCount;
    document.querySelectorAll('#count-select .timer-btn').forEach(b => {
      b.classList.toggle('selected', parseInt(b.dataset.count) === saved.qCount);
    });
  }
  if (saved.difficulty) {
    state.difficulty = saved.difficulty;
    document.querySelectorAll('#diff-select .timer-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.diff === saved.difficulty);
    });
  }
}

// ══════════════════════════════════════════
//  ADAPTIVE DIFFICULTY
// ══════════════════════════════════════════
function evaluateAdaptive() {
  if (state.difficulty !== 'adaptive') return;
  if ((state.idx + 1) % 5 !== 0) return;
  const last5 = state.recentAnswers.slice(-5);
  const pct = last5.filter(Boolean).length / last5.length;
  let newDiff = state.adaptiveDiff;
  if (pct >= 0.8 && newDiff < 3) newDiff++;
  else if (pct < 0.5 && newDiff > 1) newDiff--;
  if (newDiff !== state.adaptiveDiff) {
    state.adaptiveDiff = newDiff;
    const remaining = state.deck.slice(state.idx + 1);
    const preferred = shuffle(remaining.filter(q => q.diff === newDiff));
    const rest = shuffle(remaining.filter(q => q.diff !== newDiff));
    state.deck = [...state.deck.slice(0, state.idx + 1), ...preferred, ...rest];
    document.getElementById('cat-label').textContent = `🎯 ${'⭐'.repeat(newDiff)}`;
  }
}

// ══════════════════════════════════════════
//  SCORE HISTORY CHART
// ══════════════════════════════════════════
function renderHistoryChart() {
  const history = loadHistory();
  const panel = document.getElementById('history-panel');
  if (history.length < 2) { panel.style.display = 'none'; return; }

  const recent = history.slice(-10);
  const W = 340, H = 90;
  const pad = { t: 14, r: 8, b: 20, l: 26 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const pts = recent.map((r, i) => ({
    x: pad.l + (recent.length === 1 ? cW / 2 : i * cW / (recent.length - 1)),
    y: pad.t + cH * (1 - r.pct / 100),
    pct: r.pct
  }));

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const grids = [25, 50, 75, 100].map(v => {
    const y = (pad.t + cH * (1 - v / 100)).toFixed(1);
    return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#1e2e26" stroke-width="1"/>` +
           `<text x="${pad.l - 3}" y="${(+y + 3).toFixed(1)}" fill="#5a7a6e" font-size="7" text-anchor="end">${v}</text>`;
  }).join('');

  const dots = pts.map((p, i) => {
    const isLast = i === pts.length - 1;
    const color = p.pct >= 80 ? '#00c896' : p.pct >= 60 ? '#f0a500' : '#ff4f5e';
    const r = isLast ? 4 : 2.5;
    const label = isLast
      ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 7).toFixed(1)}" fill="${color}" font-size="9" text-anchor="middle" font-family="monospace">${p.pct}%</text>`
      : '';
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${color}" ${isLast ? 'stroke="#0a0f0d" stroke-width="1.5"' : ''}/>` + label;
  }).join('');

  panel.innerHTML =
    `<div class="tracking-title">Score history (last ${recent.length} rounds)</div>` +
    `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;display:block">` +
    grids +
    `<polyline points="${polyline}" fill="none" stroke="#00c896" stroke-width="1.5" stroke-opacity="0.5" stroke-linejoin="round"/>` +
    dots +
    `</svg>`;
  panel.style.display = 'block';
}

// ══════════════════════════════════════════
//  PWA: SERVICE WORKER + INSTALL PROMPT
// ══════════════════════════════════════════
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').classList.add('show');
});

document.getElementById('install-yes').addEventListener('click', async () => {
  document.getElementById('install-banner').classList.remove('show');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});

document.getElementById('install-no').addEventListener('click', () => {
  document.getElementById('install-banner').classList.remove('show');
});

// ══════════════════════════════════════════
//  START
// ══════════════════════════════════════════
init();
