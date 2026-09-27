"""Fair Board claim stress test (The Nurts, CT2 build pack v1). Run: python3 tests/fair-board-stress-test.py
For each content form it runs: a SOLVER (every claim's truth proven against the board data), READABILITY (<= 12 words,
no word > 9 letters, grade ~3), board-blind DISCRIMINATORS (single cues, board-fold logistic, naive-Bayes words),
LAZY strategies (doubt numbers / every / because / everyone says / teacher / long / hard), DIFFICULTY parity,
PLAUSIBILITY of flawed numbers, an ORDER attack (parity, alternation, runs) and SKIMMER attacks. Pass = no cue beats 0.625.
Edit a form's source below, rerun, and only ship on PASS. (Copied from the Game Ideas thread; the game's
src/modules/fair-board/content.json is generated from these sources by tools/fb_build_content.py.)"""
import sys
FORMS = {"A": r'''# Fair Board content (Form A). Every claim carries a predicate that is evaluated against the board data (the solver).
SALES = {"days": ["Fri", "Sat", "Sun"], "weather": {"Fri": "sun", "Sat": "rain", "Sun": "sun"},
         "stalls": {"lemonade": [30, 10, 25], "cakes": [20, 25, 20], "badges": [15, 15, 30], "plants": [10, 5, 15]},
         "note": "Sat: plant stall shut early"}
TIMES = {"day": "Sun", "header": "Sunday (sunny)", "events": {  # name: (start, end, place)   times in minutes after noon
    "face painting": (60, 180, "tent"), "magic show": (120, 150, "hall"), "tug of war": (180, 210, "field"),
    "band": (240, 285, "stage"), "prize draw": (300, 315, "hall")}, "note": "Tug of war: if it rains, in the hall"}
MAP = {"key": "next to = side by side (not corner to corner)", "grid": [["gate", "lemonade", "tent"], ["cakes", "stage", "badges"], ["hall", "field", "plants"]]}
def pos(x):
    for r, row in enumerate(MAP["grid"]):
        if x in row: return r, row.index(x)
def nextto(a, b):
    (r1, c1), (r2, c2) = pos(a), pos(b); return abs(r1 - r2) + abs(c1 - c2) == 1
S = lambda st, d: SALES["stalls"][st][SALES["days"].index(d)]
E = TIMES["events"]
FOOD = ["lemonade", "cakes"]; STALLS = ["lemonade", "cakes", "badges", "plants"]
# (id, board, type, truth, source, cue, difficulty, text, predicate, evidence)
C = [
 ("A01","sales","value","sound","mia",None,1,"Cakes sold 25 on Saturday.", lambda: S("cakes","Sat")==25, "sales:cakes"),
 ("A02","sales","value","flawed","raj",None,1,"Badges sold 20 on Friday.", lambda: S("badges","Fri")==20, "sales:badges"),
 ("A03","sales","compare","sound","noah","sure",2,"I'm sure plants sold more on Sunday than on Friday.", lambda: S("plants","Sun")>S("plants","Fri"), "sales:plants"),
 ("A04","sales","compare","flawed","liam","sure",2,"I'm sure cakes sold more than lemonade on Friday.", lambda: S("cakes","Fri")>S("lemonade","Fri"), "sales:fri"),
 ("A05","sales","always","sound","teacher",None,2,"Cakes sold 20 or more every day.", lambda: all(v>=20 for v in SALES["stalls"]["cakes"]), "sales:cakes"),
 ("A06","sales","always","flawed","amira","crowd",2,"Everyone says lemonade sold the most every day.", lambda: all(S("lemonade",d)==max(S(s,d) for s in STALLS) for d in SALES["days"]), "sales:all"),
 ("A07","sales","because","sound","liam",None,3,"Plant sales fell on Saturday because the stall shut early.", lambda: S("plants","Sat")<S("plants","Fri") and "shut" in SALES["note"], "sales:note"),
 ("A08","sales","because","flawed","teacher",None,3,"Badge sales went up on Sunday because it was sunny.", lambda: False, "sales:badges;sales:weather"),
 ("A09","times","value","sound","raj","sure",1,"I'm sure the magic show starts at 2:00 today.", lambda: E["magic show"][0]==120, "time:magic show"),
 ("A10","times","value","flawed","mia","sure",1,"I'm sure the band starts at 4:45.", lambda: E["band"][0]==285, "time:band"),
 ("A11","times","compare","flawed","noah",None,2,"Face painting ends before the magic show starts.", lambda: E["face painting"][1]<E["magic show"][0], "time:face painting,magic show"),
 ("A12","times","compare","sound","amira",None,2,"The prize draw starts after the band finishes.", lambda: E["prize draw"][0]>E["band"][1], "time:prize draw,band"),
 ("A13","times","value","sound","teacher","crowd",1,"Everyone says the prize draw is in the hall.", lambda: E["prize draw"][2]=="hall", "time:prize draw"),
 ("A14","times","cross","flawed","raj",None,3,"The tug of war is in the hall today.", lambda: SALES["weather"][TIMES["day"]]=="rain", "time:tug of war,header,note"),
 ("A15","times","always","sound","mia","crowd",2,"Everyone says all hall events end by 5:30.", lambda: all(e[1]<=330 for e in E.values() if e[2]=="hall"), "time:all"),
 ("A16","times","always","flawed","liam",None,2,"Every event lasts 30 minutes or more.", lambda: all(e[1]-e[0]>=30 for e in E.values()), "time:all"),
 ("A17","map","cross","sound","raj",None,3,"Face painting is next to the lemonade stall.", lambda: nextto(E["face painting"][2],"lemonade"), "time:face painting;map:tent,lemonade"),
 ("A18","map","value","flawed","amira","sure",1,"I'm sure the tent is next to the hall.", lambda: nextto("tent","hall"), "map:tent,hall"),
 ("A19","map","value","sound","liam","sure",2,"I'm sure the plant stall isn't next to the stage.", lambda: not nextto("plants","stage"), "map:plants,stage"),
 ("A20","map","compare","flawed","teacher",None,2,"The tent is nearer the gate than the lemonade stall.", lambda: dist("tent","gate")<dist("lemonade","gate"), "map:tent,lemonade,gate"),
 ("A21","map","always","sound","amira",None,2,"The cake and lemonade stalls are both next to the gate.", lambda: all(nextto(f,"gate") for f in FOOD), "map:lemonade,cakes,gate"),
 ("A22","map","always","flawed","noah","crowd",2,"Everyone says every stall is next to the stage.", lambda: all(nextto(s,"stage") for s in STALLS), "map:all"),
 ("A23","map","cross","sound","noah",None,3,"The band plays in the middle of the fair.", lambda: pos(E["band"][2])==(1,1), "time:band;map:stage"),
 ("A24","map","cross","flawed","mia",None,3,"The magic show is next to the stage.", lambda: nextto(E["magic show"][2],"stage"), "time:magic show;map:hall,stage"),
]
def dist(a,b):
    (r1,c1),(r2,c2)=pos(a),pos(b); return abs(r1-r2)+abs(c1-c2)
# display order: shuffled within each board (fixed for everyone); max 2 of the same truth in a row
ORDER = ['A06', 'A05', 'A01', 'A02', 'A08', 'A07', 'A03', 'A04', 'A09', 'A12', 'A14', 'A13', 'A15', 'A11', 'A16', 'A10', 'A17', 'A23', 'A22', 'A20', 'A21', 'A19', 'A24', 'A18']
''', "B": r'''# Fair Board content (Form B: a mirror of Form A with renamed stalls/events, +5 sales, +1 hour, flipped map). Every claim carries a predicate that is evaluated against the board data (the solver).
SALES = {"days": ["Fri", "Sat", "Sun"], "weather": {"Fri": "sun", "Sat": "rain", "Sun": "sun"},
         "stalls": {"juice": [35, 15, 30], "cookies": [25, 30, 25], "stickers": [20, 20, 35], "seeds": [15, 10, 20]},
         "note": "Sat: seed stall shut early"}
TIMES = {"day": "Sun", "header": "Sunday (sunny)", "events": {  # name: (start, end, place)   times in minutes after noon
    "balloon art": (120, 240, "hut"), "puppet show": (180, 210, "gym"), "sack race": (240, 270, "lawn"),
    "choir": (300, 345, "stage"), "lucky draw": (360, 375, "gym")}, "note": "Sack race: if it rains, in the gym"}
MAP = {"key": "next to = side by side (not corner to corner)", "grid": [["hut", "juice", "gate"], ["stickers", "stage", "cookies"], ["seeds", "lawn", "gym"]]}
def pos(x):
    for r, row in enumerate(MAP["grid"]):
        if x in row: return r, row.index(x)
def nextto(a, b):
    (r1, c1), (r2, c2) = pos(a), pos(b); return abs(r1 - r2) + abs(c1 - c2) == 1
S = lambda st, d: SALES["stalls"][st][SALES["days"].index(d)]
E = TIMES["events"]
FOOD = ["juice", "cookies"]; STALLS = ["juice", "cookies", "stickers", "seeds"]
# (id, board, type, truth, source, cue, difficulty, text, predicate, evidence)
C = [
 ("B01","sales","value","sound","mia",None,1,"Cookies sold 30 on Saturday.", lambda: S("cookies","Sat")==30, "sales:cookies"),
 ("B02","sales","value","flawed","raj",None,1,"Stickers sold 25 on Friday.", lambda: S("stickers","Fri")==25, "sales:stickers"),
 ("B03","sales","compare","sound","noah","sure",2,"I'm sure seeds sold more on Sunday than on Friday.", lambda: S("seeds","Sun")>S("seeds","Fri"), "sales:seeds"),
 ("B04","sales","compare","flawed","liam","sure",2,"I'm sure cookies sold more than juice on Friday.", lambda: S("cookies","Fri")>S("juice","Fri"), "sales:fri"),
 ("B05","sales","always","sound","teacher",None,2,"Cookies sold 25 or more every day.", lambda: all(v>=25 for v in SALES["stalls"]["cookies"]), "sales:cookies"),
 ("B06","sales","always","flawed","amira","crowd",2,"Everyone says juice sold the most every day.", lambda: all(S("juice",d)==max(S(s,d) for s in STALLS) for d in SALES["days"]), "sales:all"),
 ("B07","sales","because","sound","liam",None,3,"Seed sales fell on Saturday because the stall shut early.", lambda: S("seeds","Sat")<S("seeds","Fri") and "shut" in SALES["note"], "sales:note"),
 ("B08","sales","because","flawed","teacher",None,3,"Sticker sales went up on Sunday because it was sunny.", lambda: False, "sales:stickers;sales:weather"),
 ("B09","times","value","sound","raj","sure",1,"I'm sure the puppet show starts at 3:00 today.", lambda: E["puppet show"][0]==180, "time:puppet show"),
 ("B10","times","value","flawed","mia","sure",1,"I'm sure the choir starts at 5:45.", lambda: E["choir"][0]==345, "time:choir"),
 ("B11","times","compare","flawed","noah",None,2,"Balloon art ends before the puppet show starts.", lambda: E["balloon art"][1]<E["puppet show"][0], "time:balloon art,puppet show"),
 ("B12","times","compare","sound","amira",None,2,"The lucky draw starts after the choir finishes.", lambda: E["lucky draw"][0]>E["choir"][1], "time:lucky draw,choir"),
 ("B13","times","value","sound","teacher","crowd",1,"Everyone says the lucky draw is in the gym.", lambda: E["lucky draw"][2]=="gym", "time:lucky draw"),
 ("B14","times","cross","flawed","raj",None,3,"The sack race is in the gym today.", lambda: SALES["weather"][TIMES["day"]]=="rain", "time:sack race,header,note"),
 ("B15","times","always","sound","mia","crowd",2,"Everyone says all gym events end by 6:30.", lambda: all(e[1]<=390 for e in E.values() if e[2]=="gym"), "time:all"),
 ("B16","times","always","flawed","liam",None,2,"Every event lasts 30 minutes or more.", lambda: all(e[1]-e[0]>=30 for e in E.values()), "time:all"),
 ("B17","map","cross","sound","raj",None,3,"Balloon art is next to the juice stall.", lambda: nextto(E["balloon art"][2],"juice"), "time:balloon art;map:hut,juice"),
 ("B18","map","value","flawed","amira","sure",1,"I'm sure the hut is next to the gym.", lambda: nextto("hut","gym"), "map:hut,gym"),
 ("B19","map","value","sound","liam","sure",2,"I'm sure the seed stall isn't next to the stage.", lambda: not nextto("seeds","stage"), "map:seeds,stage"),
 ("B20","map","compare","flawed","teacher",None,2,"The hut is nearer the gate than the juice stall.", lambda: dist("hut","gate")<dist("juice","gate"), "map:hut,juice,gate"),
 ("B21","map","always","sound","amira",None,2,"The cookie and juice stalls are both next to the gate.", lambda: all(nextto(f,"gate") for f in FOOD), "map:juice,cookies,gate"),
 ("B22","map","always","flawed","noah","crowd",2,"Everyone says every stall is next to the stage.", lambda: all(nextto(s,"stage") for s in STALLS), "map:all"),
 ("B23","map","cross","sound","noah",None,3,"The choir plays in the middle of the fair.", lambda: pos(E["choir"][2])==(1,1), "time:choir;map:stage"),
 ("B24","map","cross","flawed","mia",None,3,"The puppet show is next to the stage.", lambda: nextto(E["puppet show"][2],"stage"), "time:puppet show;map:gym,stage"),
]
def dist(a,b):
    (r1,c1),(r2,c2)=pos(a),pos(b); return abs(r1-r2)+abs(c1-c2)
# display order: shuffled within each board (fixed for everyone); max 2 of the same truth in a row
ORDER = ['B07', 'B03', 'B01', 'B06', 'B08', 'B05', 'B04', 'B02', 'B15', 'B13', 'B14', 'B12', 'B09', 'B11', 'B16', 'B10', 'B23', 'B18', 'B20', 'B22', 'B17', 'B19', 'B24', 'B21']
'''}
if __name__ == "__main__" or True:
  _overall = []
  for _name, SRC in FORMS.items():
    print("\n===== FORM " + _name + " =====")
    import re, itertools, math, statistics
    import numpy as np
    exec(SRC)
    errs=[]
    # ---------- 1. SOLVER: every stated truth must match the board ----------
    for c in C:
        t=c[8](); want=c[3]=="sound"
        if bool(t)!=want: errs.append(f"SOLVER {c[0]}: board says {'true' if t else 'false'}, marked {c[3]}")
    # ---------- 2. READABILITY ----------
    SIMPLE_MAX=9
    def syll(w): w=w.lower(); return max(1,len(re.findall(r"[aeiouy]+",w))-(1 if w.endswith("e") and not w.endswith("le") else 0))
    for c in C:
        ws=re.findall(r"[A-Za-z']+",c[7])
        if len(c[7].split())>12: errs.append(f"READ {c[0]}: {len(c[7].split())} words")
        long=[w for w in ws if len(w)>SIMPLE_MAX]
        if long: errs.append(f"READ {c[0]}: long words {long}")
    wds=[w for c in C for w in re.findall(r"[A-Za-z']+",c[7])]; fk=0.39*len(wds)/len(C)+11.8*sum(map(syll,wds))/len(wds)-15.59
    # ---------- 3. DISCRIMINATORS (never see the board) ----------
    y=np.array([1 if c[3]=="flawed" else 0 for c in C])
    def feats(c):
        t=c[7].lower()
        return dict(words=len(t.split()), number=bool(re.search(r"\d",t)), time=":" in t,
            absolute=bool(re.search(r"\b(every|all|always|most|best|only|never|nothing|both)\b",t)),
            because=bool(re.search(r"\b(because|so)\b",t)), sure="definitely" in t, crowd="everyone" in t,
            teacher=c[4]=="teacher", negation=bool(re.search(r"\b(not|no|never|isn't)\b",t)),
            comparative=bool(re.search(r"\b(more|less|than|before|after|closer|still)\b",t)), today="today" in t,
            next_to="next to" in t, diff=c[6])
    F=[feats(c) for c in C]; keys=list(F[0])
    X=np.array([[float(f[k]) for k in keys] for f in F])
    single={}
    for j,k in enumerate(keys):
        col=X[:,j]; best=0
        for thr in sorted(set(col)):
            pred=(col>=thr).astype(int); acc=max((pred==y).mean(),(pred!=y).mean()); best=max(best,acc)
        single[k]=best
    src={s: [c[3] for c in C if c[4]==s] for s in set(c[4] for c in C)}
    def loocv_logreg(X,y,l2=1.0,it=400):
        n=len(y); hits=0; Xs=(X-X.mean(0))/(X.std(0)+1e-9)
        for i in range(n):
            m=np.ones(n,bool); m[i]=False; A=np.c_[np.ones(m.sum()),Xs[m]]; w=np.zeros(A.shape[1])
            for _ in range(it):
                p=1/(1+np.exp(-A@w)); g=A.T@(p-y[m])/m.sum()+l2*np.r_[0,w[1:]]/m.sum(); w-=0.5*g
            hits+= (1/(1+np.exp(-np.r_[1,Xs[i]]@w))>0.5)==y[i]
        return hits/n
    tok=lambda s: set(re.findall(r"[a-z']+",s.lower()))
    def loocv_nb():
        n=len(C); hits=0
        for i in range(n):
            tr=[j for j in range(n) if j!=i]; vocab=set().union(*[tok(C[j][7]) for j in tr])
            cnt={0:{},1:{}}; tot={0:0,1:0}
            for j in tr:
                for w in tok(C[j][7]): cnt[y[j]][w]=cnt[y[j]].get(w,0)+1
                tot[y[j]]+=1
            sc={k: math.log(tot[k]/len(tr))+sum(math.log((cnt[k].get(w,0)+1)/(tot[k]+2)) for w in tok(C[i][7]) if w in vocab) for k in (0,1)}
            hits+= (max(sc,key=sc.get)==y[i])
        return hits/n
    lr=loocv_logreg(X,y); nb=loocv_nb()
    def board_cv():   # train on two boards, guess the third (no leave-one-out balance artefact)
        hits=0
        for b in ("sales","times","map"):
            tr=np.array([c[1]!=b for c in C]); te=~tr; Xs=(X-X[tr].mean(0))/(X[tr].std(0)+1e-9)
            A=np.c_[np.ones(tr.sum()),Xs[tr]]; w=np.zeros(A.shape[1])
            for _ in range(400):
                p=1/(1+np.exp(-A@w)); w-=0.5*(A.T@(p-y[tr])/tr.sum()+np.r_[0,w[1:]]/tr.sum())
            hits+=((1/(1+np.exp(-np.c_[np.ones(te.sum()),Xs[te]]@w))>0.5)==y[te]).sum()
        return hits/len(C)
    bcv=board_cv()
    # ---------- 4. LAZY STRATEGIES (claimAccuracy = hit - falseAlarm; should be ~0) ----------
    lazy={"doubt numbers":[f["number"] for f in F],"doubt 'every/all/most'":[f["absolute"] for f in F],"doubt 'because'":[f["because"] for f in F],
          "doubt 'definitely'":[f["sure"] for f in F],"doubt 'everyone says'":[f["crowd"] for f in F],"doubt teacher":[f["teacher"] for f in F],
          "doubt comparisons":[f["comparative"] for f in F],"doubt long claims":[f["words"]>=9 for f in F],"doubt hard (diff 3)":[f["diff"]==3 for f in F]}
    lz={}
    for k,d in lazy.items():
        d=np.array(d,bool); lz[k]=round(d[y==1].mean()-d[y==0].mean(),2)
    # ---------- 5. PARITY & PLAUSIBILITY ----------
    dF=statistics.mean(c[6] for c in C if c[3]=="flawed"); dS=statistics.mean(c[6] for c in C if c[3]=="sound")
    nums_board={str(v) for l in SALES["stalls"].values() for v in l}
    times_board=set()
    for s_,e_,_ in E.values():
        for m in (s_,e_): times_board.add(f"{m//60}:{m%60:02d}")
    implaus=[]
    for c in C:
        if c[3]!="flawed": continue
        for n in re.findall(r"\d+:\d\d|\d+",c[7]):
            if ":" in n and n not in times_board: implaus.append((c[0],n))
            if ":" not in n and n not in nums_board: implaus.append((c[0],n))
    per_board={b:(sum(1 for c in C if c[1]==b and c[3]=="flawed"),sum(1 for c in C if c[1]==b)) for b in ("sales","times","map")}
    # ---------- 6. ORDER ATTACK (display order must not leak the pattern) ----------
    byid={c[0]:c for c in C}; seq=[1 if byid[i][3]=="flawed" else 0 for i in ORDER]
    assert sorted(ORDER)==sorted(byid), "ORDER must list every claim once"
    par=max(np.mean([s==(k%2) for k,s in enumerate(seq)]),np.mean([s!=(k%2) for k,s in enumerate(seq)]))
    alt=np.mean([seq[k]!=seq[k-1] for k in range(1,len(seq))]); same=1-alt
    run=max(len(list(g_)) for _,g_ in itertools.groupby(seq))
    # ---------- REPORT ----------
    print("solver/readability errors:", errs or "none")
    print(f"reading grade (Flesch-Kincaid) ~ {fk:.1f}; max words {max(len(c[7].split()) for c in C)}")
    print("best single-cue accuracy:", {k:round(v,2) for k,v in sorted(single.items(),key=lambda x:-x[1])[:5]})
    print("source split (flawed/sound):", {s:(v.count('flawed'),v.count('sound')) for s,v in src.items()})
    print(f"board-fold logistic (all surface features): {bcv:.2f}  | LOOCV logistic {lr:.2f} (below-chance = balance artefact)  | LOOCV naive-Bayes words {nb:.2f}   [chance 0.50; pass <= 0.625]")
    print("lazy strategies (hit - false alarm, pass |x| <= 0.17):", lz)
    print(f"difficulty flawed {dF:.2f} vs sound {dS:.2f}; per board {per_board}; implausible flawed numbers: {implaus or 'none'}")
    fails=[k for k,v in single.items() if v>0.625]+(["logreg"] if max(lr,bcv)>0.625 else [])+(["nb"] if nb>0.625 else [])+[k for k,v in lz.items() if abs(v)>0.17]
    if abs(dF-dS)>0.25: fails.append("difficulty parity")
    if implaus: fails.append("implausible numbers")
    print(f"order attack: parity guess {par:.2f}, opposite-of-last {alt:.2f}, same-as-last {same:.2f}, longest run {run}  [pass <= 0.625, run <= 3]")
    if par>0.625 or alt>0.625 or same>0.625 or run>3: fails.append("order")
    print("VERDICT:", "PASS" if not (errs or fails) else f"FAIL {fails}")
    _ok = not (errs or fails)
    # ---------- 7. SKIMMER ATTACK (glances at the board, doesn't really read it) ----------
    board_words={"sales":set(SALES["stalls"])|set(SALES["days"])|{"sunday","saturday","friday","sunny","rain","plant","badge","cake"},
                 "times":set(E)|{e[2] for e in E.values()}|{"sunday"},"map":{w for r in MAP["grid"] for w in r}}
    board_nums={"sales":nums_board,"times":times_board,"map":set()}
    def skim_num(c):   # agree if every number/time in the claim appears somewhere on the board
        ns=re.findall(r"\d+:\d\d|\d+",c[7]); return (not ns) or all(n in board_nums[c[1]] for n in ns)
    def skim_word(c):  # agree if the claim names things that are on the board
        t=c[7].lower(); hits=sum(1 for w in board_words[c[1]] if w in t); return hits>=2
    for name,f in [("skim: numbers look familiar",skim_num),("skim: names look familiar",skim_word)]:
        agree=np.array([f(c) for c in C]); doubt=~agree
        acc=doubt[y==1].mean()-doubt[y==0].mean(); print(f"{name}: hit - false alarm = {acc:+.2f}  [pass |x| <= 0.17]")
        if abs(acc)>0.17: print("VERDICT: FAIL skimmer"); _ok = False
    _overall.append(_ok)
  print("\nALL FORMS PASS" if all(_overall) else "\nSTRESS TEST FAILED")
  sys.exit(0 if all(_overall) else 1)
