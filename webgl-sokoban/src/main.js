import { createGLContext } from './gl.js';
import { mat4 } from './math.js';
import { Renderer } from './renderer.js';
import { Game } from './game.js';
import { setupInput } from './input.js';
import { generateSolvableLevel, convertToLevelFormat } from './level-generator.js';
import { addGeneratedLevel, loadGeneratedLevels, LEVELS } from './levels.js';

const canvas = document.getElementById('glcanvas');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');
const generateBtn = document.getElementById('generateBtn');
const levelSelect = document.getElementById('levelSelect');
const levelInfo = document.getElementById('levelInfo');

const gl = createGLContext(canvas);
const renderer = new Renderer(gl);
let game = null;

// 相机和视图矩阵（需要在外部作用域）
let viewProj = mat4.create();
let cameraAngleY = -0.7;
let cameraDistance = 16;

// 初始化游戏（在关卡加载完成后）
async function initGame() {
  // 加载自动生成的关卡
  await loadGeneratedLevels();
  
  // 创建游戏实例
  game = new Game();
  
  // 更新关卡选择器
  updateLevelSelector();
  
  // 设置事件监听
  setupEventListeners();
  
  // 开始渲染循环
  startRenderLoop();
}

function updateLevelSelector() {
  if (!levelSelect) return;
  
  levelSelect.innerHTML = '';
  for (let i = 0; i < LEVELS.length; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `关卡 ${i + 1}`;
    if (i === 0) option.textContent += ' (默认)';
    if (i > 0) option.textContent += ' (生成)';
    levelSelect.appendChild(option);
  }
  
  levelSelect.value = game ? game.levelIndex : 0;
  updateLevelInfo();
}

function updateLevelInfo() {
  if (!levelInfo || !game) return;
  levelInfo.textContent = `关卡 ${game.levelIndex + 1} / ${LEVELS.length}`;
}

function setupEventListeners() {
  if (!game) return;

  game.onStateChange = (g) => {
    if (g.gameState === 'completed') {
      statusEl.textContent = '通关！所有箱子都在目标点上。';
    } else {
      statusEl.textContent = 'WASD / 方向键 移动；将所有箱子推到黄色目标点上以通关。';
    }
    updateLevelInfo();
  };

  resetBtn.addEventListener('click', () => {
    game.resetLevel();
  });

  if (levelSelect) {
    levelSelect.addEventListener('change', (e) => {
      const index = parseInt(e.target.value);
      game.loadLevel(index);
      updateLevelInfo();
    });
  }

  generateBtn.addEventListener('click', () => {
    statusEl.textContent = '正在生成关卡...';
    generateBtn.disabled = true;

    // 在下一帧生成，避免阻塞UI
    setTimeout(() => {
      const generated = generateSolvableLevel({
        width: 8,
        height: 8,
        numBoxes: 2,
        numHoles: 1,
        wallDensity: 0.15,
        maxAttempts: 50,
      });

      if (generated) {
        const levelData = convertToLevelFormat(generated);
        const newIndex = addGeneratedLevel(levelData);
        game.loadLevel(newIndex);
        updateLevelSelector();
        statusEl.textContent = '新关卡已生成！将所有箱子推到黄色目标点上以通关。';
      } else {
        statusEl.textContent = '生成失败，请重试。';
      }

      generateBtn.disabled = false;
    }, 10);
  });

  setupInput((dx, dy) => {
    game.tryMovePlayer(dx, dy);
  });
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  gl.viewport(0, 0, canvas.width, canvas.height);

  const aspect = canvas.width / canvas.height;
  const proj = mat4.create();
  mat4.perspective(proj, Math.PI / 3, aspect, 0.1, 100.0);

  const centerX = 0;
  const centerZ = 0;
  const eyeHeight = 10;
  const eye = [
    Math.sin(cameraAngleY) * cameraDistance + centerX,
    eyeHeight,
    Math.cos(cameraAngleY) * cameraDistance + centerZ,
  ];
  const center = [centerX, 0, centerZ];
  const up = [0, 1, 0];
  const view = mat4.create();
  mat4.lookAt(view, eye, center, up);

  // 注意顺序：viewProj = proj * view
  viewProj = mat4.create();
  mat4.multiply(viewProj, proj, view);
  renderer.setViewProj(viewProj);
}

window.addEventListener('resize', resize);
resize();

function startRenderLoop() {
  function renderLoop() {
    if (!game) {
      requestAnimationFrame(renderLoop);
      return;
    }
    
    const cellSize = 1.4;
    renderer.setViewProj(viewProj);
    renderer.beginFrame();
    const commands = game.buildDrawCommands(cellSize);
    // 按渲染顺序排序，确保正确的深度显示
    commands.sort((a, b) => (a.renderOrder || 0) - (b.renderOrder || 0));
    for (const cmd of commands) {
      renderer.drawCube(cmd.model, cmd.color, cmd.isTarget || false);
    }
    requestAnimationFrame(renderLoop);
  }
  
  requestAnimationFrame(renderLoop);
}

// 启动应用
initGame();


