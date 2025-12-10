#!/usr/bin/env python3
"""
推箱子关卡生成器（Python版本）
- 自动生成关卡
- 验证关卡是否可解
- 验证关卡是否有唯一解
- 保存关卡到文件
"""

import json
import random
import copy
from typing import List, Tuple, Set, Optional, Dict
from collections import deque
from dataclasses import dataclass

# 瓦片类型常量
TILE_EMPTY = 0
TILE_FLOOR = 1
TILE_HOLE = 2
TILE_WALL = 3
TILE_BOX = 4
TILE_PLAYER = 5
TILE_TARGET = 6


@dataclass
class Position:
    x: int
    y: int

    def __hash__(self):
        return hash((self.x, self.y))

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y


@dataclass
class Box:
    x: int
    y: int
    is_in_hole: bool = False

    def __hash__(self):
        return hash((self.x, self.y, self.is_in_hole))

    def __eq__(self, other):
        return (self.x == other.x and 
                self.y == other.y and 
                self.is_in_hole == other.is_in_hole)


@dataclass
class GameState:
    player: Position
    boxes: List[Box]

    def serialize(self) -> str:
        """序列化状态为字符串（用于去重）"""
        box_str = ';'.join(sorted([f"{b.x},{b.y},{1 if b.is_in_hole else 0}" 
                                   for b in self.boxes]))
        return f"{self.player.x},{self.player.y}|{box_str}"

    def __hash__(self):
        return hash(self.serialize())


