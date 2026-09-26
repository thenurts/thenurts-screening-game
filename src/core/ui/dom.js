// Minimal DOM helpers for the shell screens (forms, menus, results) layered over the Phaser canvas.
import { ASSET_BASE } from '../config.js';
import { sfx } from '../sfx.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export const brand = (p) => `${ASSET_BASE}brand/${p}`;
export const charImg = (host, pose) => brand(`chars/${host}-${pose}.webp`);

let layer = null;
export function initUi(root) {
  layer = h('div', { class: 'tn-ui', id: 'tn-ui' });
  root.append(layer);
  return layer;
}

let current = null;
/** Replace the active screen with a slide/fade transition. */
export function show(screen) {
  const old = current;
  current = screen;
  screen.classList.add('tn-screen', 'is-entering');
  layer.append(screen);
  requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.remove('is-entering')));
  if (old) {
    old.classList.add('is-leaving');
    old.style.pointerEvents = 'none';
    setTimeout(() => old.remove(), 380);
  }
  screen.querySelector('[autofocus]')?.focus({ preventScroll: true });
  return screen;
}
export function hideUi() { if (current) { const c = current; current = null; c.classList.add('is-leaving'); setTimeout(() => c.remove(), 380); } }

export function button(label, onClick, { kind = 'primary', icon = null, id = null, type = 'button' } = {}) {
  return h('button', {
    class: `tn-btn tn-btn--${kind}`, type, id,
    onclick: (e) => { sfx.unlock(); sfx.play('click'); onClick?.(e); },
  }, icon ? h('span', { class: 'tn-btn__icon', 'aria-hidden': 'true' }, icon) : null, h('span', {}, label));
}

/** Host character bust with a speech bubble; poses: happy|excited|worried|cross */
export function host(hostId, pose, text, { side = 'left' } = {}) {
  return h('div', { class: `tn-host tn-host--${side} tn-host--${hostId}` },
    h('img', { class: 'tn-host__img', src: charImg(hostId, pose), alt: '', draggable: 'false' }),
    text ? h('div', { class: 'tn-bubble' }, text) : null);
}

export function card(...kids) { return h('div', { class: 'tn-card' }, ...kids); }

export function logo(variant = 'horizontal-black', cls = '') {
  return h('img', { class: `tn-logo ${cls}`, src: brand(`logos/logo-${variant}.webp`), alt: 'The Nurts' });
}

let toastEl = null;
export function toast(msg, kind = 'info') {
  toastEl?.remove();
  toastEl = h('div', { class: `tn-toast tn-toast--${kind}`, role: 'status' }, msg);
  document.getElementById('tn-ui').append(toastEl);
  const ms = kind === 'bad' ? 7000 : 3200; // error messages stay long enough to read
  const el = toastEl;
  setTimeout(() => el.classList.add('is-out'), ms);
  setTimeout(() => el.remove(), ms + 500);
}

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on; btn.classList.toggle('is-busy', on);
}

/** Animated count-up for numbers. */
export function countUp(el, to, { ms = 900, decimals = 0, suffix = '' } = {}) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms); const e = 1 - (1 - k) ** 3;
    el.textContent = (to * e).toFixed(decimals) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
