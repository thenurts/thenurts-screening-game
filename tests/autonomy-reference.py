"""Autonomy reference v1 (SUITE): the two open-brief finales + the level read. Run: python3 autonomy-reference.py → SELF-TEST PASS.
Part A: The Nurts Mamak "Closing Time" (12 actions). Part B: Mia's Fix-It Kit "Free Fix" (6 tries).
The level read uses behaviour, not skill: guidance dependence (a tip before trying), coherence of self-chosen priorities (any consistent strategy:
fixed weightings, balancing the weakest aim, or focus-plus-floor), balance across the aims (each scaled to the best achievable, from exhaustive
search), and an outcome floor. Per-game L3 balance bar: tau = b_obvious + 0.25 x (b_best - b_obvious)."""
import itertools, statistics, random, copy
# ======================= Part A: Mamak Closing Time =======================
ORDERS = [  # (id, arrive, steps, stars, due_in, regular). Demand 23 steps vs 12 actions: the four aims genuinely conflict
 ("c1",1,2,1,3,False), ("c2",1,3,2,9,True),  ("c3",1,3,3,7,False), ("c4",3,2,1,3,False), ("c5",4,3,3,6,False),
 ("c6",5,2,1,7,True),  ("c7",7,2,1,3,False), ("c8",9,3,3,5,False), ("c9",10,3,2,5,False),
]
TICKS = 12
BEST = dict(stars=11, walkouts=2, regulars=2, waste=0); WORST = dict(walkouts=7, waste=9)   # from an exhaustive search of all 8,234 possible closes
def measures(st):
    """each aim scaled so 1.0 = the best achievable for that aim (exhaustive search), 0 = the worst"""
    done = [o for o in ORDERS if st["done"].get(o[0])]
    walk = sum(1 for o in ORDERS if st["left"].get(o[0])); waste = sum(1 for o in ORDERS if 0 < st["prog"].get(o[0], 0) < o[2])
    return dict(stars=min(1, sum(o[3] for o in done) / BEST["stars"]),
                happy=max(0, min(1, (WORST["walkouts"] - walk) / (WORST["walkouts"] - BEST["walkouts"]))),
                regulars=sum(1 for o in done if o[5]) / BEST["regulars"],
                noWaste=max(0, min(1, (WORST["waste"] - waste) / (WORST["waste"] - BEST["waste"]))))
def value(o, st, t):  # what each aim gains if we work on this order now (used to read coherence)
    rem = o[2] - st["prog"].get(o[0], 0); slack = (o[1] + o[4]) - t - rem + 1; can_finish = t + rem - 1 <= TICKS
    return dict(stars=(o[3] / rem) if can_finish else 0.0, happy=(1.0 if slack <= 1 else 0.3) if can_finish else 0.0,
                regulars=(1.0 if o[5] else 0.0) if can_finish else 0.0, noWaste=(1.0 if st["prog"].get(o[0], 0) > 0 else 0.2) if can_finish else -1.0)
def balancer_pick(opts, st):
    """the dynamic 'balance the aims' rule: help whichever aim is currently weakest (ties -> stars)"""
    m = measures(st); weak = min(m, key=m.get)
    return max(opts, key=lambda k: (opts[k][weak], opts[k]["stars"]))
ARCH = {"stars": dict(stars=1, happy=0, regulars=0, noWaste=0), "happy": dict(stars=0, happy=1, regulars=0, noWaste=0),
        "regulars": dict(stars=0, happy=0, regulars=1, noWaste=0), "noWaste": dict(stars=0, happy=0, regulars=0, noWaste=1),
        "balanced": dict(stars=1, happy=1, regulars=1, noWaste=1)}
