"""
generate-assets.py - Antidote 2.0 Pilot (2026-11-24): bespoke Flux 16:9 illustrations + contact sheet.
Reads scripts/antidote-v2-pilot/prompts.json. NVIDIA_API_KEY read in place from main checkout .env
(never copied, never printed). Cache: unchanged prompt hash is never regenerated.
  python scripts/antidote-v2-pilot/generate-assets.py [--sheet=<png>] [--only=s1_fast_grin,s2_warm_chat]
"""
import os, sys, json, time, base64, hashlib, subprocess, re
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
args = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
ONLY = set(args["only"].split(",")) if args.get("only") else None

prompts_path = args.get("prompts") or os.path.join(HERE, "prompts.json")
if not os.path.isabs(prompts_path):
    prompts_path = os.path.join(ROOT, prompts_path) if os.path.exists(os.path.join(ROOT, prompts_path)) else os.path.join(HERE, prompts_path)
P = json.load(open(prompts_path, encoding="utf-8"))
OUT = os.path.join(ROOT, "public", P["outDir"])
os.makedirs(OUT, exist_ok=True)
REP = os.path.join(OUT, "assets.report.json")
rep = json.load(open(REP, encoding="utf-8")) if os.path.exists(REP) else {"images": {}}

if not os.environ.get("NVIDIA_API_KEY"):
    common = subprocess.check_output(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=ROOT, text=True
    ).strip()
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(common), ".env"), override=False)

KEY = os.environ.get("NVIDIA_API_KEY")
if not KEY:
    print("ERROR: NVIDIA_API_KEY not found (operator provides it)")
    sys.exit(1)

URL = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b"
NO_TEXT = ""


def full_prompt(s):
    p = s["prompt"]
    for k, v in (P.get("characters") or {}).items():
        p = p.replace("{" + k + "}", v)
    for bad, good in (P.get("filterBlacklist") or {}).items():
        if bad.lower() in p.lower():
            p = re.sub(re.escape(bad), good, p, flags=re.IGNORECASE)
            print(f"  [blacklist] {bad!r} -> {good!r}")
    out = p + ". " + P["artLock"]
    if s.get("cutout"):
        out += ", isolated single subject centered with generous margin on pure flat solid white #FFFFFF seamless background, crisp ink outer contour, no cast shadow"
    out += NO_TEXT
    if len(out) > 800:
        raise SystemExit(f"prompt too long ({len(out)} > 800): {s.get('id')}")
    return out


def call(prompt, w, h):
    t0 = time.time()
    r = requests.post(
        URL,
        headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"},
        json={"prompt": prompt, "width": w, "height": h, "steps": 4},
        timeout=180,
    )
    dt = time.time() - t0
    if r.status_code == 200:
        a = (r.json().get("artifacts") or [{}])[0]
        if a.get("base64"):
            return base64.b64decode(a["base64"]), dt, "ok"
        return None, dt, a.get("finishReason") or "empty"
    return None, dt, f"HTTP {r.status_code}: {r.text[:160]}"


SIZES = [(1344, 768), (1024, 576)]
jobs = [(s["id"], full_prompt(s), s.get("mode", "scene"), bool(s.get("cutout"))) for s in P["scenes"]]
t_all = time.time()
calls = 0

for jid, prompt, _mode, is_cutout in jobs:
    if ONLY and jid not in ONLY:
        continue
    sha = hashlib.sha256(prompt.encode()).hexdigest()[:16]
    out = os.path.join(OUT, f"{jid}.png")
    prev = rep["images"].get(jid) or {}
    if os.path.exists(out) and prev.get("sha") == sha:
        print(f"[CACHE] {jid}")
        continue
    rec = {"sha": sha, "attempts": [], "prompt": prompt}
    data = None
    for w, h in SIZES:
        data, dt, why = call(prompt, w, h)
        calls += 1
        rec["attempts"].append({"size": f"{w}x{h}", "seconds": round(dt, 1), "result": why})
        print(f"[{jid}] {w}x{h} {why} {dt:.1f}s", flush=True)
        if data:
            if is_cutout:
                raw_out = os.path.join(OUT, f"{jid}.raw.png")
                with open(raw_out, "wb") as f:
                    f.write(data)
                subprocess.check_call([sys.executable, os.path.join(HERE, "cutout.py"), raw_out, out])
            else:
                with open(out, "wb") as f:
                    f.write(data)
            rec["size"] = f"{w}x{h}"
            rec["outcome"] = "ok"
            break
        if why == "CONTENT_FILTERED":
            rec["outcome"] = "filtered"
            for _ in range(2):
                data, dt, why = call(prompt, w, h)
                calls += 1
                rec["attempts"].append({"size": f"{w}x{h}", "seconds": round(dt, 1), "result": why})
                print(f"[{jid}] retry {why} {dt:.1f}s", flush=True)
                if data:
                    break
            if data:
                with open(out, "wb") as f:
                    f.write(data)
                rec["size"] = f"{w}x{h}"
                rec["outcome"] = "ok"
            break
        time.sleep(3)
    rep["images"][jid] = rec
    with open(REP, "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=2)
    time.sleep(1.5)

rep["lastRun"] = {"calls": calls, "seconds": round(time.time() - t_all, 1)}
with open(REP, "w", encoding="utf-8") as f:
    json.dump(rep, f, indent=2)

if args.get("sheet"):
    from PIL import Image, ImageDraw
    os.makedirs(os.path.dirname(os.path.abspath(args["sheet"])), exist_ok=True)
    tiles = [(s["id"], f"{s['id']}.png", s.get("mode", "scene")) for s in P["scenes"]]
    TW, TH, cols = 480, 270, 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * TW, rows * (TH + 28)), (235, 230, 220))
    d = ImageDraw.Draw(sheet)
    for i, (jid, fn, mode) in enumerate(tiles):
        x, y = (i % cols) * TW, (i // cols) * (TH + 28)
        p = os.path.join(OUT, fn)
        if os.path.exists(p):
            im = Image.open(p).convert("RGBA")
            im.thumbnail((TW - 8, TH - 8))
            bg = Image.new("RGBA", (TW - 8, TH - 8), (24, 28, 36, 255))
            bg.alpha_composite(im, ((TW - 8 - im.width) // 2, (TH - 8 - im.height) // 2))
            sheet.paste(bg.convert("RGB"), (x + 4, y + 4))
        else:
            d.rectangle([x + 4, y + 4, x + TW - 4, y + TH - 4], outline=(160, 40, 30), width=3)
            d.text((x + 20, y + 120), "MISSING", fill=(160, 40, 30))
        d.text((x + 8, y + TH + 6), f"{jid} · {mode}", fill=(20, 20, 20))
    sheet.save(args["sheet"])
    print("sheet:", args["sheet"])

print("calls:", calls, "seconds:", rep["lastRun"]["seconds"])
