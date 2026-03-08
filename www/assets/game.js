/**
 * 拼图游戏 - 全 PixiJS 实现
 */
import * as PIXI from "pixi.js";
import {
  THEMES,
  getLevelGridSize,
  getLevelImage,
  COIN_PER_LEVEL,
} from "./game-config.js";
import {
  loadSave,
  addCoin,
  spendCoin,
  unlockTheme,
  recordLevelComplete,
  getLevelBestTime,
} from "./storage.js";
import { sliceImage } from "./puzzle-core.js";

const W = 420;
const H = 700;
const APP_VERSION = "1.1.0";
let app;
let stage;
let state = { themeId: 1, levelIndex: 0 };

const COLORS = {
  primary: 0x6366f1,
  primaryHover: 0x818cf8,
  cardBg: 0x1e1e28,
  cardBgHover: 0x252532,
  cardBorder: 0x2d2d3a,
  cardAccent: 0x6366f133,
  success: 0x10b981,
  successBg: 0x10b98122,
  successText: 0xfbbf24,
  text: 0xe2e8f0,
  textMuted: 0x94a3b8,
  back: 0xa5b4fc,
  locked: 0x64748b,
  coinBg: 0x1e293b,
  coinBorder: 0x334155,
};

/** 创建按钮 */
function createButton(text, x, y, w, h, onClick) {
  const btn = new PIXI.Container();
  btn.interactive = true;
  btn.buttonMode = true;

  const bg = new PIXI.Graphics();
  const r = Math.min(14, h / 3);
  bg.beginFill(COLORS.primary);
  bg.drawRoundedRect(0, 0, w, h, r);
  bg.endFill();
  btn.addChild(bg);

  const label = new PIXI.Text(text, { fontFamily: "sans-serif", fontSize: 16, fill: 0xffffff });
  label.anchor.set(0.5);
  label.x = w / 2;
  label.y = h / 2;
  btn.addChild(label);

  btn.x = x;
  btn.y = y;
  btn.on("pointerdown", onClick);
  btn.on("pointerover", () => {
    bg.clear();
    bg.beginFill(COLORS.primaryHover);
    bg.drawRoundedRect(0, 0, w, h, r);
    bg.endFill();
  });
  btn.on("pointerout", () => {
    bg.clear();
    bg.beginFill(COLORS.primary);
    bg.drawRoundedRect(0, 0, w, h, r);
    bg.endFill();
  });
  return btn;
}

/** 创建文本 */
function createText(text, fontSize = 18, fill = COLORS.text) {
  return new PIXI.Text(text, { fontFamily: "sans-serif", fontSize, fill });
}

/** 显示提示（替代 alert） */
function showToast(message, duration = 2500) {
  const toast = new PIXI.Container();
  toast.zIndex = 3000;
  stage.sortableChildren = true;

  const padding = 16;
  const text = createText(message, 16);
  text.anchor.set(0.5, 0.5);
  const tw = text.width + padding * 2;
  const th = 44;

  const bg = new PIXI.Graphics();
  bg.beginFill(0x1e1e28);
  bg.lineStyle(1, COLORS.cardBorder);
  bg.drawRoundedRect(-tw / 2, -th / 2, tw, th, 12);
  bg.endFill();
  toast.addChild(bg);
  toast.addChild(text);

  toast.x = W / 2;
  toast.y = H / 2;
  stage.addChild(toast);

  setTimeout(() => {
    if (toast.parent) stage.removeChild(toast);
  }, duration);
}

