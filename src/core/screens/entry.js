// Home, Register and Login screens.
import { h, show, button, host, card, logo, toast, busy } from '../ui/dom.js';
import { log } from '../logger.js';
import { validateNric } from '../nric.js';
import { CONSENT_VERSION } from '../config.js';
import { CONSENT } from '../consent.js';

export function homeScreen({ onNew, onReturning }) {
  log('core', 'home_view');
  return show(h('div', { class: 'tn-screen' },
    h('div', { style: { marginBottom: '8px' } }, logo('vertical-black', 'tn-logo--home')),
    card(
      host('liam', 'excited', 'Hey! Ready for a few quick games?', { side: 'right' }),
      h('h1', {}, 'Play with The Nurts'),
      h('p', {}, 'A short series of mini-games. There are no trick questions, just play the way you naturally would.'),
      h('div', { class: 'tn-stack' },
        button("I'm new here", () => { log('core', 'choose_new'); onNew(); }, { icon: '✨', id: 'btn-new' }),
        button("I've played before", () => { log('core', 'choose_returning'); onReturning(); }, { kind: 'secondary', icon: '↩', id: 'btn-returning' })),
    )));
}

const DEPTS = ['Events', 'Marketing', 'Sales', 'Product', 'Creative', 'Other'];
const TYPES = ['Intern', 'Freelance', 'Part-time', 'Full-time', 'Just here for fun'];
const MAX_CV = 5 * 1024 * 1024;
const CV_OK = /\.(pdf|docx?|PDF|DOCX?)$/;

