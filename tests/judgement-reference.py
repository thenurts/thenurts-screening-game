"""Zoey's Big Calls: reference v1.1 (after the inversion pass). Run: python3 judgement-reference.py → STRESS PASS + SELF-TEST PASS.
The game's JS must match voi(), run() and metrics() exactly (parity fixture exported from this file).
ONE currency (points). Each call is worth 10 / 20 / 30. ONE Check button reveals the next clue and shows its strength first
("Check · strong clue · -2"). A check costs 2 points, or 6 on urgent calls. There is no cross-call budget. A face-up first clue
replaces the "hunch". A live tally adds up the arrows. Judgement tested: when is the next check worth its cost?"""
import math, random, statistics
W1 = math.log(0.62 / 0.38)
def post(a): return 1 / (1 + math.exp(-W1 * a))
COST = {False: 2, True: 6}; MARGIN = 0.5          # points; checks within +-0.5 of break-even are neutral
def voi(worth, net, s, urgent):
    """Value of the next check (its strength s is SHOWN on the button) minus its cost, in points."""
    acc = post(s); pL = post(net); pd = pL * acc + (1 - pL) * (1 - acc)
    after = pd * max(post(net + s), 1 - post(net + s)) + (1 - pd) * max(post(net - s), 1 - post(net - s))
    return worth * (after - max(post(net), 1 - post(net))) - COST[urgent]
