"""Exports tests/fixtures/autonomy-parity.json from autonomy-reference.py (the JS finales + the scoring layer's autonomy read must
match it exactly). Run: python3 tests/autonomy-fixture.py"""
import json, random, statistics, itertools, importlib.util, os
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ar", os.path.join(here, "autonomy-reference.py")); R = importlib.util.module_from_spec(spec); spec.loader.exec_module(R)

def fx_detail(m, log, tau):  # read() with its intermediate values (same code)
    dec = [e for e in log if e["choice"] is not None and len(e["options"]) > 1]
    fits = {}
    if dec:
        for ws in itertools.product([0, 0.5, 1, 2], repeat=3):
            if not any(ws): continue
            w = dict(zip(R.AIMS_FX, ws)); fits[ws] = statistics.mean(1.0 if e["choice"] == max(e["options"], key=lambda k: sum(e["options"][k][a] * w[a] for a in R.AIMS_FX)) else 0.0 for e in dec)
        fits["balancer"] = statistics.mean(1.0 if e["choice"] == e["balancerBest"] else 0.0 for e in dec)
    coh = max(fits.values()) if fits else 0; tipB = statistics.mean(1.0 if e["tipBefore"] else 0.0 for e in log) if log else 0
    return dict(coherence=coh, tipBefore=tipB, balance=min(m.values()), outcome=statistics.mean(m.values()))

mk, fx = [], []
MK = [("executor-high", lambda: R.executor(1.0)), ("executor-low", lambda: R.executor(0.0)), ("objective-owner", lambda: R.objective_owner(0.15)),
      ("purpose-setter", lambda: R.purpose_setter(0.15)), ("focused-setter", lambda: R.focused_setter(0.15)), ("flailer", R.flailer)]
FX = [("executor-high", lambda: R.P_exec(1.0)), ("executor-low", lambda: R.P_exec(0.0)), ("objective-owner", R.P_kids), ("purpose-setter", R.P_bal), ("flailer", R.P_rand)]
for name, mkp in MK:
    for s in range(40):
        st, log = R.play(mkp(), random.Random(s)); lvl, r = R.mamak_level(st, log)
        mk.append(dict(persona=name, seed=s, log=[[e["t"], e.get("choice"), bool(e.get("tipBefore"))] for e in log], level=lvl,
                       coherence=r["coherence"], balance=r["balance"], outcome=r["outcome"], tipBefore=r["tipBefore"], measures=R.measures(st)))
for name, fxp in FX:
    for s in range(40):
        m, log = R.play_fx(fxp(), random.Random(1000 + s)); lvl = R.read(m, log, R.TAU_FX); d = fx_detail(m, log, R.TAU_FX)
        fx.append(dict(persona=name, seed=s, log=[[None if e["choice"] is None else [e["choice"][0], R.PROBLEMS[e["choice"][0]][1].index(e["choice"][1])], bool(e["tipBefore"])] for e in log],
                       level=lvl, measures=m, **d))
combos = [dict(a=a, b=b, **R.combine(a, b)) for a in (1, 2, 3) for b in (1, 2, 3)]
out = dict(source="tests/autonomy-reference.py v1", tauMamak=R.TAU_MK, tauFixIt=R.TAU_FX, bestFx=R.BEST_FX, mamak=mk, fixIt=fx, combine=combos)
json.dump(out, open(os.path.join(here, "fixtures", "autonomy-parity.json"), "w"), indent=0)
print("mamak", len(mk), "fixIt", len(fx), "levels", {l: sum(1 for x in mk if x["level"] == l) for l in (1, 2, 3)}, {l: sum(1 for x in fx if x["level"] == l) for l in (1, 2, 3)})
