#!/usr/bin/env node
// Generates the USAHORA PWA icons into public/icons/ from the same geometry as the in-app <Logo />
// (src/components/ui.tsx): blue rounded square with three rising white bars.
// Usage: node scripts/generate-pwa-icons.js
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const BRAND = [0x25, 0x63, 0xeb];
const OUT = path.join(__dirname, "..", "public", "icons");
const SS = 4; // supersampling factor for smooth edges

/** Signed-distance style coverage helpers (in supersampled pixel space). */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * @param size output size in px
 * @param opts.fullBleed background fills the whole square (maskable / apple-touch)
 * @param opts.scale content scale (maskable keeps content inside the 80% safe zone)
 */
function render(size, { fullBleed = false, scale = 1 } = {}) {
  const S = size * SS;
  const acc = new Float64Array(size * size * 4);
  const c = S / 2;
  const g = S * scale; // logo box size
  const ox = c - g / 2, oy = c - g / 2;
  const w = g * 0.13, gap = w * 0.7;
  const total = 3 * w + 2 * gap;
  const bx0 = ox + (g - total) / 2;
  const bottom = oy + g * 0.76;
  const bars = [0.28, 0.44, 0.6].map((h, i) => ({ x0: bx0 + i * (w + gap), x1: bx0 + i * (w + gap) + w, y0: bottom - g * h, y1: bottom, a: 0.55 + i * 0.22 }));
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const x = sx + 0.5, y = sy + 0.5;
      const bg = fullBleed ? true : inRoundRect(x, y, 0, 0, S, S, S * 0.28);
      if (!bg) continue;
      let r = BRAND[0], gg = BRAND[1], b = BRAND[2];
      for (const bar of bars) {
        if (inRoundRect(x, y, bar.x0, bar.y0, bar.x1, bar.y1, w / 2)) {
          r = r + (255 - r) * bar.a; gg = gg + (255 - gg) * bar.a; b = b + (255 - b) * bar.a;
        }
      }
      const i = (Math.floor(sy / SS) * size + Math.floor(sx / SS)) * 4;
      acc[i] += r; acc[i + 1] += gg; acc[i + 2] += b; acc[i + 3] += 255;
    }
  }
  const png = new PNG({ width: size, height: size });
  const n = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3];
    png.data[i * 4 + 3] = Math.round(a / n);
    // un-premultiply so edge pixels keep the right colour
    png.data[i * 4] = a ? Math.round((acc[i * 4] / a) * 255) : 0;
    png.data[i * 4 + 1] = a ? Math.round((acc[i * 4 + 1] / a) * 255) : 0;
    png.data[i * 4 + 2] = a ? Math.round((acc[i * 4 + 2] / a) * 255) : 0;
  }
  return PNG.sync.write(png);
}

fs.mkdirSync(OUT, { recursive: true });
const files = {
  "icon-192.png": render(192),
  "icon-512.png": render(512),
  "icon-maskable-512.png": render(512, { fullBleed: true, scale: 0.8 }),
  "apple-touch-icon.png": render(180, { fullBleed: true, scale: 0.86 }),
  "favicon-32.png": render(32),
};
for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`public/icons/${name} (${buf.length} bytes)`);
}
