# 微信小游戏：WebGL 过山车

该仓库提供一个微信小游戏骨架，用于承载 WebGL 过山车场景的渲染逻辑。核心目标是把既有的 WebGL 过山车项目移植到小游戏运行环境中。

## 项目结构

- `project.config.json`：微信开发者工具项目配置，已设置为小游戏（game）。
- `game.json`：小游戏运行时配置，包含子包、网络与横屏设置。
- `game.js`：入口脚本，负责拉起渲染流程。
- `src/main.js`：创建 Canvas、WebGL 上下文并注入业务逻辑。
- `src/rollercoaster/`：放置过山车渲染相关的核心代码，当前提供最小示例。
- `open-data/`：开放数据域示例，占位文件。
- `workers/`：Worker 目录，可用于异步计算轨迹或网格。

## 下一步

1. 将原 WebGL 过山车代码拷贝到 `src/rollercoaster/`，替换 `_renderFrame` 里的 TODO。
2. 如果有 shader、贴图等资源，可放入 `assets/`（手动创建）并在加载器里引用。
3. 使用微信开发者工具导入本项目，选择「小游戏」类型，预览及调试。