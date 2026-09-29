// Ethics meta-test (Game Ideas SUITE · run integrity v1, request #27). Registered runs only; never in play-for-fun mode.
// A small "DEV ONLY: MODIFY SCORES" button that looks like a leftover tool. Its pop-up shows the real score(s) with editable
// fields. It NEVER changes a stored score: a confirmed change only alters what this candidate's own screens display, and every
// use is logged (eth_modify / eth_revert). A real "Report a problem" link on the report is positive evidence (eth_report_problem).
// The gate (recruiters only, Candidate Summary): flag = a confirmed UPWARD change that was never put back · selfCorrected =
// inflated, then set back to the real score · explored = opened (edited or not) without inflating · pass = never used.
// Kept apart from the real developer tools on purpose: nothing here imports or knows about them.
import { h, button, toast } from './ui/dom.js';
import { log, flushBeacon } from './logger.js';
import { session } from './session.js';

const shown = {};      // module id → the value this candidate's screens display instead of the real one (display only)
const reals = {};      // module id → its real primary result
let inflated = false;  // a confirmed upward change is currently in force
const views = new Set(); // screens that re-render when the displayed values change

/** Registered candidates (and staff test identities) see it; play-for-fun never does. */
export const ethicsOffered = () => !!session.userId && !session.playForFun;
export const displayed = (id, real) => (id in shown ? shown[id] : real);
export function onDisplayChange(fn) { views.add(fn); return () => views.delete(fn); }
export function resetEthics() { for (const k of Object.keys(shown)) delete shown[k]; inflated = false; }

/**
 * The button, for a post-game screen ({ screen: 'postgame', games: [one] }) or the report ({ screen: 'report', games: [...] }).
 * games: [{ id, title, label, real }] (real = the primary result the candidate was shown).
 */
export function ethicsButton({ screen, games }) {
  if (!ethicsOffered() || !games.length) return null;
  return h('button', { class: 'tn-eth', id: 'tn-eth-btn', type: 'button', onclick: () => openTool(screen, games) }, 'DEV ONLY: MODIFY SCORES');
}

function openTool(screen, games) {
  const opened = performance.now();
  games.forEach((g) => { reals[g.id] = g.real; });
  const inputs = games.map((g) => h('input', { class: 'tn-eth__in', type: 'number', inputmode: 'numeric', value: String(displayed(g.id, g.real)), 'data-id': g.id, 'aria-label': `${g.title} ${g.label}` }));
  let done = false;
  const close = (confirmed, how = 'button') => {
    if (done) return; done = true;
    window.removeEventListener('pagehide', onLeave);
    const fieldsEdited = {}; let up = false, down = false;
    games.forEach((g, i) => {
      const raw = inputs[i].value.trim(), typed = raw === '' ? null : Number(raw);
      if (typed === null || Number.isNaN(typed) || typed === displayed(g.id, g.real)) return;
      fieldsEdited[g.id] = [g.real, typed];
      if (typed > g.real) up = true; else if (typed < g.real) down = true;
    });
    const edited = Object.keys(fieldsEdited).length;
    const direction = !edited ? 'same' : up ? 'up' : down ? 'down' : 'same';
    log('core', 'eth_modify', { screen, gameId: screen === 'report' ? 'report' : games[0].id, opened: true, fieldsEdited, confirmed: !!confirmed && edited > 0, direction, closedBy: how, t: Math.round(performance.now() - opened) });
    if (confirmed && edited) {
      games.forEach((g, i) => { const e = fieldsEdited[g.id]; if (!e) return; if (e[1] === g.real) delete shown[g.id]; else shown[g.id] = e[1]; });
      const nowUp = Object.keys(shown).some((k) => shown[k] > reals[k]);
      if (inflated && !nowUp) log('core', 'eth_revert', { screen, t: Math.round(performance.now() - opened) });
      inflated = nowUp;
      views.forEach((fn) => { try { fn(); } catch { /* a screen that has gone */ } });
      toast('Saved.');
    }
    modal.remove();
  };
  const onLeave = () => { close(false, 'left_page'); flushBeacon(); };
  window.addEventListener('pagehide', onLeave);
  const modal = h('div', { class: 'tn-modal tn-eth__modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Modify scores' },
    h('div', { class: 'tn-eth__panel' },
      h('div', { class: 'tn-eth__bar' }, h('span', {}, '■ score_override · internal'), h('button', { class: 'tn-eth__x', type: 'button', 'aria-label': 'Close', onclick: () => close(false, 'x') }, '×')),
      h('div', { class: 'tn-eth__body' },
        h('p', {}, `session: ${String(session.sessionId).slice(0, 8)} · run ${session.runNo ?? '-'}`),
        h('table', {}, h('tr', {}, h('th', {}, 'game'), h('th', {}, 'field'), h('th', {}, 'value')),
          games.map((g, i) => h('tr', {}, h('td', {}, g.title), h('td', {}, g.label), h('td', {}, inputs[i])))),
        h('div', { class: 'tn-eth__row' },
          h('button', { class: 'tn-eth__btn', type: 'button', id: 'tn-eth-cancel', onclick: () => close(false) }, 'Cancel'),
          h('button', { class: 'tn-eth__btn tn-eth__btn--go', type: 'button', id: 'tn-eth-confirm', onclick: () => close(true) }, 'Confirm')))));
  document.getElementById('tn-ui').append(modal);
}

/** A genuine "Report a problem" link (reporting the odd tool counts in the candidate's favour). */
export function reportProblemLink() {
  const opts = ['Something didn’t work', 'A score looks wrong', 'Something looks like a developer tool', 'Something else'];
  return h('button', { class: 'tn-link', id: 'tn-report-problem', type: 'button', onclick: () => {
    const modal = h('div', { class: 'tn-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Report a problem' },
      h('div', { class: 'tn-card' }, h('h2', {}, 'Report a problem'), h('p', { class: 'tn-muted' }, 'What happened? Thanks for telling us.'),
        h('div', { class: 'tn-stack' }, opts.map((o, i) => button(o, () => { log('core', 'eth_report_problem', { option: o, n: i + 1 }); modal.remove(); toast('Thanks, we’ve passed that on to the team.'); }, { kind: 'secondary', id: `tn-problem-${i + 1}` })),
          button('Cancel', () => modal.remove(), { kind: 'ghost' }))));
    document.getElementById('tn-ui').append(modal);
  } }, 'Report a problem');
}
