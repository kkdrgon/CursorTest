const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// WebSocket 服务器
const wss = new WebSocket.Server({ server });

const ISLAND_BASE_RADIUS = 150;
const MAX_JUMP_HEIGHT = 3;

// 游戏状态
const gameState = {
    players: new Map(),
    bullets: [],
    lastUpdate: Date.now(),
    gameId: 0
};

function noise2D(x, z) {
    return (
        Math.sin(x * 0.04 + z * 0.02) * 0.6 +
        Math.sin(x * 0.1 - z * 0.05) * 0.3 +
        Math.cos((x + z) * 0.03) * 0.4
    );
}

function getIslandRadius(angle) {
    return ISLAND_BASE_RADIUS +
        Math.sin(angle * 3.1 + 0.5) * 35 +
        Math.cos(angle * 5.2 - 1.2) * 25 +
        Math.sin(angle * 11.0 + 2.0) * 10;
}

function getIslandMask(x, z) {
    const angle = Math.atan2(z, x);
    const radius = getIslandRadius(angle);
    const dist = Math.sqrt(x * x + z * z);
    const normalized = dist / radius;
    const edgeNoise = noise2D(Math.cos(angle) * 20, Math.sin(angle) * 20) * 0.05;
    const mask = 1 - normalized + edgeNoise;
    return Math.max(0, Math.min(1, mask));
}

function getIslandHeight(x, z) {
    const mask = getIslandMask(x, z);
    if (mask <= 0) {
        return { height: -2, mask: 0 };
    }
    const base = Math.pow(mask, 2.2) * 8;
    const detail = noise2D(x, z) * mask * 2;
    const height = base + detail;
    return { height, mask };
}

function isPointOnIsland(x, z) {
    return getIslandMask(x, z) > 0.03;
}

function randomPositionOnIsland() {
    const maxAttempts = 50;
    for (let i = 0; i < maxAttempts; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * getIslandRadius(angle) * 0.9;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (isPointOnIsland(x, z)) {
            return { x, z };
        }
    }
    return { x: 0, z: 0 };
}

// 生成唯一ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// 广播消息给所有客户端
function broadcast(data, excludeId = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.id !== excludeId) {
            client.send(message);
        }
    });
}

// 更新游戏状态
function updateGameState() {
    const now = Date.now();
    const deltaTime = (now - gameState.lastUpdate) / 1000;
    gameState.lastUpdate = now;

        // 更新子弹位置（3D）
        gameState.bullets = gameState.bullets.filter(bullet => {
            bullet.x += bullet.vx * deltaTime;
            bullet.y += bullet.vy * deltaTime;
            bullet.z += bullet.vz * deltaTime;
            
            // 检查岛屿边界
            if (!isPointOnIsland(bullet.x, bullet.z) ||
                bullet.y < -5 || bullet.y > 20) {
                return false;
            }
            
            // 检查碰撞（3D）
            let hitPlayer = null;
            let shouldRemove = false;
            
            gameState.players.forEach((player, id) => {
                if (id !== bullet.ownerId && player.alive && !shouldRemove) {
                    const dx = bullet.x - player.x;
                    const dy = bullet.y - (player.y + 1); // 玩家中心高度
                    const dz = bullet.z - player.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 0.9) { // 碰撞半径
                        player.health -= 10;
                        if (player.health <= 0) {
                            player.health = 0;
                            player.alive = false;
                            if (!player.deaths) player.deaths = 0;
                            player.deaths++;
                            
                            // 记录击杀者
                            const killer = gameState.players.get(bullet.ownerId);
                            if (killer) {
                                if (!killer.kills) killer.kills = 0;
                                killer.kills++;
                                hitPlayer = { victimId: id, killerId: bullet.ownerId };
                            }
                        }
                        shouldRemove = true; // 标记移除子弹
                    }
                }
            });
            
            // 发送击杀通知
            if (hitPlayer) {
                broadcast({
                    type: 'playerKilled',
                    victimId: hitPlayer.victimId,
                    killerId: hitPlayer.killerId
                });
            }
            
            if (shouldRemove) {
                return false; // 移除子弹
            }
            
            return true;
        });

    // 广播游戏状态
    const state = {
        type: 'gameState',
        players: Array.from(gameState.players.entries()).map(([id, player]) => ({
            id,
            ...player
        })),
        bullets: gameState.bullets
    };
    
    broadcast(state);
}

// 游戏循环
setInterval(updateGameState, 16); // ~60 FPS