class SokobanSolver:
    """推箱子求解器"""
    
    def __init__(self, tiles: List[List[int]], width: int, height: int, 
                 targets: List[Position]):
        self.tiles = tiles
        self.width = width
        self.height = height
        self.targets = targets
        self.dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)]

    def is_inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get_tile(self, x: int, y: int) -> int:
        if not self.is_inside(x, y):
            return TILE_EMPTY
        return self.tiles[y][x]

    def is_walkable(self, x: int, y: int, boxes: List[Box]) -> bool:
        tile = self.get_tile(x, y)
        if tile == TILE_EMPTY or tile == TILE_WALL or tile == TILE_HOLE:
            return False  # 玩家不能走到坑上
        # 检查是否有箱子（不在坑里的箱子是障碍）
        for box in boxes:
            if box.x == x and box.y == y and not box.is_in_hole:
                return False
        return True

    def compute_player_reachable(self, start: Position, boxes: List[Box]) -> Set[Position]:
        """计算玩家可达区域（BFS）"""
        reachable = set()
        queue = deque([start])
        reachable.add(start)

        while queue:
            pos = queue.popleft()
            for dx, dy in self.dirs:
                nx, ny = pos.x + dx, pos.y + dy
                new_pos = Position(nx, ny)

                if new_pos in reachable:
                    continue
                if not self.is_walkable(nx, ny, boxes):
                    continue

                reachable.add(new_pos)
                queue.append(new_pos)

        return reachable

    def is_solved(self, boxes: List[Box]) -> bool:
        """检查是否已通关"""
        # 箱子数量 = 目标点数量 + 坑数量
        # 通关条件：所有目标点上都有箱子（箱子可以在坑里，只要在目标点上）
        if len(boxes) == 0:
            return False

        # 检查所有目标点是否都有箱子
        for target in self.targets:
            has_box = any(box.x == target.x and box.y == target.y for box in boxes)
            if not has_box:
                return False
        return True
    
    def can_reach_targets_without_filling_holes(self, initial_state: GameState) -> bool:
        """检查在不填坑的情况下，箱子是否能到达目标点"""
        # 创建一个临时的 tiles，将所有坑视为墙（不可走）
        temp_tiles = [row[:] for row in self.tiles]
        for y in range(self.height):
            for x in range(self.width):
                if temp_tiles[y][x] == TILE_HOLE:
                    temp_tiles[y][x] = TILE_WALL  # 将坑视为墙
        
        # 使用临时 tiles 创建临时求解器
        temp_solver = SokobanSolver(
            temp_tiles,
            self.width,
            self.height,
            self.targets
        )
        
        # 检查是否可解（在不填坑的情况下）
        solvable, _ = temp_solver.is_solvable(initial_state)
        return solvable

    def has_deadlock(self, box: Box, boxes: List[Box]) -> bool:
        """检查箱子是否在死锁位置（简单版：非目标角落）"""
        # 如果箱子已经在目标点上，不算死锁
        if any(t.x == box.x and t.y == box.y for t in self.targets):
            return False

        x, y = box.x, box.y
        left_blocked = x == 0 or self.get_tile(x - 1, y) == TILE_WALL
        right_blocked = x == self.width - 1 or self.get_tile(x + 1, y) == TILE_WALL
        up_blocked = y == 0 or self.get_tile(x, y - 1) == TILE_WALL
        down_blocked = y == self.height - 1 or self.get_tile(x, y + 1) == TILE_WALL

        # 角落死锁：两个相邻方向都被堵住
        if (left_blocked or right_blocked) and (up_blocked or down_blocked):
            return True

        return False

    def find_solution(self, initial_state: GameState, 
                     find_all: bool = False) -> Tuple[bool, Optional[List[GameState]], int]:
        """
        查找解
        :param find_all: 如果为True，找到所有解（用于验证唯一解）
        :return: (是否可解, 解路径列表, 搜索的节点数)
        """
        queue = deque([(initial_state, [])])  # (状态, 路径)
        visited = {initial_state.serialize(): initial_state}
        solutions = []
        max_iterations = 100000
        iterations = 0

        while queue and iterations < max_iterations:
            iterations += 1
            state, path = queue.popleft()

            # 检查是否已通关
            if self.is_solved(state.boxes):
                solutions.append(path + [state])
                if not find_all:
                    return True, solutions[0], iterations
                # 如果已经找到多个解，可以提前返回（用于唯一解验证）
                if len(solutions) > 1:
                    return True, solutions, iterations
                continue

            # 计算玩家可达区域
            reachable = self.compute_player_reachable(state.player, state.boxes)

            # 尝试推每个箱子
            for i, box in enumerate(state.boxes):
                if box.is_in_hole:
                    continue  # 在坑里的箱子不能再推动

                for dx, dy in self.dirs:
                    # 玩家需要站在 box 的反方向才能推
                    push_from_x = box.x - dx
                    push_from_y = box.y - dy
                    push_from = Position(push_from_x, push_from_y)

                    # 检查玩家能否到达推的位置
                    if not self.is_inside(push_from_x, push_from_y):
                        continue
                    if push_from not in reachable:
                        continue

                    # 箱子要推到的位置
                    dest_x = box.x + dx
                    dest_y = box.y + dy

                    # 检查目标位置是否合法
                    if not self.is_inside(dest_x, dest_y):
                        continue

                    dest_tile = self.get_tile(dest_x, dest_y)
                    if dest_tile == TILE_EMPTY or dest_tile == TILE_WALL:
                        continue

                    # 检查目标位置是否有其他箱子
                    has_other_box = any(
                        j != i and b.x == dest_x and b.y == dest_y and not b.is_in_hole
                        for j, b in enumerate(state.boxes)
                    )
                    if has_other_box:
                        continue

                    # 生成新状态
                    new_boxes = []
                    for j, b in enumerate(state.boxes):
                        if j == i:
                            into_hole = dest_tile == TILE_HOLE
                            new_boxes.append(Box(dest_x, dest_y, into_hole))
                        else:
                            new_boxes.append(Box(b.x, b.y, b.is_in_hole))

                    # 检查死锁
                    new_box = new_boxes[i]
                    if self.has_deadlock(new_box, new_boxes):
                        continue

                    new_player = Position(box.x, box.y)
                    new_state = GameState(new_player, new_boxes)

                    state_key = new_state.serialize()
                    if state_key not in visited:
                        visited[state_key] = new_state
                        queue.append((new_state, path + [state]))

        if solutions:
            return True, solutions if find_all else solutions[0], iterations
        return False, None, iterations

    def is_solvable(self, initial_state: GameState) -> Tuple[bool, int]:
        """判断关卡是否可解"""
        solvable, _, iterations = self.find_solution(initial_state, find_all=False)
        return solvable, iterations

    def has_unique_solution(self, initial_state: GameState) -> Tuple[bool, int]:
        """判断关卡是否有唯一解（通过找所有解来验证）"""
        solvable, solutions, iterations = self.find_solution(initial_state, find_all=True)
        if not solvable:
            return False, iterations
        
        # 如果只找到一个解，认为是唯一解
        # 更严格的验证：检查所有解是否"本质上相同"（相同的关键决策点）
        if len(solutions) == 1:
            return True, iterations
        
        # 如果有多个解，检查它们是否在关键步骤上不同
        # 简化版：如果找到多个解，认为不是唯一解
        return False, iterations


