#version 300 es
#extension GL_EXT_shader_storage_buffer_object : require
precision highp float;

uniform int _ticks;
uniform int mode;
uniform int eNow;
uniform ivec4 newT;

struct Unit {
    int id;
    int ticks;
    int hp;
    int path;
    vec4 tf;
    vec4 uv;
};

struct Tower {
    int id;
    int range;
    int cooldown;
    int canF;
    int canG;
    int price;
    int bulletId;
    int updateId;
    vec4 uv;
};

struct Enemy {
    int isF;
    int hp;
    float speed;
    int gold;
    vec4 uv;
};

struct Bullet {
    float speed;
    int damage;
    float damageRange;
    int mode;
    vec4 uv;
};

layout(std430, binding=0) buffer UnitSSBO { Unit units[]; };
layout(std430, binding=1) buffer TowerSSBO { Tower towers[]; };
layout(std430, binding=2) buffer EnemySSBO { Enemy enemies[]; };
layout(std430, binding=3) buffer BulletSSBO { Bullet bullets[]; };
layout(std430, binding=4) buffer CtrlSSBO { atomic_int ctrls[]; };
layout(std430, binding=5) buffer AtmSSBO { int atm[]; };
layout(std430, binding=6) buffer LogSSBO { int log[]; };

in vec4 aPosition;
out vec3 vTexCoord;

const float PI = 3.1415926;

