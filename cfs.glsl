#version 300 es
precision highp float;

uniform highp usampler2D unitTexture; // 无符号整数纹理

// 输出到乒乓纹理
out uvec4 oUnitColor; // 无符号整数输出
in vec2 vTexCoord;

const vec2 uResolution = vec2(300.0, 26.0);

struct TowerInfo {
    int range;
    int cooldown;
    int atkMode; // 0单体 1地面群体 2空中群体
    int bulletId;
};

struct BulletInfo {
    int speed;
    int attack;
    int range;
    int mode;
};
// 固化塔数据
const TowerInfo towers[10] = TowerInfo[10](
    TowerInfo(6, 10, 0, 0),   // 塔0
    TowerInfo(8, 40, 1, 1),   // 塔1  
    TowerInfo(10, 4, 2, 2),   // 塔2
    TowerInfo(10, 8, 0, 3),   // 塔3
    TowerInfo(10, 35, 1, 4),  // 塔4
    TowerInfo(12, 3, 2, 5),   // 塔5
    TowerInfo(15, 6, 0, 6),   // 塔6
    TowerInfo(12, 30, 1, 7),  // 塔7
    TowerInfo(14, 2, 2, 8),   // 塔8
    TowerInfo(2, 2, -1, -1)    // 塔9
);

// 固化的子弹数据
const BulletInfo bullets[9] = BulletInfo[9](
    BulletInfo(10, 5, 0, 0),   // 子弹0
    BulletInfo(8, 20, 0, 0),   // 子弹1
    BulletInfo(15, 10, 0, 0),  // 子弹2
    BulletInfo(12, 8, 0, 0),   // 子弹3
    BulletInfo(6, 50, 0, 0),   // 子弹4
    BulletInfo(20, 5, 0, 0),   // 子弹5
    BulletInfo(10, 15, 0, 0),  // 子弹6
    BulletInfo(5, 100, 0, 0),  // 子弹7
    BulletInfo(25, 3, 0, 0)    // 子弹8
);

struct EnemyInfo {
    int HP;
    float speed;
    int isFlying;
    int goldValue;
};

struct UnitInfo{
    vec2 position;
    float direction; // 10位
    int ticksFlag;   // 19位
    bool isUsed;
    int id;          // 8位
    int a;           // 4位
    int b;           // 18位
};

// 游戏基础数据
layout(std140) uniform GameBase {
    int ticks;
    int w;
    int h;
    int r; // 0-5的整型随机数
    int npt;
    int towerCtrl; // 塔操作标记 0无操作 1建造 2删除 3升级 4点击
    int tId;
    int tx;
    int ty;
    int lv; // 敌人等级
} gameBase;

// 路径数据
layout(std140) uniform PathData {
    int path[3000];
};

EnemyInfo getEnemyInfo(int uid) {
    EnemyInfo ei;
    int i = uid + 1;
    ei.HP = 10 * int(floor(pow(float(i), 1.5)));
    ei.speed = pow(float(i), 0.33) * 20.0;
    ei.isFlying = 0;
    ei.goldValue = 1 + i / 10;

    if(i % 10 == 5) { ei.speed *= 2.0; ei.goldValue *= 2; ei.HP /= 2; }
    if(i % 20 == 10) { ei.speed *= 0.5; ei.goldValue *= 2; ei.HP *= 4; }
    if(i % 20 == 0) { ei.isFlying = 1; ei.goldValue *= 3; }
    return ei;
}

// 位操作辅助函数
UnitInfo readData(ivec2 coord) {
    uvec4 data = texelFetch(unitTexture, coord, 0);
    
    UnitInfo ui;
    // 从无符号整数数据解码
    ui.position = vec2(uintBitsToFloat(data.x), uintBitsToFloat(data.y));
    
    // 将 uint 转换为 int 进行位操作
    int zData = int(data.z);
    ui.direction = float(zData & 0x3FF) / 150.0 - 500.0; // 10位方向
    ui.ticksFlag = (zData >> 10) & 0x7FFFF; // 19位 子弹目标ID、炮台上次攻击ticks
    
    int wData = int(data.w);
    ui.isUsed = (wData & 0x1) != 0; // 最低位作为使用标记
    ui.id = (wData >> 1) & 0xFF; // 8位
    ui.a = (wData >> 9) & 0xF; // 4位 敌人PATH/死亡标记、子弹命中标记
    ui.b = (wData >> 13) & 0x3FFFF; // 18位 子弹的目标xy、敌人的生命值+10、炮台的目标敌人ID
    
    return ui;
}

vec2 parseB(int b) {
    return vec2(float(b & 0x1FF), float((b >> 9) & 0x1FF)) / 10.0;
}

int encodeB(vec2 pos) {
    return (int(floor(pos.x * 10.0)) & 0x1FF) | ((int(floor(pos.y * 10.0)) & 0x1FF) << 9);
}

// 编码数据为无符号整数
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

