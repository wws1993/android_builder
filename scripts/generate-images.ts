/**
 * 生成随机图片作为默认拼图资源：5 主题 × 10 关 = 50 张，含流体形状
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join } from "path";

const SIZE = 400;
const OUT_DIR = join(import.meta.dir, "..", "www", "assets", "images");

/** 主题配色：自然、动物、艺术、城市、奇幻 */
const THEME_PALETTES = [
  ["#87CEEB", "#98D8AA", "#F7DC6F", "#E8B4B8", "#DDA0DD"],
  ["#FFE4B5", "#DEB887", "#8B4513", "#CD853F", "#F4A460"],
  ["#E6E6FA", "#DDA0DD", "#9370DB", "#BA55D3", "#FF69B4"],
  ["#708090", "#2F4F4F", "#4682B4", "#5F9EA0", "#B0C4DE"],
  ["#00CED1", "#FFD700", "#FF6347", "#9370DB", "#00FA9A"],
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** 可复现的伪随机，范围 [0, 1) */
function srnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 生成有机流体形状：平滑闭合路径，类似水滴/熔岩灯 */
function createFluidBlob(baseSeed: number, palette: string[]): string {
  const n = 6 + Math.floor(srnd(baseSeed) * 5);
  const cx = SIZE * (0.2 + srnd(baseSeed + 1) * 0.6);
  const cy = SIZE * (0.2 + srnd(baseSeed + 2) * 0.6);
  const baseR = 40 + srnd(baseSeed + 3) * 80;

  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + (srnd(baseSeed + 4 + i) - 0.5) * 0.8;
    const r = baseR * (0.6 + srnd(baseSeed + 10 + i) * 0.8);
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }

  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const prev = pts[(i - 1 + n) % n];
    const dx = (next[0] - prev[0]) / 4;
    const dy = (next[1] - prev[1]) / 4;
    const cp1x = curr[0] + dx + (srnd(baseSeed + 20 + i) - 0.5) * 25;
    const cp1y = curr[1] + dy + (srnd(baseSeed + 25 + i) - 0.5) * 25;
    const cp2x = next[0] - dx + (srnd(baseSeed + 30 + i) - 0.5) * 25;
    const cp2y = next[1] - dy + (srnd(baseSeed + 35 + i) - 0.5) * 25;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${next[0].toFixed(1)},${next[1].toFixed(1)}`;
  }
  d += " Z";

  const fill = pick(palette, baseSeed);
  const opacity = 0.35 + srnd(baseSeed + 40) * 0.4;
  const gradId = `blob${baseSeed}`;
  const grad = `<defs><radialGradient id="${gradId}" cx="40%" cy="40%" r="60%">
    <stop offset="0%" stop-color="${fill}" stop-opacity="${(opacity * 1.2).toFixed(2)}"/>
    <stop offset="100%" stop-color="${fill}" stop-opacity="${(opacity * 0.5).toFixed(2)}"/>
  </radialGradient></defs>`;

  return `${grad}<path d="${d}" fill="url(#${gradId})"/>`;
}

/** 水滴形流体：带高光的有机形状 */
function createDropPath(baseSeed: number, palette: string[]): string {
  const fill = pick(palette, baseSeed);
  const opacity = 0.35 + srnd(baseSeed + 60) * 0.35;
  const cx = SIZE * (0.2 + srnd(baseSeed + 61) * 0.6);
  const cy = SIZE * (0.2 + srnd(baseSeed + 62) * 0.6);
  const r = 30 + srnd(baseSeed + 63) * 45;

  const top: [number, number] = [cx, cy - r];
  const br: [number, number] = [cx + r * 0.85, cy + r * 0.4];
  const bot: [number, number] = [cx, cy + r * 0.9];
  const bl: [number, number] = [cx - r * 0.85, cy + r * 0.4];
  const d = `M ${top[0].toFixed(1)},${top[1].toFixed(1)} C ${(cx + r * 0.8).toFixed(1)},${(cy - r * 0.2).toFixed(1)} ${(cx + r).toFixed(1)},${(cy + r * 0.5).toFixed(1)} ${br[0].toFixed(1)},${br[1].toFixed(1)} C ${(cx + r * 0.3).toFixed(1)},${(cy + r).toFixed(1)} ${(cx - r * 0.3).toFixed(1)},${(cy + r).toFixed(1)} ${bl[0].toFixed(1)},${bl[1].toFixed(1)} C ${(cx - r).toFixed(1)},${(cy + r * 0.5).toFixed(1)} ${(cx - r * 0.8).toFixed(1)},${(cy - r * 0.2).toFixed(1)} ${top[0].toFixed(1)},${top[1].toFixed(1)} Z`;

  const gradId = `drop${baseSeed}`;
  const grad = `<defs><radialGradient id="${gradId}" cx="48%" cy="38%" r="52%">
    <stop offset="0%" stop-color="white" stop-opacity="${(opacity * 0.6).toFixed(2)}"/>
    <stop offset="60%" stop-color="${fill}" stop-opacity="${opacity.toFixed(2)}"/>
    <stop offset="100%" stop-color="${fill}" stop-opacity="${(opacity * 0.35).toFixed(2)}"/>
  </radialGradient></defs>`;

  return `${grad}<path d="${d}" fill="url(#${gradId})"/>`;
}

/** 生成随机流体图案的 SVG */
function createSvg(themeId: number, levelIndex: number): string {
  const palette = THEME_PALETTES[themeId - 1] ?? THEME_PALETTES[0];
  const base = themeId * 1000 + levelIndex * 47;

  const shapes: string[] = [];

  const bg = pick(palette, base);
  shapes.push(`<rect width="100%" height="100%" fill="${bg}"/>`);

  const numBlobs = 4 + Math.floor(srnd(base + 1) * 4);
  for (let i = 0; i < numBlobs; i++) {
    const seed = base + i * 137 + Math.floor(srnd(base + i) * 800);
    shapes.push(createFluidBlob(seed, palette));
  }

  const numDrops = 3 + Math.floor(srnd(base + 2) * 3);
  for (let i = 0; i < numDrops; i++) {
    const seed = base + i * 257 + Math.floor(srnd(base + i + 5) * 600);
    shapes.push(createDropPath(seed, palette));
  }

  const text = `主题${themeId} ${levelIndex + 1}`;
  shapes.push(
    `<text x="50%" y="50%" text-anchor="middle" dy=".35em" font-size="22" font-family="sans-serif" fill="rgba(0,0,0,0.2)">${text}</text>`
  );

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">${shapes.join("")}</svg>`;
}

async function main() {
  for (let themeId = 1; themeId <= 5; themeId++) {
    const dir = join(OUT_DIR, `theme${themeId}`);
    await mkdir(dir, { recursive: true });

    for (let levelIndex = 0; levelIndex < 10; levelIndex++) {
      const svg = createSvg(themeId, levelIndex);
      const filename = `level${String(levelIndex + 1).padStart(2, "0")}.png`;
      const outPath = join(dir, filename);

      await sharp(Buffer.from(svg))
        .png()
        .toFile(outPath);

      console.log(`  theme${themeId}/${filename}`);
    }
  }
  console.log("生成完成:", OUT_DIR);
}

main().catch(console.error);
