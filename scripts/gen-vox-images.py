"""
gen-vox-images.py - generate beat images for a vox-config via NVIDIA Flux 2 klein.
Reads a vox-config JSON, generates one image per beat that has an `imagePrompt`,
writing to public/<beat.image>. Skips existing files.

Usage:
  python scripts/gen-vox-images.py books/<slug>/config.vox.json [options]

Options (cycle 8, 2026-11-02 - Hamnet: 58 of 221 images CONTENT_FILTERED; re-running make-book re-tried every one of
them although only 11 beats had new prompts):
  --beats=beat-012,beat-019   only these beats' images (every other image: ZERO Flux calls, nothing rewritten)
  --dry-run                   print the call plan (what would be generated / skipped and why) - no API call, no write
  --max-calls=N               stop after N Flux requests in this run (the rest: outcome "not-attempted-cap")
  --retry-failed              also retry images whose prompt is UNCHANGED since a failed attempt (default: never)
  --root=<checkout>           the checkout that holds the book (config, public/, images.report.json) - e.g. a pinned
                              book worktree run with current tools; default: this checkout

A failed image is recorded with the sha256 of its prompt (images.report.json). An unchanged prompt that failed is not
retried automatically: a CONTENT_FILTERED prompt fails the same way again and costs calls. A CHANGED prompt (the beat
was re-authored) is generated normally; a beat named with --beats is generated on purpose. Existing images (> 10 KB)
are always kept. This never searches for wording that passes the content filter: a filtered prompt is changed by its
author (a narration-grounded alternative). The in-run rewording below (_SOFTEN) is the pre-existing behaviour,
unchanged.
"""
import requests, base64, os, sys, time, json, hashlib

# ---- arguments (positional config path + --flags) ---------------------------------------------------------------------
_flags = {}
_pos = []
for a in sys.argv[1:]:
    if a.startswith("--"):
        k, eq, v = a[2:].partition("=")
        _flags[k] = v if eq else True
    else:
        _pos.append(a)
KNOWN = {"beats", "dry-run", "max-calls", "retry-failed", "root"}
_unknown = [k for k in _flags if k not in KNOWN]
if _unknown:
    print(f"ERROR: unknown option(s): {', '.join('--' + k for k in _unknown)} (known: {', '.join('--' + k for k in sorted(KNOWN))})"); sys.exit(2)
DRY = bool(_flags.get("dry-run"))
RETRY_FAILED = bool(_flags.get("retry-failed"))
if _flags.get("beats") is True:
    print("ERROR: --beats needs a list: --beats=beat-012,beat-019"); sys.exit(2)
SEL_BEATS = set(x.strip() for x in str(_flags["beats"]).split(",") if x.strip()) if "beats" in _flags else None
MAX_CALLS = None
if "max-calls" in _flags:
    try:
        MAX_CALLS = int(_flags["max-calls"])
        assert MAX_CALLS >= 0
    except Exception:
        print("ERROR: --max-calls needs a number >= 0"); sys.exit(2)

TOOLS_ROOT = os.path.join(os.path.dirname(__file__), "..")
ROOT = os.path.abspath(_flags["root"]) if isinstance(_flags.get("root"), str) else TOOLS_ROOT
if not os.path.isdir(ROOT):
    print(f"ERROR: --root {ROOT} is not a directory"); sys.exit(2)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT, ".env"))
except Exception:
    pass

def _main_checkout_env():
    # A book runs in its own worktree (../wt-book-<slug>, book-start.js); the operator's .env lives in the main
    # checkout only and is never copied (2026-10-26: their-eyes-were-watching-god stopped on "NVIDIA_API_KEY not found").
    # Read it in place - never copy it, never print it.
    try:
        import subprocess
        common = subprocess.check_output(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=ROOT, text=True).strip()
        p = os.path.join(os.path.dirname(common), ".env")
        return p if os.path.isfile(p) else None
    except Exception:
        return None

if not os.environ.get("NVIDIA_API_KEY"):
    main_env = _main_checkout_env()
    if main_env:
        try:
            from dotenv import load_dotenv
            load_dotenv(main_env, override=False)
            if os.environ.get("NVIDIA_API_KEY") and not DRY:
                print("NVIDIA_API_KEY: read from the main checkout's .env (not copied)")
        except Exception:
            pass

API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY and not DRY:
    print("ERROR: NVIDIA_API_KEY not found (not in the environment, this checkout's .env, or the main checkout's .env) - the operator provides it; never write it into a file"); sys.exit(1)

# FLUX_INVOKE_URL_FOR_TESTS: scripts/test-gen-vox-images.js points this at a local fake server to COUNT the calls
INVOKE_URL = os.environ.get("FLUX_INVOKE_URL_FOR_TESTS") or "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"