/** 主菜单 */
function showMenu() {
  stage.removeChildren();
  const s = loadSave();

  const titleIcon = createText("🧩", 48);
  titleIcon.anchor.set(0.5);
  titleIcon.x = W / 2;
  titleIcon.y = 130;
  stage.addChild(titleIcon);

  const title = createText("拼图游戏", 34);
  title.anchor.set(0.5);
  title.x = W / 2;
  title.y = 185;
  stage.addChild(title);

  const coinBg = new PIXI.Graphics();
  coinBg.lineStyle(1, COLORS.cardBorder);
  coinBg.beginFill(COLORS.cardBg);
  coinBg.drawRoundedRect(W / 2 - 65, 225, 130, 48, 24);
  coinBg.endFill();
  coinBg.x = 0;
  stage.addChild(coinBg);

  const coin = createText(`💰 ${s.coin}`, 20);
  coin.anchor.set(0.5);
  coin.x = W / 2;
  coin.y = 249;
  stage.addChild(coin);

  stage.addChild(createButton("选择主题", W / 2 - 90, 310, 180, 52, showThemes));
  stage.addChild(createButton("关于", W / 2 - 90, 382, 180, 52, showSettings));
}

/** 设置 */
function showSettings() {
  stage.removeChildren();

  const back = createText("← 返回", 16, COLORS.back);
  back.interactive = true;
  back.buttonMode = true;
  back.x = 20;
  back.y = 20;
  back.on("pointerdown", showMenu);
  stage.addChild(back);

  const title = createText("关于", 26);
  title.x = 20;
  title.y = 100;
  stage.addChild(title);

  const descBg = new PIXI.Graphics();
  descBg.lineStyle(1, COLORS.cardBorder);
  descBg.beginFill(COLORS.cardBg);
  descBg.drawRoundedRect(20, 155, W - 40, 100, 16);
  descBg.endFill();
  stage.addChild(descBg);

  const desc = createText("单机游戏，数据保存在本地", 16, COLORS.textMuted);
  desc.x = 36;
  desc.y = 175;
  stage.addChild(desc);

  const versionText = createText(`版本 ${APP_VERSION}`, 14, COLORS.textMuted);
  versionText.x = 36;
  versionText.y = 215;
  stage.addChild(versionText);
}

/** 主题选择 */
function showThemes() {
  stage.removeChildren();
  const s = loadSave();

  const back = createText("← 返回", 16, COLORS.back);
  back.interactive = true;
  back.buttonMode = true;
  back.x = 20;
  back.y = 20;
  back.on("pointerdown", showMenu);
  stage.addChild(back);

  const title = createText("选择主题", 26);
  title.anchor.set(0.5, 0);
  title.x = W / 2;
  title.y = 75;
  stage.addChild(title);

  const coinBg = new PIXI.Graphics();
  coinBg.beginFill(COLORS.cardBg);
  coinBg.drawRoundedRect(W / 2 - 55, 125, 110, 36, 18);
  coinBg.endFill();
  stage.addChild(coinBg);

  const coin = createText(`💰 ${s.coin}`, 17);
  coin.anchor.set(0.5, 0.5);
  coin.x = W / 2;
  coin.y = 143;
  stage.addChild(coin);

  const cardW = W - 40;
  const cardH = 60;
  const cardPad = (W - cardW) / 2;
  THEMES.forEach((t, i) => {
    const card = new PIXI.Container();
    card.x = cardPad;
    card.y = 170 + i * 72;

    const bg = new PIXI.Graphics();
    const isUnlocked = s.unlockedThemes?.includes(t.id);
    bg.lineStyle(1, isUnlocked ? COLORS.primary : COLORS.cardBorder);
    bg.beginFill(COLORS.cardBg);
    bg.drawRoundedRect(0, 0, cardW, cardH, 16);
    bg.endFill();
    if (isUnlocked) {
      bg.beginFill(COLORS.primary);
      bg.drawRoundedRect(0, 0, 4, cardH, 2);
      bg.endFill();
    }
    card.addChild(bg);

    const icon = createText(t.icon ?? "🧩", 24);
    icon.x = 18;
    icon.y = cardH / 2;
    icon.anchor.set(0, 0.5);
    card.addChild(icon);

    const name = createText(t.name, 18);
    name.x = 52;
    name.y = cardH / 2;
    name.anchor.set(0, 0.5);
    card.addChild(name);

    const rightPad = 16;
    if (isUnlocked) {
      const enterW = 78;
      const btn = createButton("进入", cardW - rightPad - enterW, 14, enterW, 36, () => {
        state.themeId = t.id;
        showLevels();
      });
      card.addChild(btn);
    } else {
      const unlockBtnW = 68;
      const cost = createText(`${t.unlockCost} 💰`, 14, COLORS.textMuted);
      cost.anchor.set(1, 0.5);
      cost.x = cardW - rightPad - unlockBtnW - 12;
      cost.y = cardH / 2;
      card.addChild(cost);
      const lockIcon = createText("🔒", 14);
      lockIcon.anchor.set(1, 0.5);
      lockIcon.x = cost.x - 52;
      lockIcon.y = cardH / 2;
      card.addChild(lockIcon);
      const btn = createButton("解锁", cardW - rightPad - unlockBtnW, 14, unlockBtnW, 36, () => {
        if (spendCoin(t.unlockCost)) {
          unlockTheme(t.id);
          showThemes();
        } else showToast("货币不足");
      });
      card.addChild(btn);
    }

    card.interactive = true;
    card.buttonMode = true;
    card.on("pointerover", () => {
      bg.clear();
      bg.lineStyle(1, isUnlocked ? COLORS.primary : COLORS.cardBorder);
      bg.beginFill(COLORS.cardBgHover);
      bg.drawRoundedRect(0, 0, cardW, cardH, 16);
      bg.endFill();
      if (isUnlocked) {
        bg.beginFill(COLORS.primary);
        bg.drawRoundedRect(0, 0, 4, cardH, 2);
        bg.endFill();
      }
    });
    card.on("pointerout", () => {
      bg.clear();
      bg.lineStyle(1, isUnlocked ? COLORS.primary : COLORS.cardBorder);
      bg.beginFill(COLORS.cardBg);
      bg.drawRoundedRect(0, 0, cardW, cardH, 16);
      bg.endFill();
      if (isUnlocked) {
        bg.beginFill(COLORS.primary);
        bg.drawRoundedRect(0, 0, 4, cardH, 2);
        bg.endFill();
      }
    });
    stage.addChild(card);
  });
}

