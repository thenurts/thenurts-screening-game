"""Torch Talk item-bank validator (The Nurts). Run: python3 torch-talk-validate.py [torch-talk-items.json]
Checks every item rule (build pack 5.3), the pool rules and 10,000 random rounds. Prints ALL CHECKS PASS or a list of problems.
Does not modify the file; the 'ideal' and 'cap' in the JSON must equal what this script derives.
(Copied from the Game Ideas thread's torch-talk-validate.py; only the default path differs.)"""
import json, itertools, re, random, sys
D=json.load(open(sys.argv[1] if len(sys.argv)>1 else "src/modules/torch-talk/items.json")); R=D["items"]
def check(msg,it):
    used=set()
    for i,w in enumerate(msg):
        if w=="not":
            n=msg[i+1] if i+1<len(msg) else None
            if n in it["breakers"]: used|={i,i+1}; continue
            if n and any(n in s["accept"] for s in it["slots"]): return "negated"
            used.add(i)
    for i,w in enumerate(msg):
        if i not in used and w in it["breakers"]: return "breaker"
    pos={}
    for s in it["slots"]:
        p=[i for i,w in enumerate(msg) if w in s["accept"]]
        if not p: return "missing"
        pos[s["id"]]=p[0]
    for a,b in it["order"]:
        if pos[a]>pos[b]: return "order"
    return "pass"
err=[]; E=lambda m: err.append(m)
def minimal(it):
    tray=it["tiles"]+([it["gap"]["answerTile"]] if it["gap"] else [])
    cand=[t for t in tray if any(t in s["accept"] for s in it["slots"])]
    order_idx={s["id"]:k for k,s in enumerate(it["slots"])}
    for n in range(1,7):
        for sub in itertools.combinations(cand,n):
            msg=sorted(sub,key=lambda t:min(order_idx[s["id"]] for s in it["slots"] if t in s["accept"]))
            if check(msg,it)=="pass": return msg
tier={"E":(3,4,1),"M":(4,5,2),"H":(5,6,3)}
for it in R:
    i=it["id"]; T=it["tiles"]; need=17 if it["gap"] else 18
    if len(T)!=need or len(set(T))!=len(T): E(f"{i}: {len(T)} tiles (need {need})")
    for t in T+([it["gap"]["answerTile"]] if it["gap"] else []):
        if len(t)>9: E(f"{i}: tile too long {t}")
        roles=sum(t in s["accept"] for s in it["slots"])+(t in it["breakers"])+(t in it["fillers"])
        sh=it["shorthand"] and t==it["shorthand"]["tile"]
        if (roles!=1 and not sh) or (sh and roles!=len(it["shorthand"]["slots"])): E(f"{i}: tile {t} has {roles} roles")
    words=len(re.findall(r"[A-Za-z0-9'\-é]+",it["note"])); sents=len(re.findall(r"[.!?](\s|$)",it["note"]))
    if words>40 or sents>3: E(f"{i}: note {words} words / {sents} sentences")
    lo,hi,nb=tier[it["tier"]]
    if not lo<=len(it["slots"])<=hi: E(f"{i}: {len(it['slots'])} slots for tier {it['tier']}")
    if len(it["breakers"])<nb: E(f"{i}: breakers {len(it['breakers'])}<{nb}")
    if it["tier"]=="H" and not (it["order"] or it["context"]): E(f"{i}: H needs order/context")
    ideal=minimal(it)
    if not ideal: E(f"{i}: no passing message"); continue
    if it["ideal"]!=ideal or it["cap"]!=min(len(ideal)+4,10): E(f"{i}: stored ideal/cap differ from derived {ideal}")
    for b in it["breakers"]:
        if check(ideal+[b],it)!="breaker": E(f"{i}: breaker {b} doesn't fail")
        if "not" in T and check(ideal+["not",b],it)!="pass": E(f"{i}: not {b} should pass")
    for f in it["fillers"]:
        if f=="not": continue
        if check(ideal+[f],it)!="pass": E(f"{i}: filler {f} fails")
    for k in range(len(ideal)):
        if check(ideal[:k]+ideal[k+1:],it)=="pass": E(f"{i}: ideal not minimal")
    if it["order"] and check(list(reversed(ideal)),it)!="order": E(f"{i}: reversed ideal should fail order")
    if it["gap"]:
        g=it["gap"]; s=[x for x in it["slots"] if x["id"]==g["slot"]][0]
        if any(t in s["accept"] for t in T): E(f"{i}: gap answer present pre-ask")
        if g["answerTile"] not in s["accept"]: E(f"{i}: answer tile not accepted")
        pre=minimal(dict(it,gap=None,tiles=T))
        if pre: E(f"{i}: passes without asking")
    if it["mixup"]:
        m=it["mixup"]
        if m["echo"] not in it["breakers"]: E(f"{i}: echo must be a breaker")
    if it["context"]:
        c=it["context"]
        if it["recipient"]!="zoey" or c["tile"] not in it["fillers"]: E(f"{i}: context tile must be a Zoey filler")
        sub=[x for x in ideal if not any(x in s["accept"] for s in it["slots"] if s["id"]==c["slot"])]+[c["tile"]]
        if check(sub,it)!="missing": E(f"{i}: nickname-only should fail")
    if it["shorthand"] and it["shorthand"]["tile"] not in ideal: E(f"{i}: shorthand should be in ideal")
