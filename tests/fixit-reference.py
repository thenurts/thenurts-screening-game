"""Mia's Fix-It Kit: reference (CR1 build pack v1). Run: python3 fixit-reference.py → STRESS PASS + SELF-TEST PASS.
The game's JS must match lookup(), play_problem() and metrics() exactly (parity fixture exported from this file). School sports day, Mia is the organiser.
A try = 1 or 2 objects dropped in the Fix tray + "Try it". A try works only if it's on the problem's curated FIXES list.
Distinct fixes are counted by MECHANISM (different objects doing the same thing count once)."""
import itertools, random, statistics, json
KIT = {  # id: (name, chips = [everyday use] + properties). A try = 1-2 objects, and for each one the chip saying HOW it's used
 "U": ("Umbrella",      ["keeps you dry", "long", "hooked handle", "opens wide"]),
 "R": ("Skipping rope", ["for skipping", "long", "bendy", "ties"]),
 "RB":("Rubber bands",  ["bundle things", "stretchy", "grips"]),
 "C": ("Chopsticks",    ["for eating", "thin", "stiff", "pinch"]),
 "B": ("Cardboard box", ["carry things", "flat when folded", "hollow", "stiff"]),
 "S": ("Metal spoon",   ["for stirring", "clangs", "thin handle"]),
 "H": ("Hair clips",    ["hold hair", "clip on", "bendy wire"]),
 "W": ("Water bottle",  ["for drinking", "heavy when full", "whistles"]),   # "whistles" chip: "blow across the top"
}
def F(spec, mech, tier, line):
    """spec: 'W:whistles' or 'S:clangs+W:for drinking|heavy when full'. Returns ({obj: set(accepted chips)}, mech, tier, line)."""
    d = {}
    for part in spec.split("+"):
        o, chips = part.split(":"); d[o] = set(chips.split("|"))
    return (d, mech, tier, line)
PROBLEMS = {
 # ---------- Form A ----------
 "A1": dict(form="A", title="The starting whistle is lost!", job="Signal the start", fixes=[
    F("W:whistles","bottle whistle",0.5,"Blow across the top: whooo!"),
    F("S:clangs+W:for drinking|heavy when full|whistles","bang the bottle",0,"Clang! Everyone heard that."),
    F("C:stiff|thin+W:for drinking|heavy when full|whistles","bang the bottle",0,"Tok-tok-tok! Loud enough."),
    F("B:hollow","box drum",0,"Boom-boom on the box!"), F("S:clangs+B:hollow","box drum",0,"Bang the box like a drum!"), F("C:stiff|thin+B:hollow","box drum",0,"Drumsticks and a box drum!"),
    F("U:opens wide","umbrella flag",1,"Pop it open: a big bright start flag!")]),
 "A2": dict(form="A", title="A shuttlecock is stuck in the tree!", job="Get it down", block="U", fixes=[
    F("U:long","poke it down",0,"Poke, poke, it's down!"),
    F("U:hooked handle","hook the branch",1,"Hook the branch and give it a shake!"),
    F("U:long|hooked handle+H:bendy wire|clip on","hook on a stick",1,"A clip hook on the umbrella tip: got it!"),
    F("W:heavy when full","knock it down",0,"One good throw and it drops!"),
    F("R:long|bendy","shake the branch",0.5,"Throw the rope over and shake!"), F("R:long|bendy|ties+W:heavy when full","shake the branch",0.5,"A weighted rope shakes the branch!"),
    F("H:bendy wire|clip on+R:long|ties|bendy","grappling hook",1,"A clip hook on a rope: a grappling hook!")]),
 "A3": dict(form="A", title="The finish-line tape snapped!", job="Mend the finish line", fixes=[
    F("R:long|bendy|ties","new finish line",0.5,"The rope makes a brand-new finish line!"),
    F("RB:stretchy|grips|bundle things","join the ends",0,"Band the two ends together!"),
    F("H:clip on","join the ends",0.5,"Clip the two ends together!"),
    F("RB:stretchy|grips|bundle things+H:clip on","join the ends",0,"Band and clip the ends!"),
    F("S:thin handle","draw a line",1,"Scratch a new finish line across the grass!")]),
 # ---------- Form B ----------
 "B1": dict(form="B", title="The scoreboard table wobbles!", job="Steady the table", fixes=[
    F("C:thin|stiff","wedge the leg",0.5,"Chopsticks wedged under the short leg!"), F("S:thin handle","wedge the leg",0.5,"The spoon handle wedges the leg!"),
    F("W:heavy when full","weigh it down",0.5,"The heavy bottle holds that corner still!"),
    F("R:ties|bendy","tie the leg",1,"Tie the leg to the fence post!"), F("R:ties|bendy+C:stiff|thin","tie the leg",1,"A splint: chopstick tied to the leg!")]),
 "B2": dict(form="B", title="The race numbers keep blowing away!", job="Keep them in place", block="H", fixes=[
    F("H:clip on|hold hair","clip them",0,"Clip the stack together!"),
    F("RB:bundle things|grips|stretchy","bundle them",0,"A rubber band round the stack!"), F("R:ties|bendy","bundle them",0.5,"Tie the stack with the rope!"),
    F("W:heavy when full","weigh them down",0.5,"The bottle holds them down!"),
    F("B:carry things|hollow","box them",0,"Into the box, lid down!"),
    F("U:long","weigh them down",1,"The closed umbrella lies across the stack!")]),
 "B3": dict(form="B", title="The water station is in the hot sun!", job="Shade it", fixes=[
    F("U:keeps you dry|opens wide","umbrella shade",0,"Open the umbrella: instant shade!"),
    F("B:flat when folded|stiff","box shade",0.5,"Hold the flat box up as a sunshade!"),
    F("B:flat when folded|stiff+C:stiff|thin","box tent",1,"A box roof on chopstick poles: a mini tent!"),
    F("U:keeps you dry|opens wide+R:ties|bendy","tied-up umbrella",1,"Tie the open umbrella to the table: hands-free shade!"),
    F("U:keeps you dry|opens wide+RB:grips|stretchy","tied-up umbrella",1,"Band the umbrella to the table leg: hands-free shade!")]),
}
REJECTED_REVIEW = {
 "A1": {"RB": "a rubber-band twang is too quiet for a race start", "C": "a chopstick clack is too quiet at 10 m", "R": "waving a rope isn't a clear start signal"},
 "A2": {"B": "a cardboard box is too light to knock it down", "C": "chopsticks are far too short to reach a branch", "S": "a thrown spoon is too light and risky"},
 "A3": {"B": "the box can't become a strip without scissors", "U": "an umbrella can't join tape"},
 "B1": {"B": "a folded box squashes flat under a table leg (kept out so the box isn't a universal answer)", "RB": "rubber bands can't stop a wobble", "H": "hair clips are too small to wedge"},
 "B2": {"C": "chopsticks won't hold papers down in wind"},
 "B3": {"R": "a rope gives no shade on its own", "W": "a bottle gives no shade"},
}
TRIES = 6; COUNT_MAX = 4
def tries_space(avail):
    """every possible try: 1-2 objects, each with one chip"""
    out = []
    for o in avail:
        for c in KIT[o][1]: out.append({o: c})
    for a, b in itertools.combinations(avail, 2):
        for ca in KIT[a][1]:
            for cb in KIT[b][1]: out.append({a: ca, b: cb})
    return out
