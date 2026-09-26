// Home (apply vs play for fun), Applicant choice (new vs returning), Register and Login screens.
import { h, show, button, host, card, logo, toast, busy } from '../ui/dom.js';
import { log } from '../logger.js';
import { emailOk, phoneOk, normEmail, normPhone } from '../identity.js';
import { CONSENT_VERSION } from '../config.js';
import { CONSENT } from '../consent.js';

export function homeScreen({ onApply, onCasual }) {
  log('core', 'home_view');
  return show(h('div', { class: 'tn-screen' },
    h('div', { style: { marginBottom: '8px' } }, logo('vertical-black', 'tn-logo--home')),
    card(
      host('liam', 'excited', 'Hey! Ready for a few quick games?', { side: 'right' }),
      h('h1', {}, 'Play with The Nurts'),
      h('p', {}, 'A short series of mini-games. There are no trick questions, just play the way you naturally would.'),
      h('div', { class: 'tn-stack' },
        button('I’m applying to join', () => { log('core', 'choose_apply'); onApply(); }, { icon: '💼', id: 'btn-apply' }),
        button('Just play for fun', () => { log('core', 'choose_casual'); onCasual(); }, { kind: 'secondary', icon: '🎮', id: 'btn-casual' })),
      h('p', { class: 'tn-muted', style: { marginTop: '12px', textAlign: 'center' } }, 'Playing for fun needs no sign-up. We record gameplay anonymously to improve our games.'),
    )));
}

export function applicantScreen({ onNew, onReturning, onBack }) {
  log('core', 'applicant_view');
  return show(h('div', { class: 'tn-screen' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(
      host('zoey', 'happy', 'Great! Have you played with us before?'),
      h('h2', {}, 'Applying to The Nurts'),
      h('p', {}, 'Your results are saved to your application, and you can stop and come back any time.'),
      h('div', { class: 'tn-stack' },
        button('I’m a new candidate', () => { log('core', 'choose_new'); onNew(); }, { icon: '✨', id: 'btn-new' }),
        button('I’m a returning candidate', () => { log('core', 'choose_returning'); onReturning(); }, { kind: 'secondary', icon: '↩', id: 'btn-returning' }),
        button('Back', onBack, { kind: 'ghost' })),
    )));
}

const DEPTS = ['Events', 'Marketing', 'Sales', 'Product', 'Creative', 'Other'];
const TYPES = ['Intern', 'Freelance', 'Part-time', 'Full-time'];
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
const EMAIL_MSG = 'Please enter a valid email, e.g. name@example.com.';
const PHONE_MSG = 'Use + and your country code, digits only, no spaces, e.g. +60178720118.';
function phoneInput(id, attrs = {}) {
  const el = input(id, 'tel', { autocomplete: 'tel', inputmode: 'tel', placeholder: '+60178720118', maxlength: 16, ...attrs });
  // Strip spaces, dashes and brackets as they type, keeping one leading +.
  el.addEventListener('input', () => { const v = el.value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); if (v !== el.value) el.value = v; });
  return el;
}