def util(v, w): return sum(v[k] * w[k] for k in w)
def play(policy, rng):
    st = dict(prog={}, done={}, left={}); log = []; tips = []
    for t in range(1, TICKS + 1):
        for o in ORDERS:
            if o[1] + o[4] < t and not st["done"].get(o[0]) and not st["left"].get(o[0]) and o[1] <= t: st["left"][o[0]] = True
        avail = [o for o in ORDERS if o[1] <= t and not st["done"].get(o[0]) and not st["left"].get(o[0])]
        if not avail: log.append(dict(t=t, choice=None)); continue
        choice, tip = policy(t, avail, st, rng)
        vals = {o[0]: value(o, st, t) for o in avail}
        log.append(dict(t=t, options=vals, choice=choice, tipBefore=tip, balancerBest=balancer_pick(vals, st), m=measures(st)))
        if choice:
            st["prog"][choice] = st["prog"].get(choice, 0) + 1
            o = next(o for o in ORDERS if o[0] == choice)
            if st["prog"][choice] >= o[2]: st["done"][choice] = True
    for o in ORDERS:
        if o[1] + o[4] <= TICKS and not st["done"].get(o[0]) and not st["left"].get(o[0]): st["left"][o[0]] = True
    return st, log
def autonomy_read(st, log, first_latency_ratio=1.0):
    m = measures(st); dec = [e for e in log if e.get("choice") and len(set(max(e["options"], key=lambda k: e["options"][k][x]) for x in ARCH["stars"])) > 1]
    fits = {}
    if dec:
        AIMS = ["stars", "happy", "regulars", "noWaste"]
        for ws in itertools.product([0, 0.5, 1, 2], repeat=4):          # any consistent fixed priority
            if not any(ws): continue
            w = dict(zip(AIMS, ws))
            fits[("weights",) + ws] = statistics.mean(1.0 if e["choice"] == max(e["options"], key=lambda k: util(e["options"][k], w)) else 0.0 for e in dec)
        fits[("balancer",)] = statistics.mean(1.0 if e["choice"] == e["balancerBest"] else 0.0 for e in dec)
        for aim in AIMS:                                              # "focus on X, but keep the other aims above a floor"
            for fl in (0.35, 0.5):
                fits[("focus", aim, fl)] = statistics.mean(1.0 if e["choice"] == (e["balancerBest"] if min(e["m"].values()) < fl else
                    max(e["options"], key=lambda k: (e["options"][k][aim], e["options"][k]["stars"]))) else 0.0 for e in dec)
    coherence = max(fits.values()) if fits else 0; focus = max(fits, key=fits.get) if fits else None
    tipBefore = statistics.mean(1.0 if e["tipBefore"] else 0.0 for e in log if e.get("choice")) if log else 0
    balance = min(m.values()); outcome = statistics.mean(m.values())
    freeze = first_latency_ratio >= 3
    if tipBefore >= 0.5 or freeze or coherence < 0.55: level = 1
    elif coherence >= 0.7 and balance >= 0.55 and outcome >= 0.5: level = 3
    else: level = 2
    return dict(level=level, coherence=round(coherence, 2), focus=focus, balance=round(balance, 2), outcome=round(outcome, 2), tipBefore=round(tipBefore, 2), measures=m)
# ---------------- personas ----------------
def best_by(w, noise=0.0):
    def p(t, avail, st, rng):
        vals = {o[0]: util(value(o, st, t), w) + rng.gauss(0, noise) for o in avail}
        return max(vals, key=vals.get), False
    return p
def executor(skill=0.0):  # asks for a tip before (almost) every move, then follows it; skill = how well they follow
    def p(t, avail, st, rng):
        tipw = ARCH[rng.choice(["stars", "happy", "regulars", "noWaste"])]      # each tip serves ONE measure
        vals = {o[0]: util(value(o, st, t), tipw) + rng.gauss(0, 0.3 * (1 - skill)) for o in avail}
        return max(vals, key=vals.get), rng.random() < 0.85
    return p