void main() {
    int pos = gl_VertexID;

    
    if(mode == 0) {
        if(pos < 300) {
            Unit u = units[pos];
            if(u.id < 999) {
                Tower t = towers[u.id];
                int target_id = 0;
                int min_ticks = 300000000;
                int target_isF = 0;
                int target_hp = 0;
                float min_dist = 1000000.0;
                float max_speed = 0.0;
                vec2 target_dir;
                float range_sq = float(t.range) * float(t.range);

                // 敌人搜索循环
                for(int i = 1800; i < 6800; ++i) { // 调整循环范围为WebGL兼容形式
                    Unit enemy_unit = units[i];
                    if(enemy_unit.id > 999) continue;
                    
                    Enemy e = enemies[enemy_unit.id];
                    bool valid = true;
                    if((t.canF == 0 && e.isF == 1) || (e.isF == 0 && t.canG == 0)) {
                        valid = false;
                    }
                    
                    vec2 delta = enemy_unit.tf.xy - u.tf.xy;
                    float dist_sq = dot(delta, delta);
                    if(dist_sq > range_sq) valid = false;
                    
                    if(valid) {
                        bool update_target = false;
                        if(target_id == 0) {
                            update_target = true;
                        } else if(e.isF != 0) {
                            if(target_isF == 0 || dist_sq < min_dist) {
                                update_target = true;
                            }
                        } else {
                            if(u.path == 0 && enemy_unit.ticks < min_ticks) {
                                update_target = true;
                            } else if(u.path == 1 && dist_sq < min_dist) {
                                update_target = true;
                            } else if(u.path == 2 && e.speed > max_speed) {
                                update_target = true;
                            } else if(u.path == 3 && enemy_unit.hp > target_hp) {
                                update_target = true;
                            }
                        }
                        
                        if(update_target) {
                            target_id = i;
                            min_ticks = enemy_unit.ticks;
                            target_isF = e.isF;
                            target_hp = enemy_unit.hp;
                            min_dist = dist_sq;
                            max_speed = e.speed;
                            target_dir = delta;
                        }
                    }
                }

                if(target_id > 1799) {
                    // 更新炮塔方向
                    units[pos].tf.zw = normalize(target_dir);
                    
                    if(_ticks > units[pos].ticks + t.cooldown) {
                        units[pos].ticks = _ticks;
                        
                        // 查找空闲子弹位置
                        int bullet_base = 300 + pos * 5;
                        for(int k = 0; k < 5; ++k) {
                            if(units[bullet_base + k].id == 1000) {
                                // 原子操作开始
                                atomicAdd(units[bullet_base + k].id, t.bulletId - 1000); // 修改ID
                                
                                units[bullet_base + k].ticks = target_id;
                                
                                // 计算子弹参数
                                if(t.bulletId % 3 == 2) {
                                    float angle = radians(float(k * 72));
                                    units[bullet_base + k].hp = int(floor(
                                        (units[target_id].tf.x + cos(angle)) * 100.0
                                    ));
                                    units[bullet_base + k].path = int(floor(
                                        (units[target_id].tf.y + sin(angle)) * 100.0
                                    ));
                                } else {
                                    units[bullet_base + k].hp = int(floor(
                                        units[target_id].tf.x * 100.0
                                    ));
                                    units[bullet_base + k].path = int(floor(
                                        units[target_id].tf.y * 100.0
                                    ));
                                }
                                
                                units[bullet_base + k].tf.xy = units[pos].tf.xy;
                                units[bullet_base + k].uv = towers[t.bulletId].uv;
                                break;
                            }
                        }
                    }
                }
            }
        }
        else if(pos < 1800) {
            if (unit[pos].id < 999) {
                Bullet bullet = bulletInfo[unit[pos].id];

                if (bullet.mode == 0) {
                    // 模式0：追踪目标
                    vec2 p;
                    int target_idx = unit[pos].ticks;
                    if (unit[target_idx].id < 1000) {
                        p = unit[target_idx].tf.xy - unit[pos].tf.xy;
                        unit[pos].hp = int(floor(unit[target_idx].tf.x * 100.0));
                        unit[pos].path = int(floor(unit[target_idx].tf.y * 100.0));
                    } else {
                        p = vec2(float(unit[pos].hp), float(unit[pos].path)) / 100.0 - unit[pos].tf.xy;
                    }

                    vec2 np = normalize(p);
                    vec2 dt = np * (bullet.speed / 1000.0);
                    float dotp = dot(p, p);

                    if (dotp < 0.01 || dotp < dot(dt, dt)) {
                        int idx = (pos - 300) * 5000 + (unit[pos].ticks - 1800);
                        atm[idx] = bullet.damage;
                        unit[pos].id = 1000;
                        unit[pos].tf.x = 1000.0;
                    } else {
                        unit[pos].tf = vec4(unit[pos].tf.xy + dt, np, 0.0); // 补充z,w分量
                    }
                } else if (bullet.mode == 1) {
                    // 模式1：地面群体
                    vec2 tag = vec2(float(unit[pos].hp), float(unit[pos].path)) / 100.0;
                    vec2 p = tag - unit[pos].tf.xy;
                    vec2 np = normalize(p);
                    vec2 dt = np * (bullet.speed / 1000.0);
                    float dotp = dot(p, p);

                    if (dotp < 0.01 || dotp < dot(dt, dt)) {
                        float damageRangePow = bullet.damageRange * bullet.damageRange;
                        for (int i = 1800; i < 6800; i++) {
                            if (unit[i].id < 1000) {
                                vec2 delta = unit[i].tf.xy - tag;
                                if (dot(delta, delta) < damageRangePow) {
                                    int idx = (pos - 300) * 5000 + (i - 1800);
                                    atm[idx] = bullet.damage;
                                }
                            }
                        }
                        unit[pos].id = 1000;
                        unit[pos].tf.x = 1000.0;
                    } else {
                        unit[pos].tf = vec4(unit[pos].tf.xy + dt, np, 0.0);
                    }
                } else {
                    // 模式2：对空群体
                    vec2 tag = vec2(float(unit[pos].hp), float(unit[pos].path)) / 100.0;
                    vec2 p = tag - unit[pos].tf.xy;
                    vec2 np = normalize(p);
                    vec2 dt = np * (bullet.speed / 1000.0);
                    float dotp = dot(p, p);

                    if (dotp < 0.01 || dotp < dot(dt, dt)) {
                        float damageRangePow = bullet.damageRange * bullet.damageRange;
                        for (int i = 1800; i < 10800; i++) {
                            if (unit[i].id < 1000 && enemyInfo[unit[i].id].isF == 1) {
                                vec2 delta = unit[i].tf.xy - tag;
                                if (dot(delta, delta) < damageRangePow) {
                                    int idx = (pos - 300) * 5000 + (i - 1800);
                                    atm[idx] = bullet.damage;
                                }
                            }
                        }
                        unit[pos].id = 1000;
                        unit[pos].tf.x = 1000.0;
                    } else {
                        unit[pos].tf = vec4(unit[pos].tf.xy + dt, np, 0.0);
                    }
                }
            }
        }
        else if(pos < 6800) {
            // enemy寻路逻辑
            if (unit[pos].id < 999) {
                Enemy e = enemyInfo[unit[pos].id];
                vec2 ep = unit[pos].tf.xy;
                ivec2 epi = ivec2(int(floor(ep.x)), int(floor(ep.y)));

                // 路径有效性检查
                int map_idx = epi.y * log[131000] + epi.x + 120000 + unit[pos].path * log[131002];
                if (log[map_idx] == 0) {
                    atomicAdd(ctrl, -1); // GLSL原子操作需要原子变量支持
                    unit[pos].id = 1000;
                    unit[pos].tf.x = 1000.0;
                    return;
                }

                vec2 dt;
                if (e.isF == 1) {
                    // 飞行单位固定方向（用三元运算符代替select）
                    dt = (unit[pos].path == 0) ? vec2(0.0, 1.0) : vec2(-1.0, 0.0);
                } else {
                    // 地面单位路径跟随
                    int p1 = epi.x + epi.y * log[131000];
                    int temp = log[120000 + p1 + (2 + unit[pos].path) * log[131002]];

                    // 超时检测（_ticks需定义为uniform变量）
                    if (temp >= 60000) {
                        if (unit[pos].ticks + 60 < _ticks) {
                            log[126000 + pos - 1800] = 1;
                        }
                        return;
                    }

                    // 路径点计算（用ivec2代替WGSL的vec2<i32>）
                    ivec2 pi = ivec2(temp % log[131000], temp / log[131000]);
                    vec2 pd1 = vec2(epi - pi);
                    vec2 target_pos = vec2(pi) + 0.5;
                    dt = target_pos - ep;

                    // 方向修正逻辑
                    float powd1 = dot(pd1, pd1);
                    float powd2 = dot(dt, dt);
                    if (powd2 > powd1 + 0.03) {
                        dt = (vec2(epi) + 0.5) - ep;
                    }
                    dt = normalize(dt);
                }

                // 更新状态（dt改为vec2类型）
                unit[pos].ticks = _ticks;
                vec2 new_pos = unit[pos].tf.xy + dt * (e.speed / 1000.0);
                unit[pos].tf = vec4(new_pos, dt.x, dt.y); // GLSL的vec4需要显式填充所有分量
            }

        }
        else  if (pos == 6800){
           int i = log[131004];
    
            if (newT.w >= 0) {
                log[131004] = -1;
                atomicExchange(ctrl[4], log[131004]);
            } else {
                // 重置四个单位
                for (int idx = 8600; idx <= 8603; idx++) {
                    unit[idx].id = 1000;
                    unit[idx].tf = vec4(1000.0, 1000.0, 0.0, 1.0);
                }
            }

            switch (newT.w) {
                case 0: {
                    if (all(greaterThanEqual(newT.yz, ivec2(3))) && 
                    all(lessThanEqual(newT.yz, ivec2(47, 27))) )
                    {
                        i = newT.y + newT.z * log[131000] - log[131000] + 120000;
                        
                        unit[8600].id = 600;
                        unit[8600].tf = vec4(vec2(newT.yz) - 0.5, 0.0, 1.0);
                        unit[8601].id = 600;
                        unit[8601].tf = vec4(vec2(newT.y) - 0.5, vec2(newT.z) + 0.5, 0.0, 1.0);
                        unit[8602].id = 600;
                        unit[8602].tf = vec4(vec2(newT.yz) + 0.5, 0.0, 1.0);
                        unit[8603].id = 600;
                        unit[8603].tf = vec4(vec2(newT.y) + 0.5, vec2(newT.z) - 0.5, 0.0, 1.0);
                        
                        unit[8603].uv.x = (log[i] <= 60000) ? 53.0 : 50.0;
                        unit[8600].uv.x = (log[i-1] <= 60000) ? 53.0 : 50.0;
                        unit[8602].uv.x = (log[i+log[131000]] <= 60000) ? 53.0 : 50.0;
                        unit[8601].uv.x = (log[i+log[131000]-1] <= 60000) ? 53.0 : 50.0;
                    }
                    break;
                }
                
                case 1: {
                    if (newT.x < 999 && all(greaterThanEqual(newT.yz, ivec2(3))) &&
                    all(lessThanEqual(newT.yz, ivec2(47, 27))) )
                    {
                        TowerInfo t = towerInfo[newT.x];
                        int currentGold = atomicAdd(ctrl[0], 0);
                        if (t.price <= currentGold) {
                            int base_idx = newT.y + newT.z * log[131000] - log[131000] + 120000;
                            if (log[base_idx] <= 60000 && log[base_idx-1] <= 60000 &&
                                log[base_idx+log[131000]] <= 60000 && 
                                log[base_idx+log[131000]-1] <= 60000) 
                            {
                                for (int idx = 0; idx < 300; idx++) {
                                    if (unit[idx].id > 999) {
                                        atomicAdd(ctrl[0], -t.price);
                                        unit[idx].id = newT.x;
                                        unit[idx].ticks = _ticks;
                                        unit[idx].hp = 1;
                                        unit[idx].tf = vec4(newT.y, newT.z, 0.0, 1.0);
                                        unit[idx].uv = t.uv;
                                        
                                        int linked_idx = idx + 6800;
                                        unit[linked_idx].id = 800;
                                        unit[linked_idx].tf = unit[idx].tf;
                                        unit[linked_idx].uv = vec4(5.0, 2.0, 0.0, 0.0);
                                        
                                        for (int o = 0; o < 8; o++) {
                                            int k = o / 4;
                                            int phase = o % 4;
                                            int term = k * log[131002];
                                            int offset = phase == 0 ? term :
                                                    phase == 1 ? -1 + term :
                                                    phase == 2 ? log[131000] + term :
                                                    log[131000] -1 + term;
                                            log[base_idx + offset] = 61000;
                                        }
                                        
                                        log[131008] = 0;
                                        log[131009] = 0;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    break;
                }
                
                case 2: {
                    for (int idx = 0; idx < 300; idx++) {
                        if (unit[idx].id == 1000) continue;
                        vec2 delta = unit[idx].tf.xy - vec2(newT.y, newT.z);
                        if (all(lessThan(abs(delta), vec2(1.1)))) {
                            log[131004] = idx;
                            log[131005] = unit[idx].id;
                            log[131006] = int(floor(unit[idx].tf.x + 0.5));
                            log[131007] = int(floor(unit[idx].tf.y + 0.5));
                            
                            atomicExchange(ctrl[4], log[131004]);
                            atomicExchange(ctrl[5], log[131005]);
                            atomicExchange(ctrl[6], log[131006]);
                            atomicExchange(ctrl[7], log[131007]);
                            
                            if (log[131005] == 9) {
                                atomicAdd(ctrl[0], -towerInfo[9].price);
                                unit[idx].hp = -unit[idx].hp;
                                unit[idx+6800].hp = unit[idx].hp;
                                
                                int m = (unit[idx].hp == -1) ? 60000 : 61000;
                                unit[idx].uv.x -= float(unit[idx].hp * 3);
                                
                                int base_idx = log[131006] + log[131007]*log[131000] - log[131000] + 120000;
                                for (int o = 0; o < 8; o++) {
                                    int k = o / 4;
                                    int phase = o % 4;
                                    int term = k * log[131002];
                                    int offset = phase == 0 ? term :
                                            phase == 1 ? -1 + term :
                                            phase == 2 ? log[131000] + term :
                                            log[131000] -1 + term;
                                    log[base_idx + offset] = m;
                                }
                                
                                log[131008] = 0;
                                log[131009] = 0;
                            }
                            break;
                        }
                    }
                    break;
                }
                
                case 3: {
                    unit[i].id = 1000;
                    unit[i].tf = vec4(1000.0, 1000.0, 0.0, 1.0);
                    unit[i+6800].id = 1000;
                    unit[i+6800].tf = unit[i].tf;
                    
                    int base_idx = log[131006] + log[131007]*log[131000] - log[131000] + 120000;
                    for (int o = 0; o < 16; o++) {
                        int k = o / 4;
                        int phase = o % 4;
                        int term = k * log[131002];
                        int offset = phase == 0 ? term :
                                    phase == 1 ? -1 + term :
                                    phase == 2 ? log[131000] + term :
                                    log[131000] -1 + term;
                        log[base_idx + offset] = (o < 8) ? 65535 : 60000;
                    }
                    
                    log[131008] = 0;
                    log[131009] = 0;
                    break;
                }
                
                case 4: {
                    int j = towerInfo[unit[i].id].updateId;
                    if (j >= 0) {
                        int currentGold = atomicAdd(ctrl[0], 0);
                        if (currentGold > towerInfo[j].price) {
                            atomicAdd(ctrl[0], -towerInfo[j].price);
                            unit[i].id = j;
                            unit[i+6800].uv.x += 3.0;
                        }
                    }
                    break;
                }
                
                default: break;
            }
        } else if (pos == 6801) {
            if (log[131010] > 0) {
                log[131010] = 0;
                for (int j = 0; j < 300; j++) {
                    if (unit[j].id < 1000) {
                        int x = int(floor(unit[j].tf.x + 0.5));
                        int y = int(floor(unit[j].tf.y + 0.5));
                        int i = x + y * log_131000 - log_131000 + 120000;
                        
                        unit[j].id = 1000;
                        unit[j].tf = vec4(1000.0, 1000.0, 0.0, 1.0);
                        unit[j+6800].id = 1000;
                        unit[j+6800].tf = vec4(1000.0, 1000.0, 0.0, 1.0);

                        // 更新8个地图块
                        log[i] = 60000;
                        log[i-1] = 60000;
                        log[i+log_131000] = 60000;
                        log[i+log_131000-1] = 60000;
                        log[i+log_131002] = 60000;
                        log[i-1+log_131002] = 60000;
                        log[i+log_131000+log_131002] = 60000;
                        log[i+log_131000-1+log_131002] = 60000;

                        log[131008] = 0;
                        log[131009] = 0;
                        break;
                    }
                }
            }
        } else if (pos == 6802) {
            int sum = 0;
            for (int i = 1800; i < 6800; i++) {
                if (unit[i].id < 1000) {
                    sum++;
                }
            }
            atomicExchange(ctrl[8], sum);
        }
    }
    else {
        // 经济系统逻辑
        if(pos == 0) {
            int ctrl1 = atomicAdd(ctrl[1], 0);  // atomicLoad模拟
            int ctrl2 = atomicAdd(ctrl[2], 0);
            bool condition1 = (_ticks >= (ctrl1 + 20*30)) && (eNow == 1);
            bool condition2 = _ticks >= (ctrl1 + 30*30);

            if (ctrl2 < 199 && (condition1 || condition2)) {
                atomicExchange(ctrl[1], _ticks);
                atomicAdd(ctrl[2], 1);
                
                int old_ctrl0 = atomicAdd(ctrl[0], 0);
                atomicAdd(ctrl[0], old_ctrl0 / 20);
            }

            int t = _ticks - atomicAdd(ctrl[1], 0);
            if (t > 600) return;

            if (t % 10 == 0) {
                int ii = 0;
                while(true) {
                    int i = (log[131003] + ii) % 5000 + 1800;
                    
                    if (unit[i].id > 999) {
                        int wave_id = atomicAdd(ctrl[2], 0);
                        
                        // 更新unit属性
                        unit[i].id = wave_id;
                        unit[i].path = (t % 20 == 0) ? 0 : 1;
                        unit[i].ticks = _ticks;
                        unit[i].hp = enemyInfo[wave_id].hp;
                        
                        // 计算随机值
                        int log_index = wave_id * 60 + t / 10;
                        int random_value = log[log_index] % 6;
                        
                        // 计算变换矩阵
                        if (t % 20 == 0) {
                            unit[i].tf = vec4(float(log_131000 / 2 + random_value) - 2.5, 1.5, 0.0, 1.0);
                        } else {
                            unit[i].tf = vec4(float(log_131000) - 1.5, float(log_131001 / 2 + random_value) - 2.5, 0.0, 1.0);
                        }
                        
                        unit[i].uv = enemyInfo[wave_id].uv;
                        
                        log[131003] += ii + 1;
                        break;
                    }
                    
                    // 循环控制
                    ii++;
                    if (ii >= 5000) {
                        break;
                    }
                }
            }
        }
        else if(pos < 3) {
            int p = pos - 1;
            if (log[131008 + p] == 0) {
                log[131008 + p] = 1;
                
                // 第一部分：初始化atm区域
                for (int i = 0; i < 1500; i++) {
                    int index1 = i + 120000 + p * log[131002];
                    if (log[index1] < 60000) {
                        log[index1] = 60000;
                    }
                    log[index1 + 2 * log[131002]] = 65535;
                }

                // 第二部分：设置初始搜索区域
                int a = 7500008 + p * 20000;
                int b = a;
                int c, d;

                if (p == 0) {
                    c = (log[131000] / 2) + log[131000] * (log[131001] - 2) - 3 + 120000;
                    d = 1;
                } else {
                    c = ((log[131001] / 2 - 3) * log[131000]) + 1 + log[131002] + 120000;
                    d = log[131000];
                }

                // 初始化搜索队列
                for (int i = 0; i < 6; i++) {
                    atm[b] = c + d * i;
                    atm[b + 1] = 0;
                    b += 2;
                }

                // 第三部分：广度优先搜索（用while代替WGSL的loop）
                while (true) {
                    if (a == b) break;
                    
                    c = atm[a++]; // 合并读取操作
                    d = atm[a++];
                    
                    if (log[c] == 60000) {
                        log[c] = d;
                        
                        // 处理8方向邻域
                        for (int i = 7500000; i < 7500008; i++) {
                            int e = c + atm[i];
                            if (log[e] == 60000) {
                                atm[b] = e;
                                atm[b + 1] = d + 1;
                                b += 2;
                            }
                        }
                    }
                }

                // 第四部分：生成导航数据
                int j = log[131002] - log[131000] - 1 + 120000 + p * log[131002];
                int start_c = log[131000] + 1 + 120000 + p * log[131002];
                
                for (int c = start_c; c < j; c++) {
                    int current_d = log[c];
                    int imax = (current_d > 60000) ? 7500004 : 7500008;
                    
                    int min_val = 60000;
                    int min_index = 1000000;
                    for (int i = 7500000; i < imax; i++) {
                        int e = c + atm[i];
                        if (log[e] < min_val) {
                            min_val = log[e];
                            min_index = e;
                        }
                    }
                    
                    log[c + 2 * log[131002]] = (min_index != 1000000) ? 
                        ((min_index - 120000) - p * log[131002]) : 65535;
                }
            }

        }
        else if(pos < 5003) {
            int p = pos - 3;
            int sum = 0;

            // 累加并清除区域数值
            for (int i = 0; i < 1500; i++) {
                int index = i * 5000 + p;
                sum += atm[index];
                atm[index] = 0;
            }

            if (sum > 0) {
                int unit_index = p + 1800;
                int current_hp = unit[unit_index].hp;

                if (sum < current_hp) {
                    // 扣除生命值
                    unit[unit_index].hp = current_hp - sum;
                } else if (unit[unit_index].id < 1000) {
                    // 单位死亡处理
                    int enemy_id = unit[unit_index].id;
                    int gold_value = enemyInfo[enemy_id].gold;
                    atomicAdd(ctrl[0], gold_value);
                    
                    unit[unit_index].id = 1000;
                    unit[unit_index].tf = vec4(1000.0, 1000.0, 0.0, 1.0);
                }
            }
        }
        else if(pos == 5003) {
            int sum = 0;
            for (int i = 126000; i < 131000; ++i) {
                sum += log[i];
                log[i] = 0;
            }
            if (sum > 0) {
                log[131010] = 1;
            }

        }
    }

    // 保持顶点输出
    gl_Position = vec4(aPosition.xy, 0.0, 1.0);
    vTexCoord = vec3(0.0);
}