## 椭圆岛地图 Web 版实现设计（HTML + JS）

### 1. 页面组织
- `index.html`
  - `<canvas id="mapCanvas" width="1200" height="900">`：俯视渲染。
  - `<section id="infoPanel">`：显示当前模式、参数、碰撞检测结果。
  - `<form id="controls">`：调试控件（切换图层、模拟射线等）。
- `styles.css`
  - 基础布局（左右结构）、控件样式、Canvas 背景/格线。
- `main.js`
  - 负责数据定义、渲染循环、交互逻辑、碰撞演示。

### 2. 数据结构
```js
const MAP_CONFIG = {
  size: { width: 400, height: 300 },      // 米
  canvasScale: 2.5,                       // px per meter
  layers: {
    terrain: 1,
    staticObstacle: 2,
    water: 4,
    cliff: 8,
  },
  elevationProfile: { max: 45, centerPlateauRadius: 80 },
  spawnPoints: [
    { id: 'A1', team: 'blue', position: { x: -160, z: 0 } },
    { id: 'A2', team: 'blue', position: { x: 0, z: -120 } },
    { id: 'B1', team: 'red', position: { x: 160, z: 0 } },
    { id: 'B2', team: 'red', position: { x: 0, z: 120 } },
  ],
  paths: [
    { id: 'main_x_pos', width: 20, from: { x: 0, z: 0 }, to: { x: 200, z: 0 } },
    // ...
  ],
  obstacles: [
    { type: 'rock', position: { x: 50, z: 90 }, radius: 6, height: 4, collider: 'circle' },
    { type: 'cliff', poly: [...], height: 15 },
  ],
};
```

### 3. 渲染流程
1. **初始化**
   - 获取 Canvas context，计算缩放（米→像素）。
   - 预计算椭圆轮廓 `x²/a² + z²/b² = 1`，用于裁剪海域。
   - 生成背景格线（50m 间距）。
2. **绘制顺序**
   1. 海面（浅蓝圆角矩形，透明）。
   2. 岛屿椭圆主体（填充渐变，高度越高颜色越浅）。
   3. 分区遮罩（森林、中央高地、海岸环带）。
   4. 路径与刷点标记。
   5. 静态障碍、崖壁碰撞轮廓。
   6. 调试图层（箭矢轨迹、碰撞检测点）。
3. **尺寸换算**
   - `canvasX = centerX + pos.x * scale`
   - `canvasY = centerY - pos.z * scale`

### 4. 碰撞演示
- **地形内外判定**：基于椭圆方程判断点是否在岛内。
- **水域触发**：点在椭圆外且距离边界 <20m，显示“入水”状态。
- **射线检测**
  - 拖拽起点/终点或输入初速度。
  - 用离散时间步积分抛物线，逐点检测：
    - 命中地形：当 `y <= elevation(x,z)`。
    - 命中障碍：判断与圆/多边形碰撞。
  - 将命中点以红色十字绘制，并在信息面板显示层级、法线。

### 5. 交互控件
- 图层开关：`[ ] Terrain / [ ] Paths / [ ] Obstacles / [ ] Collision`.
- 视图模式：俯视（默认）、高度热力（颜色映射）、线框模式。
- 抛物线沙盒：
  - 输入拉弓力度（m/s），角度（°），方向（°）。
  - “发射”按钮触发轨迹绘制。
- 刷点调试：高亮当前队伍出生点，随机切换按钮展示不同组合。

### 6. 模块划分
- `Renderer`：封装绘制函数（drawEllipse、drawPath、drawObstacles）。
- `CollisionSystem`：点/线/圆碰撞工具、椭圆内外判定。
- `ParabolaSimulator`：根据输入返回轨迹点、终点信息。
- `UIController`：绑定控件事件，更新状态。

### 7. 开发步骤
1. 搭建基础 HTML/CSS/Canvas 并绘制椭圆轮廓。
2. 加入分区、路径、刷点数据驱动渲染。
3. 实现碰撞逻辑与射线/抛物线可视化。
4. 完善控件、信息面板、调试图层。
5. 提炼配置导出/导入能力（JSON）。

### 8. 后续扩展
- 使用 WebGL/Three.js 进行 3D 预览（带高度）。
- 引入噪声生成器随机化地形、障碍。
- 接入 WebSocket 读取实时 BOT/玩家位置进行可视化。

### 9. 职业与技能模块
- 将弓箭手抛物线射击逻辑单独拆分为 `archerAbility`，便于维护物理与平衡参数。
- 新增战士（近战斩击）和法师（火球术、陨石术）能力模块，统一通过 `AbilityRegistry` 管理。
- 每个技能声明所需输入（速度、仰角、方位角、距离等）与默认值，UI 依赖此配置动态显示控件。
- 技能执行返回轨迹、命中信息与自定义覆盖图层，实现画布统一渲染与日志反馈。
