"""
Generate chapter accent images from scene-prompts-accent.txt
Each line = one prompt = one transparent cutout (chapter-acc-00.png, chapter-acc-01.png, ...)
Uses NVIDIA Flux 2 klein API
"""

import requests
import base64
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY:
    print("ERROR: NVIDIA_API_KEY not found in environment or .env")
    sys.exit(1)

INVOKE_URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
OUTPUT_FOLDER = os.path.join(os.path.dirname(__file__), "..", "public", "scenes")
INPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "scene-prompts-accent.txt")

MAX_RETRIES = 3
RETRY_DELAY = 15
BETWEEN_DELAY = 5

def log(msg):
    print(msg, flush=True)

def get_pixel_art_quality():
    return ""

def generate_accent_image(index, prompt):
    scene_number = index
    filename = f"chapter-acc-{scene_number:02d}.png"
    filepath = os.path.join(OUTPUT_FOLDER, filename)

    if os.path.exists(filepath) and os.path.getsize(filepath) > 10000:
        log(f"  [SKIP] {filename} already exists ({os.path.getsize(filepath)/1024:.0f} KB)")
        return True

    # Flux is bad at rendering text — suppress it so Remotion handles all on-screen text.
    NO_TEXT = "no text, no words, no letters, no writing, no typography, no labels, no captions, no titles"
    enhanced = f"{prompt} - isolated subject, transparent background, sharp edges, high contrast, 8K quality, no watermark, {NO_TEXT}"

    payload = {
        "prompt": enhanced,
        "width": 1024,
        "height": 1024,
        "steps": 4,
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Accept": "application/json",
    }

    log(f"[ACCENT {scene_number:02d}] Generating...")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log(f"  Attempt {attempt}/{MAX_RETRIES}...")
            resp = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
            if resp.status_code == 200:
                data = resp.json()
                artifacts = data.get("artifacts")
                if artifacts and len(artifacts) > 0:
                    b64 = artifacts[0].get("base64")
                    if b64:
                        img_bytes = base64.b64decode(b64)
                        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
                        with open(filepath, "wb") as f:
                            f.write(img_bytes)
                        log(f"  [OK] {filename} saved ({len(img_bytes)/1024:.0f} KB)")
                        return True
            log(f"  [ERR] HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            log(f"  [ERR] {e} (attempt {attempt})")

        if attempt < MAX_RETRIES:
            wait = RETRY_DELAY * attempt
            log(f"  Retrying in {wait}s...")
            time.sleep(wait)

    return False

if __name__ == "__main__":
    log("=" * 60)
    log("Chapter Accent Image Generator (NVIDIA Flux 2)")
    log("=" * 60)

    if not os.path.exists(INPUT_FILE):
        log(f"Input file not found: {INPUT_FILE}")
        log("Run generate-prompts-from-srt.js first to create scene-prompts-accent.txt")
        sys.exit(1)

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    log(f"Loaded {len(lines)} accent prompts from {INPUT_FILE}")
    log(f"Output: {OUTPUT_FOLDER}")
    log("-" * 60)

    success = 0
    failed = []

    for i, prompt in enumerate(lines):
        log(f"\n[{i}/{len(lines) - 1}]")
        if generate_accent_image(i, prompt):
            success += 1
        else:
            failed.append(i)

        if i < len(lines) - 1:
            log(f"  Waiting {BETWEEN_DELAY}s...")
            time.sleep(BETWEEN_DELAY)

    log("\n" + "=" * 60)
    log("GENERATION COMPLETE")
    log("=" * 60)
    log(f"Success: {success}/{len(lines)}")
    if failed:
        log(f"Failed: {', '.join([f'{s:02d}' for s in failed])}")
    log(f"Output: {OUTPUT_FOLDER}")