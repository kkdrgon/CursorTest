#version 300 es
precision highp float;

uniform highp usampler2D unitTexture; // 无符号整数纹理（输入）
out uvec4 oUnitColor; // 无符号整数输出
in vec2 vTexCoord;

const vec2 uResolution = vec2(300.0, 26.0);

// 塔信息结构
struct TowerInfo {
    int range;
    int cooldown;
    bool canF;  // 能否攻击飞行单位
    bool canG;  // 能否攻击地面单位
    int bulletId;
};

// 子弹信息结构
struct BulletInfo {
    float speed;
    int attack;
    float range;
    int mode;  // 0: 单体追踪, 1: 地面群体, 2: 空中群体
};

// 敌人信息结构
struct EnemyInfo {
    int HP;
    float speed;
    bool isFlying;
    int goldValue;
};

// 单元信息结构
struct UnitInfo {
    vec2 position;
    float direction;
    int ticksFlag;   // 塔：上次攻击ticks, 敌人：上次移动ticks, 子弹：目标敌人ID
    bool isUsed;
    int id;          // 塔/敌人/子弹类型ID
    int a;           // 敌人：路径ID, 子弹：命中标记
    int b;           // 塔：目标敌人ID, 敌人：HP+10, 子弹：目标位置编码
};

// 固化塔数据（对应 worker.js 中的 towerData）
const TowerInfo towers[10] = TowerInfo[10](
    TowerInfo(6, 10, true, true, 0),    // 塔0: MachineGun
    TowerInfo(8, 40, false, true, 1),   // 塔1: Artillery
    TowerInfo(10, 4, true, false, 2),   // 塔2: Missile
    TowerInfo(10, 8, true, true, 3),    // 塔3: MachineGun升级
    TowerInfo(10, 35, false, true, 4),  // 塔4: Artillery升级
    TowerInfo(12, 3, true, false, 5),   // 塔5: Missile升级
    TowerInfo(15, 6, true, true, 6),    // 塔6: MachineGun最终
    TowerInfo(12, 30, false, true, 7),  // 塔7: Artillery最终
    TowerInfo(14, 2, true, false, 8),   // 塔8: Missile最终
    TowerInfo(2, 2, false, false, -1)   // 塔9: Quantum (特殊)
);

// 固化子弹数据（对应 worker.js 中的 bulletData）
const BulletInfo bullets[9] = BulletInfo[9](
    BulletInfo(1200.0, 10, 2.0, 0),   // 子弹0
    BulletInfo(200.0, 20, 1.5, 1),    // 子弹1
    BulletInfo(500.0, 50, 2.0, 2),    // 子弹2
    BulletInfo(1200.0, 20, 2.0, 0),   // 子弹3
    BulletInfo(250.0, 40, 2.0, 1),    // 子弹4
    BulletInfo(600.0, 100, 2.4, 2),   // 子弹5
    BulletInfo(1200.0, 50, 2.0, 0),   // 子弹6
    BulletInfo(300.0, 100, 2.4, 1),   // 子弹7
    BulletInfo(700.0, 200, 3.0, 2)    // 子弹8
);

// 游戏基础数据
layout(std140) uniform GameBase {
    int ticks;
    int w;
    int h;
    int r;          // 0-5的随机数
    int npt;        // 当前波次开始ticks
    int towerCtrl;  // 塔操作: 0无, 1建造, 2删除, 3升级
    int tId;        // 塔ID或坐标
    int tx;
    int ty;
    int lv;         // 敌人等级
    int eNow;       // 是否开始新波次
} gameBase;

// 路径数据
layout(std140) uniform PathData {
    int path[3000];  // 路径数据，每个路径1500个点
};

// 获取敌人信息（对应 worker.js 中的 enemyData）
EnemyInfo getEnemyInfo(int uid) {
    EnemyInfo ei;
    int i = uid + 1;
    ei.HP = 10 * int(floor(pow(float(i), 1.5)));
    ei.speed = pow(float(i), 0.5) * 20.0;
    ei.isFlying = false;
    ei.goldValue = 1 + i / 10;
    
    // 特殊敌人类型
    if(i % 10 == 4) {  // 快速敌人
        ei.speed *= 2.0;
        ei.goldValue *= 2;
        ei.HP = ei.HP / 2;
    }
    if(i % 20 == 9) {  // 重型敌人
        ei.HP *= 4;
        ei.speed *= 0.5;
        ei.goldValue *= 2;
    }
    if(i % 20 == 19) {  // 飞行敌人
        ei.isFlying = true;
        ei.goldValue *= 2;
    }
    
    return ei;
}

