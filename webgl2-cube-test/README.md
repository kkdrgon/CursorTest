# 图片生成工具

这个目录包含了生成"美女"和"机器人"图片的工具。

## 已生成的图片

- `美女.svg` - 美女图片（SVG格式）
- `机器人.svg` - 机器人图片（SVG格式）

## 使用方法

### 方法1：使用HTML页面生成PNG图片（推荐）

1. 在浏览器中打开 `generate-images.html`
2. 点击"生成美女图片"或"生成机器人图片"按钮
3. 图片会自动下载为PNG格式

### 方法2：使用Node.js脚本生成图片

#### 生成SVG图片（默认，无需额外依赖）

```bash
node generate-images.js
```

这会生成：
- `美女.svg`
- `机器人.svg`

#### 生成PNG图片（需要安装canvas库）

首先安装依赖：
```bash
npm install canvas
```

然后运行：
```bash
node generate-images.js
```

## 文件说明

- `generate-images.html` - 在浏览器中使用Canvas API生成PNG图片的HTML页面
- `generate-images.js` - Node.js脚本，可以生成SVG或PNG格式的图片
- `美女.svg` - 生成的美女图片（SVG格式）
- `机器人.svg` - 生成的机器人图片（SVG格式）

## 图片预览

### 美女图片
- 粉红色渐变背景
- 卡通风格的女性角色
- 包含头部、身体和装饰元素

### 机器人图片
- 灰色渐变背景
- 科技风格的机器人角色
- 包含LED眼睛、按钮、手臂等机械元素