export function registerScreen({ onSubmit, onBack }) {
  log('core', 'register_view');
  const name = input('f-name', 'text', { autocomplete: 'name', autofocus: true, maxlength: 80 });
  const email = input('f-email', 'email', { autocomplete: 'email', inputmode: 'email', maxlength: 120, placeholder: 'name@example.com' });
  const phone = phoneInput('f-phone');
  const dept = chips('f-dept', DEPTS);
  const type = chips('f-type', TYPES);
  let cv = null;
  const cvLabel = h('span', {}, '📎 Tap to attach your CV (PDF or Word, max 5 MB)');
  const cvInput = h('input', { type: 'file', accept: '.pdf,.doc,.docx', id: 'f-cv', onchange: async (e) => {
    const file = e.target.files[0]; cv = null;
    if (!file) { cvLabel.textContent = '📎 Tap to attach your CV (PDF or Word, max 5 MB)'; return; }
    if (!CV_OK.test(file.name) || file.size > MAX_CV) { toast('Please choose a PDF or Word file under 5 MB.', 'bad'); e.target.value = ''; return; }
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(file); });
    cv = { name: file.name, type: file.type, size: file.size, data: b64 };
    cvLabel.textContent = '✅ ' + file.name;
    log('core', 'cv_attached', { type: file.type, kb: Math.round(file.size / 1024) });
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
    name: field('Full name', name),
    email: field('Email', email), phone: field('Mobile number', phone, 'With country code, no spaces, e.g. +60178720118.'),
    type: field('Type of role', type), dept: field('Desired function', dept),
  };
  const consentErr = h('div', { class: 'tn-err' });
  const submit = button('Start playing', () => {}, { type: 'submit', icon: '▶', id: 'btn-register' });

  const form = h('form', { class: 'tn-stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const errs = {
      name: name.value.trim().length < 2 && 'Please enter your name.',
      email: !emailOk(email.value) && EMAIL_MSG,
      phone: !phoneOk(phone.value) && PHONE_MSG,
      type: !type.value && 'Pick one.',
      dept: !dept.value && 'Pick one.',
    };
    Object.entries(errs).forEach(([k, m]) => F[k].setError(m));
    consentErr.textContent = agree.checked ? '' : 'Please tick the box to continue.';
    const bad = Object.values(errs).some(Boolean) || !agree.checked;
    log('core', 'register_submit', { valid: !bad, errors: Object.keys(errs).filter((k) => errs[k]).concat(agree.checked ? [] : ['consent']) });
    if (bad) { form.querySelector('.is-bad input, .is-bad button')?.focus(); return; }
    busy(submit, true);
    try {
      await onSubmit({
        profile: { name: name.value.trim(), email: normEmail(email.value), phone: normPhone(phone.value), employmentType: type.value, desiredFunction: dept.value, cvName: cv?.name || '' },
        cv, consent: agree.checked, consentVersion: CONSENT_VERSION, consentLang: lang,
      });
    } finally { busy(submit, false); }
  } },
  F.name, F.email, F.phone, F.type, F.dept,
  h('div', { class: 'tn-field' },
    h('label', { for: 'f-cv' }, 'CV / résumé ', h('span', { class: 'tn-optional' }, 'Optional')),
    h('label', { class: 'tn-file', for: 'f-cv' }, cvInput, cvLabel),
    h('small', {}, 'Not required. You can skip this and still take part fully.')),
  consentBox, consentErr, submit,
  button('Back', onBack, { kind: 'ghost' }));

  return show(h('div', { class: 'tn-screen tn-screen--top' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(host('zoey', 'happy', 'First, a little about you.'), h('h2', {}, 'Create your player profile'), form)));
}

export function loginScreen({ onSubmit, onBack, email: prefill = '' }) {
  log('core', 'login_view');
  const email = input('l-email', 'email', { autocomplete: 'email', inputmode: 'email', value: prefill, autofocus: true, placeholder: 'name@example.com' });
  const phone = phoneInput('l-phone');
  const F = { email: field('Email you registered with', email), phone: field('Mobile number you registered with', phone, 'With country code, no spaces, e.g. +60178720118.') };
  const submit = button('Continue', () => {}, { type: 'submit', icon: '▶', id: 'btn-login' });
  const form = h('form', { class: 'tn-stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    F.email.setError(!emailOk(email.value) && EMAIL_MSG);
    F.phone.setError(!phoneOk(phone.value) && PHONE_MSG);
    if (!emailOk(email.value) || !phoneOk(phone.value)) return;
    busy(submit, true);
    try { await onSubmit({ email: normEmail(email.value), phone: normPhone(phone.value) }); } finally { busy(submit, false); }
  } }, F.email, F.phone, submit, button('Back', onBack, { kind: 'ghost' }));
  return show(h('div', { class: 'tn-screen' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(host('noah', 'happy', 'Welcome back! Let’s find your spot.'), h('h2', {}, 'Pick up where you left off'), form)));
}
