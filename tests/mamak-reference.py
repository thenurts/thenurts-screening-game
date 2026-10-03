"""The Nurts Mamak: reference simulator (O1 build pack v1.2; reference v1.3: BEST_STARS 28).
Player-facing time: tick n = 7:(n-1) pm on the mamak wall clock (1 action = 1 minute; shift 7:00-7:36). Never show "tick" to players. Run: python3 mamak-reference.py → PASS.
The game's JS must match act(), metrics() and org_score() exactly (parity fixture exported from this file). Tick-based: the clock moves ONE tick per station tap.
Selecting an order is free. Nothing moves while the player thinks, so speed never matters."""
import random, statistics, copy
STATIONS = ["urn", "griddle", "rice", "counter"]
MENU = {  # item: (label, stars, steps as stations)
 "teh":      ("Teh tarik",   1, ["urn", "urn"]),                 # brew, pull
 "kopi":     ("Kopi ais",    1, ["urn", "counter"]),             # brew, add ice
 "roti":     ("Roti canai",  2, ["griddle", "griddle", "counter"]),   # flip, cook, plate with dhal
 "mee":      ("Mee goreng",  2, ["griddle", "counter"]),         # fry, plate
 "nasi":     ("Nasi lemak",  3, ["rice", "rice", "counter"]),     # scoop, add sambal and egg, wrap
 "murtabak": ("Murtabak",    3, ["griddle", "griddle", "counter"]),   # fill, fry, cut
}
TICKS = 36
# fixed stream, the same for everyone: (arrive_tick, id, item, due_in_ticks, customer)
STREAM = [   # 4 rushes. Rushes 1 and 3: cheap drinks first, then a tight *3 dish (punishes first-come).
             # Rushes 2 and 4: the *3 dish first, then urgent cheap drinks (punishes jumping to the newest / half-done work).
 (1,"o1","teh",5,"mia"), (2,"o2","roti",7,"noah"),
 (6,"o3","kopi",8,"zoey"), (6,"o4","teh",8,"raj"), (7,"o5","nasi",5,"amira"),
 (10,"o6","mee",6,"mia"),
 (13,"o7","murtabak",6,"noah"), (14,"o8","teh",3,"zoey"), (14,"o9","kopi",4,"raj"),
 (16,"o10","roti",8,"mia"),
 (21,"o11","kopi",8,"amira"), (21,"o12","teh",8,"noah"), (22,"o13","nasi",5,"zoey"),
 (25,"o14","mee",6,"raj"),
 (28,"o15","nasi",6,"mia"), (29,"o16","kopi",3,"amira"), (29,"o17","teh",4,"noah"),
 (31,"o18","roti",5,"zoey"),
]
STREAM_B = [  # Form B (restarts / later runs): Form A's rush logic, dishes swapped within types, due times nudged (searched for the widest margin)
 (1, 'o1', 'kopi', 5, 'zoey'),
 (2, 'o2', 'roti', 8, 'amira'),
 (6, 'o3', 'teh', 7, 'raj'),
 (6, 'o4', 'kopi', 8, 'noah'),
 (7, 'o5', 'nasi', 6, 'amira'),
 (10, 'o6', 'mee', 7, 'raj'),
 (13, 'o7', 'murtabak', 6, 'noah'),
 (14, 'o8', 'teh', 4, 'mia'),
 (14, 'o9', 'kopi', 3, 'noah'),
 (16, 'o10', 'roti', 7, 'zoey'),
 (21, 'o11', 'kopi', 8, 'raj'),
 (21, 'o12', 'teh', 9, 'raj'),
 (22, 'o13', 'murtabak', 6, 'noah'),
 (25, 'o14', 'mee', 5, 'mia'),
 (28, 'o15', 'murtabak', 6, 'zoey'),
 (29, 'o16', 'kopi', 4, 'zoey'),
 (29, 'o17', 'kopi', 5, 'amira'),
 (31, 'o18', 'roti', 6, 'amira'),
]
PARKED = dict(id="tapau", item="roti", announce=10, arrive=21, waits=3, customer="amira")   # "Back at 7:20 for my tapau!" (tick 21 = 7:20). She collects it automatically; waits until 7:23
SETBACK = dict(tick=18, station="griddle", ticks=3, notice_from=13)   # announced from 7:12: "Gas runs out 7:17-7:19, griddle off" (no surprise, so no luck)
def new_state():
    return dict(tick=1, orders={}, done=[], expired=[], started=set(), errors=[], log=[],
                tapau=dict(steps=0, handed=None), pins=0)