class LevelGenerator:
    """关卡生成器"""
    
    def __init__(self, width: int = 8, height: int = 8, 
                 num_targets: int = 2, num_holes: int = 1, 
                 wall_density: float = 0.15):
        self.width = width
        self.height = height
        self.num_targets = num_targets  # 目标点数量
        self.num_holes = num_holes
        self.num_boxes = num_targets + num_holes  # 箱子数量 = 目标点数量 + 坑数量
        self.wall_density = wall_density

    def generate_candidate(self) -> Optional[Dict]:
        """生成一个候选关卡"""
        tiles = [[TILE_EMPTY for _ in range(self.width)] for _ in range(self.height)]
        boxes = []
        targets = []
        player = None

        # 1. 四周放墙
        for y in range(self.height):
            for x in range(self.width):
                if x == 0 or x == self.width - 1 or y == 0 or y == self.height - 1:
                    tiles[y][x] = TILE_WALL
                else:
                    tiles[y][x] = TILE_FLOOR

        # 2. 随机放一些内部墙
        internal_cells = [(x, y) for y in range(1, self.height - 1) 
                          for x in range(1, self.width - 1)]
        random.shuffle(internal_cells)

        num_walls = int(len(internal_cells) * self.wall_density)
        for i in range(min(num_walls, len(internal_cells))):
            x, y = internal_cells[i]
            tiles[y][x] = TILE_WALL

        # 3. 收集可用格子
        available_cells = [(x, y) for x, y in internal_cells 
                          if tiles[y][x] == TILE_FLOOR]

        if len(available_cells) < self.num_boxes + self.num_holes + 1:
            return None

        random.shuffle(available_cells)
        idx = 0

        # 先放置坑（目标点可以放在坑上）
        for i in range(self.num_holes):
            if idx >= len(available_cells):
                return None
            x, y = available_cells[idx]
            idx += 1
            tiles[y][x] = TILE_HOLE

        # 放置目标点（可以在坑上）
        # 如果目标点在坑上，保持 TILE_HOLE，这样玩家不能直接走到坑上
        # 箱子推入坑后，坑变成地面，箱子在目标点上
        for i in range(self.num_targets):
            if idx >= len(available_cells):
                return None
            x, y = available_cells[idx]
            idx += 1
            targets.append(Position(x, y))
            # 如果目标点不在坑上，标记为 TILE_TARGET
            # 如果目标点在坑上，保持 TILE_HOLE（这样玩家不能走到坑上）
            if tiles[y][x] != TILE_HOLE:
                tiles[y][x] = TILE_TARGET

        # 放置箱子（确保不在目标点和坑上）
        box_cells = [(x, y) for x, y in available_cells[idx:] 
                    if tiles[y][x] == TILE_FLOOR]
        if len(box_cells) < self.num_boxes:
            return None

        for i in range(self.num_boxes):
            x, y = box_cells[i]
            boxes.append(Box(x, y, False))

        # 放置玩家
        player_cells = [(x, y) for x, y in available_cells[idx:] 
                       if tiles[y][x] == TILE_FLOOR and 
                       not any(b.x == x and b.y == y for b in boxes)]
        if not player_cells:
            return None
        x, y = player_cells[0]
        player = Position(x, y)

        return {
            'width': self.width,
            'height': self.height,
            'tiles': tiles,
            'player': player,
            'boxes': boxes,
            'targets': targets,
        }

    def generate_solvable_level(self, max_attempts: int = 100) -> Optional[Dict]:
        """生成一个可解的关卡"""
        for attempt in range(max_attempts):
            level = self.generate_candidate()
            if not level:
                continue

            solver = SokobanSolver(
                level['tiles'],
                level['width'],
                level['height'],
                level['targets']
            )

            initial_state = GameState(level['player'], level['boxes'])
            
            # 检查是否可解
            solvable, iterations = solver.is_solvable(initial_state)
            if not solvable:
                continue
            
            # 验证：在不填坑的情况下，箱子不能到达目标点
            can_reach_without_filling = solver.can_reach_targets_without_filling_holes(initial_state)
            if can_reach_without_filling:
                # 如果不填坑也能到达目标点，不符合要求，跳过
                continue

            level['solver_iterations'] = iterations
            return level

        return None

    def generate_unique_solution_level(self, max_attempts: int = 200) -> Optional[Dict]:
        """生成一个有唯一解的关卡"""
        for attempt in range(max_attempts):
            if attempt > 0 and attempt % 10 == 0:
                print(f"  尝试中... ({attempt}/{max_attempts})")
            
            level = self.generate_solvable_level(max_attempts=30)
            if not level:
                continue

            solver = SokobanSolver(
                level['tiles'],
                level['width'],
                level['height'],
                level['targets']
            )

            initial_state = GameState(level['player'], level['boxes'])
            has_unique, iterations = solver.has_unique_solution(initial_state)

            if has_unique:
                level['unique_solution'] = True
                level['solver_iterations'] = iterations
                return level

        return None


