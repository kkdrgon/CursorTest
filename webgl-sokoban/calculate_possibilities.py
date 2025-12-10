#!/usr/bin/env python3
"""
计算 10×15 地图全随机的可能性数量
"""

import math

def calculate_map_possibilities():
    """计算地图生成的可能性"""
    
    width = 10
    height = 15
    
    # 总格子数
    total_cells = width * height
    print(f"地图尺寸: {width} × {height} = {total_cells} 个格子")
    
    # 四周的墙（固定）
    border_cells = 2 * (width + height - 2)  # 四周的墙
    internal_cells = total_cells - border_cells
    print(f"四周墙: {border_cells} 个（固定）")
    print(f"内部可用格子: {internal_cells} 个")
    print()
    
    # 每个内部格子可能的类型
    # 0=空, 1=地面, 2=坑, 3=墙, 4=箱子, 5=玩家, 6=目标点
    tile_types = 7  # 0-6 共7种类型
    
    print("=" * 60)
    print("情况1: 完全随机（每个格子可以是任意类型）")
    print("=" * 60)
    possibilities_1 = tile_types ** internal_cells
    print(f"每个内部格子有 {tile_types} 种可能")
    print(f"总可能性: {tile_types}^{internal_cells} = {possibilities_1}")
    print(f"科学计数法: {possibilities_1:.2e}")
    print(f"位数: {len(str(possibilities_1))} 位")
    print()
    
    print("=" * 60)
    print("情况2: 排除空类型（内部格子不能是空）")
    print("=" * 60)
    tile_types_no_empty = 6  # 1-6 共6种类型
    possibilities_2 = tile_types_no_empty ** internal_cells
    print(f"每个内部格子有 {tile_types_no_empty} 种可能（排除空）")
    print(f"总可能性: {tile_types_no_empty}^{internal_cells} = {possibilities_2}")
    print(f"科学计数法: {possibilities_2:.2e}")
    print(f"位数: {len(str(possibilities_2))} 位")
    print()
    
    print("=" * 60)
    print("情况3: 实际生成器的约束")
    print("=" * 60)
    print("约束条件：")
    print("  - 必须有且仅有一个玩家（5）")
    print("  - 可以有多个箱子（4）")
    print("  - 可以有多个目标点（6）")
    print("  - 可以有多个坑（2）")
    print("  - 可以有多个墙（3）")
    print("  - 其余是地面（1）")
    print()
    
    # 假设有 n 个箱子，m 个目标点，k 个坑
    # 那么需要：1个玩家 + n个箱子 + m个目标点 + k个坑 + 一些墙 + 其余地面
    # 总格子数 = 1 + n + m + k + walls + floors
    
    # 简化计算：假设平均情况
    # 假设：2个箱子，2个目标点，1个坑，10个墙，其余是地面
    example_boxes = 2
    example_targets = 2
    example_holes = 1
    example_walls = 10
    
    used_cells = 1 + example_boxes + example_targets + example_holes + example_walls
    floor_cells = internal_cells - used_cells
    
    print(f"示例配置：")
    print(f"  - 玩家: 1 个")
    print(f"  - 箱子: {example_boxes} 个")
    print(f"  - 目标点: {example_targets} 个")
    print(f"  - 坑: {example_holes} 个")
    print(f"  - 墙: {example_walls} 个")
    print(f"  - 地面: {floor_cells} 个")
    print()
    
    # 计算排列组合
    # C(internal_cells, 1) * C(internal_cells-1, example_boxes) * C(internal_cells-1-example_boxes, example_targets) * ...
    # 但这样计算太复杂，我们简化
    
    # 更实际的估算：考虑位置排列
    # 玩家位置：C(internal_cells, 1) = internal_cells
    # 箱子位置：C(internal_cells-1, example_boxes)
    # 目标点位置：C(internal_cells-1-example_boxes, example_targets)
    # 坑位置：C(internal_cells-1-example_boxes-example_targets, example_holes)
    # 墙位置：C(internal_cells-1-example_boxes-example_targets-example_holes, example_walls)
    
    def combination(n, k):
        """计算组合数 C(n, k)"""
        if k > n or k < 0:
            return 0
        if k == 0 or k == n:
            return 1
        return math.factorial(n) // (math.factorial(k) * math.factorial(n - k))
    
    # 计算一个具体配置的可能性
    remaining = internal_cells
    possibilities_3 = 1
    
    # 玩家位置
    player_pos = combination(remaining, 1)
    possibilities_3 *= player_pos
    remaining -= 1
    print(f"玩家位置选择: C({internal_cells}, 1) = {player_pos}")
    
    # 箱子位置
    box_pos = combination(remaining, example_boxes)
    possibilities_3 *= box_pos
    remaining -= example_boxes
    print(f"箱子位置选择: C({internal_cells-1}, {example_boxes}) = {box_pos}")
    
    # 目标点位置
    target_pos = combination(remaining, example_targets)
    possibilities_3 *= target_pos
    remaining -= example_targets
    print(f"目标点位置选择: C({remaining+example_targets}, {example_targets}) = {target_pos}")
    
    # 坑位置
    hole_pos = combination(remaining, example_holes)
    possibilities_3 *= hole_pos
    remaining -= example_holes
    print(f"坑位置选择: C({remaining+example_holes}, {example_holes}) = {hole_pos}")
    
    # 墙位置
    wall_pos = combination(remaining, example_walls)
    possibilities_3 *= wall_pos
    remaining -= example_walls
    print(f"墙位置选择: C({remaining+example_walls}, {example_walls}) = {wall_pos}")
    
    print()
    print(f"单个配置的可能性: {possibilities_3}")
    print(f"科学计数法: {possibilities_3:.2e}")
    print()
    
    # 但实际配置数量是变化的（不同数量的箱子、目标点、坑、墙）
    # 这是一个更复杂的组合问题
    
    print("=" * 60)
    print("情况4: 考虑所有可能的配置组合")
    print("=" * 60)
    print("如果允许：")
    print("  - 箱子数量: 1-5 个")
    print("  - 目标点数量: 1-5 个")
    print("  - 坑数量: 1-3 个")
    print("  - 墙数量: 5-20 个")
    print()
    
    # 估算所有配置的总可能性
    total_configs = 0
    for boxes in range(1, 6):
        for targets in range(1, 6):
            for holes in range(1, 4):
                for walls in range(5, 21):
                    used = 1 + boxes + targets + holes + walls
                    if used > internal_cells:
                        continue
                    # 计算这个配置的可能性
                    remaining = internal_cells
                    config_poss = 1
                    config_poss *= combination(remaining, 1)  # 玩家
                    remaining -= 1
                    config_poss *= combination(remaining, boxes)  # 箱子
                    remaining -= boxes
                    config_poss *= combination(remaining, targets)  # 目标点
                    remaining -= targets
                    config_poss *= combination(remaining, holes)  # 坑
                    remaining -= holes
                    config_poss *= combination(remaining, walls)  # 墙
                    total_configs += config_poss
    
    print(f"所有可能配置的总数: {total_configs}")
    print(f"科学计数法: {total_configs:.2e}")
    print(f"位数: {len(str(total_configs))} 位")
    print()
    
    print("=" * 60)
    print("总结")
    print("=" * 60)
    print(f"10×15 地图（内部 {internal_cells} 个格子）的可能性：")
    print(f"  1. 完全随机: {possibilities_1:.2e}")
    print(f"  2. 排除空类型: {possibilities_2:.2e}")
    print(f"  3. 单个合理配置: {possibilities_3:.2e}")
    print(f"  4. 所有合理配置: {total_configs:.2e}")
    print()
    print("注意：实际生成器还有更多约束（可解性、唯一解等），")
    print("所以实际可生成的关卡数量会远小于理论值。")


if __name__ == '__main__':
    calculate_map_possibilities()