def active(st): return [o for o in st["orders"].values() if o["status"] == "open"]
def arrive(st):
    for (t, oid, item, due, cust) in STREAM:
        if t == st["tick"]: st["orders"][oid] = dict(id=oid, item=item, due=t + due, step=0, status="open", cust=cust, stars=MENU[item][1])
def expire(st):
    for o in active(st):
        if st["tick"] > o["due"]: o["status"] = "expired"; st["expired"].append(o["id"])
def blocked(st, station): return station == SETBACK["station"] and SETBACK["tick"] <= st["tick"] < SETBACK["tick"] + SETBACK["ticks"]
def act(st, target, station):
    """target: an order id, 'tapau' (cook a step of the parked order), or None (wait 1 minute).
    station: the station tapped. One call = one tick."""
    load = len(active(st))
    ok = False
    if target == "tapau":
        need = MENU["roti"][2][st["tapau"]["steps"]] if st["tapau"]["steps"] < 3 else None
        if need and station == need and not blocked(st, station) and st["tick"] >= PARKED["announce"]: st["tapau"]["steps"] += 1; ok = True
        elif need and station != need: st["errors"].append((st["tick"], load))
    elif target in st["orders"] and st["orders"][target]["status"] == "open":
        o = st["orders"][target]; need = MENU[o["item"]][2][o["step"]]
        if station == need and not blocked(st, station):
            o["step"] += 1; st["started"].add(o["id"]); ok = True
            if o["step"] == len(MENU[o["item"]][2]): o["status"] = "done"; st["done"].append(o["id"])
        elif station != need: st["errors"].append((st["tick"], load))
    st["log"].append((st["tick"], target, station, ok, load))
    st["tick"] += 1; expire(st); arrive(st); collect(st)
def collect(st):
    """Amira collects her tapau automatically: at 7:20 if it's ready, or the moment it's finished while she waits (to 7:23)."""
    t = st["tapau"]
    if t["handed"] is None and t["steps"] >= 3 and PARKED["arrive"] <= st["tick"] <= PARKED["arrive"] + PARKED["waits"]:
        t["handed"] = st["tick"]
def metrics(st):
    val = sum(st["orders"][o]["stars"] for o in st["done"]) + (MENU["roti"][1] if st["tapau"]["handed"] else 0)
    best = BEST_STARS["A" if STREAM is STREAM_A else "B"]
    threes = [o for o in st["orders"].values() if o["stars"] == 3]
    exp_hi = sum(1 for o in threes if o["status"] == "expired") / max(1, len(threes))
    started = [o for o in st["orders"].values() if o["id"] in st["started"]]
    half = sum(1 for o in started if o["status"] != "done") / max(1, len(started))
    h = st["tapau"]["handed"]
    parked = 1.0 if h == PARKED["arrive"] else 0.5 if h else 0.0          # ready when she arrived / finished while she waited / she left
    hi = [e for e in st["log"] if e[4] >= 3]; err_hi = sum(1 for e in st["errors"] if e[1] >= 3) / max(1, len(hi))
    return dict(starsServed=val, bestPossible=best, valueShare=round(min(1.0, val / best), 3), expiredHigh=round(exp_hi, 3), halfDone=round(half, 3), parkedReturn=parked, errorsUnderLoad=round(err_hi, 3))
W = dict(valueDone=0.30, expiredHigh=0.20, halfDone=0.20, parkedReturn=0.15, errorsUnderLoad=0.15)
def org_score(m):
    return round(100 * (W["valueDone"] * m["valueShare"] + W["expiredHigh"] * (1 - m["expiredHigh"]) +
                        W["halfDone"] * (1 - m["halfDone"]) + W["parkedReturn"] * m["parkedReturn"] + W["errorsUnderLoad"] * (1 - min(1, m["errorsUnderLoad"] * 4))), 1)
BEST_STARS = {"A": 28, "B": 28}   # o1.bestStars v1.3 (2026-10-02): the TRUE maximum per form, from an exact search (dead-order + bound pruning); was 27 (beam search). Alpha: a 28-star run was seen. Demand is 33 stars / 46 steps vs 36 minutes
def run(policy, seed=0, slip=0.0):
    st = new_state(); arrive(st); rng = random.Random(seed)
    while st["tick"] <= TICKS:
        tgt, sta = policy(st, rng)
        if tgt and sta and rng.random() < slip * (1 + len(active(st)) / 3):   # careless slips grow with load
            sta = rng.choice([s for s in STATIONS if s != sta])
        act(st, tgt, sta)
    return st