/** 关卡列表 */
function showLevels() {
  stage.removeChildren();
  const s = loadSave();
  const theme = THEMES.find((t) => t.id === state.themeId);

  const back = createText("← 返回", 16, COLORS.back);
  back.interactive = true;
  back.buttonMode = true;
  back.x = 20;
  back.y = 20;
  back.on("pointerdown", showThemes);
  stage.addChild(back);

  const cardSize = 62;
  const colGap = 10;
  const rowGap = 14;
  const gridW = 5 * cardSize + 4 * colGap;
  const gridH = 2 * cardSize + 1 * rowGap;
  const headerH = 160;
  const gridTopPad = 24;
  const gridBottomPad = 24;
  const contentH = headerH + gridTopPad + gridH + gridBottomPad;
  const contentY = (H - contentH) / 2;

  const content = new PIXI.Container();
  content.y = contentY;

  const themeIcon = createText(theme?.icon ?? "🧩", 28);
  themeIcon.anchor.set(0.5, 0);
  themeIcon.x = W / 2;
  themeIcon.y = 0;
  content.addChild(themeIcon);

  const title = createText(`${theme?.name ?? "主题"} - 关卡`, 26);
  title.anchor.set(0.5, 0);
  title.x = W / 2;
  title.y = 48;
  content.addChild(title);

  const coinBg = new PIXI.Graphics();
  coinBg.lineStyle(1, COLORS.coinBorder);
  coinBg.beginFill(COLORS.coinBg);
  coinBg.drawRoundedRect(W / 2 - 60, 105, 120, 42, 21);
  coinBg.endFill();
  content.addChild(coinBg);

  const coin = createText(`💰 ${s.coin}`, 18);
  coin.anchor.set(0.5, 0.5);
  coin.x = W / 2;
  coin.y = 126;
  content.addChild(coin);

  const panelHeight = gridH + gridBottomPad;

  const gridPanel = new PIXI.Graphics();
  gridPanel.lineStyle(1, COLORS.cardBorder);
  gridPanel.beginFill(0x16161d);
  gridPanel.drawRoundedRect((W - gridW - 24) / 2, headerH, gridW + 24, panelHeight + 20, 20);
  gridPanel.endFill();
  content.addChild(gridPanel);

  const grid = new PIXI.Container();
  grid.x = (W - gridW) / 2;
  grid.y = headerH + gridTopPad;
  for (let i = 0; i < 10; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const card = new PIXI.Container();
    card.x = col * (cardSize + colGap);
    card.y = row * (cardSize + rowGap);

    const key = `${state.themeId}-${i}`;
    const best = getLevelBestTime(state.themeId, i);
    const done = s.levelProgress?.[key]?.completed;

    const bg = new PIXI.Graphics();
    bg.lineStyle(1.5, done ? COLORS.success : COLORS.cardBorder);
    bg.beginFill(done ? 0x064e3b22 : COLORS.cardBg);
    bg.drawRoundedRect(0, 0, cardSize, cardSize, 16);
    bg.endFill();
    if (done) {
      bg.beginFill(COLORS.success);
      bg.drawRoundedRect(0, 0, 5, cardSize, 2);
      bg.endFill();
    }
    card.addChild(bg);

    const num = createText(String(i + 1), 24);
    num.anchor.set(0.5);
    num.x = cardSize / 2;
    num.y = cardSize / 2 - 10;
    card.addChild(num);

    const bestLabel = best != null ? `最佳 ${best}秒` : "待挑战";
    const bestText = createText(bestLabel, 11, done ? COLORS.successText : COLORS.textMuted);
    bestText.anchor.set(0.5);
    bestText.x = cardSize / 2;
    bestText.y = cardSize / 2 + 12;
    card.addChild(bestText);

    card.interactive = true;
    card.buttonMode = true;
    card.on("pointerover", () => {
      bg.clear();
      bg.lineStyle(1.5, done ? COLORS.success : COLORS.primary);
      bg.beginFill(done ? 0x064e3b33 : COLORS.cardBgHover);
      bg.drawRoundedRect(0, 0, cardSize, cardSize, 16);
      bg.endFill();
      if (done) {
        bg.beginFill(COLORS.success);
        bg.drawRoundedRect(0, 0, 5, cardSize, 2);
        bg.endFill();
      }
    });
    card.on("pointerout", () => {
      bg.clear();
      bg.lineStyle(1.5, done ? COLORS.success : COLORS.cardBorder);
      bg.beginFill(done ? 0x064e3b22 : COLORS.cardBg);
      bg.drawRoundedRect(0, 0, cardSize, cardSize, 16);
      bg.endFill();
      if (done) {
        bg.beginFill(COLORS.success);
        bg.drawRoundedRect(0, 0, 5, cardSize, 2);
        bg.endFill();
      }
    });
    card.on("pointerdown", () => {
      state.levelIndex = i;
      startPuzzle();
    });
    grid.addChild(card);
  }
  content.addChild(grid);
  stage.addChild(content);
}

