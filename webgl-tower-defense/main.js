// 主入口文件
// 注意：如果浏览器不支持 ES6 模块，请使用 script type="module" 或使用打包工具
import { TowerDefenseGame } from './game.js';

function projection(x, y, dx, dy, zoom, w, h) {
    return [(2 * x - w) / 50.0 / zoom + dx + 0.5, -(2 * y - h) / 50.0 / zoom + dy + 0.5];
}

// 拖拽功能
const transparentImg = new Image();
transparentImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setDragImage(transparentImg, 0, 0);
        e.dataTransfer.setData('text/plain', btn.dataset.type);
        btn.classList.add('dragging');
    });

    btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
    });
});

let isGameplayActive = false;
let towerDefenseGame = null;

async function initGame() {
    try {
        const canvas = document.getElementById('webgl-canvas');
        canvas.width = 1600;
        canvas.height = 1000;
        
        // 初始化游戏
        towerDefenseGame = new TowerDefenseGame(canvas);
        await towerDefenseGame.init();
        
        // 加载纹理（需要将 abc.png 复制到 assets 目录）
        try {
            await towerDefenseGame.loadTexture('assets/abc.png');
        } catch (e) {
            console.warn('Texture not found, using default');
        }
        
        // 获取UI元素
        const waveElement = document.getElementById('wave');
        const healthElement = document.getElementById('health');
        const goldElement = document.getElementById('gold');
        const ntElement = document.getElementById('nextTime');
        const ntButton = ntElement.parentNode;
        const leftElement = document.getElementById('toolPaletteLeft');
        const gcElement = document.getElementById('game-controls');
        const deleteElement = document.getElementById('delete');
        const updateElement = document.getElementById('update');
        const pauseElement = document.getElementById('pause');
        const newElement = document.getElementById('new');
        const continueElement = document.getElementById('continue');
        
        leftElement.style.display = 'none';
        
        function showMsg(msg) {
            const tip = document.createElement('div');
            tip.className = 'tip-message';
            tip.textContent = msg;
            
            const container = document.createElement('div');
            container.className = 'tip-container';
            container.appendChild(tip);
            
            document.getElementById('baseDiv').appendChild(container);
            
            setTimeout(() => tip.classList.add('show'), 10);
            
            setTimeout(() => {
                tip.classList.remove('show');
                setTimeout(() => container.remove(), 300);
            }, 3000);
        }
        
        function showVictoryScreen() {
            const overlay = document.createElement('div');
            overlay.id = 'victoryOverlay';
            
            const content = document.createElement('div');
            content.className = 'victory-content';
            
            const title = document.createElement('h1');
            title.className = 'victory-title';
            title.textContent = 'Victory!';
            
            const text = document.createElement('p');
            text.textContent = 'You successfully resisted all the enemies!';
            text.style.color = '#ecf0f1';
            text.style.marginBottom = '1.5rem';
            
            const restartBtn = document.createElement('button');
            restartBtn.id = 'restartButton';
            restartBtn.textContent = 'Play Again';
            
            content.appendChild(title);
            content.appendChild(text);
            content.appendChild(restartBtn);
            overlay.appendChild(content);
            
            document.body.appendChild(overlay);
            overlay.style.display = 'flex';
            
            restartBtn.addEventListener('click', () => {
                restartGame();
                overlay.remove();
            });
        }
        
        function restartGame() {
            towerDefenseGame = new TowerDefenseGame(canvas);
            towerDefenseGame.init().then(() => {
                isGameplayActive = true;
                updateGameUI();
            });
        }
        
        function showDefeatScreen() {
            const overlay = document.createElement('div');
            overlay.id = 'defeatOverlay';
            
            const content = document.createElement('div');
            content.className = 'defeat-content';
            
            const title = document.createElement('h1');
            title.className = 'defeat-title';
            title.textContent = 'GameOver!';
            
            const text = document.createElement('p');
            text.textContent = 'Defense failure!';
            text.style.color = '#ecf0f1';
            text.style.marginBottom = '1.5rem';
            
            const retryBtn = document.createElement('button');
            retryBtn.id = 'retryButton';
            retryBtn.textContent = 'Replay';
            
            content.appendChild(title);
            content.appendChild(text);
            content.appendChild(retryBtn);
            overlay.appendChild(content);
            
            document.body.appendChild(overlay);
            overlay.style.display = 'flex';
            
            retryBtn.addEventListener('click', () => {
                restartGame();
                overlay.remove();
            });
        }
        
        function updateGameUI() {
            if (!towerDefenseGame) return;
            
            goldElement.textContent = Math.floor(towerDefenseGame.gold);
            waveElement.textContent = Math.floor(towerDefenseGame.gameState.lv);
            healthElement.textContent = Math.floor(towerDefenseGame.health);
            
            // 计算下一波倒计时：每30个ticks = 1秒
            // 如果当前波次还在进行中（t < 600，即20秒），显示距离当前波次结束还有多少秒
            // 如果当前波次已结束（t >= 600），显示距离下一波自动开始还有多少秒（最多30秒）
            const t = towerDefenseGame.gameState.ticks - towerDefenseGame.gameState.npt;
            if (towerDefenseGame.gameState.lv >= 199) {
                ntElement.textContent = "∞";
                ntButton.disabled = true;
            } else if (towerDefenseGame.gameState.npt === 0) {
                // 游戏刚开始，npt还未设置
                ntElement.textContent = "30";
                ntButton.disabled = false;
            } else {
                let nextTime;
                if (t < 600) {
                    // 当前波次还在进行中，显示距离当前波次结束还有多少秒
                    nextTime = Math.max(0, Math.ceil((600 - t) / 30));
                } else {
                    // 当前波次已结束，显示距离下一波自动开始还有多少秒
                    nextTime = Math.max(0, Math.ceil((900 - t) / 30));
                }
                ntElement.textContent = nextTime;
                ntButton.disabled = nextTime > 10;
            }
        }
        
        newElement.addEventListener('click', () => {
            restartGame();
            isGameplayActive = true;
            gcElement.style.display = 'none';
        });
        
        continueElement.addEventListener('click', () => {
            gcElement.style.display = 'none';
            isGameplayActive = true;
        });
        
        pauseElement.addEventListener('click', () => {
            gcElement.style.display = 'flex';
            isGameplayActive = false;
        });
        
        deleteElement.addEventListener('click', () => {
            if (towerDefenseGame.clickTowerId !== -1) {
                towerDefenseGame.removeTower(towerDefenseGame.clickTowerId);
                leftElement.style.display = 'none';
            }
        });
        
        updateElement.addEventListener('click', () => {
            if (towerDefenseGame.clickTowerId !== -1) {
                towerDefenseGame.upgradeTower(towerDefenseGame.clickTowerId);
            }
        });
        
        ntButton.addEventListener('click', () => {
            towerDefenseGame.eNow = true;
            // 立即设置npt，让计算着色器可以开始生成敌人
            if (towerDefenseGame.gameState.npt === 0 || 
                towerDefenseGame.gameState.ticks >= towerDefenseGame.gameState.npt + 600) {
                towerDefenseGame.gameState.npt = towerDefenseGame.gameState.ticks;
                towerDefenseGame.gameState.lv++;
                towerDefenseGame.gold = Math.floor(towerDefenseGame.gold * 1.05);
            }
            updateGameUI();
        });
        
        canvas.addEventListener('dragover', e => {
            e.preventDefault();
            const x = e.offsetX / canvas.clientWidth * canvas.width;
            const y = e.offsetY / canvas.clientHeight * canvas.height;
            const r = projection(x, y, 29.0, 16.0, 1.05, canvas.width, canvas.height);
            towerDefenseGame.checkTower(Math.trunc(r[0]), Math.trunc(r[1]));
        });
        
        canvas.addEventListener('click', (e) => {
            e.preventDefault();
            const x = e.offsetX / canvas.clientWidth * canvas.width;
            const y = e.offsetY / canvas.clientHeight * canvas.height;
            const r = projection(x, y, 29.0, 16.0, 1.05, canvas.width, canvas.height);
            towerDefenseGame.clickTower(Math.trunc(r[0]), Math.trunc(r[1]));
        });
        
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            const x = e.offsetX / canvas.clientWidth * canvas.width;
            const y = e.offsetY / canvas.clientHeight * canvas.height;
            const r = projection(x, y, 29.0, 16.0, 1.05, canvas.width, canvas.height);
            const s = e.dataTransfer.getData('tower');
            towerDefenseGame.buildTower(parseInt(s.substring(1)), Math.trunc(r[0]), Math.trunc(r[1]));
            updateGameUI();
        });
        
        // 游戏循环
        let accDelta = 0;
        const TIME_STEP = 33; // 60FPS
        let lastUpdate = 0;
        
        function gameLoop(timestamp) {
            const delta = timestamp - (lastUpdate || timestamp);
            lastUpdate = timestamp;
            
            accDelta += delta;
            
            while (accDelta >= TIME_STEP) {
                if (isGameplayActive && towerDefenseGame) {
                    towerDefenseGame.update();
                    updateGameUI();
                    
                    // 检查游戏状态
                    if (towerDefenseGame.health <= 0) {
                        isGameplayActive = false;
                        showDefeatScreen();
                    }
                    
                    if (towerDefenseGame.gameState.lv >= 199) {
                        isGameplayActive = false;
                        showVictoryScreen();
                    }
                }
                accDelta -= TIME_STEP;
            }
            
            if (towerDefenseGame) {
                towerDefenseGame.render();
            }
            
            requestAnimationFrame(gameLoop);
        }
        
        requestAnimationFrame(gameLoop);
        
        // 初始化UI
        updateGameUI();
        isGameplayActive = true;
        
    } catch (error) {
        document.getElementById('error').textContent = error.message;
        console.error('Initialization error:', error);
    }
}

// 启动游戏
initGame();

