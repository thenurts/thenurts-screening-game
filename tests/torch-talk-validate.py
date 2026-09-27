"""Torch Talk item-bank validator v2.2 (The Nurts, build pack v2.2). Run: python3 torch-talk-validate.py [torch-talk-items.json]
Reference implementation of the meaning checker (check) and per-turn points (points). The game's JS must return identical results.
Prints ALL CHECKS PASS or a list of problems. (Copied from the Game Ideas thread; only the default path differs.)"""
import json, itertools, re, random, sys
D = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "src/modules/torch-talk/items.json")); R = D["items"]
CF, CA = {"liam", "mia", "zoey"}, {"raj", "amira"}
def find(msg, acc):                       # first index where a single word or a multi-word phrase occurs
    best = None
    for a in acc:
        p = a.split()
        for i in range(len(msg) - len(p) + 1):
            if msg[i:i + len(p)] == p:
                best = i if best is None else min(best, i); break
    return best
def check(msg, it):
    used = set()
    for i, w in enumerate(msg):
        if w == "not":
            n = msg[i + 1] if i + 1 < len(msg) else None
            if n in it["breakers"]: used |= {i, i + 1}; continue          # "not X" = true statement
            n2 = msg[i + 2] if i + 2 < len(msg) else None                 # "not use X" / "not bring X": one harmless word may sit between
            if n in it["fillers"] and n2 in it["breakers"]: used |= {i, i + 1, i + 2}; continue
            if n and any(n in a.split() for s in it["slots"] for a in s["accept"]): return "negated"
            used.add(i)
    for i, w in enumerate(msg):
        if i not in used and w in it["breakers"]: return "breaker"
    pos = {}
    for s in it["slots"]:
        p = find(msg, s["accept"])
        if p is None: return "missing"
        pos[s["id"]] = p
    for a, b in it["order"]:
        if pos[a] > pos[b]: return "order"
    heads = sorted({pos[h] for h, _ in it["bind"]})
    for h, d in it["bind"]:                                   # dependent after its head and before the next head
        nxt = [x for x in heads if x > pos[h]]
        if not (pos[d] > pos[h] and (not nxt or pos[d] < nxt[0])): return "bind"
    for a, m, b in it["between"]:                             # m sits between a and b (either order)
        if not (min(pos[a], pos[b]) < pos[m] < max(pos[a], pos[b])): return "between"
    return "pass"
CW = D.get("scoring", {}).get("clarifierWeight", 2.5)
def points(msg, it):
    """0 if the meaning fails; else min(10, round(10 x idealLen / (wordsUsed + CW x missingClarifiers)))."""
    if check(msg, it) != "pass": return 0
    miss = sum(1 for c in it["clarifiers"] if find(msg, c["accept"]) is None)
    return min(10, round(10 * len(it["ideal"]) / (len(msg) + CW * miss)))
def slotwords(it): return {w for s in it["slots"] for a in s["accept"] for w in a.split()}
def clarwords(it): return {w for s in it.get("clarifiers", []) for a in s["accept"] for w in a.split() if w != "not" and w not in it.get("breakers", [])}
def shortest(it, tiles, maxn):
    cand = [t for t in tiles if t in slotwords(it)]
    for n in range(1, maxn + 1):
        for sub in itertools.combinations(cand, n):
            perms = itertools.permutations(sub) if n <= 6 else [sub]
            for m in perms:
                if check(list(m), it) == "pass": return list(m)
    return None