# Flux is bad at rendering text - suppress it in every prompt so Remotion handles all text.
NO_TEXT_SUFFIX = ", no text, no words, no letters, no writing, no typography, no labels, no captions, no titles"

cfg_path = _pos[0] if _pos else "vox-config.single-dad-dilemma.json"
with open(os.path.join(ROOT, cfg_path), "r", encoding="utf-8") as f:
    cfg = json.load(f)

targets = [(img["path"], img["prompt"]) for b in cfg["beats"] for img in b.get("images", []) if img.get("path") and img.get("prompt")]
beat_of = {img["path"]: b.get("id") for b in cfg["beats"] for img in b.get("images", []) if img.get("path")}
if SEL_BEATS is not None:
    unknown_beats = sorted(SEL_BEATS - set(b.get("id") for b in cfg["beats"]))
    if unknown_beats:
        print(f"ERROR: --beats names beat(s) not in {cfg_path}: {', '.join(unknown_beats)}"); sys.exit(2)
# one outcome record per image -> <config dir>/images.report.json (merged by path) - stdout alone was lost
records = {}
rep_path = os.path.join(os.path.dirname(os.path.abspath(os.path.join(ROOT, cfg_path))), "images.report.json")
prev = {}
if os.path.exists(rep_path):
    try:
        with open(rep_path, "r", encoding="utf-8") as f:
            prev = {r["path"]: r for r in (json.load(f).get("images") or []) if r.get("path")}
    except Exception:
        prev = {}

def prompt_sha(p):
    return hashlib.sha256(p.encode("utf-8")).hexdigest()[:16]

def image_ok(rel, minsize=10000):
    p = os.path.join(ROOT, "public", rel)
    return os.path.exists(p) and os.path.getsize(p) > minsize

def plan_of(rel, prompt):
    """why an image is (not) generated in this run - decided before any call"""
    if SEL_BEATS is not None and beat_of.get(rel) not in SEL_BEATS:
        return "not-selected"
    if image_ok(rel):
        return "skipped-existing"
    pr = prev.get(rel)
    if pr and pr.get("outcome") == "failed" and not RETRY_FAILED and SEL_BEATS is None:
        # the same prompt as the failed attempt (or a record from before prompt hashes existed): a re-try repeats the
        # refusal. Generated again only when the prompt changed, the beat is named with --beats, or --retry-failed.
        if pr.get("promptSha") == prompt_sha(prompt):
            return "skipped-failed-unchanged"
        if not pr.get("promptSha"):
            return "skipped-failed-unknown-prompt"
    return "generate"

plan = [(rel, prompt, plan_of(rel, prompt)) for rel, prompt in targets]
counts = {}
for _, _, why in plan:
    counts[why] = counts.get(why, 0) + 1
