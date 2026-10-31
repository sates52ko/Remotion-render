"""
Generate sample B-roll images for the Single Dad Dilemma Vox opening via NVIDIA Flux 2 klein.
Images are used as halftone-treated framed cards (no transparency required).
Output: public/scenes/single-dad-vox/<name>.png
"""
import requests, base64, os, sys, time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY:
    print("ERROR: NVIDIA_API_KEY not found"); sys.exit(1)

INVOKE_URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

# Flux is bad at rendering text — suppress it in every prompt so Remotion handles all text.
NO_TEXT_SUFFIX = ", no text, no words, no letters, no writing, no typography, no labels, no captions, no titles"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "scenes", "single-dad-vox")
os.makedirs(OUT, exist_ok=True)

IMAGES = {
    "dad-child": "cinematic portrait of a rugged single father in his early thirties gently holding his small child's hand, warm golden hour light, shallow depth of field, emotional film still, muted earthy tones",
    "football-stadium": "dramatic empty professional american football stadium at night under bright floodlights, cinematic wide shot, moody atmosphere, volumetric light, desaturated teal and amber",
    "defenses-man": "moody cinematic portrait of a lone man in his thirties standing with arms crossed in defensive guarded posture, dramatic single-source shadow, dark background, film noir lighting",
}

def gen(name, prompt):
    path = os.path.join(OUT, f"{name}.png")
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        print(f"[SKIP] {name}.png exists"); return True
    payload = {"prompt": prompt + " -- high detail, 8k, no watermark" + NO_TEXT_SUFFIX, "width": 1024, "height": 1024, "steps": 4}
    headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
    for attempt in range(1, 4):
        try:
            print(f"[{name}] attempt {attempt} ...", flush=True)
            r = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                arts = r.json().get("artifacts") or []
                b64 = arts[0].get("base64") if arts else None
                if b64:
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    print(f"  [OK] {name}.png ({os.path.getsize(path)/1024:.0f} KB)"); return True
            print(f"  [ERR] HTTP {r.status_code}: {r.text[:160]}")
        except Exception as e:
            print(f"  [ERR] {e}")
        time.sleep(8 * attempt)
    return False

if __name__ == "__main__":
    ok = 0
    for i, (name, prompt) in enumerate(IMAGES.items()):
        if gen(name, prompt): ok += 1
        if i < len(IMAGES) - 1: time.sleep(4)
    print(f"\nDONE: {ok}/{len(IMAGES)} -> {OUT}")
