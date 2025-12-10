const fs = require('fs');
const path = require('path');

// 尝试使用node-canvas，如果不可用则使用备用方案
let Canvas, createCanvas, loadImage;

try {
    const canvasModule = require('canvas');
    Canvas = canvasModule.Canvas || canvasModule;
    createCanvas = canvasModule.createCanvas || Canvas.createCanvas;
    loadImage = canvasModule.loadImage;
} catch (e) {
    console.log('node-canvas未安装，使用SVG方式生成图片');
}

function generateBeautyImagePNG() {
    if (!createCanvas) {
        console.error('需要安装canvas库: npm install canvas');
        return;
    }

    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制背景渐变
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#FFB6C1');
    gradient.addColorStop(1, '#FFE4E1');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 绘制头部（圆形）
    ctx.fillStyle = '#FFDBB3';
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.3, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D4A574';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制头发
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.25, 120, 0, Math.PI, true);
    ctx.fill();

    // 绘制眼睛
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(width / 2 - 30, height * 0.28, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2 + 30, height * 0.28, 8, 0, Math.PI * 2);
    ctx.fill();

    // 绘制眉毛
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 50, height * 0.25);
    ctx.quadraticCurveTo(width / 2 - 30, height * 0.23, width / 2 - 10, height * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2 + 10, height * 0.25);
    ctx.quadraticCurveTo(width / 2 + 30, height * 0.23, width / 2 + 50, height * 0.25);
    ctx.stroke();

    // 绘制鼻子
    ctx.strokeStyle = '#D4A574';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, height * 0.32);
    ctx.lineTo(width / 2, height * 0.37);
    ctx.stroke();

    // 绘制嘴巴（微笑）
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.38, 20, 0, Math.PI);
    ctx.stroke();

    // 绘制身体（裙子）
    ctx.fillStyle = '#FF69B4';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 80, height * 0.4);
    ctx.lineTo(width / 2 + 80, height * 0.4);
    ctx.lineTo(width / 2 + 100, height * 0.7);
    ctx.lineTo(width / 2 - 100, height * 0.7);
    ctx.closePath();
    ctx.fill();

    // 绘制装饰
    ctx.fillStyle = '#FF1493';
    ctx.beginPath();
    ctx.arc(width / 2 - 40, height * 0.5, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2 + 40, height * 0.5, 15, 0, Math.PI * 2);
    ctx.fill();

    // 添加文字
    ctx.fillStyle = '#000';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('美女', width / 2, height * 0.85);

    // 保存图片
    const buffer = canvas.toBuffer('image/png');
    const filePath = path.join(__dirname, '美女.png');
    fs.writeFileSync(filePath, buffer);
    console.log(`已生成: ${filePath}`);
}

