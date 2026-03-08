/**
 * 拼图游戏配置：主题、关卡、难度、货币与道具定价
 */

/** 每主题关卡难度分布：规格 -> 关卡数量 */
export const DIFFICULTY_CURVE = {
  3: 1,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
  9: 1,
};

/** 主题配置 */
export const THEMES = [
  { id: 1, name: "默认", icon: "🧩", unlockCost: 0 },
  { id: 2, name: "动物", icon: "🐾", unlockCost: 50 },
  { id: 3, name: "艺术", icon: "🎨", unlockCost: 80 },
  { id: 4, name: "城市", icon: "🏙️", unlockCost: 100 },
  { id: 5, name: "奇幻", icon: "✨", unlockCost: 120 },
];

/** 每主题默认图片路径（占位，后续替换为实际资源） */
export function getLevelImage(themeId, levelIndex) {
  return `./assets/images/theme${themeId}/level${String(levelIndex + 1).padStart(2, "0")}.png`;
}

/** 根据关卡索引返回网格规格 */
export function getLevelGridSize(levelIndex) {
  const curve = [3, 4, 4, 5, 5, 6, 6, 7, 7, 9];
  return curve[levelIndex] ?? 3;
}

/** 通关基础货币奖励 */
export const COIN_PER_LEVEL = 10;

/** 自定义图片替换消耗 */
export const CUSTOM_IMAGE_COST = 30;

/** 道具定价 */
export const ITEM_PRICES = {
  preview: 5,
  highlight: 8,
  autoPlace: 15,
  shuffle: 5,
};
