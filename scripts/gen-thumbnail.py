"""
gen-thumbnail.py — generate the thumbnail hero image (Flux) + cut-out (rembg)
from a youtube-meta.<slug>.json thumbnail brief.

MODES:
  Single-image mode (default, backward-compatible):
    python scripts/gen-thumbnail.py books/<slug>/youtube-meta.json [--candidates=N]
    Generates one hero image from thumbnail.subject + style rotation.
    --candidates=N generates N images and picks the sharpest (legacy).

  Art-Director mode (new, recommended):
    python scripts/gen-thumbnail.py books/<slug>/youtube-meta.json --concepts=books/<slug>/thumbnail-concepts.json
    Generates one image per concept using each concept's pre-built fluxPrompt.
    No sharpness selection (thumbnail-critic.js handles winner selection).
    Use --winner-only to generate only the winning concept's cutout after critic runs.
"""
import requests, base64, os, sys, time, json, hashlib, re

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

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

# ── DIVERSE PROMPT STYLES FOR HIGH-CTR YOUTUBE ─────────────────────────────
# Engineered for YouTube browse feed (high contrast, rim lighting, 16:9 composition)
FLUX_STYLES = [
    "cinematic film still, 35mm photography, dramatic side key lighting, deep shadow on left side, intense rim lighting on subject, photorealistic, sharp focus, 8k",
    "moody dark cinematic portrait, high contrast Chiaroscuro, deep blacks, striking intense eye contact, vivid rim light, shallow depth of field, anamorphic lens",
    "stark high-contrast documentary still, rich saturated color accents, single powerful dramatic spotlight, dark negative space on left, award-winning cinematography",
    "dramatic film noir lighting, golden hour rim backlight, deep moody atmospheric background, sharp micro-contrast, cinematic poster quality",
    "intense cinematic close-up, dramatic split lighting, volumetric fog, vivid accent glow, photorealistic textures, 8k masterpiece",
]

def slug_hash(s):
    h = int(hashlib.md5(s.encode()).hexdigest(), 16)
    return h / (2**128)

def pick_style(slug):
    """Deterministic style from slug so it's repeatable but distributed."""
    idx = int(slug_hash(slug) * len(FLUX_STYLES))
    return FLUX_STYLES[idx % len(FLUX_STYLES)]

# ── ARGS ─────────────────────────────────────────────────────────────────────
candidates = 1
meta_path = None
concepts_path = None   # Art-Director mode: path to thumbnail-concepts.json
winner_only = False    # Only generate the winner concept's cutout (post-critic)

for arg in sys.argv[1:]:
    if arg.startswith("--candidates="):
        candidates = int(arg.split("=")[1])
    elif arg.startswith("--concepts="):
        concepts_path = arg.split("=", 1)[1]
    elif arg == "--winner-only":
        winner_only = True
    else:
        meta_path = arg

if not meta_path:
    print("Usage: python scripts/gen-thumbnail.py <meta-json> [--candidates=N] [--concepts=<path>] [--winner-only]")
    sys.exit(1)

with open(os.path.join(ROOT, meta_path), "r", encoding="utf-8") as f:
    meta = json.load(f)

thumb = meta.get("thumbnail") or {}
subject = thumb.get("subject")

# Extract slug from path for style rotation
slug = meta_path.split("/")[-1].replace("youtube-meta.", "").replace(".json", "")
if "slug" in meta:
    slug = meta["slug"]
elif "slug" in thumb:
    slug = thumb["slug"]

# Default to art-director mode if thumbnail-concepts.json exists
if not concepts_path and slug:
    auto_concepts = os.path.join(ROOT, "books", slug, "thumbnail-concepts.json")
    if os.path.exists(auto_concepts):
        concepts_path = os.path.relpath(auto_concepts, ROOT).replace("\\", "/")
        print(f"  [Default Thumbnail System] Found {concepts_path}")