// 从纹理读取单元数据
UnitInfo readData(ivec2 coord) {
    uvec4 data = texelFetch(unitTexture, coord, 0);
    
    UnitInfo ui;
    ui.position = vec2(uintBitsToFloat(data.x), uintBitsToFloat(data.y));
    
    int zData = int(data.z);
    ui.direction = float(zData & 0x3FF) / 150.0 - 500.0;
    ui.ticksFlag = (zData >> 10) & 0x7FFFF;
    
    int wData = int(data.w);
    ui.isUsed = (wData & 0x1) != 0;
    ui.id = (wData >> 1) & 0xFF;
    ui.a = (wData >> 9) & 0xF;
    ui.b = (wData >> 13) & 0x3FFFF;
    
    return ui;
}

// 编码单元数据到纹理
uvec4 encodeData(UnitInfo ui) {
    int z = (int(ui.direction * 150.0 + 500.0) & 0x3FF) | (ui.ticksFlag << 10);
    int w = (ui.isUsed ? 1 : 0) |
           ((ui.id & 0xFF) << 1) |
           ((ui.a & 0xF) << 9) |
           ((ui.b & 0x3FFFF) << 13);
    
    return uvec4(floatBitsToUint(ui.position.x),
                floatBitsToUint(ui.position.y),
                uint(z), uint(w));
}

// 解析编码的位置
vec2 parseB(int b) {
    return vec2(float(b & 0x1FF), float((b >> 9) & 0x1FF)) / 10.0;
}

// 编码位置
int encodeB(vec2 pos) {
    return (int(floor(pos.x * 10.0)) & 0x1FF) | 
           ((int(floor(pos.y * 10.0)) & 0x1FF) << 9);
}

