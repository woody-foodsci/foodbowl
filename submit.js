// Question submission form

function showSubmitScreen() {
  resetSubmitForm();
  show('submit');
}

let submitFormState = { cat: 'chemistry', type: 'mcq', diff: 2 };

function resetSubmitForm() {
  submitFormState = { cat: 'chemistry', type: 'mcq', diff: 2 };
  document.getElementById('sub-q').value = '';
  document.getElementById('sub-exp').value = '';
  document.getElementById('sub-error').textContent = '';
  document.getElementById('sub-success').style.display = 'none';
  [0,1,2,3].forEach(i => { document.getElementById('sub-opt-' + i).value = ''; });
  document.querySelector('input[name="sub-ans"][value="0"]').checked = true;
  document.getElementById('sub-sa-answers').value = '';
  syncSubmitUI();
}

function syncSubmitUI() {
  const isMCQ = submitFormState.type === 'mcq';
  document.getElementById('sub-mcq-area').style.display = isMCQ ? 'block' : 'none';
  document.getElementById('sub-sa-area').style.display = isMCQ ? 'none' : 'block';

  document.querySelectorAll('#sub-cat-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.cat === submitFormState.cat));
  document.querySelectorAll('#sub-type-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.qtype === submitFormState.type));
  document.querySelectorAll('#sub-diff-opts .timer-btn').forEach(b =>
    b.classList.toggle('selected', parseInt(b.dataset.diff) === submitFormState.diff));
}

async function submitQuestion() {
  const q = document.getElementById('sub-q').value.trim();
  const exp = document.getElementById('sub-exp').value.trim();
  const errEl = document.getElementById('sub-error');
  const btn = document.getElementById('sub-submit-btn');

  errEl.textContent = '';
  if (!q)   { errEl.textContent = 'Question text is required.'; return; }
  if (!exp) { errEl.textContent = 'Explanation is required.'; return; }

  const payload = {
    cat: submitFormState.cat,
    type: submitFormState.type,
    q, exp,
    diff: submitFormState.diff,
    status: 'pending',
    author_id: currentUser.id,
    author_email: currentUser.email
  };

  if (submitFormState.type === 'mcq') {
    const opts = [0,1,2,3].map(i => document.getElementById('sub-opt-' + i).value.trim());
    if (opts.some(o => !o)) { errEl.textContent = 'Fill in all 4 answer options.'; return; }
    payload.opts = opts;
    payload.ans = parseInt(document.querySelector('input[name="sub-ans"]:checked').value);
  } else {
    const answers = document.getElementById('sub-sa-answers').value
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!answers.length) { errEl.textContent = 'Enter at least one accepted answer.'; return; }
    payload.answers = answers;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const { error } = await sb.from('submissions').insert(payload);

  btn.disabled = false;
  btn.textContent = 'Submit →';

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

// Event listeners
document.getElementById('submit-back-btn').addEventListener('click', () => show('home'));
document.getElementById('sub-submit-btn').addEventListener('click', submitQuestion);
document.getElementById('submit-question-btn').addEventListener('click', showSubmitScreen);

document.querySelectorAll('#sub-cat-opts .timer-btn').forEach(btn => {
  btn.addEventListener('click', () => { submitFormState.cat = btn.dataset.cat; syncSubmitUI(); });
});
document.querySelectorAll('#sub-type-opts .timer-btn').forEach(btn => {
  btn.addEventListener('click', () => { submitFormState.type = btn.dataset.qtype; syncSubmitUI(); });
});
document.querySelectorAll('#sub-diff-opts .timer-btn').forEach(btn => {
  btn.addEventListener('click', () => { submitFormState.diff = parseInt(btn.dataset.diff); syncSubmitUI(); });
});