function generateRobotImagePNG() {
    if (!createCanvas) {
        console.error('需要安装canvas库: npm install canvas');
        return;
    }

    const width = 800;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制背景渐变
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#708090');
    gradient.addColorStop(1, '#C0C0C0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 绘制头部（方形）
    ctx.fillStyle = '#C0C0C0';
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 4;
    ctx.fillRect(width / 2 - 100, height * 0.15, 200, 150);
    ctx.strokeRect(width / 2 - 100, height * 0.15, 200, 150);

    // 绘制眼睛（LED灯）
    ctx.fillStyle = '#00FF00';
    ctx.beginPath();
    ctx.arc(width / 2 - 40, height * 0.3, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2 + 40, height * 0.3, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // 眼睛高光
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(width / 2 - 35, height * 0.28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2 + 45, height * 0.28, 5, 0, Math.PI * 2);
    ctx.fill();

    // 绘制嘴巴（LED显示屏）
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(width / 2 - 50, height * 0.4, 100, 20);
    ctx.fillStyle = '#FFFF00';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('===', width / 2, height * 0.41 + 14);

    // 绘制天线
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 30, height * 0.15);
    ctx.lineTo(width / 2 - 40, height * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(width / 2 - 40, height * 0.05, 5, 0, Math.PI * 2);
    ctx.fill();

    // 绘制身体（矩形）
    ctx.fillStyle = '#A0A0A0';
    ctx.fillRect(width / 2 - 120, height * 0.35, 240, 200);
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 4;
    ctx.strokeRect(width / 2 - 120, height * 0.35, 240, 200);

    // 绘制胸部面板
    ctx.fillStyle = '#808080';
    ctx.fillRect(width / 2 - 80, height * 0.45, 160, 100);
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 2;
    ctx.strokeRect(width / 2 - 80, height * 0.45, 160, 100);

    // 绘制按钮
    ctx.fillStyle = '#0000FF';
    ctx.beginPath();
    ctx.arc(width / 2 - 30, height * 0.55, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.55, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2 + 30, height * 0.55, 8, 0, Math.PI * 2);
    ctx.fill();

    // 绘制手臂（可活动关节）
    ctx.fillStyle = '#B0B0B0';
    // 左臂
    ctx.fillRect(width / 2 - 140, height * 0.4, 30, 100);
    ctx.fillRect(width / 2 - 150, height * 0.45, 20, 20);
    // 右臂
    ctx.fillRect(width / 2 + 110, height * 0.4, 30, 100);
    ctx.fillRect(width / 2 + 130, height * 0.45, 20, 20);

    // 绘制手（夹子）
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 4;
    // 左手
    ctx.beginPath();
    ctx.moveTo(width / 2 - 130, height * 0.5);
    ctx.lineTo(width / 2 - 145, height * 0.52);
    ctx.lineTo(width / 2 - 155, height * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2 - 130, height * 0.5);
    ctx.lineTo(width / 2 - 145, height * 0.48);
    ctx.lineTo(width / 2 - 155, height * 0.5);
    ctx.stroke();
    // 右手
    ctx.beginPath();
    ctx.moveTo(width / 2 + 130, height * 0.5);
    ctx.lineTo(width / 2 + 145, height * 0.52);
    ctx.lineTo(width / 2 + 155, height * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width / 2 + 130, height * 0.5);
    ctx.lineTo(width / 2 + 145, height * 0.48);
    ctx.lineTo(width / 2 + 155, height * 0.5);
    ctx.stroke();

    // 绘制腿部
    ctx.fillStyle = '#909090';
    ctx.fillRect(width / 2 - 60, height * 0.55, 40, 150);
    ctx.fillRect(width / 2 + 20, height * 0.55, 40, 150);
    
    // 绘制脚
    ctx.fillStyle = '#707070';
    ctx.fillRect(width / 2 - 70, height * 0.7, 60, 30);
    ctx.fillRect(width / 2 + 10, height * 0.7, 60, 30);

    // 添加文字
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeText('机器人', width / 2, height * 0.9);
    ctx.fillText('机器人', width / 2, height * 0.9);

    // 保存图片
    const buffer = canvas.toBuffer('image/png');
    const filePath = path.join(__dirname, '机器人.png');
    fs.writeFileSync(filePath, buffer);
    console.log(`已生成: ${filePath}`);
}

function generateSVGImages() {
    // 生成美女SVG
    const beautySVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="beautyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FFB6C1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFE4E1;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#beautyGrad)"/>
  
  <!-- 头发 -->
  <path d="M 280 200 Q 400 100 520 200" stroke="#8B4513" stroke-width="240" fill="#8B4513" stroke-linecap="round"/>
  
  <!-- 头部 -->
  <circle cx="400" cy="240" r="100" fill="#FFDBB3" stroke="#D4A574" stroke-width="2"/>
  
  <!-- 眉毛 -->
  <path d="M 350 200 Q 370 184 390 200" stroke="#654321" stroke-width="3" fill="none"/>
  <path d="M 410 200 Q 430 184 450 200" stroke="#654321" stroke-width="3" fill="none"/>
  
  <!-- 眼睛 -->
  <circle cx="370" cy="224" r="8" fill="#000"/>
  <circle cx="430" cy="224" r="8" fill="#000"/>
  
  <!-- 鼻子 -->
  <line x1="400" y1="256" x2="400" y2="296" stroke="#D4A574" stroke-width="2"/>
  
  <!-- 嘴巴 -->
  <path d="M 380 304 Q 400 324 420 304" stroke="#FF69B4" stroke-width="3" fill="none"/>
  
  <!-- 身体 -->
  <path d="M 320 320 L 480 320 L 500 560 L 300 560 Z" fill="#FF69B4"/>
  
  <!-- 装饰 -->
  <circle cx="360" cy="400" r="15" fill="#FF1493"/>
  <circle cx="440" cy="400" r="15" fill="#FF1493"/>
  
  <!-- 文字 -->
  <text x="400" y="680" font-family="Arial" font-size="40" font-weight="bold" text-anchor="middle" fill="#000">美女</text>
</svg>`;

    fs.writeFileSync(path.join(__dirname, '美女.svg'), beautySVG);
    console.log(`已生成: ${path.join(__dirname, '美女.svg')}`);

    // 生成机器人SVG
    const robotSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="robotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#708090;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#C0C0C0;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#robotGrad)"/>
  
  <!-- 头部 -->
  <rect x="300" y="120" width="200" height="150" fill="#C0C0C0" stroke="#808080" stroke-width="4"/>
  
  <!-- 眼睛 -->
  <circle cx="360" cy="240" r="15" fill="#00FF00"/>
  <circle cx="440" cy="240" r="15" fill="#00FF00"/>
  <circle cx="365" cy="224" r="5" fill="#FFFFFF"/>
  <circle cx="445" cy="224" r="5" fill="#FFFFFF"/>
  
  <!-- 嘴巴 -->
  <rect x="350" y="320" width="100" height="20" fill="#FF0000"/>
  <text x="400" y="334" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle" fill="#FFFF00">===</text>
  
  <!-- 天线 -->
  <line x1="370" y1="120" x2="360" y2="40" stroke="#808080" stroke-width="3"/>
  <circle cx="360" cy="40" r="5" fill="#FF0000"/>
  
  <!-- 身体 -->
  <rect x="280" y="280" width="240" height="200" fill="#A0A0A0" stroke="#606060" stroke-width="4"/>
  <rect x="320" y="360" width="160" height="100" fill="#808080" stroke="#404040" stroke-width="2"/>
  
  <!-- 按钮 -->
  <circle cx="370" cy="440" r="8" fill="#0000FF"/>
  <circle cx="400" cy="440" r="8" fill="#0000FF"/>
  <circle cx="430" cy="440" r="8" fill="#0000FF"/>
  
  <!-- 左臂 -->
  <rect x="260" y="320" width="30" height="100" fill="#B0B0B0"/>
  <rect x="250" y="360" width="20" height="20" fill="#B0B0B0"/>
  <path d="M 270 400 L 255 416 L 245 400" stroke="#606060" stroke-width="4" fill="none"/>
  <path d="M 270 400 L 255 384 L 245 400" stroke="#606060" stroke-width="4" fill="none"/>
  
  <!-- 右臂 -->
  <rect x="510" y="320" width="30" height="100" fill="#B0B0B0"/>
  <rect x="530" y="360" width="20" height="20" fill="#B0B0B0"/>
  <path d="M 530 400 L 545 416 L 555 400" stroke="#606060" stroke-width="4" fill="none"/>
  <path d="M 530 400 L 545 384 L 555 400" stroke="#606060" stroke-width="4" fill="none"/>
  
  <!-- 腿部 -->
  <rect x="340" y="440" width="40" height="150" fill="#909090"/>
  <rect x="420" y="440" width="40" height="150" fill="#909090"/>
  
  <!-- 脚 -->
  <rect x="330" y="560" width="60" height="30" fill="#707070"/>
  <rect x="410" y="560" width="60" height="30" fill="#707070"/>
  
  <!-- 文字 -->
  <text x="400" y="720" font-family="Arial" font-size="40" font-weight="bold" text-anchor="middle" fill="#FFFFFF" stroke="#000000" stroke-width="2">机器人</text>
</svg>`;

    fs.writeFileSync(path.join(__dirname, '机器人.svg'), robotSVG);
    console.log(`已生成: ${path.join(__dirname, '机器人.svg')}`);
}

// 主函数
function main() {
    console.log('开始生成图片...');
    
    // 尝试使用canvas生成PNG，如果失败则使用SVG
    if (createCanvas) {
        try {
            generateBeautyImagePNG();
            generateRobotImagePNG();
            console.log('PNG图片生成完成！');
        } catch (error) {
            console.log('PNG生成失败，改用SVG格式...');
            console.log('错误:', error.message);
            generateSVGImages();
            console.log('SVG图片生成完成！');
        }
    } else {
        console.log('node-canvas未安装，使用SVG方式生成图片...');
        generateSVGImages();
        console.log('SVG图片生成完成！');
        console.log('提示: 如需PNG格式，请运行: npm install canvas');
    }
}

// 运行主函数
if (require.main === module) {
    main();
}

module.exports = { generateBeautyImagePNG, generateRobotImagePNG, generateSVGImages };

