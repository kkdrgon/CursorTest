import { Network } from './network.js';
import { Vec3 } from './math3d.js';

const ISLAND_BASE_RADIUS = 150;
const WATER_PLANE_SIZE = 420;

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
    const edgeNoise = noise2D(
        Math.cos(angle) * 20,
        Math.sin(angle) * 20
    ) * 0.05;
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

export class Game {
    constructor(renderer, network) {
        this.renderer = renderer;
        this.network = network;
        
        this.playerId = null;
        this.players = new Map();
        this.bullets = [];
        this.localPlayer = null;
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            mouseDeltaX: 0,
            mouseDeltaY: 0
        };
        
        this.lastShootTime = 0;
        this.shootCooldown = 200; // 毫秒
        
        // 第一人称相机
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        
        // 游戏世界 - 随机岛屿
        this.waterSize = WATER_PLANE_SIZE;
        this.boundaryPoints = this.computeBoundaryPoints(96);
        this.maxIslandRadius = this.boundaryPoints.reduce((max, point) => {
            const dist = Math.sqrt(point.x * point.x + point.z * point.z);
            return Math.max(max, dist);
        }, ISLAND_BASE_RADIUS);
        const terrainMesh = this.generateIslandTerrain(100, ISLAND_BASE_RADIUS * 2.2);
        if (terrainMesh) {
            this.renderer.setTerrainMesh(terrainMesh);
        }
        
        // 计分系统
        this.stats = {
            kills: 0,
            deaths: 0,
            kd: 0
        };
        
        // 击杀提示
        this.killFeed = [];
        this.maxKillFeedItems = 5;
        
        // 障碍物 - 在岛屿范围内生成
        this.obstacles = this.generateObstaclesOnIsland(18);
        this.trees = this.generateTrees(28);
        this.rocks = this.generateRocks(22);
        this.ruins = this.generateRuins(8);
        
        // 垂直运动参数
        this.gravity = -24;
        this.jumpStrength = 9;
        this.verticalVelocity = 0;
        this.isOnGround = true;
        this.maxJumpHeight = 3;
        
        // 小地图
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = null;
        if (this.minimapCanvas) {
            this.minimapCanvas.width = 200;
            this.minimapCanvas.height = 200;
            this.minimapCtx = this.minimapCanvas.getContext('2d');
        }
        
        // 第一人称武器
        this.weaponCanvas = document.getElementById('weaponCanvas');
        this.weaponCtx = null;
        if (this.weaponCanvas) {
            this.weaponCanvas.width = 300;
            this.weaponCanvas.height = 300;
            this.weaponCtx = this.weaponCanvas.getContext('2d');
        }
        
        // 帧率
        this.lastFpsTime = Date.now();
        this.fpsFrameCount = 0;
        this.currentFps = 0;
        
        // 统计信息请求间隔
        this.lastStatsRequest = 0;
        this.statsRequestInterval = 2000; // 2秒请求一次
        
        this.setupNetwork();

