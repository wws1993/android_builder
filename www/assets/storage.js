/** 本地存档管理：货币、进度、主题、自定义图 */

const STORAGE_KEY = "puzzle_save";

/** 默认存档 */
const DEFAULT_SAVE = {
  coin: 50,
  unlockedThemes: [1],
  levelProgress: {},
  customImages: {},
};

/** 读取存档 */
export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const data = JSON.parse(raw);
    return { ...DEFAULT_SAVE, ...data };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

/** 写入存档 */
export function saveGame(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** 增加货币 */
export function addCoin(amount) {
  const s = loadSave();
  s.coin = (s.coin ?? 0) + amount;
  saveGame(s);
  return s.coin;
}

/** 消耗货币，不足返回 false */
export function spendCoin(amount) {
  const s = loadSave();
  if ((s.coin ?? 0) < amount) return false;
  s.coin -= amount;
  saveGame(s);
  return true;
}

/** 解锁主题 */
export function unlockTheme(themeId) {
  const s = loadSave();
  if (!s.unlockedThemes) s.unlockedThemes = [1];
  if (s.unlockedThemes.includes(themeId)) return true;
  s.unlockedThemes.push(themeId);
  saveGame(s);
  return true;
}

/** 记录关卡通关与用时 */
export function recordLevelComplete(themeId, levelIndex, timeSeconds) {
  const key = `${themeId}-${levelIndex}`;
  const s = loadSave();
  if (!s.levelProgress) s.levelProgress = {};
  const prog = s.levelProgress[key] ?? { completed: false, bestTimes: [] };
  prog.completed = true;
  prog.bestTimes = (prog.bestTimes ?? []).concat(timeSeconds).sort((a, b) => a - b).slice(0, 3);
  s.levelProgress[key] = prog;
  saveGame(s);
  return prog.bestTimes[0];
}

/** 获取关卡最佳用时（秒），无则 null */
export function getLevelBestTime(themeId, levelIndex) {
  const key = `${themeId}-${levelIndex}`;
  const s = loadSave();
  const prog = s.levelProgress?.[key];
  const times = prog?.bestTimes;
  return times?.length ? times[0] : null;
}

/** 设置自定义图片 */
export function setCustomImage(themeId, levelIndex, base64) {
  const key = `${themeId}-${levelIndex}`;
  const s = loadSave();
  if (!s.customImages) s.customImages = {};
  s.customImages[key] = base64;
  saveGame(s);
}

/** 获取自定义图片，无则 null */
export function getCustomImage(themeId, levelIndex) {
  const key = `${themeId}-${levelIndex}`;
  const s = loadSave();
  return s.customImages?.[key] ?? null;
}