def objective_owner(noise):  return best_by(ARCH["stars"], noise)            # chases the obvious score (★), ignores the other aims
def purpose_setter(noise):  # balances the aims: works on whichever is weakest right now
    def p(t, avail, st, rng):
        vals = {o[0]: value(o, st, t) for o in avail}
        if rng.random() < noise: return rng.choice(avail)[0], False
        return balancer_pick(vals, st), False
    return p
def focused_setter(noise):  # sets its own sub-goal (regulars first) but keeps the other aims off the floor
    def p(t, avail, st, rng):
        vals = {o[0]: value(o, st, t) for o in avail}; m = measures(st)
        if rng.random() < noise: return rng.choice(avail)[0], False
        if min(m.values()) < 0.5: return balancer_pick(vals, st), False
        return max(vals, key=lambda k: (vals[k]["regulars"], vals[k]["stars"])), False
    return p
def flailer():
    def p(t, avail, st, rng): return rng.choice(avail)[0], rng.random() < 0.2
    return p

TAU_MK = 0.50 + 0.25 * (0.80 - 0.50)       # b_obvious (max stars) 0.50 · b_best 0.80 (exhaustive search)
def mamak_level(st, log):
    r = autonomy_read(st, log)
    if r["tipBefore"] >= 0.5 or r["coherence"] < 0.55: return 1, r
    if r["coherence"] >= 0.7 and r["balance"] >= TAU_MK and r["outcome"] >= 0.5: return 3, r
    return 2, r
# ======================= Part B: Fix-It Free Fix =======================
_FF = {}
PROBLEMS = {  # id: (kids helped, fixes: tuples of objects used up)
 "p1": (3, [("U",), ("R", "H")]),        # shade the waiting bench: the umbrella, or the rope + clips
 "p2": (3, [("R",), ("RB", "C")]),       # mark the long-jump line: the rope, or bands + chopsticks
 "p3": (1, [("S",), ("C",)]),            # the scoreboard keeps tipping: wedge it (spoon or chopsticks)
 "p4": (2, [("W",), ("B",)]),            # the cones keep blowing over: weigh them down (bottle or box)
 "p5": (1, [("RB",), ("H",)]),           # a loose flag: band it or clip it
}
TRIES_FX = 6
def outcome_fx(fixed, used):
    kids = sum(PROBLEMS[p][0] for p in fixed); n = len(fixed); left = 8 - len(used)
    return dict(kids=kids, fixed=n, kitLeft=left)
def all_plays():
    res = []
    def rec(fixed, used, depth):
        res.append((frozenset(fixed), frozenset(used)))
        if depth == TRIES_FX: return
        for p, (k, fx) in PROBLEMS.items():
            if p in fixed: continue
            for f in fx:
                if not (set(f) & used): rec(fixed | {p}, used | set(f), depth + 1)
    rec(set(), set(), 0); return res
PLAYS_FX = all_plays(); OUT_FX = [outcome_fx(f, u) for f, u in PLAYS_FX]
BEST_FX = dict(kids=max(o["kids"] for o in OUT_FX), fixed=max(o["fixed"] for o in OUT_FX), kitLeft=8)
def norm_fx(o): return dict(kids=o["kids"] / BEST_FX["kids"], fixed=o["fixed"] / BEST_FX["fixed"], kitLeft=o["kitLeft"] / 8)

AIMS_FX = ["kids", "fixed", "kitLeft"]
def opt_value(p, f, fixed, used):
    return dict(kids=PROBLEMS[p][0] / 3, fixed=1.0, kitLeft=1.0 - len(f) / 2)
def play_fx(policy, rng):
    fixed, used, log = set(), set(), []
    for t in range(TRIES_FX):
        opts = {(p, f): opt_value(p, f, fixed, used) for p, (k, fx) in PROBLEMS.items() if p not in fixed for f in fx if not (set(f) & used)}
        m = norm_fx(outcome_fx(fixed, used))
        if not opts: break
        choice, tip = policy(opts, m, rng)
        weak = min(m, key=m.get); bal = max(opts, key=lambda k: (opts[k][weak], opts[k]["kids"]))
        log.append(dict(options=opts, choice=choice, tipBefore=tip, balancerBest=bal, m=m))
        if choice is None: break                      # stops early ("keep the kit")
        fixed.add(choice[0]); used |= set(choice[1])
    return norm_fx(outcome_fx(fixed, used)), log