def next_station(st, oid):
    if oid == "tapau": return MENU["roti"][2][st["tapau"]["steps"]] if st["tapau"]["steps"] < 3 else None
    o = st["orders"][oid]; return MENU[o["item"]][2][o["step"]]
# ---------------- policies ----------------
def careful(st, rng):
    t = st["tick"]
    cands = [o for o in active(st) if not blocked(st, next_station(st, o["id"]))]
    tap_left = 3 - st["tapau"]["steps"]
    if t >= PARKED["announce"] and tap_left and PARKED["arrive"] - t <= tap_left + 2 and not blocked(st, next_station(st, "tapau")):
        return "tapau", next_station(st, "tapau")
    def feasible(o): return o["due"] - t + 1 >= len(MENU[o["item"]][2]) - o["step"]
    cands = [o for o in cands if feasible(o)]
    if not cands:
        if tap_left and t >= PARKED["announce"] and not blocked(st, next_station(st, "tapau")): return "tapau", next_station(st, "tapau")
        return None, None
    def key(o):
        left = len(MENU[o["item"]][2]) - o["step"]
        return (-(o["step"] > 0), -o["stars"] / left, o["due"])    # finish what's started, then value per step, then deadline
    o = min(cands, key=key); return o["id"], next_station(st, o["id"])
def fifo(st, rng):
    c = [o for o in active(st) if not blocked(st, next_station(st, o["id"]))]
    if not c: return None, None
    o = min(c, key=lambda o: int(o["id"][1:])); return o["id"], next_station(st, o["id"])
def starter(st, rng):   # always jumps to the newest order
    c = [o for o in active(st) if not blocked(st, next_station(st, o["id"]))]
    if not c: return None, None
    o = max(c, key=lambda o: int(o["id"][1:])); return o["id"], next_station(st, o["id"])
def forgetful(st, rng):  # careful with orders, but never comes back for the tapau
    saved = st["tapau"]; st["tapau"] = dict(steps=99, handed=0)
    try: tgt, sta = careful(st, rng)
    finally: st["tapau"] = saved
    return (tgt, sta) if tgt != "tapau" else (None, None)
def randomp(st, rng):
    c = active(st) + ([dict(id="tapau")] if st["tick"] >= PARKED["announce"] else [])
    if not c or rng.random() < 0.1: return None, None
    o = rng.choice(c)
    if o["id"] == "tapau":
        if st["tapau"]["steps"] >= 3: return None, None
        return "tapau", rng.choice(STATIONS)
    return o["id"], rng.choice(STATIONS) if rng.random() < 0.3 else next_station(st, o["id"])
def best_plan(beam=400):
    """Beam search over whole-shift plans: finds the best-known stars per form (sets BEST_STARS)."""
    st = new_state(); arrive(st); frontier = [st]
    while frontier[0]["tick"] <= TICKS:
        nxt = []
        for s0 in frontier:
            opts = [(None, None)] + [(o["id"], next_station(s0, o["id"])) for o in active(s0)]
            if s0["tick"] >= PARKED["announce"] and s0["tapau"]["steps"] < 3: opts.append(("tapau", next_station(s0, "tapau")))
            for tg, sta in opts:
                s1 = copy.deepcopy(s0); act(s1, tg, sta); nxt.append(s1)
        def h(x):
            m = metrics(x); return m["valueDone"] + 0.02 * sum(o["step"] * o["stars"] for o in active(x)) + 0.05 * m["parkedReturn"]
        nxt.sort(key=h, reverse=True); frontier = nxt[:beam]
    return max(frontier, key=lambda x: metrics(x)["valueDone"])
def use_form(f):
    global STREAM
    STREAM = STREAM_A if f == "A" else STREAM_B
STREAM_A = STREAM
if __name__ == "__main__":
    import sys
    ok = True
    for f in ("A", "B"):
        use_form(f); print(f"===== FORM {f} =====")
        res = {}
        for n, p in [("careful", careful), ("fifo", fifo), ("starter", starter), ("forgetful", forgetful)]:
            m = metrics(run(p)); res[n] = org_score(m); print(f"{n:10}", m, "org", res[n])
        m = metrics(run(careful, 1, slip=0.15)); res["slips"] = org_score(m); print("slips     ", m, "org", res["slips"])
        R = statistics.mean(org_score(metrics(run(randomp, s))) for s in range(200)); print("random mean org", round(R, 1))
        ok &= res["careful"] >= 90 and all(res["careful"] - res[k] >= 10 for k in ("fifo", "starter", "forgetful", "slips")) and R < 40
    print("PASS" if ok else "FAIL"); sys.exit(0)
