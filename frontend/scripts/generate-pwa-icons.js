#!/usr/bin/env node
// Builds every USAHORA logo asset from the official logo (assets/brand/usahora-logo-source.png,
// transparent PNG: shield mark on the left, "USAHORA / BUSINESS MANAGEMENT SYSTEM" on the right).
//
//   assets/brand/usahora-logo.png   full logo, trimmed (for light backgrounds)
//   assets/brand/usahora-mark.png   shield mark only, square, transparent
//   public/icons/*                  PWA / browser icons: mark on white
//   assets/images/icon.png, adaptive-icon.png   native app icons
//
// Usage: node scripts/generate-pwa-icons.js   (re-run after replacing the source logo)
// A higher-resolution or SVG source logo gives sharper large icons.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "brand", "usahora-logo-source.png");
const src = PNG.sync.read(fs.readFileSync(SRC));

/** Bounding box of visible pixels within [x0, x1]. */
function bbox(img, x0 = 0, x1 = img.width - 1) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = x0; x <= x1; x++)
      if (img.data[(y * img.width + x) * 4 + 3] > 24) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** The mark ends at the first fully transparent column gap after the left edge. */
function markRight(img) {
  const has = (x) => { for (let y = 0; y < img.height; y++) if (img.data[(y * img.width + x) * 4 + 3] > 24) return true; return false; };
  let x = 0;
  while (x < img.width && !has(x)) x++;
  while (x < img.width && has(x)) x++;
  return x - 1;
}

/** Bilinear sample with premultiplied alpha. */
function sample(img, fx, fy) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  const out = [0, 0, 0, 0];
  for (const [x, y, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
    const i = (y * img.width + x) * 4, a = img.data[i + 3] / 255;
    out[0] += img.data[i] * a * w; out[1] += img.data[i + 1] * a * w; out[2] += img.data[i + 2] * a * w; out[3] += a * w;
  }
  return out; // premultiplied rgb + alpha (0..1)
}

/** Draws region `r` of `img` into a new canvas, fitted inside a centred box of `inner` px, over `bg`. */
function render(img, r, size, { inner, bg = null, radius = 0, w = size, h = size }) {
  const out = new PNG({ width: w, height: h });
  const scale = Math.min(inner / r.w, inner / r.h);
  const dw = r.w * scale, dh = r.h * scale;
  const ox = (w - dw) / 2, oy = (h - dh) / 2;
  const SS = 3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          // background (optionally a rounded square)
          let bgA = 0;
          if (bg) {
            const cx = Math.min(Math.max(px, radius), w - radius), cy = Math.min(Math.max(py, radius), h - radius);
            bgA = (px - cx) ** 2 + (py - cy) ** 2 <= radius * radius || radius === 0 ? 1 : 0;
          }
          let r0 = bg ? bg[0] * bgA : 0, g0 = bg ? bg[1] * bgA : 0, b0 = bg ? bg[2] * bgA : 0, a0 = bgA;
          if (px >= ox && px < ox + dw && py >= oy && py < oy + dh) {
            const s = sample(img, r.x + (px - ox) / scale - 0.5, r.y + (py - oy) / scale - 0.5);
            r0 = s[0] + r0 * (1 - s[3]); g0 = s[1] + g0 * (1 - s[3]); b0 = s[2] + b0 * (1 - s[3]); a0 = s[3] + a0 * (1 - s[3]);
          }
          R += r0; G += g0; B += b0; A += a0;
        }
      const n = SS * SS, i = (y * w + x) * 4, a = A / n;
      out.data[i + 3] = Math.round(a * 255);
      out.data[i] = a ? Math.round(R / n / a) : 0;
      out.data[i + 1] = a ? Math.round(G / n / a) : 0;
      out.data[i + 2] = a ? Math.round(B / n / a) : 0;
    }
  return PNG.sync.write(out);
}

const full = bbox(src);
const mark = bbox(src, 0, markRight(src));
const WHITE = [255, 255, 255];
const write = (rel, buf) => {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  console.log(`${rel} (${buf.length} bytes)`);
};

// In-app images (2x of their display size for sharp rendering).
const fullW = 520, fullH = Math.round((fullW * full.h) / full.w);
write("assets/brand/usahora-logo.png", render(src, full, 0, { inner: fullW, w: fullW, h: fullH }));
write("assets/brand/usahora-mark.png", render(src, mark, 256, { inner: 240 }));

// PWA / browser icons: mark on white.
write("public/icons/icon-192.png", render(src, mark, 192, { inner: 128, bg: WHITE, radius: 192 * 0.22 }));
write("public/icons/icon-512.png", render(src, mark, 512, { inner: 340, bg: WHITE, radius: 512 * 0.22 }));
write("public/icons/icon-maskable-512.png", render(src, mark, 512, { inner: 280, bg: WHITE }));
write("public/icons/apple-touch-icon.png", render(src, mark, 180, { inner: 120, bg: WHITE }));
write("public/icons/favicon-32.png", render(src, mark, 32, { inner: 28 }));

// Native app icons (Expo).
write("assets/images/icon.png", render(src, mark, 512, { inner: 330, bg: WHITE }));
write("assets/images/adaptive-icon.png", render(src, mark, 512, { inner: 260 }));
