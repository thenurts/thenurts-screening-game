"""Sunny Tap (resilience): reference v1 (RS1 build pack). Run: python3 sunny-tap-reference.py → SELF-TEST PASS.
v1.2: 4 rounds of Fair 20 s + Wipeout 10 s (2:00 of play), each followed by a mini-report (gained / faded / mis-taps + a score line chart; a Continue button). An unscored 10 s warm-up comes first. No retry.
Suns pop up across the sky over a sunny beach: tap them (+10). A sun that fades untapped costs 10. A tap on a cloud or empty sky costs 15.
The score is floored at 0. **Only the three Fair phases are measured** (accuracy + reaction time; score = 25% accuracy shock + 50% speed shock + 25% hold) (the same fixed pace in all three). The Wipeouts exist to create real
pressure: their spawn rate = max(the fixed flood, 2.5 x the player's own Fair-1 hit rate), so fast tappers are overwhelmed too.
The game's JS must reproduce schedule() and score_round() exactly (parity fixture exported from this file)."""
import random, statistics, math
PHASES = [("F1", 0, 20), ("W1", 20, 30), ("F2", 30, 50), ("W2", 50, 60), ("F3", 60, 80), ("W3", 80, 90), ("F4", 90, 110), ("W4", 110, 120)]
# v1.2: 4 rounds of (Fair 20 s + Wipeout 10 s) = 2:00 of play; a MINI-REPORT pause after each round (the game clock stops).
# The fair phase after each report is the recovery window (F2-F4). Times are on the game clock, excluding the report pauses.
POST = [n for n, _, _ in PHASES if n.startswith("F") and n != "F1"]   # the fair phases that follow a wipeout
FAIR = dict(sun_every=0.5, sun_life=1.6, cloud_every=4.0, cloud_life=1.6)
WIPE = dict(min_rate=7.0, adapt=4.5, sun_life=0.6, cloud_share=0.25)   # v1.2: tuned so every skill level nets ~0 or less per round (tapping-ceiling model)
PTS = dict(hit=10, fade=-10, miss=-15)   # v1.2: a missed sun costs as much as a caught one (was -3), so sitting out a wipeout never protects points
EARLY = 8.0   # seconds: the "shock" window at the start of Fair 2 and Fair 3
def schedule(seed=2026, f1_hit_rate=None):
    """Fair phases: a fixed, seeded schedule (identical for everyone). Wipeouts: rate = max(min_rate, adapt * f1_hit_rate) targets/s."""
    ev = []
    for i, (name, a, b) in enumerate(PHASES):
        rng = random.Random(seed * 10 + i)          # an independent stream per phase, so the Fair phases never depend on the wipeout speed
        if name.startswith("F"):
            t = a + 0.3
            while t < b - 0.2:
                ev.append(dict(t=round(t, 2), kind="sun", life=FAIR["sun_life"], x=round(rng.uniform(0.1, 0.9), 3), y=round(rng.uniform(0.2, 0.75), 3), phase=name)); t += FAIR["sun_every"]
            t = a + 1.7
            while t < b - 0.5:
                ev.append(dict(t=round(t, 2), kind="cloud", life=FAIR["cloud_life"], x=round(rng.uniform(0.1, 0.9), 3), y=round(rng.uniform(0.2, 0.75), 3), phase=name)); t += FAIR["cloud_every"]
        else:
            rate = max(WIPE["min_rate"], WIPE["adapt"] * (f1_hit_rate or 0)); t = a + 0.1
            while t < b:
                kind = "cloud" if rng.random() < WIPE["cloud_share"] else "sun"
                ev.append(dict(t=round(t, 2), kind=kind, life=WIPE["sun_life"], x=round(rng.uniform(0.08, 0.92), 3), y=round(rng.uniform(0.18, 0.78), 3), phase=name)); t += 1 / rate
    return sorted(ev, key=lambda e: e["t"])
def phase_of(t):
    for n, a, b in PHASES:
        if a <= t < b: return n
    return None
def round_report(taps, fades, n):
    """the mini-report after round n (1-4): points gained, lost to fades, lost to mis-taps, and the score line (for the chart)."""
    a, b = (n - 1) * 30, n * 30
    g = sum(PTS["hit"] for tp in taps if tp[1] == "hit" and a <= tp[0] < b); m = sum(PTS["miss"] for tp in taps if tp[1] == "miss" and a <= tp[0] < b)
    f = sum(PTS["fade"] for t in fades if a <= t < b)
    return dict(round=n, gained=g, lostFaded=f, lostMisTaps=m, net=g + f + m)