void main() {
    ivec2 pixelCoord = ivec2(vTexCoord * uResolution);
    int currentId = pixelCoord.y * 300 + pixelCoord.x;
    UnitInfo ui = readData(pixelCoord);
    
    if(ui.isUsed){
        if(pixelCoord.y == 0) { // 塔逻辑
            TowerInfo ti = towers[ui.id];
            float tRange = float(ti.range);
            float eRange = tRange;
            int e_Id = -1;
            bool efly = false;
            
            // 寻找攻击目标
            for(ivec2 eCoord = ivec2(0, 1); eCoord.y < 9; eCoord.y++) {
                for(eCoord.x = 0; eCoord.x < 300; eCoord.x++) {
                    UnitInfo eui = readData(eCoord);
                    if(!eui.isUsed || eui.b <= 10) continue;
                    
                    EnemyInfo ei = getEnemyInfo(eui.id);
                    
                    // 检查攻击模式是否匹配
                    if((ei.isFlying + ti.atkMode) == 2) continue;
                    
                    float dist = length(eui.position - ui.position);
                    
                    if(dist <= tRange) {
                        if(e_Id < 0 || 
                           (!efly && (ei.isFlying == 1 || dist < eRange)) || 
                           (efly && ei.isFlying == 1 && dist < eRange)) {
                            eRange = dist;
                            e_Id = eCoord.y * 300 + eCoord.x;
                            efly = ei.isFlying == 1;
                        }
                    }
                }
            }
            
            if(e_Id >= 0) {
                ivec2 targetCoord = ivec2(e_Id % 300, e_Id / 300);
                UnitInfo eui = readData(targetCoord);
                vec2 dt = normalize(eui.position - ui.position);

                if(ui.ticksFlag + ti.cooldown <= gameBase.ticks) {
                    ui.ticksFlag = gameBase.ticks;
                    ui.b = e_Id;
                }
                ui.direction = atan(dt.y, dt.x);
            }
            
            if(gameBase.towerCtrl == 2 && currentId == gameBase.tId) {
                ui.isUsed = false;
            } else if(gameBase.towerCtrl == 3 && currentId == gameBase.tId) {
                // 升级逻辑
                int newId = ui.id + 3;
                if (newId < 10) {  // 确保不超过数组边界
                    ui.id = newId;
                }
            }
            
        } else if(pixelCoord.y < 9) { // 敌人逻辑
            if(ui.b > 10) {
                EnemyInfo ei = getEnemyInfo(ui.id);
                ivec2 epi = ivec2(floor(ui.position.x), floor(ui.position.y));
                vec2 dt = ui.a == 0 ? vec2(0.0, 1.0) : vec2(-1.0, 0.0);
                
                // 地面敌人寻路
                if(ei.isFlying == 0) {
                    int pidx = epi.y * gameBase.w + epi.x;
                    int nextDir = path[pidx + 1500 * ui.a];
                    if(nextDir < 10000) {
                        ivec2 nextPos = ivec2(nextDir % gameBase.w, nextDir / gameBase.w);
                        vec2 targetPos = vec2(nextPos) + vec2(0.5);
                        dt = targetPos - ui.position;
                        if(length(vec2(epi) - vec2(nextPos)) + 0.01 > length(dt)) {
                            dt = vec2(epi) - ui.position + vec2(0.5);
                        }
                        dt = normalize(dt);
                    }
                }
                
                // 检查子弹命中
                for(int bx = 0; bx < 300 && ui.b > 10; bx++) {
                    ivec2 bCountCoord = ivec2(bx, 9);
                    UnitInfo bCount = readData(bCountCoord);

                    for(int bi = bCount.ticksFlag; bi < bCount.b; bi++) {
                        ivec2 bCoord = ivec2(bx, bi % 15 + 10);
                        UnitInfo bui = readData(bCoord);
                        
                        if(bui.isUsed && bui.a != 0) {
                            BulletInfo biInfo = bullets[bui.id];
                            if(biInfo.mode == 0) {
                                if(bui.ticksFlag == currentId) {
                                    ui.b -= biInfo.attack;
                                }
                            } else if(biInfo.mode - ei.isFlying == 1) {
                                float dist = length(bui.position - ui.position);
                                if(dist < float(biInfo.range)) {
                                    ui.b -= biInfo.attack;
                                }
                            }
                        }
                    }
                }
                
                // 更新位置
                float moveDistance = ei.speed / 1000.0;
                ui.position += dt * moveDistance;   
                ui.direction = atan(dt.y, dt.x);
                
                if(ui.b <= 10) {
                    ui.b = 10;
                    ui.isUsed = false;
                }
            } else {
                if(ui.b < 5) {
                    ui.isUsed = false;
                } else {
                    ui.b--;
                }
            }
            
        } else if(pixelCoord.y == 9) { // 子弹计数逻辑
            ivec2 tCoord = ivec2(pixelCoord.x, 0);
            UnitInfo tui = readData(tCoord);
            if(tui.isUsed && tui.ticksFlag == gameBase.ticks - 1) {
                do {
                    ui.b++;
                    ivec2 bCoord = ivec2(pixelCoord.x, ui.b % 15 + 10);
                    UnitInfo bui = readData(bCoord);
                } while(bui.isUsed);
            }

            ivec2 bCoord = ivec2(pixelCoord.x, ui.ticksFlag % 15 + 10);
            UnitInfo bui = readData(bCoord);
            if(!bui.isUsed) {
                ui.ticksFlag++;
            }
            
        } else if(pixelCoord.y < 25) { // 子弹逻辑
            if(ui.a != 0) {
                if(ui.a >= 5) {
                    ui.isUsed = false;
                } else {
                    ui.a++;
                }
            } else {
                BulletInfo bi = bullets[ui.id];
                vec2 targetPos = parseB(ui.b);

                if(bi.mode == 0) {
                    ivec2 eCoord = ivec2(ui.ticksFlag % 300, ui.ticksFlag / 300);
                    UnitInfo eui = readData(eCoord);
                    if(eui.isUsed) {
                        targetPos = eui.position;
                    }
                }
                   
                vec2 direction = normalize(targetPos - ui.position);
                float distanceToTarget = length(targetPos - ui.position);
                float moveDistance = float(bi.speed) / 1000.0;
                        
                if(distanceToTarget <= moveDistance || distanceToTarget < 0.1) {
                    ui.a = 1;
                    ui.position = targetPos;
                } else {
                    ui.position += direction * moveDistance;
                    ui.direction = atan(direction.y, direction.x);
                }
            }
            
        } else if(pixelCoord.y == 25 && pixelCoord.x == 0) { // 敌人生成位置预处理
            int t = gameBase.ticks - gameBase.npt;
            if(t <= 600 && t % 10 == 0) {
                do {
                    ui.b++;
                    ivec2 eCoord = ivec2(ui.b % 300, (ui.b / 300) % 10 + 1);
                    UnitInfo eui = readData(eCoord);
                } while(eui.isUsed);
            }
            
        } else if(pixelCoord.y == 25 && pixelCoord.x == 1) { // 塔生成位置查找
            if(gameBase.tId != -1) {
                do {
                    ui.b++;
                    ivec2 tCoord = ivec2(ui.b % 300, 0);
                    UnitInfo tui = readData(tCoord);
                } while(tui.isUsed);
            }
            
        } else if(pixelCoord.y == 25 && pixelCoord.x == 2) { // 游戏总体计数
            // 游戏状态逻辑
        }
        
    } else {
        if(pixelCoord.y > 9 && pixelCoord.y < 25) { // 子弹生成
            ivec2 bCountCoord = ivec2(pixelCoord.x, 9);
            UnitInfo bCountI = readData(bCountCoord);
            
            if((bCountI.b % 15 + 10) == pixelCoord.y) {
                ivec2 tCoord = ivec2(pixelCoord.x, 0);
                UnitInfo tui = readData(tCoord);
                if(tui.isUsed && tui.ticksFlag == gameBase.ticks - 1) {
                    TowerInfo ti = towers[tui.id];
                    int eid = tui.b;
                    ivec2 eCoord = ivec2(eid % 300, eid / 300);
                    UnitInfo eui = readData(eCoord);
                    if(!eui.isUsed) {
                        oUnitColor = encodeData(ui);
                        return;
                    }

                    ui.id = ti.bulletId;
                    ui.ticksFlag = tui.b;
                    ui.position = tui.position;
                    ui.b = encodeB(eui.position);
                    ui.a = 0;
                    ui.isUsed = true;
                }
            }
            
        } else if(pixelCoord.y > 0 && pixelCoord.y < 9) { // 敌人生成
            ivec2 eCountCoord = ivec2(0, 25);
            UnitInfo eCountI = readData(eCountCoord);

            int expectedX = eCountI.b % 300;
            int expectedY = (eCountI.b / 300) % 10 + 1;
            if(expectedX == pixelCoord.x && expectedY == pixelCoord.y) {
                int t = gameBase.ticks - gameBase.npt;
                if(t <= 600 && t % 10 == 0) {
                    EnemyInfo ei = getEnemyInfo(gameBase.lv);
                    ui.id = gameBase.lv;
                    ui.a = (t % 20 == 0) ? 0 : 1;
                    ui.b = ei.HP + 10;
                    ui.isUsed = true;
                    ui.ticksFlag = 0;

                    float randomOffset = float(gameBase.r);
                    if(t % 20 == 0) {
                        ui.position = vec2(float(gameBase.w) / 2.0 + randomOffset - 2.5, 1.5);
                    } else {
                        ui.position = vec2(float(gameBase.w) - 1.5, float(gameBase.h) / 2.0 + randomOffset - 2.5);
                    }
                }
            }
            
        } else if(pixelCoord.y == 0) { // 塔生成
            ivec2 tCountCoord = ivec2(1, 25);
            UnitInfo tCountI = readData(tCountCoord);
            
            int expectedX = tCountI.b % 300;
            if(gameBase.towerCtrl == 1 && expectedX == pixelCoord.x) {
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
    }
    
    oUnitColor = encodeData(ui);
}