CALLS = {'A01': {'situation': 'Relay race today: field or hall?', 'L': 'Field', 'R': 'Hall', 'worth': 20, 'urgent': False, 'first': 1, 'clues': [('Mia heard', 1, -1), ('Teacher', 1, 1), ('Last year', 2, -1)], 'truth': 1, 'default': 1}, 'A02': {'situation': 'Class party: 20 or 30 pizzas?', 'L': '20 pizzas', 'R': '30 pizzas', 'worth': 10, 'urgent': False, 'first': 1, 'clues': [('Teacher', 1, 1), ('Weather app', 2, 1), ('Janitor', 1, 1)], 'truth': 1, 'default': 1}, 'A03': {'situation': 'Tour bus: North or South gate?', 'L': 'North', 'R': 'South', 'worth': 10, 'urgent': True, 'first': -1, 'clues': [('Mia heard', 2, -1), ('Office note', 1, 1), ('Raj thinks', 1, -1)], 'truth': -1, 'default': 1}, 'A04': {'situation': 'Bake sale: cupcakes or cookies first?', 'L': 'Cupcakes', 'R': 'Cookies', 'worth': 30, 'urgent': True, 'first': -1, 'clues': [('Class chat', 1, 1), ('Office note', 1, -1), ('Sign-up sheet', 1, -1)], 'truth': 1, 'default': 1}, 'A05': {'situation': 'Posters: print 50 or 100?', 'L': '50', 'R': '100', 'worth': 10, 'urgent': False, 'first': 1, 'clues': [('Weather app', 1, 1), ('Teacher', 1, -1), ('Poll', 1, -1)], 'truth': 1, 'default': -1}, 'A06': {'situation': 'Lost hall key: classroom or gym?', 'L': 'Classroom', 'R': 'Gym', 'worth': 30, 'urgent': False, 'first': 0, 'clues': [('Teacher', 1, 1), ('Raj thinks', 2, 1), ('Weather app', 1, 1)], 'truth': 1, 'default': 1}, 'A07': {'situation': 'Movie night: start at 7 or 8?', 'L': '7 pm', 'R': '8 pm', 'worth': 30, 'urgent': False, 'first': 0, 'clues': [('Last year', 1, -1), ('Survey', 1, -1), ('Survey', 1, -1)], 'truth': -1, 'default': 1}, 'A08': {'situation': 'Prize stall: books or games?', 'L': 'Books', 'R': 'Games', 'worth': 30, 'urgent': True, 'first': 0, 'clues': [('Raj thinks', 1, 1), ('Class chat', 1, 1), ('Raj thinks', 1, -1)], 'truth': -1, 'default': -1}, 'A09': {'situation': 'Photo day: morning or afternoon?', 'L': 'Morning', 'R': 'Afternoon', 'worth': 30, 'urgent': False, 'first': -1, 'clues': [('Mia heard', 1, -1), ('Class chat', 1, -1), ('Noah saw', 1, -1)], 'truth': -1, 'default': 1}, 'A10': {'situation': 'Talent show opener: choir or band?', 'L': 'Choir', 'R': 'Band', 'worth': 30, 'urgent': False, 'first': -1, 'clues': [('Weather app', 2, -1), ('Weather app', 1, -1), ('Sign-up sheet', 1, -1)], 'truth': -1, 'default': -1}, 'B01': {'situation': 'Craft corner: paint or clay?', 'L': 'Paint', 'R': 'Clay', 'worth': 30, 'urgent': True, 'first': 1, 'clues': [('Class chat', 1, -1), ('Office note', 1, 1), ('Sign-up sheet', 1, 1)], 'truth': -1, 'default': -1}, 'B02': {'situation': 'Class trip: museum or zoo?', 'L': 'Museum', 'R': 'Zoo', 'worth': 30, 'urgent': True, 'first': 0, 'clues': [('Raj thinks', 1, -1), ('Class chat', 1, -1), ('Raj thinks', 1, 1)], 'truth': 1, 'default': 1}, 'B03': {'situation': 'Club snacks: buns or fruit?', 'L': 'Buns', 'R': 'Fruit', 'worth': 10, 'urgent': False, 'first': -1, 'clues': [('Teacher', 1, -1), ('Weather app', 2, -1), ('Janitor', 1, -1)], 'truth': -1, 'default': -1}, 'B04': {'situation': 'Fun fair ride: swings or slide first?', 'L': 'Swings', 'R': 'Slide', 'worth': 30, 'urgent': False, 'first': 1, 'clues': [('Weather app', 2, 1), ('Weather app', 1, 1), ('Sign-up sheet', 1, 1)], 'truth': 1, 'default': 1}, 'B05': {'situation': 'Missing ball: store room or field?', 'L': 'Store room', 'R': 'Field', 'worth': 30, 'urgent': False, 'first': 0, 'clues': [('Teacher', 1, -1), ('Raj thinks', 2, -1), ('Weather app', 1, -1)], 'truth': -1, 'default': -1}, 'B06': {'situation': 'Sports day photo: field or steps?', 'L': 'Field', 'R': 'Steps', 'worth': 20, 'urgent': False, 'first': -1, 'clues': [('Mia heard', 1, 1), ('Teacher', 1, -1), ('Last year', 2, 1)], 'truth': -1, 'default': -1}, 'B07': {'situation': 'Choir practice: Monday or Tuesday?', 'L': 'Monday', 'R': 'Tuesday', 'worth': 30, 'urgent': False, 'first': 1, 'clues': [('Mia heard', 1, 1), ('Class chat', 1, 1), ('Noah saw', 1, 1)], 'truth': 1, 'default': -1}, 'B08': {'situation': 'Pick-up point: main or side door?', 'L': 'Main door', 'R': 'Side door', 'worth': 10, 'urgent': True, 'first': 1, 'clues': [('Mia heard', 2, 1), ('Office note', 1, -1), ('Raj thinks', 1, 1)], 'truth': 1, 'default': -1}, 'B09': {'situation': 'Quiz night: 12 or 16 teams?', 'L': '12 teams', 'R': '16 teams', 'worth': 30, 'urgent': False, 'first': 0, 'clues': [('Last year', 1, 1), ('Survey', 1, 1), ('Survey', 1, 1)], 'truth': 1, 'default': -1}, 'B10': {'situation': 'Flyers: hand out or pin up?', 'L': 'Hand out', 'R': 'Pin up', 'worth': 10, 'urgent': False, 'first': -1, 'clues': [('Weather app', 1, -1), ('Teacher', 1, 1), ('Poll', 1, 1)], 'truth': -1, 'default': 1}}
def run(policy, form="A", seed=0):
    rng = random.Random(seed); log = []
    for cid in [c for c in CALLS if c.startswith(form)]:
        c = CALLS[cid]; net = c["first"]; nxt = 0; checks = []
        while True:
            s = c["clues"][nxt][1] if nxt < 3 else None
            act = policy(dict(worth=c["worth"], urgent=c["urgent"], net=net, nextStrength=s, left=3 - nxt), rng)
            if act[0] == "check" and nxt < 3:
                v = voi(c["worth"], net, s, c["urgent"]); checks.append(True if v > MARGIN else False if v < -MARGIN else None)
                net += s * c["clues"][nxt][2]; nxt += 1; continue
            choice = act[1]; break
        best = 0 if net == 0 else (1 if net > 0 else -1)
        missed = nxt < 3 and voi(c["worth"], net, c["clues"][nxt][1], c["urgent"]) > MARGIN
        log.append(dict(worth=c["worth"], correctExAnte=(best == 0 or choice == best), checks=checks, missed=missed))
    return log
