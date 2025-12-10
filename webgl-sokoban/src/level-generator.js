// 关卡生成器：随机生成可解的推箱子关卡

import { isLevelSolvable } from './solver.js';
import { TILE_EMPTY, TILE_FLOOR, TILE_HOLE, TILE_WALL, TILE_TARGET } from './game.js';

/**
 * 随机生成一个候选关卡
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} numBoxes - 箱子数量（也是目标点数量）
 * @param {number} numHoles - 坑的数量
 * @param {number} wallDensity - 墙的密度（0-1）
 * @returns {Object} - 关卡数据
 */
function generateCandidateLevel(width, height, numBoxes, numHoles, wallDensity = 0.15) {
  const tiles = Array(height).fill(0).map(() => Array(width).fill(TILE_EMPTY));
  const boxes = [];
  const targets = [];
  const holes = [];
  let player = null;

  // 1. 四周放墙
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        tiles[y][x] = TILE_WALL;
      } else {
        tiles[y][x] = TILE_FLOOR;
      }
    }
  }

  // 2. 随机放一些内部墙
  const internalCells = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      internalCells.push({ x, y });
    }
  }

  // 打乱顺序
  for (let i = internalCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [internalCells[i], internalCells[j]] = [internalCells[j], internalCells[i]];
  }

  const numWalls = Math.floor(internalCells.length * wallDensity);
  for (let i = 0; i < numWalls && i < internalCells.length; i++) {
    const { x, y } = internalCells[i];
    tiles[y][x] = TILE_WALL;
  }

  // 3. 随机放置目标点
  const availableCells = internalCells.filter(
    ({ x, y }) => tiles[y][x] === TILE_FLOOR
  );

  if (availableCells.length < numBoxes + numHoles + 1) {
    return null;  // 空间不够
  }

  // 打乱可用格子
  for (let i = availableCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableCells[i], availableCells[j]] = [availableCells[j], availableCells[i]];
  }

  let idx = 0;

  // 放置目标点
  for (let i = 0; i < numBoxes && idx < availableCells.length; i++) {
    const { x, y } = availableCells[idx++];
    targets.push({ x, y });
    tiles[y][x] = TILE_TARGET;
  }

  // 放置坑
  for (let i = 0; i < numHoles && idx < availableCells.length; i++) {
    const { x, y } = availableCells[idx++];
    holes.push({ x, y });
    tiles[y][x] = TILE_HOLE;
  }

  // 放置箱子（确保不在目标点上）
  const boxCells = availableCells.slice(idx).filter(
    ({ x, y }) => tiles[y][x] !== TILE_TARGET && tiles[y][x] !== TILE_HOLE
  );
  for (let i = 0; i < numBoxes && i < boxCells.length; i++) {
    const { x, y } = boxCells[i];
    boxes.push({ x, y, isInHole: false });
    // 箱子位置保持为地面（不覆盖）
  }

  // 放置玩家（确保不在目标点、坑或箱子上）
  const playerCells = availableCells.slice(idx).filter(
    ({ x, y }) => {
      const tile = tiles[y][x];
      const hasBox = boxes.some(b => b.x === x && b.y === y);
      return tile === TILE_FLOOR && !hasBox && tile !== TILE_TARGET && tile !== TILE_HOLE;
    }
  );
  if (playerCells.length > 0) {
    const { x, y } = playerCells[0];
    player = { x, y };
    tiles[y][x] = TILE_FLOOR;
  } else {
    return null;
  }

  return {
    width,
    height,
    tiles,
    player,
    boxes,
    targets,
  };
}

/**
 * 生成一个可解的关卡
 * @param {Object} options - 生成选项
 * @returns {Object|null} - 关卡数据，失败返回 null
 */
export function generateSolvableLevel(options = {}) {
  const {
    width = 8,
    height = 8,
    numBoxes = 2,
    numHoles = 1,
    wallDensity = 0.15,
    maxAttempts = 100,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = generateCandidateLevel(width, height, numBoxes, numHoles, wallDensity);
    
    if (!level) {
      continue;
    }

    // 用求解器判断是否可解
    if (isLevelSolvable(level)) {
      return level;
    }
  }

  return null;  // 尝试多次都没生成可解的关卡
}

/**
 * 将生成的关卡转换为 LEVELS 格式
 * @param {Object} level - 生成的关卡数据
 * @returns {Object} - LEVELS 格式的关卡
 */
export function convertToLevelFormat(level) {
  const { width, height, tiles, player, boxes, targets } = level;
  
  // 深拷贝 tiles
  const levelTiles = tiles.map(row => row.slice());

  // 在 tiles 中标记箱子、玩家
  // 注意：目标点已经在 tiles 中标记为 TILE_TARGET (6)，不要覆盖
  for (const box of boxes) {
    if (!box.isInHole) {
      // 如果箱子在目标点上，保持目标点标记（游戏逻辑会处理）
      if (levelTiles[box.y][box.x] !== TILE_TARGET) {
        levelTiles[box.y][box.x] = 4;  // 箱子
      }
    }
  }

  if (player) {
    // 玩家不会在目标点上（生成时已过滤）
    levelTiles[player.y][player.x] = 5;  // 玩家
  }

  // 确保所有目标点都标记为 TILE_TARGET (6)
  for (const target of targets) {
    levelTiles[target.y][target.x] = TILE_TARGET;
  }

  return {
    width,
    height,
    tiles: levelTiles,
  };
}

