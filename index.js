function projection(x, y, dx, dy, zoom, w, h) {
    return [(2 * x - w) / 50.0 / zoom + dx + 0.5, -(2 * y - h) / 50.0 / zoom + dy + 0.5];
}

document.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('tool-btn')) return;
    e.dataTransfer.dropEffect = 'move';
    e.dataTransfer.setData('tower', e.target.dataset.type);
});

// 创建透明拖拽图像
const transparentImg = new Image();
transparentImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1透明像素

// 获取所有可拖拽按钮
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('dragstart', (e) => {
        // 关键设置：将拖拽图像替换为透明图片
        e.dataTransfer.setDragImage(transparentImg, 0, 0);
        
        // 携带需要传输的数据
        e.dataTransfer.setData('text/plain', btn.dataset.type);
        
        // 可选：添加视觉反馈
        btn.classList.add('dragging');
    });

    btn.addEventListener('dragend', () => {
        // 清除视觉反馈
        btn.classList.remove('dragging');
    });
});

var isGameplayActive = false;
var towerDefenseGame = null;

async function initWebGPU() {
    await window.CrazyGames.SDK.init();
    try {
        window.CrazyGames.SDK.game.loadingStart();
        const canvas = document.getElementById('webgpu-canvas');
        
        // 初始化 TowerDefenseGame
        towerDefenseGame = new TowerDefenseGame(canvas);
        await towerDefenseGame.init();

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
        const saveElement = document.getElementById('save');
        const loadElement = document.getElementById('load');
        const continueElement = document.getElementById('continue');

        try {
            await window.CrazyGames.SDK.banner.requestResponsiveBanner("responsive-banner-container");
        } catch (e) {
            console.log("Error on request responsive banner", e);
        }

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
            window.CrazyGames.SDK.game.happytime();
            
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

        // 更新游戏UI的函数
        function updateGameUI() {
            if (!towerDefenseGame) return;
            
            goldElement.textContent = Math.floor(towerDefenseGame.gold);
            waveElement.textContent = Math.floor(towerDefenseGame.gameState.lv);
            
            // 更新下一波时间显示
            const a=towerDefenseGame.gameState.ticks - towerDefenseGame.gameState.npt; 
            const nextTime = Math.max(0, 30 - (a % 30));
            ntElement.textContent = nextTime;
            ntButton.disabled = nextTime > 10;
        }

        saveElement.addEventListener('click', (e) => {
            const saveData = {
                gold: towerDefenseGame.gold,
                gameState: { ...towerDefenseGame.gameState },
                towers: Array.from(towerDefenseGame.towers.entries()),
                grid: Array.from(towerDefenseGame.grid),
                path: Array.from(towerDefenseGame.path)
            };
            
            const callbacks = {
                adFinished: () => {
                    window.CrazyGames.SDK.data.set("game_state", JSON.stringify(saveData))
                        .then(() => showMsg("Game saved!"))
                        .catch(error => console.error("Save failed:", error));
                },
                adError: (error) => {
                    console.log("Error rewarded ad", error);
                    window.CrazyGames.SDK.data.set("game_state", JSON.stringify(saveData))
                        .then(() => showMsg("Game saved!"))
                        .catch(error => console.error("Save failed:", error));
                },
                adStarted: () => console.log("Start rewarded ad")
            };
            window.CrazyGames.SDK.ad.requestAd("rewarded", callbacks);
        });

        loadElement.addEventListener('click', async (e) => {
            const callbacks = {
                adFinished: async () => {
                    try {
                        const savedData = await window.CrazyGames.SDK.data.get("game_state");
                        if (savedData) {
                            const data = JSON.parse(savedData);
                            
                            // 恢复游戏状态
                            towerDefenseGame.gold = data.gold;
                            towerDefenseGame.gameState = { ...data.gameState };
                            towerDefenseGame.towers = new Map(data.towers);
                            towerDefenseGame.grid = new Uint32Array(data.grid);
                            towerDefenseGame.path = new Uint32Array(data.path);
                            
                            // 更新UBO数据
                            const gameBaseData = new Int32Array([
                                towerDefenseGame.gameState.ticks,
                                towerDefenseGame.gameState.w,
                                towerDefenseGame.gameState.h,
                                towerDefenseGame.gameState.r,
                                towerDefenseGame.gameState.npt,
                                towerDefenseGame.gameState.towerCtrl,
                                towerDefenseGame.gameState.tId,
                                towerDefenseGame.gameState.tx,
                                towerDefenseGame.gameState.ty,
                                towerDefenseGame.gameState.tr,
                                towerDefenseGame.gameState.check,
                                towerDefenseGame.gameState.lv
                            ]);
                            towerDefenseGame.shader.updateUBO('GameBase', gameBaseData);
                            
                            showMsg("Game loaded!");
                            isGameplayActive = true;
                            gcElement.style.display = "none";
                            updateGameUI();
                        }
                    } catch (error) {
                        console.error("Load failed:", error);
                        showMsg("Load failed!");
                    }
                },
                adError: (error) => console.log("Error midgame ad", error),
                adStarted: () => console.log("Start midgame ad")
            };
            window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
        });

        newElement.addEventListener('click', (e) => {
            restartGame();
            isGameplayActive = true;
            gcElement.style.display = "none";
        });

        continueElement.addEventListener('click', (e) => {
            gcElement.style.display = "none";
            window.CrazyGames.SDK.game.gameplayStart();
            isGameplayActive = true;
        });

        pauseElement.addEventListener('click', (e) => {
            gcElement.style.display = "flex";
            window.CrazyGames.SDK.game.gameplayStop();
            isGameplayActive = false;
        });

        leftElement.classList.toggle('hidden', true);

        deleteElement.addEventListener('click', (e) => {
            if (towerDefenseGame.clickTowerId !== -1) {
                towerDefenseGame.removeTower(towerDefenseGame.clickTowerId);
                leftElement.style.display = "none";
            }
        });

        updateElement.addEventListener('click', (e) => {
            if (towerDefenseGame.clickTowerId !== -1) {
                towerDefenseGame.upgradeTower(towerDefenseGame.clickTowerId);
            }
        });

        ntButton.addEventListener('click', (e) => {
            towerDefenseGame.gameState.lv++;
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

        canvas.width = 1600;
        canvas.height = 1000;

        window.CrazyGames.SDK.game.loadingStop();

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
                    towerDefenseGame.render();
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
            requestAnimationFrame(gameLoop);
        }
        
        requestAnimationFrame(gameLoop);

        // 初始化UI
        updateGameUI();

    } catch (error) {
        document.getElementById('error').textContent = error.message;
        console.error('Initialization error:', error);
    }
}

// 启动游戏
initWebGPU();