def metrics(log, wD=0.5):
    tw = sum(e["worth"] for e in log); acc = sum(e["worth"] for e in log if e["correctExAnte"]) / tw
    g = sum(c is True for e in log for c in e["checks"]); b = sum(c is False for e in log for c in e["checks"]); m = sum(e["missed"] for e in log)
    info = g / (g + b + m) if g + b + m else 1.0
    return dict(decisionAccuracy=round(acc, 3), infoValue=round(info, 3), good=g, wasted=b, missed=m, judgementScore=round(100 * (wD * acc + (1 - wD) * info), 1))
def side(s): return +1 if s["net"] > 0 else -1 if s["net"] < 0 else +1
def ok(s): return s["left"] > 0
def wise(s, r):         return ("check",) if ok(s) and voi(s["worth"], s["net"], s["nextStrength"], s["urgent"]) > MARGIN else ("decide", side(s))
def impulsive(s, r):    return ("decide", side(s))
def paralysed(s, r):    return ("check",) if ok(s) else ("decide", side(s))
def every_once(s, r):   return ("check",) if s["left"] == 3 else ("decide", side(s))
def big_once(s, r):     return ("check",) if s["worth"] == 30 and s["left"] == 3 else ("decide", side(s))
def big_full(s, r):     return ("check",) if s["worth"] == 30 and ok(s) else ("decide", side(s))
def if_tied(s, r):      return ("check",) if s["net"] == 0 and ok(s) else ("decide", side(s))
def big_tied(s, r):     return ("check",) if s["net"] == 0 and s["worth"] >= 20 and ok(s) else ("decide", side(s))
def non_urgent(s, r):   return ("check",) if not s["urgent"] and s["left"] == 3 else ("decide", side(s))
def strong_only(s, r):  return ("check",) if s["nextStrength"] == 2 and ok(s) else ("decide", side(s))
def strong_big(s, r):   return ("check",) if s["nextStrength"] == 2 and s["worth"] >= 20 and ok(s) else ("decide", side(s))
def close_nonurg(s, r): return ("check",) if abs(s["net"]) <= 1 and not s["urgent"] and ok(s) else ("decide", side(s))
BOTS = [("wise", wise), ("never check", impulsive), ("check everything", paralysed), ("check every call once", every_once),
        ("check 30s once", big_once), ("check 30s fully", big_full), ("check if tied", if_tied), ("check big ties", big_tied),
        ("check non-urgent once", non_urgent), ("check strong clues only", strong_only), ("check strong clues on 20+/30", strong_big),
        ("check close non-urgent calls", close_nonurg)]

if __name__ == "__main__":
    import numpy as np
    err = []
    for f in ("A", "B"):
        V = [v for k, v in CALLS.items() if k.startswith(f)]
        acc1 = np.mean([d == v["truth"] for v in V for (_, s, d) in v["clues"] if s == 1]); acc2 = np.mean([d == v["truth"] for v in V for (_, s, d) in v["clues"] if s == 2])
        dflt = np.mean([v["default"] == v["truth"] for v in V]); first = np.mean([v["truth"] == 1 for v in V])
        dil = np.mean([abs(voi(v["worth"], v["first"], v["clues"][0][1], v["urgent"])) > MARGIN for v in V])
        r = {n: metrics(run(p, f))["judgementScore"] for n, p in BOTS}; w = r["wise"]; gap = w - max(r[n] for n, _ in BOTS[1:])
        print(f"FORM {f}: default right {dflt:.0%} · first option {first:.0%} · clue accuracy 1/2-arrow {acc1:.0%}/{acc2:.0%} · clear dilemmas {dil:.0%} · wise {w} · smallest gap to a rule of thumb {gap:.1f}")
        print("   ", " · ".join(f"{n} {r[n]}" for n, _ in BOTS))
        for c, msg in [(0.4 <= dflt <= 0.6, "default"), (0.4 <= first <= 0.6, "first"), (acc2 >= acc1, "clue reliability"), (dil >= 0.6, "dilemmas"), (w >= 95, "wise"), (gap >= 15, "rule-of-thumb gap")]:
            if not c: err.append(f"{f}: {msg}")
    print("STRESS:", "PASS" if not err else err)
    print("SELF-TEST:", "PASS" if not err else "FAIL")