def read(m, log, tau):
    dec = [e for e in log if e["choice"] is not None and len(e["options"]) > 1]
    fits = {}
    if dec:
        for ws in itertools.product([0, 0.5, 1, 2], repeat=3):
            if not any(ws): continue
            w = dict(zip(AIMS_FX, ws)); fits[ws] = statistics.mean(1.0 if e["choice"] == max(e["options"], key=lambda k: sum(e["options"][k][a] * w[a] for a in AIMS_FX)) else 0.0 for e in dec)
        fits["balancer"] = statistics.mean(1.0 if e["choice"] == e["balancerBest"] else 0.0 for e in dec)
    coh = max(fits.values()) if fits else 0; tipB = statistics.mean(1.0 if e["tipBefore"] else 0.0 for e in log) if log else 0
    bal = min(m.values()); out = statistics.mean(m.values())
    if tipB >= 0.5 or coh < 0.55: return 1
    if coh >= 0.7 and bal >= tau and out >= 0.5: return 3
    return 2
def P_exec(rng_skill=0.0):
    def p(opts, m, rng):
        aim = rng.choice(AIMS_FX); return max(opts, key=lambda k: opts[k][aim] + rng.gauss(0, 0.3 * (1 - rng_skill))), rng.random() < 0.85
    return p
def P_kids():
    def p(opts, m, rng): return max(opts, key=lambda k: (opts[k]["kids"], opts[k]["kitLeft"])), False
    return p
def P_bal(noise=0.15):
    def p(opts, m, rng):
        if rng.random() < noise: return rng.choice(list(opts)), False
        if min(m.values()) >= 0.6 * 1 and m["kitLeft"] < 0.75: return None, False       # stop while the kit and the rest are in balance
        weak = min(m, key=m.get); return max(opts, key=lambda k: (opts[k][weak], opts[k]["kids"])), False
    return p
def P_rand():
    def p(opts, m, rng): return rng.choice(list(opts)), rng.random() < 0.2
    return p

TAU_FX = 0.38 + 0.25 * (0.60 - 0.38)       # b_obvious (max kids helped) 0.38 · b_best 0.60 (exhaustive search)
def combine(a, b):
    """both finales → an autonomy read. Agree → that level; differ by 1 → a range 'L2–L3 (mixed)'; differ by 2 → L2 'inconsistent'."""
    if a == b: return dict(level=a, label=f"L{a}")
    if abs(a - b) == 1: return dict(level=min(a, b), label=f"L{min(a, b)}–L{max(a, b)} (mixed)")
    return dict(level=2, label="L2 (inconsistent between games)")
if __name__ == "__main__":
    pairs = [("executor, HIGH skill", lambda: executor(1.0), lambda: P_exec(1.0), 1), ("objective-owner", lambda: objective_owner(0.15), P_kids, 2),
             ("purpose-setter", lambda: purpose_setter(0.15), P_bal, 3), ("flailer", flailer, P_rand, 1)]
    ok = True
    for name, mkp, fxp, want in pairs:
        hits = []
        for s in range(300):
            st, log = play(mkp(), random.Random(s)); a, _ = mamak_level(st, log)
            m, lg = globals()["play_fx"](fxp(), random.Random(1000 + s)); b = read(m, lg, TAU_FX)
            c = combine(a, b); hits.append(c["level"] == want or (want == 3 and c["label"] == "L2–L3 (mixed)"))
        acc = statistics.mean(hits); print(f"{name:22} → correct (a range allowed for L3) {acc:.0%}"); ok &= acc >= 0.85
    print("SELF-TEST:", "PASS" if ok else "FAIL")
