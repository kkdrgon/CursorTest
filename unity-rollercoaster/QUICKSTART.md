# 快速开始指南

## 第一步：打开项目

1. 打开 Unity Hub
2. 点击"添加"按钮，选择 `unity-rollercoaster` 文件夹
3. 选择 Unity 版本（推荐 2022.3.0 或更高版本）
4. 点击"打开"按钮

## 第二步：打开场景

1. 在 Project 窗口中，导航到 `Assets/Scenes/`
2. 双击 `MainScene.unity` 打开场景

## 第三步：创建过山车轨道对象

1. 在 Hierarchy 窗口中，右键点击空白处
2. 选择 `Create Empty`，创建一个空的 GameObject
3. 将其重命名为 `RollercoasterTrack`

## 第四步：添加组件

选中 `RollercoasterTrack` 对象，在 Inspector 窗口中点击 `Add Component`，依次添加：

1. **BezierSpline** - 贝塞尔曲线组件
2. **BezierEditor** - 曲线编辑器组件
3. **TrackGenerator** - 轨道生成器组件

> 注意：`MeshFilter` 和 `MeshRenderer` 组件会自动添加

## 第五步：编辑曲线

1. 在 Scene 视图中，你会看到默认的3个控制点（黄色球体）
2. **选择控制点**：点击黄色球体
3. **移动控制点**：拖动选中的控制点
4. **调整曲线形状**：拖动青色球体（切线控制点）
5. **添加新点**：选中一个控制点，按 `A` 键
6. **删除点**：选中控制点，按 `Delete` 键

## 第六步：生成轨道

1. 在 Inspector 窗口中，找到 `TrackGenerator` 组件
2. 点击 `Generate Track` 按钮（或右键点击组件标题，选择"生成轨道"）
3. 轨道网格将自动生成

## 第七步：调整轨道参数

在 `TrackGenerator` 组件中可以调整：

- **Track Width** (轨道宽度)：默认 2.0
- **Track Height** (轨道高度)：默认 0.3
- **Rail Height** (护栏高度)：默认 0.5
- **Rail Thickness** (护栏厚度)：默认 0.1
- **Cross Sections** (横截面分段数)：默认 8，值越大轨道越圆滑
- **Resolution** (采样点数)：默认 50，值越大轨道越精确

调整参数后，再次点击"生成轨道"按钮更新轨道。

## 提示

- 在 Scene 视图中编辑曲线时，可以按住鼠标中键拖动来旋转视角
- 按住 Alt 键 + 鼠标左键可以旋转视角
- 按住 Alt 键 + 鼠标右键可以缩放视角
- 使用 `BezierSpline` 组件的 `Closed` 选项可以创建闭合的环形轨道
- 启用 `TrackGenerator` 的 `Auto Update` 选项可以在编辑曲线时自动更新轨道

## 常见问题

**Q: 看不到控制点？**
A: 确保 `BezierSpline` 组件的 `Show Gizmos` 选项已启用。

**Q: 轨道没有生成？**
A: 确保至少有两个控制点，然后点击"生成轨道"按钮。

**Q: 如何创建更复杂的轨道？**
A: 添加更多控制点，并调整每个点的切线控制点来创建更复杂的曲线。

**Q: 轨道看起来不平滑？**
A: 增加 `Resolution` 和 `Cross Sections` 的值。

