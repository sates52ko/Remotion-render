"""
cutout.py — Clean transparent RGBA cutout extractor for Antidote 10x CutoutStage.

Uses `rembg` when available (with alpha matting fallback to border-seeded flood-fill),
auto-crops transparent margins with 14px padding, and can render a checkerboard
contact sheet via `--preview=<out.png>` for visual QA.
"""
import os
import sys
import numpy as np
from PIL import Image


def extract_cutout(in_path: str, out_path: str) -> None:
    im = Image.open(in_path).convert("RGBA")
    used_rembg = False
    try:
        from rembg import remove
        im = remove(im)
        used_rembg = True
    except Exception:
        used_rembg = False

    if not used_rembg:
        arr = np.array(im, dtype=np.uint8)
        h, w, _ = arr.shape
        rgb = arr[:, :, :3].astype(np.float32)
        corners = np.concatenate([
            rgb[:8, :8].reshape(-1, 3),
            rgb[:8, -8:].reshape(-1, 3),
            rgb[-8:, :8].reshape(-1, 3),
            rgb[-8:, -8:].reshape(-1, 3),
        ], axis=0)
        bg_rgb = np.median(corners, axis=0)
        dist = np.linalg.norm(rgb - bg_rgb, axis=2)
        lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        sat = np.max(rgb, axis=2) - np.min(rgb, axis=2)
        is_bg = (dist < 38.0) & (lum > 215.0) & (sat < 32.0)

        visited = np.zeros((h, w), dtype=bool)
        stack = []
        for x in range(w):
            if is_bg[0, x]:
                stack.append((0, x))
            if is_bg[h - 1, x]:
                stack.append((h - 1, x))
        for y in range(h):
            if is_bg[y, 0]:
                stack.append((y, 0))
            if is_bg[y, w - 1]:
                stack.append((y, w - 1))

        while stack:
            cy, cx = stack.pop()
            if visited[cy, cx]:
                continue
            visited[cy, cx] = True
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg[ny, nx]:
                    stack.append((ny, nx))

        alpha = np.where(visited, 0, 255).astype(np.uint8)
        arr[:, :, 3] = alpha
        im = Image.fromarray(arr, "RGBA")

    # Auto-crop transparent margins with 14px padding
    bbox = im.getbbox()
    if bbox:
        pad = 14
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(im.width, bbox[2] + pad)
        y1 = min(im.height, bbox[3] + pad)
        im = im.crop((x0, y0, x1, y1))

    im.save(out_path, "PNG")


def make_preview(paths, out_png: str) -> None:
    cols = min(4, max(1, len(paths)))
    tw, th = 420, 420
    sheet = Image.new("RGB", (cols * tw, th), (220, 215, 205))
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((tw - 24, th - 24))
        # Checkerboard tile
        tile = Image.new("RGBA", (tw - 8, th - 8), (245, 242, 235, 255))
        pix = tile.load()
        for yy in range(tile.height):
            for xx in range(tile.width):
                if ((xx // 16) + (yy // 16)) % 2 == 1:
                    pix[xx, yy] = (210, 205, 198, 255)
        tile.alpha_composite(im, ((tile.width - im.width) // 2, (tile.height - im.height) // 2))
        sheet.paste(tile.convert("RGB"), (i * tw + 4, 4))
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    sheet.save(out_png)
    print("cutouts preview:", out_png)


def slice_grid(in_path: str, out_prefix: str, grid: str, names=None):
    cols, rows = [int(x) for x in grid.lower().split("x")]
    im = Image.open(in_path).convert("RGBA")
    cw = im.width // cols
    ch = im.height // rows
    gx = max(4, int(cw * 0.02))
    gy = max(4, int(ch * 0.02))
    outs = []
    idx = 0
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * cw + gx, r * ch + gy, (c + 1) * cw - gx, (r + 1) * ch - gy))
            suffix = names[idx] if names and idx < len(names) else str(idx + 1)
            tmp_in = f"{out_prefix}_{suffix}.cell.png"
            out_p = f"{out_prefix}_{suffix}.png"
            cell.save(tmp_in, "PNG")
            extract_cutout(tmp_in, out_p)
            try:
                os.remove(tmp_in)
            except OSError:
                pass
            outs.append(out_p)
            print("cutout:", out_p)
            idx += 1
    return outs


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if opts.get("preview"):
        make_preview(args, opts["preview"])
    elif opts.get("grid") and len(args) >= 2:
        names = opts["names"].split(",") if opts.get("names") else None
        slice_grid(args[0], args[1], opts["grid"], names)
    elif len(args) >= 2:
        extract_cutout(args[0], args[1])
        print("cutout:", args[1])
    else:
        print("Usage: cutout.py <in.png> <out.png> | cutout.py --grid=2x2 [--names=a,b,c,d] <in.png> <out_prefix> | cutout.py --preview=<sheet.png> <cutouts...>")
        sys.exit(1)