wss.on('connection', (ws) => {
    ws.id = generateId();
    console.log(`新玩家连接: ${ws.id}`);

    // 初始化玩家（3D坐标）- 在岛内随机生成
    const pos = randomPositionOnIsland();
    const spawnHeight = Math.max(0, getIslandHeight(pos.x, pos.z).height);
    const player = {
        id: ws.id,
        x: pos.x,
        y: spawnHeight,
        z: pos.z,
        yaw: Math.random() * Math.PI * 2,
        pitch: 0,
        health: 100,
        maxHealth: 100,
        alive: true,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        kills: 0,
        deaths: 0
    };
    
    gameState.players.set(ws.id, player);

    // 发送初始游戏状态
    ws.send(JSON.stringify({
        type: 'init',
        playerId: ws.id,
        players: Array.from(gameState.players.entries()).map(([id, p]) => ({
            id,
            ...p
        })),
        bullets: gameState.bullets
    }));

    // 通知其他玩家有新玩家加入
    broadcast({
        type: 'playerJoined',
        player: { id: ws.id, ...player }
    }, ws.id);

    // 接收客户端消息
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'playerUpdate':
                    if (gameState.players.has(ws.id)) {
                        const p = gameState.players.get(ws.id);
                        if (p.alive) {
                            // 验证位置是否在岛内
                            if (isPointOnIsland(data.x, data.z)) {
                                p.x = data.x;
                                p.z = data.z;
                            } else {
                                // 保持原位置
                            }
                            const ground = Math.max(0, getIslandHeight(p.x, p.z).height);
                            const desiredY = typeof data.y === 'number' ? data.y : ground;
                            const clampedY = Math.min(ground + MAX_JUMP_HEIGHT, Math.max(ground, desiredY));
                            p.y = clampedY;
                            p.yaw = data.yaw || 0;
                            p.pitch = data.pitch || 0;
                        }
                    }
                    break;
                    
                case 'shoot':
                    if (gameState.players.has(ws.id)) {
                        const p = gameState.players.get(ws.id);
                        if (p.alive) {
                            const yaw = data.yaw || p.yaw || 0;
                            const pitch = data.pitch || p.pitch || 0;
                            const speed = 20; // 子弹速度
                            
                            let spawnX = typeof data.x === 'number' ? data.x : p.x;
                            let spawnY = typeof data.y === 'number' ? data.y : p.y;
                            let spawnZ = typeof data.z === 'number' ? data.z : p.z;
                            
                            const maxOffset = 4;
                            if (Math.abs(spawnX - p.x) > maxOffset || Math.abs(spawnZ - p.z) > maxOffset) {
                                spawnX = p.x;
                                spawnZ = p.z;
                            }
                            const ground = Math.max(0, getIslandHeight(spawnX, spawnZ).height);
                            spawnY = Math.min(ground + MAX_JUMP_HEIGHT, Math.max(ground, spawnY));
                            
                            // 计算3D方向向量
                            const vx = Math.cos(pitch) * Math.cos(yaw) * speed;
                            const vy = Math.sin(pitch) * speed;
                            const vz = Math.cos(pitch) * Math.sin(yaw) * speed;
                            
                            const bullet = {
                                id: generateId(),
                                ownerId: ws.id,
                                x: spawnX,
                                y: spawnY + 2.6, // 眼睛高度
                                z: spawnZ,
                                vx: vx,
                                vy: vy,
                                vz: vz,
                                color: p.color
                            };
                            gameState.bullets.push(bullet);
                            broadcast({
                                type: 'bulletFired',
                                bullet
                            });
                        }
                    }
                    break;
                    
                case 'respawn':
                    if (gameState.players.has(ws.id)) {
                        const p = gameState.players.get(ws.id);
                        if (!p.alive) {
                            const pos = randomPositionOnIsland();
                            p.x = pos.x;
                            p.y = Math.max(0, getIslandHeight(pos.x, pos.z).height);
                            p.z = pos.z;
                            p.health = p.maxHealth;
                            p.alive = true;
                            p.yaw = Math.random() * Math.PI * 2;
                            p.pitch = 0;
                            broadcast({
                                type: 'playerRespawned',
                                player: { id: ws.id, ...p }
                            });
                        }
                    }
                    break;
                    
                case 'getStats':
                    if (gameState.players.has(ws.id)) {
                        const p = gameState.players.get(ws.id);
                        ws.send(JSON.stringify({
                            type: 'stats',
                            kills: p.kills,
                            deaths: p.deaths,
                            kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2)
                        }));
                    }
                    break;
            }
        } catch (error) {
            console.error('消息解析错误:', error);
        }
    });

    // 玩家断开连接
    ws.on('close', () => {
        console.log(`玩家断开连接: ${ws.id}`);
        gameState.players.delete(ws.id);
        broadcast({
            type: 'playerLeft',
            playerId: ws.id
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