err = []; E = err.append
QS = set(D["questions"])
TIER = {"E": (3, 7, 1), "M": (4, 8, 2), "H": (5, 9, 3), "P": (2, 6, 1)}
for it in R:
    i = it["id"]; T = it["tiles"]; g = it["gap"]; full = T + (g["answerTile"].split() if g else [])
    need = 17 if g else 18
    if len(T) != need or len(set(T)) != len(T): E(f"{i}: {len(T)} tiles (need {need})")
    if "not" not in T: E(f"{i}: no 'not' tile")
    phrase = {w for s in it["slots"] for a in s["accept"] if " " in a for w in a.split()}
    for t in full:
        if len(t) > 9: E(f"{i}: tile too long {t}")
        roles = sum(t in s["accept"] for s in it["slots"]) + (t in it["breakers"]) + (t in it["fillers"]) + (t in phrase) + (t in clarwords(it))
        sh = it["shorthand"] and t == it["shorthand"]["tile"]
        if (not sh and roles != 1) or (sh and roles != len(it["shorthand"]["slots"])): E(f"{i}: tile {t} has {roles} roles")
    if len(re.findall(r"[\w'\-]+", it["note"])) > 40 or len(re.findall(r"[.!?](\s|$)", it["note"])) > 3: E(f"{i}: note too long")
    if it["tag"] != ("Close Friend" if it["recipient"] in CF else "Casual Acquaintance"): E(f"{i}: wrong tag")
    if not it["note"].startswith(it["recipient"].title() + ","): E(f"{i}: note must address the recipient")
    ideal = it["ideal"]
    if check(ideal, it) != "pass": E(f"{i}: stored ideal fails ({check(ideal, it)})"); continue
    if it["cap"] != min(len(ideal) + 4, 10): E(f"{i}: cap")
    if any(w not in full for w in ideal): E(f"{i}: ideal uses a word not in the tray")
    if points(ideal, it) != 10: E(f"{i}: ideal must score 10 (got {points(ideal, it)})")
    for c in it["clarifiers"]:
        if find(ideal, c["accept"]) is None: E(f"{i}: ideal lacks clarifier {c['id']}")
        cwds = [w for a in c["accept"] for w in a.split()]
        drop = [w for w in ideal if w not in cwds] if not c["accept"][0].startswith("not ") else [w for k, w in enumerate(ideal) if not (w == "not" and k + 1 < len(ideal) and ideal[k + 1] in cwds) and w not in cwds]
        if check(drop, it) != "pass" or points(drop, it) >= 10: E(f"{i}: dropping clarifier {c['id']} must still pass but score less")
    req = [w for w in ideal if w in slotwords(it) or w in (it["shorthand"] or {}).get("tile", "")]
    if it["clarifiers"] and (check(req, it) != "pass" or points(req, it) >= 10): E(f"{i}: required-only message must pass and score < 10")
    sh = shortest(it, full, len(req) - 1 if it["clarifiers"] else len(ideal) - 1)
    if sh: E(f"{i}: a shorter message passes: {sh}")
    lo, hi, nb = TIER["P" if it["pool"] == "practice" else it["tier"]]
    if not lo <= len(ideal) <= hi: E(f"{i}: ideal length {len(ideal)} outside tier")
    if len(it["breakers"]) < nb: E(f"{i}: too few breakers")
    if it["tier"] == "H" and it["pool"] == "real" and not (it["order"] or it["bind"] or it["context"]): E(f"{i}: H needs order/bind/context")
    for b in it["breakers"]:
        if check(ideal + [b], it) != "breaker": E(f"{i}: breaker {b} doesn't fail")
        if check(ideal + ["not", b], it) != "pass": E(f"{i}: 'not {b}' should pass")
    for f in it["fillers"]:
        if f != "not" and (check(ideal + [f], it) != "pass" or points(ideal + [f], it) >= 10): E(f"{i}: filler {f} must pass but cost a point")
    for k in range(len(ideal)):
        if ideal[k] in slotwords(it) and check(ideal[:k] + ideal[k + 1:], it) == "pass" and not it["shorthand"]: E(f"{i}: required word {ideal[k]} is not required")
    if (it["order"] or it["bind"]) and check(list(reversed(req)), it) == "pass": E(f"{i}: reversed message passes")
    for kw in it["known"]:
        if kw not in it["fillers"] or kw.lower() not in it["note"].lower(): E(f"{i}: known word {kw}")
    if it["known"] and "as you know" not in it["note"].lower(): E(f"{i}: known-fact note must say 'as you know'")
    ital = [w.lower() for w in re.findall(r"\*([^*]+)\*", it["note"])]
    nick = [x["tile"].lower() for x in (it["shorthand"], it["context"]) if x]
    if sorted(ital) != sorted(nick): E(f"{i}: italics {ital} must match nickname tiles {nick}")
    if it["recipient"] in CF and it["context"]: E(f"{i}: Close Friends always understand nicknames")
    if it["recipient"] in CA and it["shorthand"]: E(f"{i}: acquaintances can't use shorthand")
    if g:
        s = [x for x in it["slots"] if x["id"] == g["slot"]][0]
        if any(t in slotwords({"slots": [s]}) for t in T): E(f"{i}: gap answer present pre-ask")
        if g["answerTile"] not in s["accept"] or g["question"] not in QS: E(f"{i}: bad gap")
        if shortest(it, T, 6): E(f"{i}: passes without asking")
    if it["mixup"] and it["mixup"]["echo"] not in it["breakers"]: E(f"{i}: echo must be a breaker")
    if it["context"]:
        c = it["context"]
        if c["tile"] not in it["fillers"]: E(f"{i}: context tile must be a filler")
        cs = [s for s in it["slots"] if s["id"] == c["slot"]][0]
        sub = [x for x in ideal if x not in slotwords({"slots": [cs]})] + [c["tile"]]
        if check(sub, it) == "pass": E(f"{i}: nickname-only passes")
    if it["shorthand"] and it["shorthand"]["tile"] not in ideal: E(f"{i}: shorthand should be in ideal")
    if len(ideal) + 1 > it["cap"]: E(f"{i}: cap leaves no room")
