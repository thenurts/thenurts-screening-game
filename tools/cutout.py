# Magenta-key prop sheet -> trimmed WebP cutouts (row-major). Usage: python3 tools/cutout.py sheet.png outdir [--grid CxR] name:size ...
# --grid groups every piece inside one grid cell into one cutout (keeps raindrops, sparkle ticks etc. with their icon).
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, out, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
grid = None
if specs and specs[0] == '--grid': grid = tuple(int(v) for v in specs[1].split('x')); specs = specs[2:]
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
key = np.minimum(R, B) - G
alpha = np.clip((215 - key) / 140, 0, 1)
# despill: pull magenta out of semi-transparent edges
spill = np.clip(np.minimum(R, B) - G, 0, None) * (1 - alpha)
rgb = a.copy(); rgb[..., 0] -= spill; rgb[..., 2] -= spill; rgb = np.clip(rgb, 0, 255)
mask = alpha > 0.5
lab, n = ndimage.label(ndimage.binary_closing(mask, iterations=3))
objs = [(s, (lab[s] == i + 1).sum()) for i, s in enumerate(ndimage.find_objects(lab))]
objs = [s for s, px in objs if px > (150 if grid else 2000)]
H = a.shape[0]
if grid:
    gc, gr = grid; cw, ch = a.shape[1] / gc, H / gr; cells = {}
    for s in objs:
        key = (int((s[0].start + s[0].stop) / 2 // ch), int((s[1].start + s[1].stop) / 2 // cw)); b = cells.get(key)
        cells[key] = s if b is None else (slice(min(b[0].start, s[0].start), max(b[0].stop, s[0].stop)), slice(min(b[1].start, s[1].start), max(b[1].stop, s[1].stop)))
    objs = [cells[k] for k in sorted(cells)]
else: objs.sort(key=lambda s: (int((s[0].start + s[0].stop) / 2 // (H / 2)), s[1].start))
assert len(objs) == len(specs), f'found {len(objs)} objects, expected {len(specs)}'
rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
for s, spec in zip(objs, specs):
    name, size = spec.split(':'); size = int(size)
    y0, y1 = max(s[0].start - 8, 0), min(s[0].stop + 8, H); x0, x1 = max(s[1].start - 8, 0), min(s[1].stop + 8, a.shape[1])
    im = Image.fromarray(rgba[y0:y1, x0:x1]); k = size / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    im.save(f'{out}/{name}.webp', quality=85, method=6); print(name, im.size)
