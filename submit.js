// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.submit-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('sub-single-panel').style.display = tab === 'single' ? 'block' : 'none';
  document.getElementById('sub-bulk-panel').style.display  = tab === 'bulk'   ? 'block' : 'none';
}

// ── Single question form ──
let submitFormState = { cat: 'chemistry', type: 'mcq', diff: 2, visibility: 'public' };

function showSubmitScreen() {
  resetSubmitForm();
  show('submit');
}

function resetSubmitForm() {
  submitFormState = { cat: 'chemistry', type: 'mcq', diff: 2, visibility: 'public' };
  document.getElementById('sub-q').value = '';
  document.getElementById('sub-exp').value = '';
  document.getElementById('sub-error').textContent = '';
  document.getElementById('sub-success').style.display = 'none';
  [0,1,2,3].forEach(i => { document.getElementById('sub-opt-' + i).value = ''; });
  document.querySelector('input[name="sub-ans"][value="0"]').checked = true;
  document.getElementById('sub-sa-answers').value = '';
  switchTab('single');
  syncSubmitUI();
}

function syncSubmitUI() {
  const isMCQ = submitFormState.type === 'mcq';
  document.getElementById('sub-mcq-area').style.display = isMCQ ? 'block' : 'none';
  document.getElementById('sub-sa-area').style.display  = isMCQ ? 'none'  : 'block';

  document.querySelectorAll('#sub-cat-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.cat === submitFormState.cat));
  document.querySelectorAll('#sub-type-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.qtype === submitFormState.type));
  document.querySelectorAll('#sub-diff-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', parseInt(b.dataset.diff) === submitFormState.diff));
  document.querySelectorAll('#sub-vis-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.vis === submitFormState.visibility));
}

async function submitQuestion() {
  const q   = document.getElementById('sub-q').value.trim();
  const exp = document.getElementById('sub-exp').value.trim();
  const errEl = document.getElementById('sub-error');
  const btn   = document.getElementById('sub-submit-btn');

  errEl.textContent = '';
  if (!q)   { errEl.textContent = 'Question text is required.'; return; }
  if (!exp) { errEl.textContent = 'Explanation is required.'; return; }

  const payload = {
    cat: submitFormState.cat, type: submitFormState.type,
    q, exp, diff: submitFormState.diff,
    visibility: submitFormState.visibility,
    status: 'pending',
    author_id: currentUser.id, author_email: currentUser.email
  };

  if (submitFormState.type === 'mcq') {
    const opts = [0,1,2,3].map(i => document.getElementById('sub-opt-' + i).value.trim());
    if (opts.some(o => !o)) { errEl.textContent = 'Fill in all 4 answer options.'; return; }
    payload.opts = opts;
    payload.ans  = parseInt(document.querySelector('input[name="sub-ans"]:checked').value);
  } else {
    const answers = document.getElementById('sub-sa-answers').value
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!answers.length) { errEl.textContent = 'Enter at least one accepted answer.'; return; }
    payload.answers = answers;
  }

  btn.disabled = true; btn.textContent = 'Submitting…';
  const { error } = await sb.from('submissions').insert(payload);
  btn.disabled = false; btn.textContent = 'Submit →';

  if (error) {
    errEl.textContent = error.message;
  } else {
    document.getElementById('sub-success').style.display = 'block';
    document.getElementById('submit-form-scroll').scrollTop = 0;
    setTimeout(() => {
      document.getElementById('sub-success').style.display = 'none';
      document.getElementById('sub-q').value = '';
      document.getElementById('sub-exp').value = '';
      [0,1,2,3].forEach(i => { document.getElementById('sub-opt-' + i).value = ''; });
      document.getElementById('sub-sa-answers').value = '';
    }, 2500);
  }
}

// ── CSV Bulk Upload ──
const CSV_TEMPLATE =
`type,cat,diff,q,opt_a,opt_b,opt_c,opt_d,ans,answers,exp,visibility
mcq,chemistry,2,"What is the Maillard reaction?","Protein denaturation","Non-enzymatic browning","Enzymatic browning","Lipid oxidation",B,,"The Maillard reaction is a non-enzymatic browning reaction between reducing sugars and amino acids.",public
sa,microbiology,1,"What protein gives wheat dough its elasticity?",,,,,,gluten|glutenin|gliadin,"Gluten is a protein complex formed from gliadin and glutenin during mixing.",public`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'foodbowl_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function parseCSVRow(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (const ch of line) {
    if (ch === '"')             { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else                        { current += ch; }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVRow(line);
    const obj  = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  });
}

const VALID_CATS = ['chemistry','microbiology','processing','regulations','sensory','nutrition'];

function validateRow(row, i) {
  const errors = []; const n = i + 2;
  if (!['mcq','sa'].includes(row.type))   errors.push(`Row ${n}: type must be "mcq" or "sa"`);
  if (!VALID_CATS.includes(row.cat))      errors.push(`Row ${n}: invalid cat "${row.cat}"`);
  if (!['1','2','3'].includes(row.diff))  errors.push(`Row ${n}: diff must be 1, 2, or 3`);
  if (!row.q)   errors.push(`Row ${n}: question text required`);
  if (!row.exp) errors.push(`Row ${n}: explanation required`);
  if (row.type === 'mcq') {
    if (!row.opt_a || !row.opt_b || !row.opt_c || !row.opt_d)
      errors.push(`Row ${n}: all four options required for MCQ`);
    if (!['A','B','C','D'].includes((row.ans || '').toUpperCase()))
      errors.push(`Row ${n}: ans must be A, B, C, or D`);
  }
  if (row.type === 'sa' && !row.answers)
    errors.push(`Row ${n}: pipe-separated answers required for SA`);
  return errors;
}

