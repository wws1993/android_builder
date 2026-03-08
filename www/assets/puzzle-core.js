/**
 * 拼图核心：矩形切割，返回源图裁剪信息供 Canvas 绘制
 */

/** 将图片切割为矩形块，返回 { id, row, col, sx, sy, sw, sh }，坐标取整避免纹理溢出 */
export function sliceImage(img, n) {
  const w = img.width;
  const h = img.height;
  const cellW = w / n;
  const cellH = h / n;

  const results = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const sx = Math.floor(c * cellW);
      const sy = Math.floor(r * cellH);
      const ex = c === n - 1 ? w : Math.floor((c + 1) * cellW);
      const ey = r === n - 1 ? h : Math.floor((r + 1) * cellH);
      results.push({
        id: r * n + c,
        row: r,
        col: c,
        sx,
        sy,
        sw: ex - sx,
        sh: ey - sy,
      });
    }
  }
  return Promise.resolve(results);
}
