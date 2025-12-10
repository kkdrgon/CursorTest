import { LEVELS } from './levels.js';
import { mat4 } from './math.js';

// tile 类型常量
export const TILE_EMPTY = 0;
export const TILE_FLOOR = 1;
export const TILE_HOLE = 2;
export const TILE_WALL = 3;
export const TILE_TARGET = 6;  // 目标点

export class Game {
  constructor() {
    this.levelIndex = 0;
    this.resetLevel();
    this.moveLock = false;
    this.onStateChange = null; // 可选回调，用于 UI
  }

  /**
   * 加载指定索引的关卡
   */
  loadLevel(index) {
    if (index >= 0 && index < LEVELS.length) {
      this.levelIndex = index;
      this.resetLevel();
    }
  }

  resetLevel() {
    const level = LEVELS[this.levelIndex];
    this.width = level.width;
    this.height = level.height;
    // 深拷贝 tiles（保存原始数据用于检查目标点是否在坑上）
    const originalTiles = level.tiles.map((row) => row.slice());
    this.tiles = level.tiles.map((row) => row.slice());
    this.boxes = [];
    this.player = { x: 0, y: 0 };
    this.targets = [];  // 目标点列表
    this.filledHoles = 0;
    this.totalHoles = 0;
    this.gameState = 'playing';

    // 如果关卡数据中有 targets 字段（由生成器提供），使用它
    // 否则从 tiles 中提取目标点
    if (level.targets && Array.isArray(level.targets)) {
      this.targets = level.targets.map(t => ({ x: t.x, y: t.y }));
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const v = this.tiles[y][x];
        if (v === TILE_HOLE) {
          this.totalHoles++;
          // 检查这个坑位置是否在目标点列表中（目标点可能在坑上）
          const isTarget = this.targets.some(t => t.x === x && t.y === y);
          if (isTarget) {
            // 目标点在坑上，保持 TILE_HOLE（玩家不能走到坑上）
            // targets 列表中已经包含这个位置
          }
        } else if (v === 4) {
          this.boxes.push({ 
            x, 
            y, 
            isInHole: false,
            sinkStartTime: null  // 下陷动画开始时间
          });
          this.tiles[y][x] = TILE_FLOOR;
        } else if (v === 5) {
          this.player.x = x;
          this.player.y = y;
          this.tiles[y][x] = TILE_FLOOR;
        } else if (v === TILE_TARGET) {
          // 如果 targets 列表中没有这个位置，添加它
          if (!this.targets.some(t => t.x === x && t.y === y)) {
            this.targets.push({ x, y });
          }
          // 目标点不在坑上，转换为可走地面
          this.tiles[y][x] = TILE_FLOOR;
        }
      }
    }
    