def lookup(pid, choice):
    """choice: {obj: chip}. Valid if the objects match a fix exactly and each chip is one it accepts."""
    for spec, mech, tier, line in PROBLEMS[pid]["fixes"]:
        if set(spec) == set(choice) and all(choice[o] in spec[o] for o in spec): return mech, tier, line
    return None
def play_problem(pid, chooser):
    """chooser(pid, available, found_mechs, tries_left) -> frozenset of objects to try. Returns a per-problem log."""
    p = PROBLEMS[pid]; avail = list(KIT); found = {}; log = []; blocked = False; block_at = None
    for t in range(TRIES):
        objs = chooser(pid, avail, set(found), TRIES - t)
        if objs is None: break
        r = lookup(pid, objs) if set(objs) <= set(avail) else None
        valid = r is not None and r[0] not in found
        log.append(dict(try_=t + 1, objs=sorted(objs), chips=dict(objs), valid=r is not None, new=valid, mech=r[0] if r else None, tier=r[1] if r else None, afterBlock=blocked))
        if valid: found[r[0]] = r[1]
        if p.get("block") and not blocked and found:
            blocked = True; block_at = t + 1; avail = [a for a in avail if a != p["block"]]
    avail_mechs = {m for o, m, _, _ in p["fixes"]}
    return dict(pid=pid, found=found, log=log, available=len(avail_mechs), block=p.get("block"), blockAt=block_at)
def metrics(results):
    flu = statistics.mean(min(COUNT_MAX, len(r["found"])) / min(COUNT_MAX, r["available"]) for r in results)
    tiers = [t for r in results for t in r["found"].values()]
    orig = statistics.mean(tiers) if tiers else 0.0
    used = {o for r in results for e in r["log"] if e["new"] for o in e["objs"]}
    hidden = [1 for r in results for e in r["log"] if e["new"] for o, c in e["chips"].items() if c != KIT[o][1][0]]
    flex = len(used) / len(KIT)
    tries = sum(len(r["log"]) for r in results); hits = sum(1 for r in results for e in r["log"] if e["new"])
    hit = hits / tries if tries else 0.0
    br = [r for r in results if r["block"] and r["blockAt"]]
    rec = statistics.mean(1.0 if any(e["new"] and e["afterBlock"] for e in r["log"]) else 0.0 for r in br) if br else None
    m = dict(fluency=round(flu, 3), originality=round(orig, 3), flexibility=round(flex, 3), hitRate=round(hit, 3), blockedRecovery=rec)
    w = dict(fluency=0.30, originality=0.25, flexibility=0.20, hitRate=0.15, blockedRecovery=0.10)
    ks = [k for k in w if m[k] is not None]
    m["creativeScore"] = round(100 * sum(w[k] * m[k] for k in ks) / sum(w[k] for k in ks), 1)
    return m
