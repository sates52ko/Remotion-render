"""
cutout.py — make transparent subject cut-outs from opaque Flux images (rembg).
Reads a vox-config JSON; for every beat that declares `imageCut`, loads its
`image`, removes the background, and writes the transparent PNG to public/<imageCut>.

Usage:
  python scripts/cutout.py vox-config.single-dad-dilemma.json
"""
import os, sys, json

ROOT = os.path.join(os.path.dirname(__file__), "..")
cfg_path = sys.argv[1] if len(sys.argv) > 1 else "vox-config.single-dad-dilemma.json"

with open(os.path.join(ROOT, cfg_path), "r", encoding="utf-8") as f:
    cfg = json.load(f)

jobs = [(img["path"], img["cut"]) for b in cfg["beats"] for img in b.get("images", []) if img.get("cut") and img.get("path")]
print(f"{len(jobs)} cut-outs to produce")
if not jobs:
    sys.exit(0)

from rembg import remove, new_session
from PIL import Image

# u2net_human_seg is better for people; u2netp is light/general. Use general u2net for mixed subjects.
session = new_session("u2net")

def trim_alpha(im, pad=12):
    """Crop to the visible (alpha>10) bounding box with a small pad."""
    bbox = im.split()[3].point(lambda a: 255 if a > 10 else 0).getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(im.width, r + pad); b = min(im.height, b + pad)
    return im.crop((l, t, r, b))

ok = 0
made = set()
for src_rel, cut_rel in jobs:
    src = os.path.join(ROOT, "public", src_rel)
    dst = os.path.join(ROOT, "public", cut_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getsize(dst) > 8000:
        print(f"  [SKIP] {cut_rel}"); ok += 1; made.add(cut_rel); continue
    if not os.path.exists(src):
        print(f"  [MISS src] {src_rel}"); continue
    try:
        img = Image.open(src).convert("RGBA")
        out = remove(img, session=session, post_process_mask=True)
        out = trim_alpha(out)
        out.save(dst)
        print(f"  [OK] {cut_rel} ({out.width}x{out.height})"); ok += 1; made.add(cut_rel)
    except Exception as e:
        print(f"  [ERR] {cut_rel}: {e}")

# reconcile: drop `cut` for any image whose cut file wasn't produced, so the
# renderer falls back to the opaque card instead of referencing a missing file.
changed = 0
for b in cfg["beats"]:
    for img in b.get("images", []):
        if img.get("cut") and img["cut"] not in made:
            del img["cut"]; changed += 1
if changed:
    with open(os.path.join(ROOT, cfg_path), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"  reconciled config: dropped {changed} missing cut ref(s)")

print(f"\nDONE: {ok}/{len(jobs)}")
