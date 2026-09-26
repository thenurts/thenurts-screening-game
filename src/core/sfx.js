// Tiny synthesized SFX bank (WebAudio, no asset downloads). Modules call sfx.play('pop') etc.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('thenurts_muted') === '1'; } catch { /* ignore */ }

function ac() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f = 440, f2 = null, t = 0.12, type = 'sine', vol = 0.18, delay = 0, noise = false }) {
  const a = ac(); if (!a || muted) return;
  const t0 = a.currentTime + delay;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  g.connect(a.destination);
  if (noise) {
    const b = a.createBuffer(1, a.sampleRate * t, a.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(); s.buffer = b;
    const flt = a.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = 0.8;
    s.connect(flt).connect(g); s.start(t0);
    return;
  }
  const o = a.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  o.connect(g); o.start(t0); o.stop(t0 + t + 0.02);
}

const BANK = {
  click: () => tone({ f: 660, f2: 880, t: 0.06, type: 'triangle', vol: 0.12 }),
  tick: () => tone({ f: 1200, t: 0.04, type: 'square', vol: 0.05 }),
  whoosh: () => tone({ f: 900, t: 0.25, noise: true, vol: 0.12 }),
  pop: () => { tone({ f: 1800, t: 0.12, noise: true, vol: 0.35 }); tone({ f: 220, f2: 60, t: 0.15, type: 'sine', vol: 0.25 }); },
  good: () => { tone({ f: 660, t: 0.1, type: 'triangle' }); tone({ f: 990, t: 0.16, type: 'triangle', delay: 0.07 }); },
  bad: () => tone({ f: 300, f2: 140, t: 0.25, type: 'sawtooth', vol: 0.09 }),
  coin: () => { tone({ f: 988, t: 0.07, type: 'square', vol: 0.07 }); tone({ f: 1319, t: 0.2, type: 'square', vol: 0.07, delay: 0.07 }); },
  count: () => tone({ f: 520, t: 0.12, type: 'triangle', vol: 0.15 }),
  go: () => tone({ f: 780, f2: 1040, t: 0.3, type: 'triangle', vol: 0.2 }),
  dip: (o = {}) => tone({ f: 520 + (o.step || 0) * 110, f2: 700 + (o.step || 0) * 130, t: 0.12, type: 'triangle', vol: 0.14 }),
  fizz: () => { tone({ f: 1200, t: 0.35, noise: true, vol: 0.18 }); tone({ f: 260, f2: 120, t: 0.3, type: 'sine', vol: 0.12 }); },
  clunk: () => { tone({ f: 180, f2: 90, t: 0.12, type: 'square', vol: 0.08 }); tone({ f: 988, t: 0.08, type: 'triangle', vol: 0.1, delay: 0.05 }); },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: 0.22, type: 'triangle', vol: 0.14, delay: i * 0.11 })),
};

export const sfx = {
  play(name, opt) { try { BANK[name]?.(opt); } catch { /* audio is best-effort */ } },
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('thenurts_muted', muted ? '1' : '0'); } catch {} ; if (!muted) BANK.click(); return muted; },
  unlock() { ac(); },
};