# ---------------- bots ----------------
def explorer(seed=0):      # inspects everything, tries new mechanisms, prefers rare
    def ch(pid, avail, found, left):
        opts = [(o, m, t) for o, m, t, _ in PROBLEMS[pid]["fixes"] if set(o) <= set(avail) and m not in found]
        if not opts: return None
        o = max(opts, key=lambda x: (x[2], -len(x[0])))[0]; return {k: sorted(v)[0] for k, v in o.items()}
    return ch
def obvious(seed=0):       # only thinks of everyday uses: finds common fixes, then repeats or gives up
    def ch(pid, avail, found, left):
        opts = [(o, m) for o, m, t, _ in PROBLEMS[pid]["fixes"] if t == 0 and set(o) <= set(avail) and m not in found]
        return {k: sorted(v)[0] for k, v in opts[0][0].items()} if opts else None
    return ch
def one_route(seed=0):     # finds the first fix, then keeps trying variants of the same idea
    def ch(pid, avail, found, left):
        fx = [o for o, m, t, _ in PROBLEMS[pid]["fixes"] if set(o) <= set(avail)]
        if not found: o = fx[0]
        else: o = next((o for o, m, t, _ in PROBLEMS[pid]["fixes"] if m in found and set(o) <= set(avail)), None)
        return {k: sorted(v)[0] for k, v in o.items()} if o else None
    return ch
def spammer(seed=0):       # random 1-2 objects every try
    rng = random.Random(seed)
    def ch(pid, avail, found, left):
        return rng.choice(tries_space(avail))
    return ch
def play(form, bot):
    return [play_problem(pid, bot) for pid in PROBLEMS if PROBLEMS[pid]["form"] == form]

if __name__ == "__main__":
    err=[]
    for f in ("A","B"):
        ps=[pid for pid in PROBLEMS if PROBLEMS[pid]["form"]==f]
        for pid in ps:
            p=PROBLEMS[pid]; mechs={}
            for o,m,t,_ in p["fixes"]: mechs.setdefault(m,[]).append(t)
            allc=tries_space(list(KIT)); valid=sum(1 for c in allc if lookup(pid,c))
            rare=[m for m,ts in mechs.items() if max(ts)>=1]
            print(f"{pid} {p['title']:40} mechanisms {len(mechs)} (rare {len(rare)}) | valid tries {valid}/{len(allc)} = {valid/len(allc):.0%}")
            if len(mechs)<3: err.append(f"{pid}: fewer than 3 mechanisms")
            if not rare: err.append(f"{pid}: no rare fix")
            if valid/len(allc)>0.10: err.append(f"{pid}: random tries work too often")
            for o,_,_,_ in p["fixes"]:
                if not set(o)<=set(KIT) or len(o)>2 or any(not (o[k] <= set(KIT[k][1])) for k in o): err.append(f"{pid}: bad fix {o}")
            if p.get("block"):
                left={m for o,m,t,_ in p["fixes"] if p["block"] not in o}
                print(f"     after the {KIT[p['block']][0]} is lost: {len(left)} mechanisms remain")
                if len(left)<2: err.append(f"{pid}: block leaves < 2 routes")
            for k in REJECTED_REVIEW.get(pid,{}):
                if any(lookup(pid,{k:c}) for c in KIT[k][1]): err.append(f"{pid}: {k} is both rejected and valid")
        # no universal object: an object valid alone in every problem of the form
        for o in KIT:
            if all(any(lookup(pid,{o:c}) for c in KIT[o][1]) for pid in ps): err.append(f"form {f}: {o} alone solves every problem")
        print(f"form {f} bots:")
        for n,b in [("explorer",explorer()),("obvious-only",obvious()),("one route",one_route()),("spammer",None)]:
            if b is None:
                R=[metrics(play(f,spammer(s))) for s in range(300)]
                m={k:round(statistics.mean(r[k] for r in R if r[k] is not None),2) for k in R[0]}
            else: m=metrics(play(f,b))
            print(f"   {n:13}",m)
    print("STRESS:", "PASS" if not err else err)

    ok = "PASS" in str(not err)
    sc = {f: {n: metrics(play(f, b))["creativeScore"] for n, b in [("explorer", explorer()), ("obvious", obvious()), ("one_route", one_route())]} for f in ("A", "B")}
    spam = {f: statistics.mean(metrics(play(f, spammer(s)))["creativeScore"] for s in range(200)) for f in ("A", "B")}
    good = not err and all(sc[f]["explorer"] > sc[f]["obvious"] + 20 > sc[f]["one_route"] + 20 and spam[f] < 20 for f in ("A", "B"))
    print("SELF-TEST:", "PASS" if good else "FAIL")