# ── ART-DIRECTOR MODE ─────────────────────────────────────────────────────────
# When --concepts=<path> is passed, generate one image per concept using
# the concept's pre-built fluxPrompt. Each concept image lands at concept.imagePath.
# Winner selection is handled by thumbnail-critic.js (no sharpness picking here).
if concepts_path:
    print(f"\n[Art-Director Mode] Generating concept images from: {concepts_path}")
    with open(os.path.join(ROOT, concepts_path), "r", encoding="utf-8") as f:
        concepts_doc = json.load(f)
    concepts = concepts_doc.get("concepts", [])
    if not concepts:
        print("  [WARN] No concepts found in concepts file."); sys.exit(1)

    # If --winner-only, filter to just the winner (for cutout after critic runs)
    winner_id = (concepts_doc.get("winner") or {}).get("conceptId")
    if winner_only:
        if winner_id:
            concepts = [c for c in concepts if c.get("conceptId") == winner_id]
            print(f"  [winner-only] Generating cutout for winner: {winner_id}")
        else:
            print("  [WARN] --winner-only requested but no winner set. Run thumbnail-critic.js first."); sys.exit(1)

    succeeded = 0
    for concept in concepts:
        c_id = concept.get("conceptId", "unknown")
        flux_prompt = concept.get("fluxPrompt", "")
        img_rel = concept.get("imagePath", f"scenes/{slug}/thumbnail-concept-{c_id}.png")

        if not flux_prompt:
            print(f"  [SKIP] {c_id}: no fluxPrompt"); continue

        # Safety-sanitize the prompt (same FILTER_REPLACEMENTS as single-image mode)
        for pattern, repl in [
            (r"\bhotel lounge\b", "grand estate library"), (r"\blounge\b", "grand interior hall"),
            (r"\bboudoir\b", "private study"), (r"\bbedroom\b", "study room"),
            (r"\bbed\b", "interior"), (r"\bnaked\b", ""), (r"\bnude\b", ""),
            (r"\bblood\b", "shadows"), (r"\bkill\b", "confront"),
        ]:
            flux_prompt = re.sub(pattern, repl, flux_prompt, flags=re.IGNORECASE)

        # Hard cap 800 chars (NVIDIA endpoint rejects longer)
        if len(flux_prompt) > 800:
            flux_prompt = flux_prompt[:798]

        print(f"\n  [{c_id}] hook: {concept.get('hook','')}")
        print(f"  [{c_id}] layout: {concept.get('layout','')}")
        print(f"  [{c_id}] prompt: {flux_prompt[:100]}...")

        out_abs = os.path.join(ROOT, "public", img_rel)
        os.makedirs(os.path.dirname(out_abs), exist_ok=True)

        headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
        # Post-critic mode should only make a cut-out. Reusing the inspected
        # source prevents an unnecessary sixth API image and keeps the winner
        # exactly the pixels that the critic evaluated.
        ok = winner_only and os.path.exists(out_abs)
        if ok:
            print(f"  [{c_id}] reusing inspected candidate -> {img_rel}")
        else:
            for attempt in range(1, 4):
                try:
                    print(f"  [{c_id}] attempt {attempt}", flush=True)
                    payload = {"prompt": flux_prompt, "width": 1344, "height": 768, "steps": 4}
                    r = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
                    if r.status_code == 200:
                        arts = r.json().get("artifacts") or []
                        if arts:
                            finish = arts[0].get("finishReason")
                            if finish == "CONTENT_FILTERED":
                                print(f"  [{c_id}] FILTERED attempt {attempt}, using safe fallback...")
                                flux_prompt = f"dramatic cinematic scene, {slug.replace('-',' ')} theme, 35mm film still, chiaroscuro lighting, deep shadows on left side, 8k, no text"
                                time.sleep(2); continue
                            b64 = arts[0].get("base64")
                            if b64:
                                with open(out_abs, "wb") as fh:
                                    fh.write(base64.b64decode(b64))
                                print(f"  [{c_id}] OK -> {img_rel} ({os.path.getsize(out_abs)//1024} KB)")
                                ok = True; break
                    print(f"  [{c_id}] HTTP {r.status_code}: {r.text[:80]}")
                except Exception as e:
                    print(f"  [{c_id}] ERR: {e}")
                time.sleep(4 * attempt)

        if ok:
            succeeded += 1
            # Cutout for winner-only or explicitly the winning concept
            if winner_only or concept.get("conceptId") == winner_id:
                cut_rel_c = concept.get("cutPath", img_rel.replace(".png", "-cut.png"))
                try:
                    from rembg import remove, new_session
                    from PIL import Image
                    subj_text = concept.get("visualSubject", "")
                    model = "u2net_human_seg" if any(k in subj_text.lower() for k in ["woman","man","girl","boy","person","face","child","warrior","soldier","philosopher"]) else "u2net"
                    session = new_session(model)
                    img = Image.open(out_abs).convert("RGBA")
                    out_cut = remove(img, session=session, post_process_mask=True)
                    bbox = out_cut.split()[3].point(lambda a: 255 if a > 10 else 0).getbbox()
                    if bbox:
                        pad = 16
                        l, t, r2, b2 = bbox
                        out_cut = out_cut.crop((max(0,l-pad),max(0,t-pad),min(out_cut.width,r2+pad),min(out_cut.height,b2+pad)))
                    dst = os.path.join(ROOT, "public", cut_rel_c)
                    out_cut.save(dst)
                    print(f"  [{c_id}] cutout OK → {cut_rel_c}")
                except Exception as e:
                    print(f"  [{c_id}] cutout warn: {e}")

    print(f"\n[Art-Director Mode] Done: {succeeded}/{len(concepts)} concepts generated.")
    print(f"  Next: node scripts/thumbnail-critic.js --slug={slug}")
    sys.exit(0 if succeeded > 0 else 1)

