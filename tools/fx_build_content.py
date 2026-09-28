# Builds src/modules/fix-it-kit/content.json from tests/fixit-reference.py (the stress-tested rule engine) plus the
# practice and blocked-moment text below (same data as the Game Ideas thread's fixit-content.json v1.0).
# Run: python3 tools/fx_build_content.py [out.json]
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location('fx', 'tests/fixit-reference.py'); fx = importlib.util.module_from_spec(spec); spec.loader.exec_module(fx)
out = {"version": "1.0", "date": "2026-09-27", "tries": fx.TRIES, "countMax": fx.COUNT_MAX,
       "kit": {k: {"name": n, "chips": c, "everydayUse": c[0]} for k, (n, c) in fx.KIT.items()},
       "problems": {pid: {"form": p["form"], "title": p["title"], "job": p["job"], "block": p.get("block"),
                          "fixes": [{"objects": {o: sorted(ch) for o, ch in d.items()}, "mechanism": m, "tier": t, "line": l} for d, m, t, l in p["fixes"]]}
                    for pid, p in fx.PROBLEMS.items()},
       "practice": {"title": "The bench is too hot to sit on!", "job": "Make it OK to sit", "kit": ["U", "B", "W", "R"],
                    "fixes": [{"objects": {"B": ["carry things", "flat when folded", "stiff"]}, "mechanism": "sit on the box", "tier": 0, "line": "Sit on the folded box: cool!"},
                              {"objects": {"U": ["keeps you dry", "opens wide"]}, "mechanism": "shade the bench", "tier": 0, "line": "Shade the bench with the umbrella!"},
                              {"objects": {"W": ["for drinking", "heavy when full"]}, "mechanism": "cool it with water", "tier": 0.5, "line": "Splash water on the bench to cool it!"}],
                    "target": 2},
       "blocks": {"A2": "Oh no! Someone borrowed the umbrella for the rain.", "B2": "Oh no! The hair clips went missing."},
       "rejectedForReview": fx.REJECTED_REVIEW}
dest = sys.argv[1] if len(sys.argv) > 1 else 'src/modules/fix-it-kit/content.json'
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print('wrote', dest)
