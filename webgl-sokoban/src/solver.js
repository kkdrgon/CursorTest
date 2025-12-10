// 推箱子求解器：判断关卡是否可解

import { TILE_EMPTY, TILE_FLOOR, TILE_HOLE, TILE_WALL } from './game.js';

/**
 * 计算玩家可达区域（BFS）
 */
function computePlayerReachable(startX, startY, tiles, boxes, width, height) {
  const reachable = Array(height).fill(0).map(() => Array(width).fill(false));
  const queue = [{ x: startX, y: startY }];
  reachable[startY][startX] = true;

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift();

    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (reachable[ny][nx]) continue;

      const tile = tiles[ny][nx];
      if (tile === TILE_EMPTY || tile === TILE_WALL || tile === TILE_HOLE) continue;  // 玩家不能走到坑上

      // 检查是否有箱子（不在坑里的箱子是障碍）
      const hasBox = boxes.some(b => b.x === nx && b.y === ny && !b.isInHole);
      if (hasBox) continue;

      reachable[ny][nx] = true;
      queue.push({ x: nx, y: ny });
    }
  }

  return reachable;
}

/**
 * 检查箱子是否在死锁位置（简单版：非目标角落）
 */
function hasDeadlock(box, boxes, tiles, targets, width, height) {
  // 如果箱子已经在目标点上，不算死锁
  if (targets.some(t => t.x === box.x && t.y === box.y)) {
    return false;
  }

  // 检查是否在角落（上下有墙/边界，左右有墙/边界）
  const x = box.x;
  const y = box.y;

  const leftBlocked = x === 0 || tiles[y][x - 1] === TILE_WALL;
  const rightBlocked = x === width - 1 || tiles[y][x + 1] === TILE_WALL;
  const upBlocked = y === 0 || tiles[y - 1][x] === TILE_WALL;
  const downBlocked = y === height - 1 || tiles[y + 1][x] === TILE_WALL;

  // 角落死锁：两个相邻方向都被堵住
  if ((leftBlocked || rightBlocked) && (upBlocked || downBlocked)) {
    return true;
  }

  return false;
}

/**
 * 序列化状态为字符串（用于去重）
 */
function serializeState(player, boxes) {
  const boxStr = boxes
    .map(b => `${b.x},${b.y},${b.isInHole ? '1' : '0'}`)
    .sort()
    .join(';');
  return `${player.x},${player.y}|${boxStr}`;
}

/**
 * 检查是否已通关（所有箱子都在目标点上，且不在坑里）
 */
function isSolved(boxes, targets) {
  if (boxes.length !== targets.length) return false;
  if (boxes.length === 0) return false;

  // 所有箱子都在目标点上，且不在坑里
  return boxes.every(box => {
    if (box.isInHole) return false;
    return targets.some(t => t.x === box.x && t.y === box.y);
  });
}

/**
 * 判断关卡是否可解
 * @param {Object} level - 关卡数据 { width, height, tiles, player, boxes, targets }
 * @returns {boolean} - 是否可解
 */
export function isLevelSolvable(level) {
  const { width, height, tiles, player, boxes: initialBoxes, targets } = level;

  if (initialBoxes.length !== targets.length) {
    return false;  // 箱子数和目标数不匹配
  }

  const queue = [];
  const visited = new Set();

  const initialState = {
    player: { x: player.x, y: player.y },
    boxes: initialBoxes.map(b => ({ ...b })),
  };

  const startKey = serializeState(initialState.player, initialState.boxes);
  queue.push(initialState);
  visited.add(startKey);

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  let iterations = 0;
  const maxIterations = 50000;  // 防止无限循环

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const state = queue.shift();

    // 检查是否已通关
    if (isSolved(state.boxes, targets)) {
      return true;
    }

    // 计算玩家可达区域
    const reachable = computePlayerReachable(
      state.player.x,
      state.player.y,
      tiles,
      state.boxes,
      width,
      height
    );

    // 尝试推每个箱子
    for (let i = 0; i < state.boxes.length; i++) {
      const box = state.boxes[i];
      
      // 在坑里的箱子不能再推动
      if (box.isInHole) continue;

      for (const { dx, dy } of dirs) {
        // 玩家需要站在 box 的 (dx, dy) 反方向才能推
        const pushFromX = box.x - dx;
        const pushFromY = box.y - dy;

        // 检查玩家能否到达推的位置
        if (pushFromX < 0 || pushFromX >= width || pushFromY < 0 || pushFromY >= height) {
          continue;
        }
        if (!reachable[pushFromY][pushFromX]) {
          continue;
        }

        // 箱子要推到的位置
        const destX = box.x + dx;
        const destY = box.y + dy;

        // 检查目标位置是否合法
        if (destX < 0 || destX >= width || destY < 0 || destY >= height) {
          continue;
        }

        const destTile = tiles[destY][destX];
        if (destTile === TILE_EMPTY || destTile === TILE_WALL) {
          continue;
        }

        // 检查目标位置是否有其他箱子
        const hasOtherBox = state.boxes.some(
          (b, idx) => idx !== i && b.x === destX && b.y === destY && !b.isInHole
        );
        if (hasOtherBox) {
          continue;
        }

        // 生成新状态
        const newBoxes = state.boxes.map((b, idx) => {
          if (idx === i) {
            const intoHole = destTile === TILE_HOLE;
            return {
              x: destX,
              y: destY,
              isInHole: intoHole,
            };
          }
          return { ...b };
        });

        // 检查死锁
        const newBox = newBoxes[i];
        if (hasDeadlock(newBox, newBoxes, tiles, targets, width, height)) {
          continue;
        }

        const newPlayer = { x: box.x, y: box.y };
        const newState = {
          player: newPlayer,
          boxes: newBoxes,
        };

        const key = serializeState(newPlayer, newBoxes);
        if (visited.has(key)) {
          continue;
        }

        visited.add(key);
        queue.push(newState);
      }
    }
  }

  return false;  // 搜索完也没找到解
}