# ── SINGLE-IMAGE MODE (legacy, backward-compatible) ───────────────────────────
# Ensure valid subject fallback if missing
if not subject:
    title_str = meta.get("title") or slug.replace("-", " ").title()
    subject = f"dramatic cinematic scene representing '{title_str}', intense emotional character"

# Normalise image path (ensure it is under scenes/<slug>/)
img_rel = thumb.get("image")
if not img_rel or img_rel.startswith("out/"):
    img_rel = f"scenes/{slug}/thumbnail-hero.png"
    thumb["image"] = img_rel

cut_rel = thumb.get("cut")

style = thumb.get("fluxStyle") or pick_style(slug)
print(f"  slug: {slug}")
print(f"  style: {style}")
print(f"  subject: {subject}")

FILTER_REPLACEMENTS = [
    (r"\bhotel lounge\b", "grand estate library"),
    (r"\blounge\b", "grand interior hall"),
    (r"\bboudoir\b", "private study"),
    (r"\bbedroom\b", "study room"),
    (r"\bbed\b", "interior"),
    (r"\bnaked\b", ""),
    (r"\bnude\b", ""),
    (r"\bblood\b", "shadows"),
    (r"\bkill\b", "confront"),
]

def sanitize_subject(text):
    out = text
    for pattern, repl in FILTER_REPLACEMENTS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return out.strip()

# PERIOD ANCHOR — same fix as plan-vox's imagePrompt(). Flux defaults to the
# present day, so a "Bronze Age warrior" came back in medieval plate armour next
# to a man in a modern jacket. books/<slug>/story-bible.json already records the
# book's era; put it in the prompt (and repeat it at the end, where a long
# prompt would otherwise dilute it). No bible / no era -> unchanged behaviour.
period = ""
try:
    with open(f"books/{slug}/story-bible.json", encoding="utf-8") as bf:
        world = (json.load(bf) or {}).get("world") or {}
    period = world.get("imageStyle") or (
        f"set in {world['era']}, historically accurate costume, materials and props for that period, "
        "no modern clothing, no modern objects, no anachronisms" if world.get("era") else ""
    )
except (OSError, ValueError, KeyError):
    period = ""
if period:
    print(f"  period: {period[:90]}...")

# 16:9 widescreen composition: subject on right side / center-right, negative space / deep shadow on left for typography
sanitized_subj = sanitize_subject(subject)
era_head = f"{period}. " if period else ""
# Short tail, not a second full clause: the endpoint rejects prompts over 800
# chars outright (HTTP 422 string_too_long) and the hero then fails every retry.
era_tail = ", period-accurate, no anachronisms" if period else ""
prompt = f"{sanitized_subj}, cinematic wide shot, subject framed on right side with dark atmospheric negative space on left side. {era_head}{style}, eye-catching YouTube thumbnail composition, no watermark, 8k" + NO_TEXT_SUFFIX + era_tail
if len(prompt) > 800:  # trim the style tail, never the subject
    prompt = prompt[:800 - len(era_tail) - 1].rsplit(",", 1)[0] + era_tail
print(f"  prompt: {prompt[:120]}...")