function rowToPayload(row) {
  const payload = {
    cat: row.cat, type: row.type, q: row.q, exp: row.exp,
    diff: parseInt(row.diff),
    visibility: ['public','private'].includes(row.visibility) ? row.visibility : 'public',
    status: 'pending',
    author_id: currentUser.id, author_email: currentUser.email
  };
  if (row.type === 'mcq') {
    payload.opts = [row.opt_a, row.opt_b, row.opt_c, row.opt_d];
    payload.ans  = ['A','B','C','D'].indexOf(row.ans.toUpperCase());
  } else {
    payload.answers = row.answers.split('|').map(s => s.trim()).filter(Boolean);
  }
  return payload;
}

let bulkRows = [];

function handleCSVFile(file) {
  if (!file) return;
  document.getElementById('sub-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => processCSV(e.target.result);
  reader.readAsText(file);
}

function processCSV(text) {
  const rows = parseCSV(text);
  const allErrors = []; const validRows = [];
  rows.forEach((row, i) => {
    const errs = validateRow(row, i);
    errs.length ? allErrors.push(...errs) : validRows.push(row);
  });
  bulkRows = validRows;

  const infoEl    = document.getElementById('sub-preview-info');
  const errEl     = document.getElementById('sub-bulk-error');
  const previewEl = document.getElementById('sub-preview');
  const bulkBtn   = document.getElementById('sub-bulk-submit-btn');

  errEl.innerHTML = allErrors.map(e => `<div>${e}</div>`).join('');

  if (validRows.length > 0) {
    const skipped = allErrors.length ? ` (${rows.length - validRows.length} row${rows.length - validRows.length > 1 ? 's' : ''} skipped due to errors)` : '';
    infoEl.textContent = `${validRows.length} valid question${validRows.length > 1 ? 's' : ''} ready.${skipped}`;
    bulkBtn.textContent = `Submit ${validRows.length} Question${validRows.length > 1 ? 's' : ''} →`;
    bulkBtn.style.display = 'block';
    previewEl.style.display = 'block';
  } else {
    infoEl.textContent = rows.length ? 'No valid rows found — fix errors and re-upload.' : 'File appears empty.';
    bulkBtn.style.display = 'none';
    previewEl.style.display = 'block';
  }
}

async function submitBulk() {
  if (!bulkRows.length) return;
  const btn = document.getElementById('sub-bulk-submit-btn');
  btn.disabled = true; btn.textContent = 'Submitting…';

  const { error } = await sb.from('submissions').insert(bulkRows.map(rowToPayload));
  btn.disabled = false;

  if (error) {
    document.getElementById('sub-bulk-error').innerHTML +=
      `<div style="color:var(--danger);margin-top:0.5rem">${error.message}</div>`;
    btn.textContent = 'Retry →';
  } else {
    document.getElementById('sub-preview').style.display = 'none';
    document.getElementById('sub-file-name').textContent = '';
    document.getElementById('sub-csv-file').value = '';
    document.getElementById('sub-bulk-error').innerHTML = '';
    document.getElementById('sub-bulk-success').style.display = 'block';
    bulkRows = [];
    setTimeout(() => { document.getElementById('sub-bulk-success').style.display = 'none'; }, 3000);
  }
}

// ── Event listeners ──
document.getElementById('submit-back-btn').addEventListener('click', () => show('home'));
document.getElementById('sub-submit-btn').addEventListener('click', submitQuestion);
document.getElementById('submit-question-btn').addEventListener('click', showSubmitScreen);

document.querySelectorAll('.submit-tab').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

document.querySelectorAll('#sub-cat-opts .timer-btn').forEach(btn =>
  btn.addEventListener('click', () => { submitFormState.cat = btn.dataset.cat; syncSubmitUI(); }));
document.querySelectorAll('#sub-type-opts .timer-btn').forEach(btn =>
  btn.addEventListener('click', () => { submitFormState.type = btn.dataset.qtype; syncSubmitUI(); }));
document.querySelectorAll('#sub-diff-opts .timer-btn').forEach(btn =>
  btn.addEventListener('click', () => { submitFormState.diff = parseInt(btn.dataset.diff); syncSubmitUI(); }));
document.querySelectorAll('#sub-vis-opts .timer-btn').forEach(btn =>
  btn.addEventListener('click', () => { submitFormState.visibility = btn.dataset.vis; syncSubmitUI(); }));

document.getElementById('sub-download-template').addEventListener('click', downloadTemplate);
document.getElementById('sub-upload-btn').addEventListener('click', () =>
  document.getElementById('sub-csv-file').click());
document.getElementById('sub-csv-file').addEventListener('change', e =>
  handleCSVFile(e.target.files[0]));
document.getElementById('sub-bulk-submit-btn').addEventListener('click', submitBulk);