def convert_to_js_format(level: Dict) -> Dict:
    """转换为 JS 格式的关卡数据"""
    tiles = [row[:] for row in level['tiles']]
    
    # 标记箱子
    for box in level['boxes']:
        if not box.is_in_hole:
            tiles[box.y][box.x] = TILE_BOX
    
    # 标记玩家
    player = level['player']
    tiles[player.y][player.x] = TILE_PLAYER
    
    # 标记目标点（目标点可能在坑上）
    # 如果目标点在坑上，保持 TILE_HOLE（这样玩家不能走到坑上）
    # 如果目标点不在坑上，标记为 TILE_TARGET
    for target in level['targets']:
        x, y = target.x, target.y
        # 如果位置不是箱子、玩家，且不是坑，则标记为 TILE_TARGET
        if tiles[y][x] != TILE_BOX and tiles[y][x] != TILE_PLAYER and tiles[y][x] != TILE_HOLE:
            tiles[y][x] = TILE_TARGET
        # 如果目标点在坑上，保持 TILE_HOLE（不覆盖）

    # 返回关卡数据，包含 targets 列表（用于标识目标点，包括在坑上的）
    return {
        'width': level['width'],
        'height': level['height'],
        'tiles': tiles,
        'targets': [{'x': t.x, 'y': t.y} for t in level['targets']],  # 添加 targets 列表
    }


def save_levels_to_file(levels: List[Dict], filename: str = 'generated_levels.js'):
    """保存关卡到 JS 文件"""
    js_content = "// 自动生成的关卡：0=空，1=地面，2=坑，3=墙，4=箱子，5=玩家，6=目标点\n\n"
    js_content += "export const GENERATED_LEVELS = [\n"
    
    for i, level in enumerate(levels):
        js_level = convert_to_js_format(level)
        js_content += "  {\n"
        js_content += f"    width: {js_level['width']},\n"
        js_content += f"    height: {js_level['height']},\n"
        js_content += "    tiles: [\n"
        for row in js_level['tiles']:
            js_content += f"      {row},\n"
        js_content += "    ],\n"
        js_content += "  },\n"
    
    js_content += "];\n"
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"已保存 {len(levels)} 个关卡到 {filename}")


def save_levels_to_json(levels: List[Dict], filename: str = 'generated_levels.json'):
    """保存关卡到 JSON 文件"""
    json_levels = []
    for level in levels:
        js_level = convert_to_js_format(level)
        json_levels.append(js_level)
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(json_levels, f, indent=2, ensure_ascii=False)
    
    print(f"已保存 {len(levels)} 个关卡到 {filename}")


def get_random_level_size():
    """随机生成关卡尺寸（支持非方形）"""
    # 预设的尺寸组合（宽 x 高）
    size_presets = [
        (6, 6),   # 小方形
        (7, 7),   # 中小方形
        (8, 8),   # 中方形
        (9, 9),   # 大方形
        (6, 8),   # 竖矩形
        (8, 6),   # 横矩形
        (7, 9),   # 竖矩形
        (9, 7),   # 横矩形
        (6, 10),  # 长竖矩形
        (10, 6),  # 长横矩形
        (8, 10),  # 竖矩形
        (10, 8),  # 横矩形
        (7, 11),  # 细长竖矩形
        (11, 7),  # 细长横矩形
    ]
    return random.choice(size_presets)


