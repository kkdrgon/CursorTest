# Unity3D 过山车轨道编辑器

一个基于Unity3D的过山车轨道生成系统，使用3D贝塞尔曲线编辑器动态生成平滑的过山车轨道。

## 功能特性

- 🎢 **3D贝塞尔曲线编辑器**：在场景视图中直观地编辑曲线
- 🔄 **C2连续性**：每个控制点的两个方向控制点在一条直线上，保证曲率连续
- 🛤️ **自动轨道生成**：根据曲线自动生成3D轨道网格
- 🎨 **可视化编辑**：实时预览曲线和轨道
- ⚙️ **可配置参数**：轨道宽度、高度、护栏等参数可调

## 项目结构

```
unity-rollercoaster/
├── Assets/
│   ├── Scripts/
│   │   ├── BezierSpline.cs          # 贝塞尔曲线核心类
│   │   ├── BezierEditor.cs          # 曲线编辑器（场景视图交互）
│   │   ├── TrackGenerator.cs        # 轨道生成器
│   │   └── Editor/
│   │       ├── BezierEditorInspector.cs    # 编辑器Inspector
│   │       └── BezierSplineInspector.cs    # 曲线Inspector
│   ├── Scenes/
│   │   └── MainScene.unity          # 主场景
│   ├── Materials/                   # 材质文件夹
│   └── Prefabs/                     # 预制体文件夹
├── ProjectSettings/                 # Unity项目设置
└── Packages/                        # Unity包管理
```

## 使用方法

### 1. 打开项目

1. 使用Unity Hub打开项目
2. 打开 `Assets/Scenes/MainScene.unity` 场景

### 2. 创建过山车轨道

1. 在场景中创建一个空的GameObject
2. 添加以下组件：
   - `BezierSpline` - 贝塞尔曲线组件
   - `BezierEditor` - 曲线编辑器组件
   - `TrackGenerator` - 轨道生成器组件
   - `MeshFilter` - 网格过滤器（自动添加）
   - `MeshRenderer` - 网格渲染器（自动添加）

### 3. 编辑曲线

在场景视图中：

- **选择控制点**：点击黄色球体选择控制点
- **移动控制点**：拖动选中的控制点移动位置
- **调整切线**：拖动青色球体（切线控制点）调整曲线形状
- **添加控制点**：选中一个控制点后按 `A` 键在其后添加新点
- **删除控制点**：选中控制点后按 `Delete` 键删除（至少保留2个点）

### 4. 生成轨道

- 在Inspector面板中点击"生成轨道"按钮
- 或者启用 `TrackGenerator` 组件的 `Auto Update` 选项，曲线变化时自动更新

### 5. 调整轨道参数

在 `TrackGenerator` 组件中可以调整：

- **Track Width**：轨道宽度
- **Track Height**：轨道高度
- **Rail Height**：护栏高度
- **Rail Thickness**：护栏厚度
- **Cross Sections**：横截面分段数（影响轨道圆滑度）
- **Resolution**：每段曲线的采样点数（影响轨道精度）

## 技术说明

### 贝塞尔曲线

使用三次贝塞尔曲线（Cubic Bezier Curve）连接控制点，每个曲线段由4个点定义：
- 起点（P0）
- 起点右侧控制点（P1）
- 终点左侧控制点（P2）
- 终点（P3）

### C2连续性

为了保证曲率连续（C2连续），每个控制点的两个方向控制点（左侧和右侧）必须共线。这意味着：

1. 左侧控制点、控制点本身、右侧控制点在一条直线上
2. 当移动一个控制点时，相邻控制点的切线会自动调整以保持平滑
3. 调整一个切线控制点时，另一个切线控制点会自动调整以保持共线

### 轨道生成

轨道生成过程：

1. 沿曲线采样多个点
2. 为每个采样点计算切线、法线和副法线
3. 使用这些向量生成横截面
4. 连接横截面形成轨道网格
5. 可选地生成护栏

## 脚本说明

### BezierSpline.cs

核心贝塞尔曲线类，提供：

- `AddPoint(Vector3)`：添加控制点
- `RemovePoint(int)`：移除控制点
- `GetPoint(float t)`：获取曲线上参数t处的点（t范围0-1）
- `GetTangent(float t)`：获取切线方向
- `GetNormal(float t, Vector3 up)`：获取法线方向
- `EnsureC2Continuity(int)`：确保C2连续性
- `GetSamplePoints()`：获取所有采样点

### BezierEditor.cs

场景视图编辑器，提供交互式编辑功能：

- 使用Unity的 `OnSceneGUI` 在场景视图中绘制控制点
- 支持拖拽移动控制点和切线
- 键盘快捷键支持

### TrackGenerator.cs

轨道网格生成器：

- 根据贝塞尔曲线生成3D网格
- 支持轨道主体和护栏生成
- 可配置的轨道参数

## 扩展建议

1. **过山车车厢**：添加沿轨道移动的车厢
2. **物理模拟**：添加物理组件实现真实的过山车运动
3. **材质系统**：为轨道添加更丰富的材质和纹理
4. **动画系统**：添加轨道动画和特效
5. **导出功能**：导出轨道数据用于其他用途
6. **预设系统**：保存和加载轨道预设

## 系统要求

- Unity 2022.3.0 或更高版本
- 支持C#脚本编辑

## 许可证

本项目仅供学习和参考使用。

## 作者

Unity3D 过山车轨道编辑器