    this._emitState();
  }

  _emitState() {
    if (this.onStateChange) {
      this.onStateChange(this);
    }
  }

  isInside(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getTile(x, y) {
    if (!this.isInside(x, y)) return TILE_EMPTY;
    return this.tiles[y][x];
  }

  isWalkable(x, y) {
    const t = this.getTile(x, y);
    if (t === TILE_EMPTY || t === TILE_WALL || t === TILE_HOLE) return false;
    return true;
  }

  getBoxAt(x, y) {
    // 检查箱子是否在这个位置，且不在坑里（包括正在下陷的箱子）
    return this.boxes.find((b) => {
      if (b.x !== x || b.y !== y) return false;
      // 如果箱子正在下陷，也算作在这个位置（不能推动）
      if (b.sinkStartTime !== null && b.sinkStartTime !== undefined) return true;
      return !b.isInHole;
    }) || null;
  }

  isHole(x, y) {
    return this.getTile(x, y) === TILE_HOLE;
  }

  isTarget(x, y) {
    return this.targets.some(t => t.x === x && t.y === y);
  }

  tryMovePlayer(dx, dy) {
    if (this.gameState !== 'playing') return;
    if (this.moveLock) return;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (!this.isInside(nx, ny)) return;
    const tile = this.getTile(nx, ny);
    if (tile === TILE_EMPTY || tile === TILE_WALL || tile === TILE_HOLE) {
      return;  // 玩家不能走到坑上
    }

    const box = this.getBoxAt(nx, ny);
    if (!box) {
      this.player.x = nx;
      this.player.y = ny;
      this._emitState();
      return;
    }

    // 如果箱子正在下陷，不能推动
    if (box.sinkStartTime !== null && box.sinkStartTime !== undefined) {
      const elapsed = Date.now() - box.sinkStartTime;
      if (elapsed < 800) {  // 下陷动画未完成（800ms）
        return;
      }
    }

    const bx2 = box.x + dx;
    const by2 = box.y + dy;
    if (!this.isInside(bx2, by2)) return;
    const tile2 = this.getTile(bx2, by2);
    if (tile2 === TILE_EMPTY || tile2 === TILE_WALL) return;
    if (this.getBoxAt(bx2, by2)) return;

    const intoHole = tile2 === TILE_HOLE;
    box.x = bx2;
    box.y = by2;
    if (intoHole) {
      // 开始下陷动画
      box.sinkStartTime = Date.now();
      box.isInHole = false;  // 先标记为未在坑里，动画完成后才标记为在坑里
      this.tiles[by2][bx2] = TILE_FLOOR;
      this.filledHoles++;
    }

    this.player.x = nx;
    this.player.y = ny;

    // 检查是否所有箱子都在目标点上
    // 注意：目标点可能在坑上，所以箱子可以在坑里但仍在目标点上
    const allOnTargets = this.boxes.every(box => {
      return this.targets.some(t => t.x === box.x && t.y === box.y);
    });

    if (allOnTargets && this.boxes.length > 0 && this.targets.length > 0) {
      this.gameState = 'completed';
    }

    this._emitState();
  }

  buildDrawCommands(cellSize, baseHeight = 0.3) {
    const commands = [];
    const model = mat4.create();

    // 地面 / 坑 / 墙（先渲染，作为背景）
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = this.tiles[y][x];
        if (t === TILE_EMPTY) continue;

        const worldX = (x - this.width / 2) * cellSize;
        const worldZ = (y - this.height / 2) * cellSize;

        mat4.identity(model);
        const isHole = t === TILE_HOLE;
        const isWall = t === TILE_WALL;
        const height = isWall ? baseHeight * 2.5 : baseHeight;
        const yOffset = isHole ? -baseHeight * 0.6 : -0.5 * baseHeight;

        mat4.translate(model, model, [worldX, yOffset, worldZ]);
        mat4.scale(model, model, [cellSize, height, cellSize]);

        let color;
        if (isWall) {
          color = [0.4, 0.4, 0.45];  // 调亮墙的颜色
        } else if (isHole) {
          color = [0.1, 0.1, 0.25];  // 稍微调亮坑的颜色（保持深色但可见）
        } else {
          color = [0.3, 0.6, 0.35];  // 调亮地面的颜色
        }

        commands.push({ 
          model: model.slice(0), 
          color,
          renderOrder: 0  // 地面先渲染
        });
      }
    }

    // 目标点标记（发光球体，悬浮在地面上方）
    for (const target of this.targets) {
      const worldX = (target.x - this.width / 2) * cellSize;
      const worldZ = (target.y - this.height / 2) * cellSize;
      const isTargetOnHole = this.getTile(target.x, target.y) === TILE_HOLE;
      const holeYOffset = isTargetOnHole ? -baseHeight * 0.6 : -0.5 * baseHeight;
      
      mat4.identity(model);
      // 悬浮在地面上方，如果是坑则悬浮在坑上方
      mat4.translate(model, model, [worldX, holeYOffset + baseHeight * 0.8, worldZ]);
      mat4.scale(model, model, [cellSize * 0.3, cellSize * 0.3, cellSize * 0.3]);
      commands.push({ 
        model: model.slice(0), 
        color: [0.9, 0.8, 0.1],
        isTarget: true,  // 标记为目标点，使用特殊渲染
        renderOrder: 1  // 目标点在地面之后渲染
      });
    }

    // 箱子
    const currentTime = Date.now();
    const sinkDuration = 800;  // 下陷动画持续时间（毫秒）
    
    // 计算箱子的正常高度和目标高度
    // 正常箱子中心：baseHeight * 0.5
    // 箱子高度（缩放后）：cellSize * 0.8
    // 箱子上表面正常位置：baseHeight * 0.5 + (cellSize * 0.8) / 2
    // 地面顶部：-0.5 * baseHeight + baseHeight / 2 = 0
    // 要让箱子上表面与地面齐平（稍微高一点点避免 z-fighting），箱子中心应该在：
    // 0 + 0.01 - (cellSize * 0.8) / 2 = 0.01 - cellSize * 0.4
    // 这样箱子上表面在 y = 0.01，稍微高于地面
    const normalBoxCenterY = baseHeight * 0.5;
    const boxHeight = cellSize * 0.8;
    const surfaceOffset = 0.01;  // 稍微高于地面，避免 z-fighting
    const targetBoxCenterY = surfaceOffset - boxHeight * 0.5;  // 箱子上表面稍微高于地面
    const sinkDistance = normalBoxCenterY - targetBoxCenterY;
    
    for (const box of this.boxes) {
      const worldX = (box.x - this.width / 2) * cellSize;
      const worldZ = (box.y - this.height / 2) * cellSize;
      mat4.identity(model);
      
      let boxCenterY = normalBoxCenterY;
      let isSinking = false;
      
      // 检查箱子是否正在下陷
      if (box.sinkStartTime !== null && box.sinkStartTime !== undefined) {
        const elapsed = currentTime - box.sinkStartTime;
        if (elapsed < sinkDuration) {
          // 正在下陷动画中
          isSinking = true;
          // 使用缓动函数（ease-in-out）实现平滑下陷
          const progress = elapsed / sinkDuration;
          const easedProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          // 从正常位置下陷到目标位置
          boxCenterY = normalBoxCenterY - sinkDistance * easedProgress;
        } else {
          // 动画完成，标记为在坑里
          box.isInHole = true;
          box.sinkStartTime = null;
          boxCenterY = targetBoxCenterY;
        }
      } else if (box.isInHole) {
        // 已经在坑里（动画完成），箱子上表面与地面齐平
        boxCenterY = targetBoxCenterY;
      }
      
      mat4.translate(model, model, [worldX, boxCenterY, worldZ]);
      mat4.scale(model, model, [cellSize * 0.8, cellSize * 0.8, cellSize * 0.8]);
      
      // 检查箱子是否在目标点上
      const isOnTarget = this.targets.some(t => t.x === box.x && t.y === box.y);
      const color = (box.isInHole || isSinking)
        ? [0.5, 0.35, 0.2]  // 调亮在坑里的箱子颜色
        : isOnTarget 
          ? [0.95, 0.8, 0.2]  // 调亮在目标点上的箱子颜色
          : [0.85, 0.6, 0.3];  // 调亮普通箱子颜色
      commands.push({ 
        model: model.slice(0), 
        color,
        renderOrder: 2  // 箱子在地面和目标点之后渲染，确保上表面可见
      });
    }

    // 玩家
    {
      const worldX = (this.player.x - this.width / 2) * cellSize;
      const worldZ = (this.player.y - this.height / 2) * cellSize;
      mat4.identity(model);
      mat4.translate(model, model, [worldX, baseHeight * 0.8, worldZ]);
      mat4.scale(model, model, [cellSize * 0.6, cellSize * 1.2, cellSize * 0.6]);
      const color = [0.3, 0.7, 1.0];  // 调亮玩家颜色
      commands.push({ 
        model: model.slice(0), 
        color,
        renderOrder: 3  // 玩家最后渲染
      });
    }

    return commands;
  }
}