def get_level_params_for_size(width: int, height: int):
    """根据关卡尺寸计算合适的参数"""
    area = width * height
    internal_area = (width - 2) * (height - 2)  # 减去四周的墙
    
    # 根据面积计算目标点和坑的数量
    # 箱子数量 = 目标点数量 + 坑数量
    if internal_area < 20:
        num_targets = 1
        num_holes = 1
    elif internal_area < 35:
        num_targets = 2
        num_holes = 1
    elif internal_area < 50:
        num_targets = 2
        num_holes = random.choice([1, 2])
    else:
        num_targets = random.choice([2, 3])
        num_holes = random.choice([1, 2])
    
    # 箱子数量 = 目标点数量 + 坑数量
    num_boxes = num_targets + num_holes
    
    # 根据尺寸调整墙密度
    if width <= 6 or height <= 6:
        wall_density = 0.1  # 小关卡少放墙
    elif width >= 10 or height >= 10:
        wall_density = 0.18  # 大关卡多放墙
    else:
        wall_density = 0.15
    
    return num_boxes, num_targets, num_holes, wall_density


def main():
    """主函数"""
    import sys
    
    # 解析命令行参数
    num_to_generate = 5
    max_attempts = 200
    fixed_size = None  # 固定尺寸，如果为 None 则随机
    
    if len(sys.argv) > 1:
        num_to_generate = int(sys.argv[1])
    if len(sys.argv) > 2:
        max_attempts = int(sys.argv[2])
    if len(sys.argv) > 3:
        # 格式: WxH 例如 8x10
        size_str = sys.argv[3]
        if 'x' in size_str:
            w, h = map(int, size_str.split('x'))
            fixed_size = (w, h)
    
    print("开始生成唯一解关卡...")
    print("=" * 50)
    print(f"参数: 生成 {num_to_generate} 个关卡，每个最多尝试 {max_attempts} 次")
    if fixed_size:
        print(f"固定尺寸: {fixed_size[0]}x{fixed_size[1]}")
    else:
        print("尺寸: 随机（支持非方形）")
    print("=" * 50)
    
    generated_levels = []
    
    for i in range(num_to_generate):
        print(f"\n正在生成第 {i+1}/{num_to_generate} 个关卡...")
        
        # 随机选择关卡尺寸（如果未指定固定尺寸）
        if fixed_size:
            width, height = fixed_size
        else:
            width, height = get_random_level_size()
        
        # 根据尺寸计算合适的参数
        num_boxes, num_targets, num_holes, wall_density = get_level_params_for_size(width, height)
        
        print(f"  尺寸: {width}x{height}, 目标点: {num_targets}, 坑: {num_holes}, 箱子: {num_boxes} (目标点+坑), 墙密度: {wall_density:.2f}")
        
        generator = LevelGenerator(
            width=width,
            height=height,
            num_targets=num_targets,
            num_holes=num_holes,
            wall_density=wall_density
        )
        
        level = generator.generate_unique_solution_level(max_attempts=max_attempts)
        
        if level:
            print(f"✓ 成功生成唯一解关卡 (搜索节点数: {level.get('solver_iterations', 0)})")
            generated_levels.append(level)
        else:
            print("✗ 生成失败，跳过")
    
    if generated_levels:
        print("\n" + "=" * 50)
        print(f"成功生成 {len(generated_levels)} 个唯一解关卡")
        
        # 统计尺寸分布
        size_counts = {}
        for level in generated_levels:
            size_key = f"{level['width']}x{level['height']}"
            size_counts[size_key] = size_counts.get(size_key, 0) + 1
        
        print("\n尺寸分布:")
        for size, count in sorted(size_counts.items()):
            print(f"  {size}: {count} 个")
        
        # 保存为 JS 格式
        save_levels_to_file(generated_levels, 'src/generated_levels.js')
        
        # 也保存为 JSON 格式（备用）
        save_levels_to_json(generated_levels, 'generated_levels.json')
        
        print("\n生成完成！")
        print(f"关卡文件已保存到: src/generated_levels.js")
    else:
        print("\n未能生成任何关卡，请调整参数后重试。")
        print("提示: 可以尝试减少 num_boxes 或增加 max_attempts")


if __name__ == '__main__':
    main()

