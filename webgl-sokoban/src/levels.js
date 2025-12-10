// 关卡数据：0=空，1=地面，2=坑，3=墙，4=箱子，5=玩家，6=目标点

export const LEVELS = [
  {
    width: 7,
    height: 7,
    tiles: [
      // y = 0 在上方
      [0, 0, 0, 0, 0, 0, 0],
      [0, 3, 3, 3, 0, 0, 0],
      [0, 3, 6, 1, 3, 0, 0],  // 目标点在 (2,2)
      [0, 3, 1, 4, 1, 3, 0],  // 箱子在 (3,3)
      [0, 0, 3, 1, 2, 3, 0],  // 坑在 (4,4)
      [0, 0, 3, 5, 1, 3, 0],  // 玩家在 (3,5)
      [0, 0, 0, 3, 3, 3, 0],
    ],
  },
];

// 动态加载生成的关卡
let GENERATED_LEVELS_LOADED = false;

/**
 * 加载自动生成的关卡
 */
export async function loadGeneratedLevels() {
  if (GENERATED_LEVELS_LOADED) return;
  
  try {
    const generated = await import('./generated_levels.js');
    const levels = generated.GENERATED_LEVELS || [];
    if (levels.length > 0) {
      LEVELS.push(...levels);
      console.log(`已加载 ${levels.length} 个自动生成的关卡`);
    }
    GENERATED_LEVELS_LOADED = true;
  } catch (e) {
    // 如果文件不存在，忽略错误
    console.log('未找到自动生成的关卡文件，使用默认关卡');
    GENERATED_LEVELS_LOADED = true;
  }
}

/**
 * 添加一个动态生成的关卡到 LEVELS 数组
 */
export function addGeneratedLevel(levelData) {
  LEVELS.push(levelData);
  return LEVELS.length - 1;  // 返回新关卡的索引
}