/** 生成占位图 */
function createPlaceholderImage(themeId, levelIndex, size = 400) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const hue = ((themeId - 1) * 60 + levelIndex * 20) % 360;
  ctx.fillStyle = `hsl(${hue}, 50%, 85%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `hsl(${hue}, 40%, 60%)`;
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`主题${themeId} 关卡${levelIndex + 1}`, size / 2, size / 2);
  return canvas.toDataURL("image/png");
}

/** 加载关卡图片 */
async function loadLevelImage(themeId, levelIndex) {
  const url = getLevelImage(themeId, levelIndex);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("load fail"));
      i.src = url;
    });
    return img.src;
  } catch {
    return createPlaceholderImage(themeId, levelIndex);
  }
}

/** 拼图玩法 */
async function startPuzzle() {
  const n = getLevelGridSize(state.levelIndex);
  const imgSrc = await loadLevelImage(state.themeId, state.levelIndex);

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgSrc;
  });

  const size = 400;
  let srcImg = img;
  if (img.width !== size || img.height !== size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const scaled = new Image();
    await new Promise((resolve, reject) => {
      scaled.onload = resolve;
      scaled.onerror = reject;
      scaled.src = c.toDataURL("image/png");
    });
    srcImg = scaled;
  }

  const pieces = await sliceImage(srcImg, n);
  const startTime = Date.now();
  const placed = new Map();
  const pool = shuffleArray([...pieces]);

  const maxBoard = Math.min(320, W - 40, H - 220);
  const boardSize = Math.floor(maxBoard / n) * n || n;
  const cellSize = boardSize / n;
  const poolPieceSize = Math.floor(W * 0.15);
  const poolCols = 4;
  const poolRowGap = 12;
  const scrollbarW = 8;
  const poolContentW = boardSize - scrollbarW;
  const poolHorizontalGap = Math.max(8, ((poolContentW - 24) - poolCols * poolPieceSize) / (poolCols + 1));
  const poolRows = Math.ceil(pool.length / poolCols);
  const poolContentH = poolRows * (poolPieceSize + poolRowGap) + 24;
  const poolAreaHeight = 200;
  const poolAreaW = boardSize;

  const baseTexture = PIXI.BaseTexture.from(srcImg);

  stage.removeChildren();

  const puzzleContainer = new PIXI.Container();
  puzzleContainer.x = (W - boardSize) / 2;
  puzzleContainer.y = 75;

  const back = createText("← 返回", 16, 0x8ab4f8);
  back.interactive = true;
  back.buttonMode = true;
  back.x = 20;
  back.y = 20;
  back.on("pointerdown", () => {
    clearInterval(timerId);
    showLevels();
  });
  stage.addChild(back);

  const timerText = createText("0 秒", 16);
  timerText.anchor.set(0.5);
  timerText.x = W / 2;
  timerText.y = 48;
  stage.addChild(timerText);

  const timerId = setInterval(() => {
    timerText.text = `${Math.floor((Date.now() - startTime) / 1000)} 秒`;
  }, 1000);

  const boardBg = new PIXI.Graphics();
  boardBg.lineStyle(1, COLORS.cardBorder);
  boardBg.beginFill(0x16161d);
  boardBg.drawRoundedRect(0, 0, boardSize, boardSize, 12);
  boardBg.endFill();
  puzzleContainer.addChild(boardBg);

  const boardContainer = new PIXI.Container();
  puzzleContainer.addChild(boardContainer);

  const poolWrapper = new PIXI.Container();
  poolWrapper.y = boardSize + 18;
  puzzleContainer.addChild(poolWrapper);

  const poolPanel = new PIXI.Graphics();
  poolPanel.lineStyle(1, COLORS.cardBorder);
  poolPanel.beginFill(0x16161d);
  poolPanel.drawRoundedRect(0, 0, poolAreaW, poolAreaHeight, 14);
  poolPanel.endFill();
  poolWrapper.addChild(poolPanel);

  const poolMask = new PIXI.Graphics();
  poolMask.beginFill(0xffffff);
  poolMask.drawRect(0, 0, poolContentW, poolAreaHeight);
  poolMask.endFill();
  poolMask.renderable = false;
  poolWrapper.addChild(poolMask);

  const poolContainer = new PIXI.Container();
  poolContainer.mask = poolMask;
  poolWrapper.addChild(poolContainer);

  let poolScrollY = 0;
  const maxScrollY = Math.max(0, poolContentH - poolAreaHeight);

  const scrollbarTrack = new PIXI.Graphics();
  scrollbarTrack.beginFill(0x2d2d3a);
  scrollbarTrack.drawRoundedRect(poolContentW + 2, 6, scrollbarW, poolAreaHeight - 12, 4);
  scrollbarTrack.endFill();
  poolWrapper.addChild(scrollbarTrack);

  const scrollbarThumb = new PIXI.Graphics();
  poolWrapper.addChild(scrollbarThumb);

  function updateScrollbar() {
    scrollbarThumb.clear();
    if (maxScrollY <= 0) {
      scrollbarTrack.visible = false;
      scrollbarThumb.visible = false;
      return;
    }
    scrollbarTrack.visible = true;
    scrollbarThumb.visible = true;
    const thumbHeight = Math.max(24, (poolAreaHeight - 12) * poolAreaHeight / poolContentH);
    const thumbY = 6 + (poolAreaHeight - 12 - thumbHeight) * (poolScrollY / maxScrollY);
    scrollbarThumb.beginFill(0x6366f1);
    scrollbarThumb.drawRoundedRect(poolContentW + 2, thumbY, scrollbarW, thumbHeight, 4);
    scrollbarThumb.endFill();
  }
  updateScrollbar();

  const canvas = app.view;

  function clientToLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const stageScale = app.stage.scale.x;
    const left = rect.left + (rect.width - W * stageScale) / 2;
    const top = rect.top + (rect.height - H * stageScale) / 2;
    return [(clientX - left) / stageScale, (clientY - top) / stageScale];
  }

  const poolTouchPadding = 32;
  function isInPoolArea(px, py) {
    const poolScreenY = puzzleContainer.y + poolWrapper.y;
    const poolScreenX = puzzleContainer.x;
    return px >= poolScreenX - poolTouchPadding && px < poolScreenX + poolAreaW + poolTouchPadding
      && py >= poolScreenY - poolTouchPadding && py < poolScreenY + poolAreaHeight + poolTouchPadding;
  }

  let targetScrollY = 0;
  let scrollInertiaTicker = null;
  function applyScroll() {
    poolContainer.y = -poolScrollY;
    updateScrollbar();
  }

  const onWheel = (e) => {
    const [px, py] = clientToLocal(e.clientX, e.clientY);
    if (isInPoolArea(px, py)) {
      e.preventDefault();
      poolScrollY = Math.max(0, Math.min(maxScrollY, poolScrollY + e.deltaY));
      targetScrollY = poolScrollY;
      applyScroll();
    }
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  let touchScrollStartY = null;
  let touchLastVelocity = 0;
  const SCROLL_LERP = 0.28;
  const INERTIA_FACTOR = 120;

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const [px, py] = clientToLocal(e.touches[0].clientX, e.touches[0].clientY);
    if (isInPoolArea(px, py)) {
      touchScrollStartY = e.touches[0].clientY;
      touchScrollStartPoolY = poolScrollY;
      touchLastVelocity = 0;
      if (scrollInertiaTicker) {
        app.ticker.remove(scrollInertiaTicker);
        scrollInertiaTicker = null;
      }
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length !== 1 || touchScrollStartY == null || dragPiece != null) return;
    const [px, py] = clientToLocal(e.touches[0].clientX, e.touches[0].clientY);
    if (!isInPoolArea(px, py)) return;
    e.preventDefault();
    const deltaY = e.touches[0].clientY - touchScrollStartY;
    touchLastVelocity = deltaY;
    touchScrollStartY = e.touches[0].clientY;
    poolScrollY = Math.max(0, Math.min(maxScrollY, poolScrollY + deltaY));
    targetScrollY = poolScrollY;
    applyScroll();
  };
  const onTouchEnd = () => {
    if (touchScrollStartY != null && maxScrollY > 0) {
      targetScrollY = Math.max(0, Math.min(maxScrollY, poolScrollY + touchLastVelocity * INERTIA_FACTOR));
      if (Math.abs(targetScrollY - poolScrollY) > 2) {
        scrollInertiaTicker = () => {
          poolScrollY += (targetScrollY - poolScrollY) * SCROLL_LERP;
          poolScrollY = Math.max(0, Math.min(maxScrollY, poolScrollY));
          applyScroll();
          if (Math.abs(targetScrollY - poolScrollY) < 0.5) {
            app.ticker.remove(scrollInertiaTicker);
            scrollInertiaTicker = null;
          }
        };
        app.ticker.add(scrollInertiaTicker);
      }
    }
    touchScrollStartY = null;
  };
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);

  const pieceSprites = [];
  const poolRects = [];

  function rebuildPool() {
    poolContainer.removeChildren();
    poolRects.length = 0;
    let idx = 0;
    for (const p of pool) {
      if (placed.has(p.id)) continue;
      const col = idx % poolCols;
      const row = Math.floor(idx / poolCols);
      const x = 12 + poolHorizontalGap + col * (poolPieceSize + poolHorizontalGap);
      const y = 12 + row * (poolPieceSize + poolRowGap);

      const tex = new PIXI.Texture(baseTexture, new PIXI.Rectangle(p.sx, p.sy, p.sw, p.sh));
      const sprite = new PIXI.Sprite(tex);
      sprite.width = poolPieceSize;
      sprite.height = poolPieceSize;
      sprite.x = x;
      sprite.y = y;
      sprite.interactive = true;
      sprite.buttonMode = true;
      sprite.pieceData = p;

      const onDown = (e) => {
        dragPiece = p;
        const g = e.global ?? e.data?.global;
        const local = puzzleContainer.toLocal(g);
        const pieceCenterX = x + poolPieceSize / 2;
        const pieceCenterY = boardSize + 18 + poolContainer.y + y + poolPieceSize / 2;
        dragOffsetX = local.x - pieceCenterX;
        dragOffsetY = local.y - pieceCenterY;
        targetDragX = pieceCenterX;
        targetDragY = pieceCenterY;
        dragSprite.x = targetDragX;
        dragSprite.y = targetDragY;
        dragSprite.visible = true;
        dragSprite.texture = tex;
        dragSprite.width = cellSize;
        dragSprite.height = cellSize;
        dragSprite.anchor.set(0.5);
        app.ticker.add(dragTick);
      };

      sprite.on("pointerdown", onDown);
      poolContainer.addChild(sprite);
      poolRects.push({ piece: p, x, y, sprite });
      idx++;
    }
  }

  let dragPiece = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let targetDragX = 0;
  let targetDragY = 0;

  puzzleContainer.sortableChildren = true;
  const dragSprite = new PIXI.Sprite();
  dragSprite.visible = false;
  dragSprite.anchor.set(0.5);
  dragSprite.zIndex = 1000;
  puzzleContainer.addChild(dragSprite);

  const LERP = 0.55;
  const dragTick = () => {
    if (!dragPiece) return;
    const dx = targetDragX - dragSprite.x;
    const dy = targetDragY - dragSprite.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      dragSprite.x += dx * LERP;
      dragSprite.y += dy * LERP;
    } else {
      dragSprite.x = targetDragX;
      dragSprite.y = targetDragY;
    }
  };

  const onMove = (e) => {
    if (!dragPiece) return;
    const g = e.global ?? e.data?.global;
    const local = puzzleContainer.toLocal(g);
    targetDragX = local.x - dragOffsetX;
    targetDragY = local.y - dragOffsetY;
  };

  const onUp = (e) => {
    if (!dragPiece) return;
    const g = e.global ?? e.data?.global;
    const local = puzzleContainer.toLocal(g);
    const localX = local.x;
    const localY = local.y;

    if (localY >= 0 && localY < boardSize && localX >= 0 && localX < boardSize) {
      const col = Math.min(n - 1, Math.max(0, Math.floor(localX / cellSize)));
      const row = Math.min(n - 1, Math.max(0, Math.floor(localY / cellSize)));
      if (row === dragPiece.row && col === dragPiece.col) {
        const tex = new PIXI.Texture(baseTexture, new PIXI.Rectangle(dragPiece.sx, dragPiece.sy, dragPiece.sw, dragPiece.sh));
        const placedSprite = new PIXI.Sprite(tex);
        placedSprite.width = cellSize;
        placedSprite.height = cellSize;
        placedSprite.x = col * cellSize;
        placedSprite.y = row * cellSize;
        boardContainer.addChild(placedSprite);
        placed.set(dragPiece.id, dragPiece);
        app.ticker.remove(dragTick);
        dragSprite.visible = false;
        dragPiece = null;

        if (placed.size === pieces.length) {
          clearInterval(timerId);
          const timeSec = Math.floor((Date.now() - startTime) / 1000);
          addCoin(COIN_PER_LEVEL);
          recordLevelComplete(state.themeId, state.levelIndex, timeSec);
          showToast(`完成！用时 ${timeSec} 秒`, 2000);
          setTimeout(showLevels, 2200);
        }
        rebuildPool();
        return;
      }
    }

    const fromX = dragSprite.x;
    const fromY = dragSprite.y;
    const toX = 12 + poolHorizontalGap + poolPieceSize / 2;
    const toY = boardSize + 18 + 12 + poolPieceSize / 2;
    const duration = 220;
    const startT = Date.now();
    const animateReturn = () => {
      const t = Math.min(1, (Date.now() - startT) / duration);
      const ease = 1 - (1 - t) * (1 - t);
      dragSprite.x = fromX + (toX - fromX) * ease;
      dragSprite.y = fromY + (toY - fromY) * ease;
      if (t >= 1) {
        app.ticker.remove(animateReturn);
        app.ticker.remove(dragTick);
        dragSprite.visible = false;
        dragPiece = null;
        rebuildPool();
      }
    };
    app.ticker.add(animateReturn);
  };

  app.stage.interactive = true;
  app.stage.hitArea = app.screen;
  app.stage.on("pointermove", onMove);
  app.stage.on("pointerup", onUp);
  app.stage.on("pointerupoutside", onUp);

  const cleanup = () => {
    app.ticker.remove(dragTick);
    if (scrollInertiaTicker) app.ticker.remove(scrollInertiaTicker);
    app.stage.off("pointermove", onMove);
    app.stage.off("pointerup", onUp);
    app.stage.off("pointerupoutside", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
  };

  back.on("pointerdown", () => {
    cleanup();
    clearInterval(timerId);
    showLevels();
  });

  rebuildPool();

  const previewBtn = createButton("👁 预览", puzzleContainer.x + (boardSize - 90) / 2, puzzleContainer.y + boardSize + poolAreaHeight + 28, 90, 42, () => {
    const overlay = new PIXI.Container();
    overlay.zIndex = 2000;
    stage.sortableChildren = true;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x0c0c10);
    bg.drawRect(0, 0, W, H);
    bg.endFill();
    bg.interactive = true;
    overlay.addChild(bg);

    const previewTex = PIXI.Texture.from(imgSrc);
    const preview = new PIXI.Sprite(previewTex);
    preview.anchor.set(0.5);
    preview.x = W / 2;
    preview.y = H / 2 - 25;
    const maxW = Math.min(W - 48, 360);
    preview.width = maxW;
    preview.height = (maxW / (previewTex.width || 400)) * (previewTex.height || 400);
    if (preview.height > H - 120) preview.height = H - 120;

    const previewFrame = new PIXI.Graphics();
    previewFrame.lineStyle(2, COLORS.cardBorder);
    previewFrame.drawRoundedRect(preview.x - preview.width / 2 - 6, preview.y - preview.height / 2 - 6, preview.width + 12, preview.height + 12, 14);
    overlay.addChild(previewFrame);
    overlay.addChild(preview);

    const closeBtn = createButton("关闭", W / 2 - 45, H - 60, 90, 40, () => stage.removeChild(overlay));
    overlay.addChild(closeBtn);

    bg.on("pointerdown", () => stage.removeChild(overlay));
    stage.addChild(overlay);
  });
  stage.addChild(previewBtn);

  stage.addChild(puzzleContainer);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function init() {
  app = new PIXI.Application({
    width: W,
    height: H,
    backgroundColor: 0x0d0d12,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });

  const container = document.getElementById("game-container");
  container.appendChild(app.view);

  const resize = () => {
    const r = container.getBoundingClientRect();
    app.renderer.resize(r.width, r.height);
    app.stage.scale.set(Math.min(r.width / W, r.height / H));
  };
  window.addEventListener("resize", resize);
  resize();

  stage = app.stage;
  stage.sortableChildren = true;
  showMenu();
}

init();
