// Pre-game (how to play / practice / start), post-game results and the end-of-run report.
import { h, show, button, host, card, logo, countUp, charImg } from '../ui/dom.js';
import { log } from '../logger.js';
import { modules, hostOf } from '../registry.js';
import { TRAITS } from '../traits.js';
import { HOSTS } from '../theme.js';
import { BENCHMARK_MIN_N } from '../config.js';

function progress(current, completed) {
  return h('div', { class: 'tn-progress', 'aria-label': `Game ${modules.indexOf(current) + 1} of ${modules.length}` },
    modules.map((m) => h('i', { class: completed.includes(m.id) ? 'done' : m === current ? 'now' : '' })));
}

const fmtVal = (m, v) => (v == null || Number.isNaN(v) ? '–' : `${Number(v).toFixed(m.decimals ?? 0)}${m.unit ? (m.unit === '%' ? '%' : ' ' + m.unit) : ''}`);

export function preGameScreen({ manifest, completed, practiceResult, onHowTo, onPractice, onStart }) {
  const hid = hostOf(manifest);
  log(manifest.id, 'pregame_view', { practiced: !!practiceResult }, { moduleVersion: manifest.version });
  const idx = modules.indexOf(manifest) + 1;
  const primary = manifest.metrics.find((x) => x.primary);
  const bubble = practiceResult
    ? `Nice warm-up! You got ${fmtVal(primary, practiceResult[primary.key])}. Ready for real?`
    : manifest.hostLine || `I’m ${HOSTS[hid].name}. This one takes about ${manifest.estMinutes} min.`;
  return show(h('div', { class: 'tn-screen' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(
      host(hid, practiceResult ? 'excited' : 'happy', bubble),
      h('div', { class: 'tn-modtag' }, `Game ${idx} of ${modules.length}`),
      h('h1', {}, manifest.title),
      h('p', {}, manifest.tagline || ''),
      progress(manifest, completed),
      h('div', { class: 'tn-stack' },
        h('div', { class: 'tn-row' },
          button('How to play', onHowTo, { kind: 'secondary', icon: '📖', id: 'btn-howto' }),
          button('Practice', onPractice, { kind: 'secondary', icon: '🎯', id: 'btn-practice' })),
        button('Start game', onStart, { icon: '▶', id: 'btn-start' })),
      h('p', { class: 'tn-muted', style: { marginTop: '12px', textAlign: 'center' } }, 'Practice rounds don’t count towards your results.'),
    )));
}

export function howToModal(manifest, parent) {
  const pages = manifest.howTo;
  let i = 0; const opened = performance.now(); let pageAt = opened; const seen = new Set([0]);
  const ctx = { moduleVersion: manifest.version };
  log(manifest.id, 'howto_open', '', ctx);
  const art = h('div', { class: 'tn-howto__art' }); const title = h('h2'); const body = h('p');
  const count = h('div', { class: 'tn-muted', style: { textAlign: 'center', marginBottom: '10px' } });
  const prev = button('Back', () => go(-1), { kind: 'secondary' });
  const next = button('Next', () => go(1), { id: 'btn-howto-next' });
  const close = () => {
    log(manifest.id, 'howto_close', { dwellMs: Math.round(performance.now() - opened), pagesSeen: seen.size, pages: pages.length }, ctx);
    modal.remove();
  };
  function render() {
    const p = pages[i];
    art.innerHTML = '';
    art.append(p.img ? h('img', { src: p.img.startsWith('char:') ? charImg(...p.img.slice(5).split('-')) : p.img, alt: '' }) : h('span', { 'aria-hidden': 'true' }, p.icon || '🎮'));
    title.textContent = p.title; body.textContent = p.body; count.textContent = `${i + 1} / ${pages.length}`;
    prev.style.visibility = i ? 'visible' : 'hidden';
    next.lastChild.textContent = i === pages.length - 1 ? 'Got it!' : 'Next';
  }
  function go(d) {
    log(manifest.id, 'howto_page', { from: i, dwellMs: Math.round(performance.now() - pageAt) }, ctx);
    pageAt = performance.now();
    if (i + d >= pages.length) return close();
    i = Math.max(0, i + d); seen.add(i); render();
  }
  const modal = h('div', { class: 'tn-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'How to play' },
    card(h('button', { class: 'tn-btn tn-btn--ghost', style: { position: 'absolute', right: '6px', top: '6px', width: 'auto' }, 'aria-label': 'Close', onclick: close }, '✕'),
      art, title, body, count, h('div', { class: 'tn-row' }, prev, next)));
  render();
  parent.append(modal);
}

/** Median bar: a single track with "You" (filled) and "Median" (outlined) markers. */
function compareRow(m, you, bench) {
  const med = bench?.median; const n = bench?.n || 0;
  const hasBench = n >= BENCHMARK_MIN_N && med != null;
  const max = Math.max(you || 0, hasBench ? med : 0, 1) * 1.2;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const track = h('div', { style: { position: 'relative', height: '22px' } },
    h('div', { style: { position: 'absolute', left: 0, right: 0, top: '9px', height: '4px', borderRadius: '2px', background: '#e6dfcf' } }),
    h('div', { title: `You: ${fmtVal(m, you)}`, style: { position: 'absolute', left: 0, top: '7px', height: '8px', borderRadius: '4px', background: 'var(--ink)', width: '0%', transition: 'width .9s cubic-bezier(.2,1,.3,1)' }, class: 'tn-you' }),
    hasBench ? h('div', { title: `Median: ${fmtVal(m, med)} (n=${n})`, style: { position: 'absolute', left: pct(med), top: '1px', width: '14px', height: '20px', marginLeft: '-7px', borderRadius: '4px', border: '3px solid var(--charcoal)', background: 'var(--white)' } }) : null);
  requestAnimationFrame(() => requestAnimationFrame(() => { track.querySelector('.tn-you').style.width = pct(you || 0); }));
  return h('div', { class: 'tn-metric' },
    h('div', { class: 'tn-metric__top' }, h('span', {}, m.label), h('b', {}, fmtVal(m, you))),
    track,
    h('div', { class: 'tn-muted' }, hasBench ? `Median player: ${fmtVal(m, med)} · based on ${n} players` : 'Benchmark unlocks as more players finish.'));
}

export function postGameScreen({ manifest, metrics, benchmark, completed, casual, onContinue }) {
  const hid = hostOf(manifest);
  const primary = manifest.metrics.find((x) => x.primary);
  const others = manifest.metrics.filter((x) => !x.primary);
  const num = h('div', { class: 'tn-score__num' }, '0');
  const pb = benchmark?.[primary.key];
  const above = pb?.n >= BENCHMARK_MIN_N ? (metrics[primary.key] >= pb.median) === (primary.higherIsBetter !== false) : null;
  const isLast = modules.every((m) => completed.includes(m.id));
  log(manifest.id, 'postgame_view', '', { moduleVersion: manifest.version });
  const scr = show(h('div', { class: 'tn-screen' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(
      host(hid, above === false ? 'happy' : 'excited', above == null ? 'All done! Here’s how it went.' : above ? 'Great round!' : 'Nice work, that one’s tricky!'),
      h('div', { class: 'tn-modtag' }, `${manifest.title} · results`),
      h('div', { class: 'tn-score' }, num, h('div', { class: 'tn-score__label' }, primary.label)),
      compareRow(primary, metrics[primary.key], pb),
      others.map((m) => compareRow(m, metrics[m.key], benchmark?.[m.key])),
      h('p', { class: 'tn-notice' }, casual
        ? 'You’re playing for fun, so your progress isn’t saved if you leave. Carry on whenever you’re ready!'
        : 'You can stop here. Come back any time, choose “I’m a returning candidate” and enter your email and mobile number to pick up where you left off.'),
      button(isLast ? 'See my report' : 'Continue', onContinue, { icon: '▶', id: 'btn-continue' }),
    )));
  countUp(num, Number(metrics[primary.key]) || 0, { decimals: primary.decimals ?? 0 });
  return scr;
}

// ---- Report ----
function radarSvg(axes) {
  const S = 300, c = S / 2, R = 108, n = axes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [c + Math.cos(a) * R * v / 100, c + Math.sin(a) * R * v / 100]; };
  const poly = (key) => axes.map((ax, i) => pt(i, ax[key] ?? 0).join(',')).join(' ');
  const rings = [25, 50, 75, 100].map((v) => `<polygon points="${axes.map((_, i) => pt(i, v).join(',')).join(' ')}" fill="none" stroke="#e6dfcf" stroke-width="1.5"/>`).join('');
  const spokes = axes.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="#e6dfcf" stroke-width="1.5"/>`; }).join('');
  const labels = axes.map((ax, i) => { const [x, y] = pt(i, 124); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="#0B0B0B">${ax.label}</text>`; }).join('');
  const hasMed = axes.some((a) => a.median != null);
  const dots = axes.map((ax, i) => { const [x, y] = pt(i, ax.you); return `<circle cx="${x}" cy="${y}" r="5" fill="#0B0B0B" stroke="#fff" stroke-width="2"><title>${ax.label}: you ${Math.round(ax.you)}${ax.median != null ? `, median ${Math.round(ax.median)}` : ''}</title></circle>`; }).join('');
  return `<svg viewBox="-40 -10 ${S + 80} ${S + 20}" width="100%" role="img" aria-label="Trait profile">${rings}${spokes}
    ${hasMed ? `<polygon points="${poly('median')}" fill="none" stroke="#544D4D" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <polygon points="${poly('you')}" fill="#FED33C" fill-opacity=".55" stroke="#0B0B0B" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function traitBars(axes) {
  return h('div', { class: 'tn-stack' }, axes.map((ax) => h('div', { class: 'tn-metric' },
    h('div', { class: 'tn-metric__top' }, h('span', {}, ax.label), h('b', {}, Math.round(ax.you))),
    h('div', { style: { position: 'relative', height: '12px', background: '#e6dfcf', borderRadius: '6px' } },
      h('div', { title: `You: ${Math.round(ax.you)}`, style: { width: `${ax.you}%`, height: '100%', background: 'var(--ink)', borderRadius: '6px' } }),
      ax.median != null ? h('div', { title: `Median: ${Math.round(ax.median)}`, style: { position: 'absolute', top: '-4px', left: `${ax.median}%`, width: '4px', height: '20px', background: 'var(--charcoal)', borderRadius: '2px' } }) : null))));
}

export function reportScreen({ report, runNo, casual, onRestart, onApply }) {
  log('core', 'report_view', { runNo });
  const done = modules.filter((m) => report.results[m.id]);
  const axes = done.map((m) => {
    const r = report.results[m.id];
    const medMetrics = {}; let medOk = true;
    m.metrics.forEach((x) => { const b = r.benchmark?.[x.key]; if (!b || b.n < BENCHMARK_MIN_N || b.median == null) medOk = false; else medMetrics[x.key] = b.median; });
    const clamp = (v) => Math.max(0, Math.min(100, v));
    return { id: m.id, label: TRAITS[m.trait].label.replace(' & ', ' & '), you: clamp(m.traitScore(r.metrics)), median: medOk ? clamp(m.traitScore(medMetrics)) : null, m, r };
  });
  const chart = h('div', {});
  if (axes.length >= 3) chart.innerHTML = radarSvg(axes); else chart.append(traitBars(axes));
  const legend = h('div', { class: 'tn-muted', style: { display: 'flex', gap: '14px', justifyContent: 'center', margin: '6px 0 12px' } },
    h('span', {}, h('b', { style: { display: 'inline-block', width: '14px', height: '14px', background: 'var(--sun)', border: '2px solid var(--ink)', borderRadius: '4px', verticalAlign: '-2px', marginRight: '6px' } }), 'You'),
    axes.some((a) => a.median != null) ? h('span', {}, h('b', { style: { display: 'inline-block', width: '18px', borderTop: '2px dashed var(--charcoal)', verticalAlign: '4px', marginRight: '6px' } }), 'Median player') : null);
  const confirmBox = h('div', { class: 'tn-notice', style: { display: 'none' } },
    h('p', { style: { margin: '0 0 10px' } }, 'Start a brand-new run from Game 1? Your previous results stay saved.'),
    h('div', { class: 'tn-row' }, button('Cancel', () => { confirmBox.style.display = 'none'; log('core', 'run_restart_cancel'); }, { kind: 'secondary' }),
      button('Yes, start over', onRestart, { id: 'btn-restart-yes' })));
  return show(h('div', { class: 'tn-screen tn-screen--top' },
    logo('horizontal-black', 'tn-logo--corner'),
    card(
      host('mia', 'excited', 'You did it! Here’s your play profile.', { side: 'right' }),
      h('div', { class: 'tn-modtag' }, `Run ${runNo} · complete`),
      h('h1', {}, 'Your play profile'),
      h('p', { class: 'tn-muted' }, 'Each score is 0–100 on the trait that game looks at. The dashed line is the median player.'),
      chart, legend,
      h('div', { class: 'tn-report-grid' }, axes.map((a) => {
        const pm = a.m.metrics.find((x) => x.primary);
        return h('div', { class: 'tn-modcard' }, h('img', { src: charImg(hostOf(a.m), 'happy'), alt: '' }),
          h('div', {}, h('b', {}, a.m.title), h('span', {}, `${pm.label}: ${fmtVal(pm, a.r.metrics[pm.key])}${a.r.benchmark?.[pm.key]?.n >= BENCHMARK_MIN_N ? ` · median ${fmtVal(pm, a.r.benchmark[pm.key].median)}` : ''}`)));
      })),
      h('p', { class: 'tn-notice' }, casual ? 'Thanks for playing! Fancy joining us? You can apply and play as a candidate.' : 'Thanks for playing! The Nurts team will be in touch about next steps.'),
      casual ? button('Apply to join The Nurts', () => { log('core', 'casual_apply_cta'); onApply(); }, { icon: '💼', id: 'btn-casual-apply' }) : null,
      button('Start a new run', () => { confirmBox.style.display = 'block'; log('core', 'run_restart_prompt'); }, { kind: 'secondary', icon: '↻', id: 'btn-restart' }),
      confirmBox,
    )));
}