void main() {
    ivec2 pixelCoord = ivec2(vTexCoord * uResolution);
    int currentId = pixelCoord.y * 300 + pixelCoord.x;
    UnitInfo ui = readData(pixelCoord);
    
    if(ui.isUsed) {
        if(pixelCoord.y == 0) {
            // ========== 塔逻辑 ==========
            TowerInfo ti = towers[ui.id];
            float tRange = float(ti.range);
            float eRange = tRange * tRange;
            int e_Id = -1;
            bool efly = false;
            
            // 寻找攻击目标（遍历所有敌人）
            for(int ey = 1; ey < 9; ey++) {
                for(int ex = 0; ex < 300; ex++) {
                    ivec2 eCoord = ivec2(ex, ey);
                    UnitInfo eui = readData(eCoord);
                    if(!eui.isUsed || eui.b <= 10) continue;
                    
                    EnemyInfo ei = getEnemyInfo(eui.id);
                    
                    // 检查攻击模式是否匹配
                    if((ei.isFlying && !ti.canF) || (!ei.isFlying && !ti.canG)) continue;
                    
                    vec2 delta = eui.position - ui.position;
                    float rangePow = dot(delta, delta);
                    
                    if(rangePow <= eRange) {
                        bool shouldUpdate = false;
                        if(e_Id < 0) {
                            shouldUpdate = true;
                        } else if(ei.isFlying) {
                            if(!efly || rangePow < eRange) {
                                shouldUpdate = true;
                            }
                        } else if(!efly && rangePow < eRange) {
                            shouldUpdate = true;
                        }
                        
                        if(shouldUpdate) {
                            eRange = rangePow;
                            e_Id = ey * 300 + ex;
                            efly = ei.isFlying;
                        }
                    }
                }
            }
            
            // 更新塔方向和射击
            if(e_Id >= 0) {
                ivec2 targetCoord = ivec2(e_Id % 300, e_Id / 300);
                UnitInfo eui = readData(targetCoord);
                vec2 dt = normalize(eui.position - ui.position);
                ui.direction = atan(dt.y, dt.x);
                
                // 检查冷却时间
                if(gameBase.ticks > ui.ticksFlag + ti.cooldown) {
                    ui.ticksFlag = gameBase.ticks;
                    ui.b = e_Id;  // 标记需要生成子弹
                }
            }
            
            // 处理塔操作
            if(gameBase.towerCtrl == 2 && currentId == gameBase.tId) {
                ui.isUsed = false;  // 删除塔
            } else if(gameBase.towerCtrl == 3 && currentId == gameBase.tId) {
                // 升级塔
                int newId = ui.id + 3;
                if(newId < 10) {
                    ui.id = newId;
                }
            }
            
        } else if(pixelCoord.y < 9) {
            // ========== 敌人逻辑 ==========
            if(ui.b > 10) {  // 敌人还活着
                EnemyInfo ei = getEnemyInfo(ui.id);
                ivec2 epi = ivec2(floor(ui.position.x), floor(ui.position.y));
                
                // 检查是否到达终点
                if((ui.a == 0 && epi.y >= 28) || (ui.a == 1 && epi.x <= 1)) {
                    ui.b = 5;  // 标记为到达终点
                    ui.isUsed = false;
                } else {
                    vec2 dt = ui.a == 0 ? vec2(0.0, 1.0) : vec2(-1.0, 0.0);
                    
                    // 地面敌人寻路
                    if(!ei.isFlying) {
                        int pidx = epi.y * gameBase.w + epi.x;
                        int nextDir = path[pidx + 1500 * ui.a];
                        
                        if(nextDir < 60000) {
                            ivec2 nextPos = ivec2(nextDir % gameBase.w, nextDir / gameBase.w);
                            vec2 targetPos = vec2(nextPos) + vec2(0.5);
                            dt = targetPos - ui.position;
                            
                            vec2 epiVec = vec2(epi);
                            vec2 nextVec = vec2(nextPos);
                            if(length(epiVec - nextVec) + 0.03 < length(dt)) {
                                dt = epiVec - ui.position + vec2(0.5);
                            }
                            dt = normalize(dt);
                        }
                    }
                    
                    // 检查子弹命中（遍历所有子弹）
                    for(int bx = 0; bx < 300; bx++) {
                        for(int by = 10; by < 25; by++) {
                            ivec2 bCoord = ivec2(bx, by);
                            UnitInfo bui = readData(bCoord);
                            
                            if(bui.isUsed && bui.a == 1) {  // 子弹已到达目标
                                BulletInfo bi = bullets[bui.id];
                                
                                if(bi.mode == 0) {
                                    // 单体追踪子弹
                                    if(bui.ticksFlag == currentId) {
                                        ui.b -= bi.attack;
                                        ui.a |= 2;  // 标记被击中
                                    }
                                } else if((bi.mode == 1 && !ei.isFlying) || 
                                         (bi.mode == 2 && ei.isFlying)) {
                                    // 群体伤害子弹
                                    float dist = length(bui.position - ui.position);
                                    if(dist < bi.range) {
                                        ui.b -= bi.attack;
                                        ui.a |= 2;  // 标记被击中
                                    }
                                }
                            }
                        }
                    }
                    
                    // 更新位置
                    float moveDistance = ei.speed / 1000.0;
                    ui.position += dt * moveDistance;
                    ui.direction = atan(dt.y, dt.x);
                    ui.ticksFlag = gameBase.ticks;
                    
                    // 检查死亡
                    if(ui.b <= 10) {
                        ui.b = 10;
                        ui.isUsed = false;
                    } else {
                        ui.a &= ~2;  // 清除击中标记（下一帧）
                    }
                }
            } else {
                // 死亡动画
                if(ui.b < 5) {
                    ui.isUsed = false;
                } else {
                    ui.b--;
                }
            }
            
        } else if(pixelCoord.y >= 10 && pixelCoord.y < 25) {
            // ========== 子弹逻辑 ==========
            if(ui.a == 0) {  // 子弹飞行中
                BulletInfo bi = bullets[ui.id];
                vec2 targetPos = parseB(ui.b);
                
                // 模式0：追踪目标敌人
                if(bi.mode == 0) {
                    ivec2 eCoord = ivec2(ui.ticksFlag % 300, ui.ticksFlag / 300);
                    UnitInfo eui = readData(eCoord);
                    if(eui.isUsed && eui.b > 10) {
                        targetPos = eui.position;
                    }
                }
                
                vec2 direction = normalize(targetPos - ui.position);
                float distanceToTarget = length(targetPos - ui.position);
                float moveDistance = bi.speed / 1000.0;
                
                if(distanceToTarget <= moveDistance || distanceToTarget < 0.1) {
                    // 到达目标
                    ui.a = 1;  // 标记为已到达
                    ui.position = targetPos;
                } else {
                    ui.position += direction * moveDistance;
                    ui.direction = atan(direction.y, direction.x);
                }
            } else {
                // 子弹已到达，等待删除
                if(ui.a >= 5) {
                    ui.isUsed = false;
                } else {
                    ui.a++;
                }
            }
            
        } else if(pixelCoord.y == 9) {
            // ========== 子弹计数逻辑 ==========
            // 检查是否有新子弹需要生成
            ivec2 tCoord = ivec2(pixelCoord.x, 0);
            UnitInfo tui = readData(tCoord);
            
            if(tui.isUsed && tui.ticksFlag == gameBase.ticks - 1 && tui.b >= 0) {
                // 寻找空闲子弹槽
                int bulletSlot = ui.b % 15 + 10;
                ivec2 bCoord = ivec2(pixelCoord.x, bulletSlot);
                UnitInfo bui = readData(bCoord);
                
                if(!bui.isUsed) {
                    ui.b++;
                }
            }
            
            // 清理旧子弹
            int oldSlot = ui.ticksFlag % 15 + 10;
            ivec2 oldBCoord = ivec2(pixelCoord.x, oldSlot);
            UnitInfo oldBui = readData(oldBCoord);
            if(!oldBui.isUsed) {
                ui.ticksFlag++;
            }
        }
        
    }
    
    // ========== 生成新单元（独立处理，不依赖isUsed） ==========
    // 先处理计数器更新（必须在生成逻辑之前）
    if(pixelCoord.y == 25 && pixelCoord.x == 0) {
        // 更新敌人生成计数器
        int t = gameBase.ticks - gameBase.npt;
        if(t <= 600 && t >= 0 && (gameBase.eNow == 1 || gameBase.npt > 0)) {
            // 确保计数器位置被标记为使用
            ui.isUsed = true;
            // 如果满足生成条件，递增计数器（在生成之前）
            if(t % 10 == 0) {
                ui.b = (ui.b + 1) % (300 * 8);  // 循环使用8行，每行300个位置
            }
        } else {
            // 如果不在生成阶段，保持计数器不变
            ui.isUsed = true;
        }
    } else if(pixelCoord.y == 0) {
        // 生成新塔
        if(gameBase.towerCtrl == 1 && !ui.isUsed) {
            ivec2 tCountCoord = ivec2(1, 25);
            UnitInfo tCountI = readData(tCountCoord);
            int expectedX = tCountI.b % 300;
            
            if(expectedX == pixelCoord.x) {
                TowerInfo ti = towers[gameBase.tId];
                ui.id = gameBase.tId;
                ui.position = vec2(float(gameBase.tx), float(gameBase.ty));
                ui.direction = 0.0;
                ui.isUsed = true;
                ui.ticksFlag = 0;
                ui.a = 0;
                ui.b = 0;
            }
        }
    } else if(pixelCoord.y >= 1 && pixelCoord.y < 9) {
        // 生成新敌人（检查是否应该生成，即使位置已被使用也要检查）
        int t = gameBase.ticks - gameBase.npt;
        // 每10个ticks生成一个敌人，持续600个ticks（20秒）
        // 只有当eNow为true或npt已设置时才生成敌人
        if(t <= 600 && t >= 0 && t % 10 == 0 && (gameBase.eNow == 1 || gameBase.npt > 0)) {
            // 使用计数器来确定生成位置
            ivec2 eCountCoord = ivec2(0, 25);
            UnitInfo eCountI = readData(eCountCoord);
            
            int expectedX = eCountI.b % 300;
            int expectedY = (eCountI.b / 300) % 8 + 1;  // 1-8行
            
            // 只在计数器指向的位置生成，并且该位置未被使用
            if(expectedX == pixelCoord.x && expectedY == pixelCoord.y && !ui.isUsed) {
                EnemyInfo ei = getEnemyInfo(gameBase.lv);
                ui.id = gameBase.lv;
                ui.a = (t % 20 == 0) ? 0 : 1;  // 路径ID：每20个ticks切换路径
                ui.b = ei.HP + 10;
                ui.isUsed = true;
                ui.ticksFlag = gameBase.ticks;
                
                float randomOffset = float(gameBase.r) - 2.5;
                if(t % 20 == 0) {
                    // 路径0：从底部中间进入
                    ui.position = vec2(float(gameBase.w) / 2.0 + randomOffset, 1.5);
                } else {
                    // 路径1：从右侧中间进入
                    ui.position = vec2(float(gameBase.w) - 1.5, float(gameBase.h) / 2.0 + randomOffset);
                }
                ui.direction = ui.a == 0 ? 1.5708 : 3.14159;  // 向下(π/2)或向左(π)
            }
        }
    } else if(pixelCoord.y >= 10 && pixelCoord.y < 25) {
        // 生成新子弹
        if(!ui.isUsed) {
            ivec2 bCountCoord = ivec2(pixelCoord.x, 9);
            UnitInfo bCountI = readData(bCountCoord);
            
            int expectedSlot = bCountI.b % 15 + 10;
            if(expectedSlot == pixelCoord.y) {
                ivec2 tCoord = ivec2(pixelCoord.x, 0);
                UnitInfo tui = readData(tCoord);
                
                if(tui.isUsed && tui.ticksFlag == gameBase.ticks - 1 && tui.b >= 0) {
                    TowerInfo ti = towers[tui.id];
                    int eid = tui.b;
                    ivec2 eCoord = ivec2(eid % 300, eid / 300);
                    UnitInfo eui = readData(eCoord);
                    
                    if(eui.isUsed && eui.b > 10) {
                        ui.id = ti.bulletId;
                        ui.ticksFlag = eid;
                        ui.position = tui.position;
                        ui.b = encodeB(eui.position);
                        ui.a = 0;
                        ui.isUsed = true;
                        vec2 dir = normalize(eui.position - tui.position);
                        ui.direction = atan(dir.y, dir.x);
                    }
                }
            }
        }
    }
    
    oUnitColor = encodeData(ui);
}