        this.scoreboardVisible = false;
        const healthElement = document.getElementById('health');
        if (healthElement) {
            healthElement.style.cursor = 'pointer';
            const toggle = (e) => {
                e.preventDefault();
                this.toggleScoreboard();
            };
            healthElement.addEventListener('click', toggle);
            healthElement.addEventListener('touchend', toggle);
        }
    }
    
    isPointOnIsland(x, z) {
        return getIslandMask(x, z) > 0.03;
    }
    
    generateIslandTerrain(resolution = 100, size = ISLAND_BASE_RADIUS * 2.4) {
        const half = size / 2;
        const grid = [];
        for (let i = 0; i <= resolution; i++) {
            const row = [];
            for (let j = 0; j <= resolution; j++) {
                const x = -half + (i / resolution) * size;
                const z = -half + (j / resolution) * size;
                const { height, mask } = getIslandHeight(x, z);
                row.push({
                    x,
                    y: height,
                    z,
                    mask,
                    u: i / resolution,
                    v: j / resolution
                });
            }
            grid.push(row);
        }
        
        const vertices = [];
        const addVertex = (p, normal) => {
            vertices.push(
                p.x, p.y, p.z,
                normal.x, normal.y, normal.z,
                p.u, p.v
            );
        };
        
        const pushTriangle = (p0, p1, p2) => {
            const v0 = new Vec3(p0.x, p0.y, p0.z);
            const v1 = new Vec3(p1.x, p1.y, p1.z);
            const v2 = new Vec3(p2.x, p2.y, p2.z);
            let normal = v1.subtract(v0).cross(v2.subtract(v0));
            if (normal.length() > 0) {
                normal = normal.normalize();
                if (normal.y < 0) {
                    normal = normal.multiplyScalar(-1);
                }
            } else {
                normal = new Vec3(0, 1, 0);
            }
            addVertex(p0, normal);
            addVertex(p1, normal);
            addVertex(p2, normal);
        };
        
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const p00 = grid[i][j];
                const p10 = grid[i + 1][j];
                const p01 = grid[i][j + 1];
                const p11 = grid[i + 1][j + 1];
                const maskAvg = (p00.mask + p10.mask + p01.mask + p11.mask) * 0.25;
                if (maskAvg < 0.02) {
                    continue;
                }
                pushTriangle(p00, p10, p01);
                pushTriangle(p10, p11, p01);
            }
        }
        
        return vertices.length ? new Float32Array(vertices) : null;
    }
    
    generateObstaclesOnIsland(count) {
        const obstacles = [];
        const maxAttempts = count * 20;
        let attempts = 0;
        
        while (obstacles.length < count && attempts < maxAttempts) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * getIslandRadius(angle) * 0.9;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            if (!this.isPointOnIsland(x, z)) {
                continue;
            }
            
            let tooClose = false;
            for (const obs of obstacles) {
                const dx = x - obs.x;
                const dz = z - obs.z;
                if (Math.sqrt(dx * dx + dz * dz) < 6) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;
            
            const { height } = getIslandHeight(x, z);
            obstacles.push({
                x,
                z,
                y: Math.max(0, height),
                size: 2 + Math.random() * 2
            });
        }
        
        return obstacles;
    }

    generateTrees(count) {
        const trees = [];
        let attempts = 0;
        while (trees.length < count && attempts < count * 8) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * getIslandRadius(angle) * 0.85;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (!this.isPointOnIsland(x, z)) continue;
            if (radius < ISLAND_BASE_RADIUS * 0.25) continue; // 保持中心空旷
            const ground = this.getGroundHeight(x, z);
            trees.push({
                x,
                z,
                y: ground,
                trunkHeight: 2.8 + Math.random() * 2.5,
                crownRadius: 1.4 + Math.random() * 1.3,
                colorOffset: Math.random() * 0.15
            });
        }
        return trees;
    }

    generateRocks(count) {
        const rocks = [];
        let attempts = 0;
        while (rocks.length < count && attempts < count * 6) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * getIslandRadius(angle) * 0.95;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (!this.isPointOnIsland(x, z)) continue;
            const ground = this.getGroundHeight(x, z);
            rocks.push({
                x,
                z,
                y: ground,
                scale: {
                    x: 0.8 + Math.random() * 1.5,
                    y: 0.5 + Math.random() * 1.2,
                    z: 0.8 + Math.random() * 1.5
                },
                rotation: Math.random() * Math.PI
            });
        }
        return rocks;
    }

    generateRuins(count) {
        const ruins = [];
        let attempts = 0;
        while (ruins.length < count && attempts < count * 5) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const radius = (0.3 + Math.random() * 0.5) * getIslandRadius(angle);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (!this.isPointOnIsland(x, z)) continue;
            const ground = this.getGroundHeight(x, z);
            const width = 1.2 + Math.random();
            const height = 1.4 + Math.random() * 1.4;
            const length = 2.5 + Math.random() * 1.5;
            ruins.push({
                x,
                z,
                y: ground,
                width,
                height,
                length,
                rotation: Math.random() * Math.PI * 2,
                debris: Array.from({ length: 3 }, () => ({
                    offsetX: (Math.random() - 0.5) * width,
                    offsetZ: (Math.random() - 0.5) * length,
                    scale: {
                        x: 0.3 + Math.random() * 0.4,
                        y: 0.2 + Math.random() * 0.3,
                        z: 0.3 + Math.random() * 0.4
                    }
                }))
            });
        }
        return ruins;
    }
    
    computeBoundaryPoints(segments = 64) {
        const points = [];
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const radius = getIslandRadius(angle);
            points.push({
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius
            });
        }
        return points;
    }
    
    setupNetwork() {
        this.network.on('init', (data) => {
            this.playerId = data.playerId;
            this.players.clear();
            data.players.forEach(p => {
                // 确保有统计信息
                if (!p.kills) p.kills = 0;
                if (!p.deaths) p.deaths = 0;
                this.players.set(p.id, p);
                if (p.id === this.playerId) {
                    this.localPlayer = p;
                    this.stats.kills = p.kills || 0;
                    this.stats.deaths = p.deaths || 0;
                    // 初始化相机角度
                    this.cameraYaw = p.yaw || 0;
                    this.cameraPitch = p.pitch || 0;
                }
            });
            this.bullets = data.bullets || [];
            this.updateUI();
        });
        
        this.network.on('gameState', (data) => {
            // 更新玩家状态
            data.players.forEach(p => {
                if (p.id === this.playerId) {
                    // 本地玩家位置由服务器同步（但保持客户端预测）
                    if (this.localPlayer) {
                        this.localPlayer.health = p.health;
                        this.localPlayer.alive = p.alive;
                        this.localPlayer.kills = p.kills || 0;
                        this.localPlayer.deaths = p.deaths || 0;
                        // 平滑插值服务器位置
                        const lerp = 0.2;
                        this.localPlayer.x += (p.x - this.localPlayer.x) * lerp;
                        this.localPlayer.y += (p.y - this.localPlayer.y) * lerp;
                        this.localPlayer.z += (p.z - this.localPlayer.z) * lerp;
                    }
                } else {
                    // 其他玩家直接更新
                    this.players.set(p.id, p);
                }
            });
            
            // 更新子弹
            this.bullets = data.bullets || [];
            this.updateUI();
        });
        
        this.network.on('playerJoined', (data) => {
            this.players.set(data.player.id, data.player);
        });
        
        this.network.on('playerLeft', (data) => {
            this.players.delete(data.playerId);
        });
        
        this.network.on('bulletFired', (data) => {
            this.bullets.push(data.bullet);
        });
        
        this.network.on('playerRespawned', (data) => {
            if (data.player.id === this.playerId) {
                this.localPlayer = data.player;
                this.cameraYaw = data.player.yaw || 0;
                this.cameraPitch = data.player.pitch || 0;
                this.isOnGround = true;
                this.verticalVelocity = 0;
            }
            this.players.set(data.player.id, data.player);
            this.updateUI();
        });
        
        this.network.on('playerKilled', (data) => {
            // 更新玩家状态
            const victim = this.players.get(data.victimId);
            const killer = this.players.get(data.killerId);
            
            if (victim) {
                victim.alive = false;
                victim.health = 0;
                if (!victim.deaths) victim.deaths = 0;
                victim.deaths++;
            }
            if (killer) {
                if (!killer.kills) killer.kills = 0;
                killer.kills++;
            }
            
            // 如果是本地玩家被击杀
            if (data.victimId === this.playerId) {
                this.stats.deaths = (this.stats.deaths || 0) + 1;
                this.addKillFeed(null, '你被击杀了', true);
            }
            
            // 如果是本地玩家击杀别人
            if (data.killerId === this.playerId) {
                this.stats.kills = (this.stats.kills || 0) + 1;
                const victimName = victim ? this.getPlayerName(data.victimId) : '敌人';
                this.addKillFeed('你', `击杀了 ${victimName}`, false);
            } else if (data.victimId !== this.playerId) {
                // 添加击杀提示（其他玩家之间的击杀）
                if (killer && victim) {
                    this.addKillFeed(null, `${this.getPlayerName(data.killerId)} 击杀了 ${this.getPlayerName(data.victimId)}`, false);
                }
            }
            
            this.updateUI();
        });
        
        this.network.on('stats', (data) => {
            this.stats.kills = data.kills || 0;
            this.stats.deaths = data.deaths || 0;
            this.stats.kd = data.kd || 0;
            if (this.localPlayer) {
                this.localPlayer.kills = data.kills || 0;
                this.localPlayer.deaths = data.deaths || 0;
            }
            this.updateUI();
        });
    }
    
    updateInput(input) {
        this.input = input;
        
        if (!this.localPlayer || !this.localPlayer.alive) {
            return;
        }
        
        // 更新相机角度（第一人称视角）
        this.cameraYaw -= input.mouseDeltaX;
        this.cameraPitch -= input.mouseDeltaY;
        this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));
        
        // 计算移动方向（相对于视角）
        const moveSpeed = 5; // 单位/秒
        let moveX = 0, moveZ = 0;
        
        if (input.forward) moveZ -= 1;
        if (input.backward) moveZ += 1;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;
        
        // 归一化对角线移动
        if (moveX !== 0 && moveZ !== 0) {
            moveX *= 0.707;
            moveZ *= 0.707;
        }
        
        // 根据当前视角计算移动方向
        const forwardX = Math.cos(this.cameraYaw);
        const forwardZ = Math.sin(this.cameraYaw);
        const rightX = -Math.sin(this.cameraYaw);
        const rightZ = Math.cos(this.cameraYaw);
        const worldMoveX = rightX * moveX + forwardX * (-moveZ);
        const worldMoveZ = rightZ * moveX + forwardZ * (-moveZ);
        
        // 更新位置（客户端预测）
        const now = Date.now();
        const deltaTime = (now - (this.lastUpdateTime || now)) / 1000;
        this.lastUpdateTime = now;
        
        if (worldMoveX !== 0 || worldMoveZ !== 0) {
            const prevX = this.localPlayer.x;
            const prevZ = this.localPlayer.z;
            this.localPlayer.x += worldMoveX * moveSpeed * deltaTime;
            this.localPlayer.z += worldMoveZ * moveSpeed * deltaTime;
            
            if (!this.isPointOnIsland(this.localPlayer.x, this.localPlayer.z)) {
                this.localPlayer.x = prevX;
                this.localPlayer.z = prevZ;
            }
        }
        
        const groundHeight = this.getGroundHeight(this.localPlayer.x, this.localPlayer.z);
        if (this.localPlayer.y === undefined) {
            this.localPlayer.y = groundHeight;
            this.isOnGround = true;
            this.verticalVelocity = 0;
        }
        this.applyVerticalPhysics(deltaTime, groundHeight);
        
        // 更新玩家角度
        this.localPlayer.yaw = this.cameraYaw;
        this.localPlayer.pitch = this.cameraPitch;
        
        // 发送更新到服务器
        this.network.send({
            type: 'playerUpdate',
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            z: this.localPlayer.z,
            yaw: this.localPlayer.yaw,
            pitch: this.localPlayer.pitch
        });
    }
    
    shoot() {
        if (!this.localPlayer || !this.localPlayer.alive) {
            return;
        }
        
        const now = Date.now();
        if (now - this.lastShootTime < this.shootCooldown) {
            return;
        }
        this.lastShootTime = now;
        
        this.network.send({
            type: 'shoot',
            yaw: this.cameraYaw,
            pitch: this.cameraPitch,
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            z: this.localPlayer.z
        });
    }
    
    respawn() {
        if (this.localPlayer && !this.localPlayer.alive) {
            this.network.send({
                type: 'respawn'
            });
        }
    }
    
    update() {
        // 更新子弹位置（客户端预测）
        const now = Date.now();
        const deltaTime = (now - (this.lastBulletUpdate || now)) / 1000;
        this.lastBulletUpdate = now;
        
        this.bullets.forEach(bullet => {
            bullet.x += bullet.vx * deltaTime;
            bullet.y += bullet.vy * deltaTime;
            bullet.z += bullet.vz * deltaTime;
        });
    }
    
    render() {
        if (!this.renderer || !this.renderer.gl) {
            return;
        }
        
        this.renderer.clear();
        
        // 设置第一人称相机（即使没有玩家也设置默认相机）
        let cameraPos, yaw, pitch;
        if (this.localPlayer && this.localPlayer.alive) {
            cameraPos = new Vec3(
                this.localPlayer.x,
                this.localPlayer.y + 2.6, // 眼睛高度
                this.localPlayer.z
            );
            yaw = this.cameraYaw;
            pitch = this.cameraPitch;
        } else {
            // 默认相机位置（等待连接时）
            cameraPos = new Vec3(0, 2.6, 5); // 稍微向后移动以便看到场景
            yaw = 0;
            pitch = -0.2; // 稍微向下看
        }
        
        this.renderer.setCamera(cameraPos, yaw, pitch);
        this.renderer.beginRender();
        
        // 渲染水面（在岛屿下方，类型4=水面）
        try {
            this.renderer.drawPlane(
                new Vec3(0, -0.5, 0),
                new Vec3(this.waterSize, 1, this.waterSize),
                { r: 0.08, g: 0.16, b: 0.35, a: 1.0 },
                4
            );
        } catch (error) {
            console.error('渲染水面失败:', error);
        }
        
        // 渲染随机岛屿地形
        try {
            this.renderer.drawTerrain(
                { r: 0.22, g: 0.32, b: 0.22, a: 1.0 },
                2
            );
        } catch (error) {
            console.error('渲染随机地形失败:', error);
        }
        
        // 渲染不规则边界标记
        try {
            const wallHeight = 2.5;
            const wallThickness = 0.4;
            const points = this.boundaryPoints;
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                const midX = (p1.x + p2.x) * 0.5;
                const midZ = (p1.z + p2.z) * 0.5;
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const length = Math.sqrt(dx * dx + dz * dz);
                const rotY = Math.atan2(dx, dz);
                
                this.renderer.drawCube(
                    new Vec3(midX, wallHeight / 2, midZ),
                    new Vec3(wallThickness, wallHeight, Math.max(0.5, length)),
                    { y: rotY },
                    { r: 0.35, g: 0.35, b: 0.4, a: 1.0 },
                    3
                );
            }
        } catch (error) {
            console.error('渲染边界失败:', error);
        }
        
        // 渲染障碍物
        this.obstacles.forEach(obs => {
            this.renderer.drawCube(
                new Vec3(obs.x, obs.y + obs.size / 2, obs.z),
                new Vec3(obs.size, obs.size, obs.size),
                null,
                { r: 0.4, g: 0.4, b: 0.5, a: 1.0 },
                3
            );
        });

        // 树木
        this.trees.forEach(tree => {
            const trunkColor = { r: 0.35, g: 0.22, b: 0.12, a: 1.0 };
            const leavesColor = {
                r: 0.15 + tree.colorOffset,
                g: 0.45 + tree.colorOffset,
                b: 0.2,
                a: 1.0
            };
            // 树干
            this.renderer.drawCube(
                new Vec3(tree.x, tree.y + tree.trunkHeight / 2, tree.z),
                new Vec3(0.35, tree.trunkHeight, 0.35),
                null,
                trunkColor,
                3
            );
            // 树冠
            this.renderer.drawSphere(
                new Vec3(tree.x, tree.y + tree.trunkHeight + tree.crownRadius * 0.6, tree.z),
                tree.crownRadius,
                leavesColor,
                0
            );
        });

        // 岩石
        this.rocks.forEach(rock => {
            this.renderer.drawCube(
                new Vec3(rock.x, rock.y + rock.scale.y / 2, rock.z),
                new Vec3(rock.scale.x, rock.scale.y, rock.scale.z),
                { y: rock.rotation },
                { r: 0.32, g: 0.33, b: 0.37, a: 1.0 },
                3
            );
        });

        // 遗迹
        this.ruins.forEach(ruin => {
            const baseColor = { r: 0.55, g: 0.55, b: 0.6, a: 1.0 };
            // 墙体
            this.renderer.drawCube(
                new Vec3(ruin.x, ruin.y + ruin.height / 2, ruin.z),
                new Vec3(ruin.width, ruin.height, ruin.length),
                { y: ruin.rotation },
                baseColor,
                3
            );
            // 顶部碎块
            ruin.debris.forEach(debris => {
                this.renderer.drawCube(
                    new Vec3(
                        ruin.x + Math.cos(ruin.rotation) * debris.offsetX - Math.sin(ruin.rotation) * debris.offsetZ,
                        ruin.y + ruin.height + 0.2,
                        ruin.z + Math.sin(ruin.rotation) * debris.offsetX + Math.cos(ruin.rotation) * debris.offsetZ
                    ),
                    new Vec3(debris.scale.x, debris.scale.y, debris.scale.z),
                    null,
                    { r: 0.5, g: 0.5, b: 0.55, a: 1.0 },
                    3
                );
            });
        });
        
        // 渲染所有玩家（除了本地玩家，因为第一人称看不到自己）
        this.players.forEach(player => {
            if (player.alive && player.id !== this.playerId) {
                const color = this.parseColor(player.color);
                const pos = new Vec3(player.x, player.y + 1, player.z);
                
                // 渲染玩家身体（立方体）
                this.renderer.drawCube(
                    pos,
                    new Vec3(0.8, 1.8, 0.8),
                    { y: player.yaw || 0 },
                    color,
                    0
                );
                
                // 渲染玩家头部
                this.renderer.drawCube(
                    new Vec3(player.x, player.y + 2.2, player.z),
                    new Vec3(0.5, 0.5, 0.5),
                    { y: player.yaw || 0 },
                    color,
                    0
                );
                
                // 渲染生命值条
                if (player.health < player.maxHealth) {
                    const healthPercent = player.health / player.maxHealth;
                    const healthColor = {
                        r: 1 - healthPercent,
                        g: healthPercent,
                        b: 0,
                        a: 0.8
                    };
                    this.renderer.drawCube(
                        new Vec3(player.x, player.y + 2.5, player.z),
                        new Vec3(1 * healthPercent, 0.1, 0.1),
                        null,
                        healthColor,
                    0
                    );
                }
            }
        });
        
        // 渲染所有子弹
        this.bullets.forEach(bullet => {
            const color = this.parseColor(bullet.color);
            this.renderer.drawSphere(
                new Vec3(bullet.x, bullet.y, bullet.z),
                0.1,
                color,
                1
            );
        });
        
        // 渲染小地图
        this.renderMinimap();
        
        // 渲染第一人称武器
        this.renderWeapon();
        
        // 更新帧率
        this.updateFPS();
    }
    
    renderMinimap() {
        if (!this.minimapCtx || !this.localPlayer) return;
        
        const ctx = this.minimapCtx;
        const size = 200;
        const centerX = size / 2;
        const centerZ = size / 2;
        
        const maxRadius = this.maxIslandRadius || ISLAND_BASE_RADIUS + 40;
        const scale = (size * 0.45) / maxRadius;
        
        // 清空
        ctx.fillStyle = 'rgba(20, 40, 20, 0.8)';
        ctx.fillRect(0, 0, size, size);
        
        // 绘制不规则边界
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.boundaryPoints.forEach((point, index) => {
            const x = centerX + point.x * scale;
            const z = centerZ + point.z * scale;
            if (index === 0) {
                ctx.moveTo(x, z);
            } else {
                ctx.lineTo(x, z);
            }
        });
        ctx.closePath();
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(30, 50, 30, 0.3)';
        ctx.fill();
        
        // 绘制障碍物
        ctx.fillStyle = 'rgba(100, 100, 120, 0.8)';
        this.obstacles.forEach(obs => {
            const x = centerX + obs.x * scale;
            const z = centerZ + obs.z * scale;
            const s = obs.size * scale * 0.5;
            ctx.fillRect(x - s/2, z - s/2, s, s);
        });
        
        // 绘制其他玩家
        this.players.forEach(player => {
            if (player.id !== this.playerId && player.alive) {
                const x = centerX + player.x * scale;
                const z = centerZ + player.z * scale;
                ctx.fillStyle = this.parseColor(player.color);
                ctx.beginPath();
                ctx.arc(x, z, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        // 绘制本地玩家
        if (this.localPlayer && this.localPlayer.alive) {
            const x = centerX + this.localPlayer.x * scale;
            const z = centerZ + this.localPlayer.z * scale;
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(x, z, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // 绘制朝向
            const dirLength = 8;
            const dirX = Math.cos(this.cameraYaw) * dirLength;
            const dirZ = Math.sin(this.cameraYaw) * dirLength;
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, z);
            ctx.lineTo(x + dirX, z + dirZ);
            ctx.stroke();
        }
    }
    
    renderWeapon() {
        if (!this.weaponCtx || !this.localPlayer || !this.localPlayer.alive) {
            // 如果玩家不存在或已死亡，清空武器画布
            if (this.weaponCtx) {
                this.weaponCtx.clearRect(0, 0, this.weaponCanvas.width, this.weaponCanvas.height);
            }
            return;
        }
        
        const ctx = this.weaponCtx;
        const width = this.weaponCanvas.width;
        const height = this.weaponCanvas.height;
        
        // 清空
        ctx.clearRect(0, 0, width, height);
        
        // 根据画布大小调整武器尺寸
        const scale = width / 300;
        
        // 绘制简单的武器（枪）
        ctx.strokeStyle = '#666';
        ctx.fillStyle = '#333';
        ctx.lineWidth = 3 * scale;
        
        // 枪身
        ctx.fillRect(180 * scale, 200 * scale, 60 * scale, 20 * scale);
        ctx.strokeRect(180 * scale, 200 * scale, 60 * scale, 20 * scale);
        
        // 枪管
        ctx.fillRect(240 * scale, 205 * scale, 30 * scale, 10 * scale);
        ctx.strokeRect(240 * scale, 205 * scale, 30 * scale, 10 * scale);
        
        // 握把
        ctx.fillRect(185 * scale, 220 * scale, 15 * scale, 30 * scale);
        ctx.strokeRect(185 * scale, 220 * scale, 15 * scale, 30 * scale);
        
        // 瞄准镜
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.arc(210 * scale, 210 * scale, 8 * scale, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    updateFPS() {
        this.fpsFrameCount++;
        const now = Date.now();
        const elapsed = now - this.lastFpsTime;
        
        if (elapsed >= 1000) {
            this.currentFps = Math.round((this.fpsFrameCount * 1000) / elapsed);
            this.fpsFrameCount = 0;
            this.lastFpsTime = now;
            
            const fpsElement = document.getElementById('fps');
            if (fpsElement) {
                fpsElement.textContent = `FPS: ${this.currentFps}`;
            }
        }
    }
    
    parseColor(colorStr) {
        if (colorStr.startsWith('hsl')) {
            const match = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                return this.renderer.hslToRgb(
                    parseInt(match[1]),
                    parseInt(match[2]),
                    parseInt(match[3])
                );
            }
        }
        return { r: 1, g: 1, b: 1, a: 1 };
    }
    
    addKillFeed(killer, action, isDeath) {
        const feedItem = {
            killer: killer,
            action: action,
            isDeath: isDeath,
            time: Date.now()
        };
        this.killFeed.unshift(feedItem);
        if (this.killFeed.length > this.maxKillFeedItems) {
            this.killFeed.pop();
        }
        this.updateKillFeed();
        
        // 5秒后移除
        setTimeout(() => {
            const index = this.killFeed.indexOf(feedItem);
            if (index > -1) {
                this.killFeed.splice(index, 1);
                this.updateKillFeed();
            }
        }, 5000);
    }
    
    updateKillFeed() {
        const killFeed = document.getElementById('killFeed');
        if (!killFeed) return;
        
        killFeed.innerHTML = '';
        this.killFeed.forEach(item => {
            const div = document.createElement('div');
            div.className = 'killFeedItem' + (item.isDeath ? ' death' : '');
            div.textContent = item.action;
            killFeed.appendChild(div);
        });
    }
    
    getPlayerName(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            return `玩家${playerId.substr(0, 4)}`;
        }
        return '未知';
    }

    getGroundHeight(x, z) {
        return Math.max(0, getIslandHeight(x, z).height);
    }

    applyVerticalPhysics(deltaTime, groundHeight) {
        if (!this.localPlayer) return;
        
        if (this.isOnGround) {
            this.localPlayer.y = groundHeight;
            return;
        }
        
        this.verticalVelocity += this.gravity * deltaTime;
        this.localPlayer.y += this.verticalVelocity * deltaTime;
        
        if (this.localPlayer.y <= groundHeight) {
            this.localPlayer.y = groundHeight;
            this.verticalVelocity = 0;
            this.isOnGround = true;
        }
    }

    jump() {
        if (!this.localPlayer || !this.localPlayer.alive) return;
        if (!this.isOnGround) return;
        this.isOnGround = false;
        this.verticalVelocity = this.jumpStrength;
    }

    updateScoreboard() {
        const list = document.getElementById('scoreboardList');
        if (!list) return;
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) {
            scoreboard.classList.toggle('visible', this.scoreboardVisible);
        }
        
        const playerEntries = Array.from(this.players.values());
        if (this.localPlayer) {
            const exists = playerEntries.some(p => p.id === this.localPlayer.id);
            if (!exists) {
                playerEntries.push(this.localPlayer);
            }
        }
        
        playerEntries.sort((a, b) => {
            const killsA = a.kills || 0;
            const killsB = b.kills || 0;
            if (killsA !== killsB) {
                return killsB - killsA;
            }
            const deathsA = a.deaths || 0;
            const deathsB = b.deaths || 0;
            return deathsA - deathsB;
        });
        
        list.innerHTML = '';
        playerEntries.forEach(player => {
            const row = document.createElement('div');
            row.className = 'scoreboard-row';
            if (player.id === this.playerId) {
                row.classList.add('local');
            }
            if (!player.alive) {
                row.classList.add('dead');
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = this.getPlayerName(player.id);
            
            const killsSpan = document.createElement('span');
            killsSpan.textContent = player.kills || 0;
            
            const deathsSpan = document.createElement('span');
            deathsSpan.textContent = player.deaths || 0;
            
            const kdSpan = document.createElement('span');
            const deaths = player.deaths || 0;
            const kills = player.kills || 0;
            kdSpan.textContent = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
            
            row.appendChild(nameSpan);
            row.appendChild(killsSpan);
            row.appendChild(deathsSpan);
            row.appendChild(kdSpan);
            list.appendChild(row);
        });
    }

    toggleScoreboard() {
        this.scoreboardVisible = !this.scoreboardVisible;
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) {
            scoreboard.classList.toggle('visible', this.scoreboardVisible);
        }
    }
    
    updateUI() {
        const playerCount = document.getElementById('playerCount');
        const health = document.getElementById('health');
        const healthFill = document.getElementById('healthFill');
        const status = document.getElementById('status');
        const stats = document.getElementById('stats');
        
        if (playerCount) {
            playerCount.textContent = this.players.size;
        }
        
        if (this.localPlayer) {
            if (health) {
                health.textContent = `${Math.max(0, Math.floor(this.localPlayer.health))}/${this.localPlayer.maxHealth}`;
            }
            if (healthFill) {
                const percent = (this.localPlayer.health / this.localPlayer.maxHealth) * 100;
                healthFill.style.width = `${Math.max(0, percent)}%`;
            }
            if (status) {
                if (this.localPlayer.alive) {
                    status.textContent = '游戏中';
                    status.style.color = '#0f0';
                    status.classList.remove('dead');
                } else {
                    status.textContent = '已死亡 - 点击重生';
                    status.style.color = '#f00';
                    status.classList.add('dead');
                }
            }
            
            // 更新统计信息
            if (stats) {
                const kills = this.localPlayer.kills || this.stats.kills || 0;
                const deaths = this.localPlayer.deaths || this.stats.deaths || 0;
                const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
                stats.innerHTML = `
                    <div>击杀: ${kills}</div>
                    <div>死亡: ${deaths}</div>
                    <div>KD: ${kd}</div>
                `;
            }
        } else {
            if (status) {
                status.textContent = '连接中...';
                status.style.color = '#ff0';
            }
        }
        
        // 定期请求统计信息（降低频率）
        const now = Date.now();
        if (this.localPlayer && this.localPlayer.alive && now - this.lastStatsRequest > this.statsRequestInterval) {
            this.network.send({ type: 'getStats' });
            this.lastStatsRequest = now;
        }
        
        this.updateScoreboard();
    }
}
