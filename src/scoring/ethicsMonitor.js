// FW-8: the monthly ethics monitor (Framework v0.3 trait 8 safeguards). Recruiters only. Per calendar month (Malaysia time):
// how many registered candidates were offered the "DEV ONLY" button, how many opened it, raised a score and left it (flag),
// raised then put it back (self-corrected) or reported it. If the open rate jumps to leakRatio × the first months' rate, the
// test may have leaked: review or retire it. Pure.
import { DEFAULTS } from './config.js';

const monthOf = (t) => new Date(Number(t) + 8 * 3600e3).toISOString().slice(0, 7); // Asia/Kuala_Lumpur, no DST

/** events: [{ userId, interaction, value, t }] (eth_* rows) · users: the registered user ids to count (no Casual / Dev Test). */
export function ethicsMonitor(events, users, cfg = DEFAULTS) {
  const keep = new Set(users), by = {};
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (!keep.has(e.userId) || !/^eth_/.test(e.interaction)) continue;
    const m = monthOf(e.t), u = ((by[m] ||= {})[e.userId] ||= { offered: false, opened: false, up: false, back: false, reported: false });
    if (e.interaction === 'eth_offer') u.offered = true;
    if (e.interaction === 'eth_modify') { u.opened = true; if (e.value?.confirmed && e.value?.direction === 'up') { u.up = true; u.back = false; } }
    if (e.interaction === 'eth_revert' && u.up) u.back = true;
    if (e.interaction === 'eth_report_problem' && /developer tool/i.test(e.value?.option || '')) { u.reported = true; if (u.up) u.back = true; }
  }
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : '');
  const months = Object.keys(by).sort(), rows = [];
  const baseN = Number(cfg['ethics.baselineMonths']) || 3, ratio = Number(cfg['ethics.leakRatio']) || 2;
  const first = months.slice(0, baseN).flatMap((x) => Object.values(by[x])), o = first.filter((u) => u.offered || u.opened).length;
  const baseOpen = o ? first.filter((u) => u.opened).length / o : null; // the pooled open rate of the first months
  months.forEach((m, i) => {
    const us = Object.values(by[m]), offered = us.filter((u) => u.offered || u.opened).length, opened = us.filter((u) => u.opened).length;
    const flagged = us.filter((u) => u.up && !u.back).length, selfCorrected = us.filter((u) => u.up && u.back).length, reported = us.filter((u) => u.reported && !u.up).length;
    const open = offered ? opened / offered : null;
    const leak = i >= baseN && baseOpen != null && open != null && (baseOpen === 0 ? open > 0.2 : open >= ratio * baseOpen);
    rows.push({ month: m, offered, opened, 'open rate %': pct(opened, offered), flagged, 'flag rate %': pct(flagged, offered), 'self-corrected': selfCorrected, reported,
      'baseline open rate %': baseOpen == null ? '' : Math.round(baseOpen * 1000) / 10,
      status: i < baseN ? 'baseline month' : leak ? `possible leak: open rate ≥ ${ratio}× the first ${baseN} months. Review or retire the test` : 'ok' });
  });
  return rows;
}