real = [x for x in R if x["pool"] == "real"]; prac = [x for x in R if x["pool"] == "practice"]
if len(real) != 30 or len(prac) != 8: E("pool size")
pk = [("gap" if x["gap"] else "nick" if x["context"] else "normal") for x in prac]
if pk.count("normal") != 3 or pk.count("nick") != 2 or pk.count("gap") != 3: E(f"practice mix {pk}")
CASLOT = {4, 7, 8}
for x in real:
    s = x["slot"]; need = {2: "known", 3: "shorthand", 4: "context", 5: "gap", 6: "mixup", 7: "context", 8: "context", 9: "gap"}.get(s)
    if need and not x[need]: E(f"{x['id']}: slot {s} needs {need}")
    if s == 10 and not (x["order"] or x["bind"]): E(f"{x['id']}: slot 10 needs order/bind")
    if (x["recipient"] in CA) != (s in CASLOT): E(f"{x['id']}: recipient class")
    if x["tier"] != "EEMMEMHHMH"[s - 1]: E(f"{x['id']}: tier")
for f in "ABC":
    fm = [x for x in real if x["form"] == f]
    if sorted(x["slot"] for x in fm) != list(range(1, 11)): E(f"form {f} slots")
    types = [x["type"] for x in fm if x["type"] != "gap"]
    if len(set(types)) < 6 or max(types.count(t) for t in types) > 2: E(f"form {f}: types {types}")
    a = [x for x in fm if x["slot"] == 3][0]; b = [x for x in fm if x["slot"] == 7][0]
    if a["shorthand"]["tile"] != b["context"]["tile"]: E(f"form {f}: T3/T7 shorthand mismatch")
for key in ("id", "note", "topic"):
    v = [x[key] for x in R]
    if len(set(v)) != len(v): E(f"duplicate {key}")
special = {}
for x in R:
    for k in ("shorthand", "context"):
        if x[k]: special.setdefault(x[k]["tile"], set()).add(x["id"])
for w, ids in special.items():
    for x in R:
        if w in x["tiles"] and x["id"] not in ids: E(f"nickname {w} leaks into {x['id']}")
random.seed(1); by = {(x["form"], x["slot"]): x for x in real}
for _ in range(10000):
    pick = {s: random.choice("ABC") for s in range(1, 11)}; pick[7] = pick[3]
    rnd = [by[(pick[s], s)] for s in range(1, 11)]
    if len({x["id"] for x in rnd}) != 10 or len({x["topic"] for x in rnd}) != 10: E("round duplicate"); break
print("\n".join(err) if err else "ALL CHECKS PASS")