def gen(rel, prompt, tag="hero"):
    out = os.path.join(ROOT, "public", rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    current_prompt = prompt
    headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
    for attempt in range(1, 5):
        try:
            print(f"[{tag}] attempt {attempt}", flush=True)
            payload = {"prompt": current_prompt, "width": 1344, "height": 768, "steps": 4}
            r = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                arts = r.json().get("artifacts") or []
                if arts:
                    finish = arts[0].get("finishReason")
                    if finish == "CONTENT_FILTERED":
                        print(f"  [FILTERED] prompt hit safety filter on attempt {attempt}, falling back...")
                        if attempt == 1:
                            clean_subj = sanitize_subject(subject.split(",")[0].replace("flat-vector", "").strip())
                            current_prompt = f"dramatic cinematic shot of {clean_subj}, framed on right side with dark moody negative space on left, 35mm film photography, high contrast lighting, photorealistic, 8k" + NO_TEXT_SUFFIX
                        elif attempt == 2:
                            title_clean = meta.get("title") or slug.replace("-", " ").title()
                            current_prompt = f"dramatic cinematic atmosphere inspired by {title_clean}, wide shot, chiaroscuro lighting, deep shadows on left side, 35mm film still, 8k" + NO_TEXT_SUFFIX
                        else:
                            current_prompt = "dramatic vintage cinematic book scene, atmospheric rim lighting, deep shadows, 35mm photography, 8k" + NO_TEXT_SUFFIX
                        time.sleep(2)
                        continue
                    b64 = arts[0].get("base64")
                    if b64:
                        with open(out, "wb") as fh:
                            fh.write(base64.b64decode(b64))
                        print(f"  [OK] {rel} ({os.path.getsize(out)/1024:.0f} KB)"); return True
            print(f"  [ERR] HTTP {r.status_code}: {r.text[:140]}")
        except Exception as e:
            print(f"  [ERR] {e}")
        time.sleep(4 * attempt)
    return False

def image_sharpness(path):
    """Laplacian variance — higher = sharper."""
    try:
        from PIL import Image, ImageFilter
        import numpy as np
        img = Image.open(path).convert("L")
        arr = np.array(img.filter(ImageFilter.Kernel((3,3), [-1,-1,-1,-1,8,-1,-1,-1,-1], scale=1, offset=128)))
        return float(arr.var())
    except Exception:
        return 0

if candidates > 1:
    print(f"\nGenerating {candidates} candidates, will auto-pick sharpest...\n")
    best_path = None
    best_score = -1
    for c in range(candidates):
        suffix = f"_candidate_{c}"
        cand_rel = img_rel.replace(".png", f"{suffix}.png")
        if gen(cand_rel, prompt, tag=f"candidate-{c}"):
            cand_path = os.path.join(ROOT, "public", cand_rel)
            score = image_sharpness(cand_path)
            print(f"  sharpness[{c}]: {score:.1f}")
            if score > best_score:
                best_score = score
                best_path = cand_path
    if best_path:
        import shutil
        final = os.path.join(ROOT, "public", img_rel)
        shutil.copy2(best_path, final)
        print(f"\n  [PICK] best candidate → {img_rel} (sharpness={best_score:.1f})")
        # clean up candidates
        for c in range(candidates):
            suffix = f"_candidate_{c}"
            cand = os.path.join(ROOT, "public", img_rel.replace(".png", f"{suffix}.png"))
            if os.path.exists(cand):
                os.remove(cand)
    else:
        print("All candidates failed"); sys.exit(1)
else:
    if not gen(img_rel, prompt):
        print("hero generation failed"); sys.exit(1)

# ── CUT-OUT ──────────────────────────────────────────────────────────────────
if cut_rel:
    try:
        from rembg import remove, new_session
        from PIL import Image
        # u2net_human_seg is better for people; u2net for mixed subjects
        model = "u2net_human_seg" if any(k in subject.lower() for k in ["woman", "man", "girl", "boy", "person", "face", "child", "warrior", "soldier"]) else "u2net"
        print(f"  cutout model: {model}")
        session = new_session(model)
        img = Image.open(os.path.join(ROOT, "public", img_rel)).convert("RGBA")
        out = remove(img, session=session, post_process_mask=True)
        # trim to subject bbox with padding
        bbox = out.split()[3].point(lambda a: 255 if a > 10 else 0).getbbox()
        if bbox:
            pad = 16
            l, t, r, b = bbox
            l = max(0, l - pad); t = max(0, t - pad)
            r = min(out.width, r + pad); b = min(out.height, b + pad)
            out = out.crop((l, t, r, b))
        dst = os.path.join(ROOT, "public", cut_rel)
        out.save(dst)
        print(f"  [OK] cutout {cut_rel} ({out.width}x{out.height})")
    except Exception as e:
        print(f"  [WARN] cutout failed ({e}); thumbnail will use the full hero image.")

try:
    with open(os.path.join(ROOT, meta_path), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
except Exception:
    pass

print("DONE")
