# 项目结构说明

## 目录结构

```
unity-rollercoaster/
│
├── Assets/                          # Unity资源文件夹
│   ├── Scripts/                     # C#脚本文件夹
│   │   ├── BezierSpline.cs         # 贝塞尔曲线核心类
│   │   ├── BezierEditor.cs         # 场景视图编辑器
│   │   ├── TrackGenerator.cs       # 轨道网格生成器
│   │   └── Editor/                 # 编辑器脚本文件夹
│   │       ├── BezierEditorInspector.cs    # BezierEditor的自定义Inspector
│   │       └── BezierSplineInspector.cs    # BezierSpline的自定义Inspector
│   │
│   ├── Scenes/                      # 场景文件夹
│   │   └── MainScene.unity         # 主场景文件
│   │
│   ├── Materials/                   # 材质文件夹（空，可添加材质）
│   └── Prefabs/                     # 预制体文件夹（空，可保存预制体）
│
├── ProjectSettings/                 # Unity项目设置
│   └── ProjectVersion.txt          # Unity版本信息
│
├── Packages/                        # Unity包管理
│   └── manifest.json               # 包依赖清单
│
├── README.md                        # 项目说明文档
├── QUICKSTART.md                    # 快速开始指南
├── PROJECT_STRUCTURE.md            # 本文件
└── .gitignore                      # Git忽略文件配置

```

## 核心脚本说明

### BezierSpline.cs
**功能**：贝塞尔曲线核心类
- 管理控制点列表
- 计算曲线上的点和切线
- 确保C2连续性（曲率连续）
- 在Scene视图中绘制Gizmos

**关键方法**：
- `AddPoint(Vector3)` - 添加控制点
- `GetPoint(float t)` - 获取曲线上参数t处的点
- `GetTangent(float t)` - 获取切线方向
- `EnsureC2Continuity(int)` - 确保C2连续性

### BezierEditor.cs
**功能**：场景视图交互式编辑器
- 在Scene视图中显示控制点
- 支持拖拽移动控制点和切线
- 键盘快捷键支持（A键添加，Delete键删除）

**依赖**：需要 `BezierSpline` 组件

### TrackGenerator.cs
**功能**：根据贝塞尔曲线生成3D轨道网格
- 生成轨道主体（顶面、底面、侧面）
- 生成护栏（可选）
- 可配置的轨道参数

**依赖**：需要 `BezierSpline`、`MeshFilter`、`MeshRenderer` 组件

### Editor脚本
**BezierEditorInspector.cs** 和 **BezierSplineInspector.cs**
- 自定义Inspector界面
- 显示曲线信息
- 提供快捷操作按钮

## 组件使用流程

1. **创建GameObject** → 添加 `BezierSpline` 组件
2. **添加编辑器** → 添加 `BezierEditor` 组件（用于场景视图编辑）
3. **添加生成器** → 添加 `TrackGenerator` 组件（用于生成网格）
4. **编辑曲线** → 在Scene视图中编辑控制点
5. **生成轨道** → 点击"生成轨道"按钮

## 技术要点

### C2连续性实现
每个控制点的左右两个切线控制点必须共线，这是通过 `BezierPoint` 类的 `SetLeftControlPoint` 和 `SetRightControlPoint` 方法实现的。

### 轨道生成算法
1. 沿曲线采样多个点
2. 为每个采样点计算局部坐标系（切线、法线、副法线）
3. 使用局部坐标系生成横截面
4. 连接横截面形成网格

### 网格优化
- 使用 `resolution` 参数控制采样密度
- 使用 `crossSections` 参数控制横截面分段数
- 可以根据需要调整这些参数来平衡质量和性能

## 扩展建议

1. **材质系统**：在 `Materials/` 文件夹中添加轨道材质
2. **过山车车厢**：创建沿轨道移动的车厢脚本
3. **物理模拟**：添加物理组件实现真实运动
4. **预设系统**：保存常用轨道配置为预制体
5. **导出功能**：导出轨道数据用于其他工具

