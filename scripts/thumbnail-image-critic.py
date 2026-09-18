"""
thumbnail-image-critic.py — Real pixel-level analysis of thumbnail candidates.

Analyzes actual PNG files (not metadata) and returns a JSON score object
for each image. Called by thumbnail-critic.js via child_process.execSync.

Metrics (all computed from real pixels, no text proxies):
  visualQuality      — sharpness (Laplacian variance) + global contrast + brightness
  mobileReadability  — scores at 320×180 (browse card): contrast + large-region separation
  leftDarkness       — how dark the left 35% of the image is (text safe zone)
  faceProxy          — skin-tone pixel cluster in right 55% (human presence signal)
  colorfulness       — HSV saturation spread (visual energy)

Usage (called internally by thumbnail-critic.js):
  python scripts/thumbnail-image-critic.py <image_path> [<image_path2> ...]
  → prints JSON array of { "path": ..., "scores": { ... } }

All metrics are 0.0–1.0. Missing/corrupt images produce {"error": "..."}.
"""
import sys, json, os

def analyze(img_path):
    try:
        from PIL import Image, ImageFilter
        import numpy as np
    except ImportError:
        return {"error": "PIL/numpy not installed. Run: pip install Pillow numpy"}

    try:
        img = Image.open(img_path).convert("RGB")
    except Exception as e:
        return {"error": str(e)}

    w, h = img.size
    arr = np.array(img, dtype=np.float32)

    # ── 1. VISUAL QUALITY ────────────────────────────────────────────────────
    # Sharpness: Laplacian variance on grayscale (higher = sharper)
    gray = np.array(img.convert("L"), dtype=np.float32)
    # Laplacian kernel approximation: variance of edge response
    from PIL import ImageFilter as IF
    lap = np.array(img.convert("L").filter(IF.Kernel(
        (3, 3), [-1, -1, -1, -1, 8, -1, -1, -1, -1], scale=1, offset=128
    )), dtype=np.float32)
    sharpness = float(np.var(lap)) / 3000.0  # normalize: typical sharp ~2000-5000
    sharpness = min(1.0, sharpness)

    # Global contrast: std dev of grayscale luminance
    gray_std = float(np.std(gray)) / 80.0  # normalize: good contrast ~50-80
    gray_std = min(1.0, gray_std)

    # Brightness adequacy: not too dark, not too blown out
    mean_brightness = float(np.mean(gray)) / 255.0
    # YouTube thumbnail should be punchy, not 0.1 (black) or 0.95 (washed)
    brightness_ok = 1.0 - abs(mean_brightness - 0.45) * 2.0
    brightness_ok = max(0.0, min(1.0, brightness_ok))

    visualQuality = sharpness * 0.5 + gray_std * 0.3 + brightness_ok * 0.2

    # ── 2. MOBILE READABILITY (at 320×180) ───────────────────────────────────
    # Resize to browse-card size and re-measure contrast + large-region structure
    small = img.resize((320, 180), Image.LANCZOS)
    small_arr = np.array(small.convert("L"), dtype=np.float32)

    small_std = float(np.std(small_arr)) / 80.0
    small_std = min(1.0, small_std)

    # Large-region separation: split image into 4 quadrants, check variance between quadrant means
    q_means = []
    for qr in range(2):
        for qc in range(2):
            quad = small_arr[qr*90:(qr+1)*90, qc*160:(qc+1)*160]
            q_means.append(float(np.mean(quad)))
    q_spread = (max(q_means) - min(q_means)) / 255.0  # 0=all same, 1=max separation
    q_spread = min(1.0, q_spread)

    mobileReadability = small_std * 0.5 + q_spread * 0.5

    # ── 3. LEFT DARKNESS (text safe zone) ────────────────────────────────────
    # Left 35% of image should be dark to allow white/yellow hook text
    left_w = int(w * 0.35)
    left_region = gray[:, :left_w]
    left_mean = float(np.mean(left_region)) / 255.0
    # Score: 1.0 = very dark (mean < 0.3), 0.0 = bright (mean > 0.7)
    leftDarkness = 1.0 - min(1.0, max(0.0, (left_mean - 0.15) / 0.55))

    # ── 4. FACE PROXY (skin-tone cluster in right 55%) ───────────────────────
    # Skin tone in RGB: R high, G medium, B low; simplified HSV skin range
    right_w = int(w * 0.45)
    right_region = arr[:, right_w:, :]  # right 55%

    R = right_region[:, :, 0]
    G = right_region[:, :, 1]
    B = right_region[:, :, 2]

    # Skin heuristic: R>95, G>40, B>20, R>G>B, R-G>15, R-B>15
    skin_mask = (
        (R > 95) & (G > 40) & (B > 20) &
        (R > G) & (R > B) &
        (R.astype(np.int16) - G.astype(np.int16) > 15) &
        (R.astype(np.int16) - B.astype(np.int16) > 15)
    )
    total_pixels = right_region.shape[0] * right_region.shape[1]
    skin_ratio = float(np.sum(skin_mask)) / total_pixels if total_pixels > 0 else 0.0
    # A face typically covers 3–15% of a portrait-right thumbnail
    # Score peaks at ~8%, drops off at <2% (no face) or >25% (face fills everything)
    if skin_ratio < 0.02:
        faceProxy = skin_ratio / 0.02 * 0.3  # tiny — likely no face, partial credit
    elif skin_ratio <= 0.15:
        faceProxy = 0.3 + (skin_ratio - 0.02) / 0.13 * 0.7  # good range
    else:
        faceProxy = max(0.0, 1.0 - (skin_ratio - 0.15) * 3.0)  # too much skin

    # ── 5. COLORFULNESS ───────────────────────────────────────────────────────
    # Saturation spread in HSV space — high colorfulness = visually energetic
    hsv_img = img.convert("HSV") if hasattr(Image, "HSV") else None
    if hsv_img is None:
        # Approximate: use spread of R-G-B max-min as saturation proxy
        max_c = np.max(arr, axis=2)
        min_c = np.min(arr, axis=2)
        sat = (max_c - min_c) / (max_c + 1e-6)
        colorfulness = float(np.mean(sat))
    else:
        hsv_arr = np.array(hsv_img, dtype=np.float32)
        colorfulness = float(np.mean(hsv_arr[:, :, 1])) / 255.0

    colorfulness = min(1.0, colorfulness)

    return {
        "visualQuality": round(visualQuality, 3),
        "mobileReadability": round(mobileReadability, 3),
        "leftDarkness": round(leftDarkness, 3),
        "faceProxy": round(faceProxy, 3),
        "colorfulness": round(colorfulness, 3),
        # Raw values for debug
        "_sharpness": round(sharpness, 3),
        "_contrast": round(gray_std, 3),
        "_brightness": round(mean_brightness, 3),
        "_skinRatio": round(skin_ratio, 4),
        "_size": [w, h],
    }

if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        print(json.dumps({"error": "No image paths provided"}))
        sys.exit(1)

    results = []
    for p in paths:
        abs_p = os.path.abspath(p)
        score = analyze(abs_p)
        results.append({"path": p, "scores": score})

    print(json.dumps(results, indent=2))