def score_round(taps, fades, sched, quit_at=None):
    """taps: [(t, 'hit', spawn_t) | (t, 'miss', None)], fades: [t]; sched: the schedule that was played.
    Display score = points (feel). MEASURES use the Fair phases only: accuracy (hits / suns shown) and reaction time (tap - spawn)."""
    total = 0
    for t, k in sorted([(tp[0], tp[1]) for tp in taps] + [(t, "fade") for t in fades]):
        if quit_at is not None and t > quit_at: continue
        if phase_of(t): total = max(0, total + PTS[k])
    start = dict((n, a) for n, a, _ in PHASES)
    def window(n, part):
        a = start[n]; lo, hi = (a, a + EARLY) if part == "early" else ((a + EARLY, a + 20) if part == "late" else (a, a + 20))
        if quit_at is not None: hi = min(hi, quit_at)
        suns = sum(1 for e in sched if e["kind"] == "sun" and lo <= e["t"] < hi)
        hits = sum(1 for tp in taps if tp[1] == "hit" and lo <= tp[2] < hi); miss = sum(1 for tp in taps if tp[1] == "miss" and lo <= tp[0] < hi)
        return suns, hits, miss
    def rts(n, part):
        a = start[n]; lo, hi = (a, a + EARLY) if part == "early" else (a + EARLY, a + 20)
        return [tp[0] - tp[2] for tp in taps if tp[1] == "hit" and lo <= tp[2] < hi and (quit_at is None or tp[0] <= quit_at)]
    def acc(n, part="all"):
        su, h, _ = window(n, part); return h / su if su else None
    a1 = acc("F1"); ap = [acc(n) for n in POST]
    hold = min(1.5, (sum(ap) / len(ap)) / a1) if a1 and None not in ap else None
    sh = [acc(n, "early") / acc(n, "late") for n in POST if acc(n, "late") and acc(n, "early") is not None]
    shock = min(1.5, sum(sh) / len(sh)) if len(sh) == len(POST) else None
    rr = [statistics.median(rts(n, "late")) / statistics.median(rts(n, "early")) for n in POST if rts(n, "early") and rts(n, "late")]
    rtShock = min(1.5, sum(rr) / len(rr)) if len(rr) == len(POST) else None      # < 1 = slower (hesitant) straight after a wipeout
    def err(n):
        _, h, m = window(n, "all"); return m / (h + m) if h + m else 0
    errCarry = max(0.0, sum(err(n) for n in POST) / len(POST) - err("F1"))
    m = dict(displayScore=total, accuracy=dict(F1=a1, **{n: acc(n) for n in POST}), hold=hold, accuracyShock=shock, speedShock=rtShock, errorCarryover=round(errCarry, 3), quit=quit_at is not None)
    m["panicCarry"] = errCarry >= 0.15            # flag only: mis-taps rise after the wipeouts (logged, not scored: too rare to score reliably)
    m["resilienceScore"] = None if None in (hold, shock, rtShock) else round(100 * (0.25 * min(1, shock) + 0.50 * min(1, rtShock) + 0.25 * min(1, hold)), 1)
    return m
# ---------------- a simple simulated player, for tests ----------------
def simulate(skill=0.0, composure=0.0, seed=0, quit_at=None):
    rng = random.Random(seed); taps = []; fades = []
    sched = schedule(seed=2026, f1_hit_rate=1.4 * (1 + 0.25 * skill)); start = dict((n, a) for n, a, _ in PHASES)
    for e in sched:
        n = e["phase"]; a = start[n]
        dip = max(0, 0.22 - 0.10 * composure) if n in POST and e["t"] - a < EARLY else 0
        if e["kind"] == "sun":
            acc = (0.35 + 0.1 * skill) if n.startswith("W") else (0.80 + 0.08 * skill) * (1 - dip)
            rt = max(0.25, rng.gauss(0.60 - 0.06 * skill, 0.10) * (1 + 1.2 * dip))
            if rng.random() < acc and rt < e["life"]: taps.append((e["t"] + rt, "hit", e["t"]))
            else: fades.append(e["t"] + e["life"])
        elif rng.random() < (0.05 if n.startswith("F") else 0.25) * (1.3 - 0.3 * composure): taps.append((e["t"] + 0.3, "miss", None))
    return score_round(taps, fades, sched, quit_at)
if __name__ == "__main__":
    import numpy as np
    s1 = schedule(f1_hit_rate=1.0); s2 = schedule(f1_hit_rate=3.0)
    same_fair = [e for e in s1 if e["phase"].startswith("F")] == [e for e in s2 if e["phase"].startswith("F")]
    w1 = sum(1 for e in s1 if e["phase"] == "W1"); w2 = sum(1 for e in s2 if e["phase"] == "W1")
    print(f"fair phases identical for every player: {same_fair} · wipeout targets: slow player {w1}, fast player {w2} (scaled up)")
    rng = np.random.default_rng(1); N = 1500; comp = rng.normal(0, 1, N); sk = rng.normal(0, 1, N)
    A = [simulate(sk[i], comp[i], seed=2 * i)["resilienceScore"] for i in range(N)]; B = [simulate(sk[i], comp[i], seed=2 * i + 1)["resilienceScore"] for i in range(N)]
    r = np.corrcoef(A, B)[0, 1]; rc = np.corrcoef(A, comp)[0, 1]; rs = np.corrcoef(A, sk)[0, 1]
    print(f"simulated: retest r={r:.2f} · tracks composure r={rc:.2f} · tracks skill r={rs:+.2f}")
    q = simulate(0, 0, quit_at=75); print("quit at 1:15 ->", q["resilienceScore"], "(not enough evidence), quit flag", q["quit"])
    ok = same_fair and w2 > w1 and r > 0.6 and rc > 0.75 and abs(rs) < 0.15 and q["resilienceScore"] is None
    print("SELF-TEST:", "PASS" if ok else "FAIL")