to_gen = [x for x in plan if x[2] == "generate"]
print(f"{len(targets)} images in {cfg_path} - plan: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) + (f" | max {MAX_CALLS} Flux call(s)" if MAX_CALLS is not None else "") + f" | at most {3 * len(to_gen)} Flux call(s) (3 attempts each)")
if DRY:
    for rel, _, why in plan:
        if why != "not-selected":
            print(f"  {why:30s} {beat_of.get(rel)}  {rel}")
    print("DRY RUN: no Flux call, nothing written.")
    sys.exit(0)

import re as _re

# After two CONTENT_FILTERED refusals, REWORD the trigger words - never delete them.
# Deleting "16-year-old girl" or "soldier" removes the SUBJECT: the image comes back
# as an anonymous adult in a room, which a muted viewer reads as someone else (a
# WRONG frame is worse than no frame). Each trigger maps to a neutral description
# of the same person / thing; violence becomes its aftermath.
_SOFTEN = [
    (r'\b\d{1,2}-year-old ((?:[A-Za-z]+ ){0,2})(girl|daughter)\b', r'\1young woman'),
    (r'\b\d{1,2}-year-old ((?:[A-Za-z]+ ){0,2})(boy|son)\b', r'\1young man'),
    (r'\b\d{1,2}-year-old\b', 'young'),
    (r'\b(teenage|adolescent) girl\b', 'young woman'),
    (r'\b(teenage|adolescent) boy\b', 'young man'),
    (r'\bgirl\b', 'young woman'), (r'\bboy\b', 'young man'),
    (r'\b(teenager|adolescent|child|minor)\b', 'young person'),
    (r'\b(Wehrmacht|Nazi|SS) (soldier|officer|troops)\b', 'man in a grey 1940s uniform'),
    (r'\b(soldiers|troops|infantry)\b', 'uniformed men'),
    (r'\b(soldier|officer|cadet)\b', 'uniformed man'),
    (r'\b(Wehrmacht|Nazi|SS)\b', '1940s German'),
    (r'\b(bombing|shelling|artillery fire|firestorm|air raid)\b', 'aftermath of destruction'),
    (r'\b(bomber|bombers)\b', 'aircraft'),
    (r'\b(rifle|pistol|gun|bayonet)\b', 'kit bag'),
    (r'\b(corpse|dead body|bodies)\b', 'empty coat on the ground'),
    (r'\b(blood|wound|wounded)\b', 'dust'),
    (r'\b(killing|murder|torture|execution)\b', 'aftermath'),
    (r'\b(dying|death)\b', 'stillness'),
]

def soften_prompt(prompt):
    """Reword content-filter trigger words, keeping who and what the image shows."""
    softened = prompt
    for pat, rep in _SOFTEN:
        softened = _re.sub(pat, rep, softened, flags=_re.IGNORECASE)
    return _re.sub(r'\s{2,}', ' ', softened).strip()

calls = 0

def gen(rel_path, prompt):
    global calls
    out = os.path.join(ROOT, "public", rel_path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    rec = {"path": rel_path, "beat": beat_of.get(rel_path), "attempts": 0, "filtered": 0, "promptSha": prompt_sha(prompt)}
    records[rel_path] = rec
    headers = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
    filtered_count = 0
    rec["outcome"] = "failed"
    for attempt in range(1, 4):
        if MAX_CALLS is not None and calls >= MAX_CALLS:
            if attempt == 1: rec["outcome"] = "not-attempted-cap"
            print(f"  [CAP] {rel_path}: --max-calls={MAX_CALLS} reached"); return False
        cur_prompt = prompt if filtered_count < 2 else soften_prompt(prompt)
        rec["attempts"] = attempt
        if filtered_count >= 2: rec["softenedPrompt"] = cur_prompt
        payload = {"prompt": cur_prompt + NO_TEXT_SUFFIX, "width": 1024, "height": 1024, "steps": 4}
        try:
            label = f"attempt {attempt}" + (" [softened]" if filtered_count >= 2 else "")
            print(f"  [{rel_path}] {label}", flush=True)
            calls += 1
            r = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                arts = r.json().get("artifacts") or []
                b64 = arts[0].get("base64") if arts else None
                if b64:
                    with open(out, "wb") as fh:
                        fh.write(base64.b64decode(b64))
                    rec["outcome"] = "ok"
                    print(f"    [OK] {os.path.getsize(out)/1024:.0f} KB"); return True
                finish = (arts[0].get("finishReason") or "") if arts else ""
                if finish == "CONTENT_FILTERED":
                    filtered_count += 1
                    rec["filtered"] = filtered_count
            print(f"    [ERR] HTTP {r.status_code}: {r.text[:140]}")
        except Exception as e:
            print(f"    [ERR] {e}")
        time.sleep(0 if os.environ.get("FLUX_INVOKE_URL_FOR_TESTS") else 8 * attempt)
    return False

ok = 0
for i, (rel, prompt, why) in enumerate(plan):
    if why == "not-selected":
        continue  # zero calls, the record is left exactly as it was
    if why == "skipped-existing":
        r = dict(prev.get(rel) or {"path": rel, "beat": beat_of.get(rel)})
        r["outcome"] = "skipped-existing"
        records[rel] = r
        print(f"  [SKIP] {rel}")
        ok += 1
        continue
    if why != "generate":
        print(f"  [SKIP] {rel}: {why} (change the prompt, name the beat with --beats, or --retry-failed)")
        continue  # the earlier failed record stays as it is
    if gen(rel, prompt): ok += 1
    if i < len(plan) - 1 and not os.environ.get("FLUX_INVOKE_URL_FOR_TESTS"): time.sleep(3)

# reconcile: drop image entries whose file didn't generate, so the renderer
# never references a missing file (that beat just renders text-only).
def exists(rel):
    p = os.path.join(ROOT, "public", rel)
    return os.path.exists(p) and os.path.getsize(p) > 8000

dropped = 0
for b in cfg["beats"]:
    if SEL_BEATS is not None and b.get("id") not in SEL_BEATS:
        continue  # --beats: an unselected beat is left exactly as it is
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

# write the per-image records (merged with earlier runs by path)
try:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for r in records.values():
        r["at"] = now
    prev.update(records)
    with open(rep_path, "w", encoding="utf-8") as f:
        json.dump({"note": "gen-vox-images.py: one record per image (outcome ok|failed|skipped-existing|not-attempted-cap; promptSha = sha256 of the prompt, first 16 hex)", "images": sorted(prev.values(), key=lambda r: r["path"])}, f, indent=2)
    failed = sum(1 for r in records.values() if r.get("outcome") == "failed")
    print(f"  images.report.json: {len(records)} record(s), {failed} failed")
except Exception as e:
    print(f"  [WARN] images.report.json not written: {e}")

print(f"\nDONE: {ok}/{len(targets)} | Flux calls this run: {calls}")