real=[x for x in R if x["pool"]=="real"]; prac=[x for x in R if x["pool"]=="practice"]
if len(real)!=30 or len(prac)!=8: E("pool size")
for f in "ABC":
    fs=sorted(x["slot"] for x in real if x["form"]==f)
    if fs!=list(range(1,11)): E(f"form {f} slots {fs}")
ids=[x["id"] for x in R]; notes=[x["note"] for x in R]; ide=[" ".join(x.get("ideal",[])) for x in R]
if len(set(ids))<len(ids) or len(set(notes))<len(notes) or len(set(ide))<len(ide): E("duplicate id/note/ideal")
special={}
for x in R:
    for key in ("shorthand","context"):
        if x[key]: special.setdefault(x[key]["tile"],set()).add(x["slot"])
for w,sl in special.items():
    for x in R:
        if w in x["tiles"] and x["slot"] not in sl: E(f"special word {w} leaks into {x['id']}")
    if w in ("usual","meetup","HQ") and sl!={3,7}: E(f"shorthand {w} must be T3/T7 only: {sl}")
role={3:"shorthand",4:"context",5:"gap",6:"mixup",7:"context",8:"context",9:"gap",10:"order"}
for x in real:
    r=role.get(x["slot"])
    if r and not x[r]: E(f"{x['id']}: slot {x['slot']} needs {r}")
    exp={1:"liam",2:"mia",3:"liam",4:"zoey",5:"liam",6:"mia",7:"zoey",8:"zoey",9:"mia",10:"liam"}[x["slot"]]
    if x["recipient"]!=exp: E(f"{x['id']}: recipient")
    if x["tier"]!="EEMMEMHHMH"[x["slot"]-1]: E(f"{x['id']}: tier")
for f in "ABC":
    a=[x for x in real if x["form"]==f and x["slot"]==3][0]; b=[x for x in real if x["form"]==f and x["slot"]==7][0]
    if a["shorthand"]["tile"]!=b["context"]["tile"]: E(f"form {f}: T3/T7 shorthand mismatch")
random.seed(1)
by={(x["form"],x["slot"]):x for x in real}
for _ in range(10000):
    pick={s:random.choice("ABC") for s in range(1,11)}; pick[7]=pick[3]
    rnd=[by[(pick[s],s)] for s in range(1,11)]
    if len({x["id"] for x in rnd})!=10 or len({x["note"] for x in rnd})!=10: E("round dup"); break
print("\n".join(err) if err else "ALL CHECKS PASS")
