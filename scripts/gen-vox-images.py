"""
gen-vox-images.py — generate beat images for a vox-config via NVIDIA Flux 2 klein.
Reads a vox-config JSON, generates one image per beat that has an `imagePrompt`,
writing to public/<beat.image>. Skips existing files.

Usage:
  python scripts/gen-vox-images.py vox-config.single-dad-dilemma.json
"""
import requests, base64, os, sys, time, json

ROOT = os.path.join(os.path.dirname(__file__), "..")
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:
    pass

API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY:
    print("ERROR: NVIDIA_API_KEY not found"); sys.exit(1)

INVOKE_URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

# Flux is bad at rendering text — suppress it in every prompt so Remotion handles all text.
NO_TEXT_SUFFIX = ", no text, no words, no letters, no writing, no typography, no labels, no captions, no titles"

cfg_path = sys.argv[1] if len(sys.argv) > 1 else "vox-config.single-dad-dilemma.json"
with open(os.path.join(ROOT, cfg_path), "r", encoding="utf-8") as f:
    cfg = json.load(f)

targets = [(img["path"], img["prompt"]) for b in cfg["beats"] for img in b.get("images", []) if img.get("path") and img.get("prompt")]
print(f"{len(targets)} images to generate from {cfg_path}")

def gen(rel_path, prompt):
    out = os.path.join(ROOT, "public", rel_path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and os.path.getsize(out) > 10000:
        print(f"  [SKIP] {rel_path}"); return True
    payload = {"prompt": prompt + NO_TEXT_SUFFIX, "width": 1024, "height": 1024, "steps": 4}
    headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
    for attempt in range(1, 4):
        try:
            print(f"  [{rel_path}] attempt {attempt}", flush=True)
            r = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                arts = r.json().get("artifacts") or []
                b64 = arts[0].get("base64") if arts else None
                if b64:
                    with open(out, "wb") as fh:
                        fh.write(base64.b64decode(b64))
                    print(f"    [OK] {os.path.getsize(out)/1024:.0f} KB"); return True
            print(f"    [ERR] HTTP {r.status_code}: {r.text[:140]}")
        except Exception as e:
            print(f"    [ERR] {e}")
        time.sleep(8 * attempt)
    return False

ok = 0
for i, (rel, prompt) in enumerate(targets):
    if gen(rel, prompt): ok += 1
    if i < len(targets) - 1: time.sleep(3)

# reconcile: drop image entries whose file didn't generate, so the renderer
# never references a missing file (that beat just renders text-only).
def exists(rel):
    p = os.path.join(ROOT, "public", rel)
    return os.path.exists(p) and os.path.getsize(p) > 8000

dropped = 0
for b in cfg["beats"]:
    keep = []
    for img in b.get("images", []):
        if img.get("path") and exists(img["path"]):
            keep.append(img)
        else:
            dropped += 1
    b["images"] = keep
if dropped:
    with open(os.path.join(ROOT, cfg_path), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"  reconciled: dropped {dropped} missing image(s)")

print(f"\nDONE: {ok}/{len(targets)}")