function field(label, input, hint) {
  const err = h('div', { class: 'tn-err', 'aria-live': 'polite' });
  const f = h('div', { class: 'tn-field' }, h('label', { for: input.id }, label), input, hint ? h('small', {}, hint) : null, err);
  f.setError = (m) => { err.textContent = m || ''; f.classList.toggle('is-bad', !!m); };
  const clear = () => f.setError('');
  input.addEventListener('input', clear); input.addEventListener('click', clear);
  return f;
}
function input(id, type, attrs = {}) { return h('input', { id, name: id, type, class: 'tn-input', ...attrs }); }
function chips(id, options) {
  const wrap = h('div', { class: 'tn-chips', id, role: 'group' });
  wrap.value = '';
  options.forEach((o) => wrap.append(h('button', {
    type: 'button', class: 'tn-chip', 'aria-pressed': 'false', 'data-v': o,
    onclick: (e) => { wrap.querySelectorAll('.tn-chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); wrap.value = o; },
  }, o)));
  return wrap;
}
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v) => /^\+?[\d\s-]{8,16}$/.test(v.trim());

export function registerScreen({ onSubmit, onBack }) {
  log('core', 'register_view');
  const name = input('f-name', 'text', { autocomplete: 'name', autofocus: true, maxlength: 80 });
  const nric = input('f-nric', 'text', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 14, placeholder: 'S1234567D or 900101-14-5678' });
  const email = input('f-email', 'email', { autocomplete: 'email', inputmode: 'email', maxlength: 120 });
  const phone = input('f-phone', 'tel', { autocomplete: 'tel', inputmode: 'tel', placeholder: '+65 9123 4567', maxlength: 20 });
  const dept = chips('f-dept', DEPTS);
  const type = chips('f-type', TYPES);
  let cv = null;
  const cvLabel = h('span', {}, 'Attach your CV (optional, PDF or Word, max 5 MB)');
  const cvInput = h('input', { type: 'file', accept: '.pdf,.doc,.docx', id: 'f-cv', onchange: async (e) => {
    const file = e.target.files[0]; cv = null;
    if (!file) { cvLabel.textContent = 'Attach your CV (optional)'; return; }
    if (!CV_OK.test(file.name) || file.size > MAX_CV) { toast('Please choose a PDF or Word file under 5 MB.', 'bad'); e.target.value = ''; return; }
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(file); });
    cv = { name: file.name, type: file.type, size: file.size, data: b64 };
    cvLabel.textContent = '📎 ' + file.name;
  } });

  let lang = 'en';
  const consentText = h('div', { class: 'tn-consent__text', html: CONSENT.en, tabindex: '0' });
  const langBtns = ['en', 'ms'].map((l) => h('button', { type: 'button', 'aria-pressed': String(l === lang), onclick: () => {
    lang = l; consentText.innerHTML = CONSENT[l]; langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === l))); log('core', 'consent_lang', l);
  }, 'data-l': l }, l === 'en' ? 'English' : 'Bahasa Melayu'));
  const agree = h('input', { type: 'checkbox', id: 'f-consent' });
  const consentBox = h('div', { class: 'tn-consent' }, h('div', { class: 'tn-lang' }, langBtns), consentText,
    h('label', { class: 'tn-check', for: 'f-consent' }, agree, h('span', {}, 'I have read this notice and agree to The Nurts collecting and using my personal data as described.')));

  const F = {
    name: field('Full name', name), nric: field('NRIC / MyKad number', nric, 'Only a masked version is kept. We never store your full number.'),
    email: field('Email', email), phone: field('Phone', phone),
    dept: field('Department you’re interested in', dept), type: field('Type of role', type),
  };
  const consentErr = h('div', { class: 'tn-err' });
  const submit = button('Start playing', () => {}, { type: 'submit', icon: '▶', id: 'btn-register' });

  const form = h('form', { class: 'tn-stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const errs = {
      name: name.value.trim().length < 2 && 'Please enter your name.',
      nric: !validateNric(nric.value).ok && 'That doesn’t look like a valid NRIC or MyKad number.',
      email: !emailOk(email.value) && 'Please enter a valid email.',
      phone: !phoneOk(phone.value) && 'Please enter a valid phone number.',
      dept: !dept.value && 'Pick one.',
      type: !type.value && 'Pick one.',
    };
    Object.entries(errs).forEach(([k, m]) => F[k].setError(m));
    consentErr.textContent = agree.checked ? '' : 'Please tick the box to continue.';
    const bad = Object.values(errs).some(Boolean) || !agree.checked;
    log('core', 'register_submit', { valid: !bad, errors: Object.keys(errs).filter((k) => errs[k]).concat(agree.checked ? [] : ['consent']) });
    if (bad) { form.querySelector('.is-bad input, .is-bad button')?.focus(); return; }
    busy(submit, true);
    try {
      await onSubmit({
        nric: nric.value,
        profile: { name: name.value.trim(), email: email.value.trim().toLowerCase(), phone: phone.value.trim(), department: dept.value, employmentType: type.value, cvName: cv?.name || '' },
        cv, consent: agree.checked, consentVersion: CONSENT_VERSION, consentLang: lang,
      });
    } finally { busy(submit, false); }
  } },
  F.name, F.nric, F.email, F.phone, F.dept, F.type,
  h('label', { class: 'tn-file', for: 'f-cv' }, cvInput, cvLabel),
  consentBox, consentErr, submit,
  button('Back', onBack, { kind: 'ghost' }));

  return show(h('div', { class: 'tn-screen tn-screen--top' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(host('zoey', 'happy', 'First, a little about you.'), h('h2', {}, 'Create your player profile'), form)));
}

export function loginScreen({ onSubmit, onBack, email: prefill = '' }) {
  log('core', 'login_view');
  const nric = input('l-nric', 'text', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 14, autofocus: true });
  const email = input('l-email', 'email', { autocomplete: 'email', inputmode: 'email', value: prefill });
  const F = { nric: field('NRIC / MyKad number', nric), email: field('Email you registered with', email) };
  const submit = button('Continue', () => {}, { type: 'submit', icon: '▶', id: 'btn-login' });
  const form = h('form', { class: 'tn-stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    F.nric.setError(!validateNric(nric.value).ok && 'That doesn’t look like a valid NRIC or MyKad number.');
    F.email.setError(!emailOk(email.value) && 'Please enter a valid email.');
    if (!validateNric(nric.value).ok || !emailOk(email.value)) return;
    busy(submit, true);
    try { await onSubmit({ nric: nric.value, email: email.value.trim().toLowerCase() }); } finally { busy(submit, false); }
  } }, F.nric, F.email, submit, button('Back', onBack, { kind: 'ghost' }));
  return show(h('div', { class: 'tn-screen' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(host('noah', 'happy', 'Welcome back! Let’s find your spot.'), h('h2', {}, 'Pick up where you left off'), form)));
}
