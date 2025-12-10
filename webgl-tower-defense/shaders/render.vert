#version 300 es
precision highp float;

uniform highp usampler2D unitTexture; // 无符号整数纹理
const vec2 uResolution = vec2(300.0, 26.0);

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

uniform vec4 dz;
uniform vec4 s;

uniform vec4 attr;//x,y,r,unitcount

in  vec4 aPosition;

out vec3 vTexCoord;

struct UnitInfo{
    vec2 position;
    float direction; // 10位
    int ticksFlag;   // 19位
    bool isUsed;
    int id;          // 8位
    int a;           // 4位
    int b;           // 18位
};

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

void main() {
    int id = int(aPosition.z);
    ivec2 coord=ivec2(id % int(uResolution.x), id / int(uResolution.x));

    if(coord.y!=9&&coord.y<25){//塔、敌人、子弹
        UnitInfo ui = readData(coord);
        // 如果单元未使用，将顶点移到视口外（而不是使用 discard）
        if(!ui.isUsed) {
            gl_Position = vec4(0.0, 0.0, 0.0, 0.0); // w=0 表示在视口外
            vTexCoord = vec3(0.0, 0.0, 0.0);
            return;
        }

        // base world position for the unit (worker encodes absolute position)
        vec2 basePos = ui.position - dz.xy;
        float angle = ui.direction;
        vec2 f = vec2(sin(angle), cos(angle));
        mat2 rotMat = mat2(f.y, -f.x, f.x, f.y);
        vec2 rotated = rotMat * aPosition.xy;

        // final position (may be modified per entity type below)
        vec2 finalPos = rotated + basePos;

        // Per-entity visual tweaks and texture coordinate selection.
        // We use a simple atlas layout: tile width = 1 unit in atlas X (multiplied by 1),
        // atlas size referenced later with vec2(55.0,4.0) as used elsewhere in the project.
        vec2 uvTile; // integer tile coords in atlas

        if(coord.y == 0) {
            // Tower: small recoil on recent attack (ticksFlag stores last attack tick-like info)
            float recoil = (ui.ticksFlag > 0) ? 0.08 : 0.0;
            finalPos -= vec2(sin(angle), cos(angle)) * recoil;

            // Each tower's sprite row is based on its id; use three frames per tower
            uvTile = vec2(float(ui.id * 3), 0.0);
            // If tower is the on/off kind (id 9 toggles active), use second frame when inactive
            if(ui.id == 9 && (ui.a & 1) != 0) {
                uvTile.x += 1.0;
            }
        } else if(coord.y < 9) {
            // Enemy: react to hit / death flags in `ui.a` (bit layout is project-specific)
            bool isDead = (ui.a & 1) != 0;
            bool wasHit = (ui.a & 2) != 0;

            // enlarge when hit, larger for death animation
            float scale = isDead ? 1.4 : (wasHit ? 1.15 : 1.0);
            // apply scale to the rotated quad (keeps center anchored)
            finalPos = basePos + (rotated * scale);

            // Select enemy animation frame: normal->0, hit->1, dead->2
            float frame = isDead ? 2.0 : (wasHit ? 1.0 : 0.0);
            uvTile = vec2(float(ui.id * 3) + frame, 1.0);
        } else {
            // Bullets: use a small, fast animation frame (single tile)
            // Optionally change based on ui.id to show different bullet types
            uvTile = vec2(44.0, 0.0);
            // give bullets a tiny forward-offset when they are about to hit
            if((ui.ticksFlag & 0x1FF) != 0) {
                finalPos += vec2(sin(angle), cos(angle)) * 0.06;
            }
        }

        // Convert final world pos to clip space like the original shader
        vec2 scaled = (finalPos / s.xy) * (dz.z * 50.0);
        float depth = s.z;
        gl_Position = vec4(scaled, depth, 1.0);

        // Compute texture coordinates from atlas tile (keep same atlas size used in background)
        vTexCoord = vec3((uvTile + aPosition.xy) / vec2(55.0, 4.0), 1.0);
    }else if(coord.y==9&&coord.x<180){
        //攻击范围圆
        int a =coord.x;
            int b = int(aPosition.w);
            float angle = float(a + b/2) / 90.0 * 3.1415926;
            vec2 dir = vec2(sin(angle), cos(angle));
            
            if(b % 2 == 0) {
                dir = dir * (attr.z+0.15);
            } else {
                dir = dir * (attr.z);
            }
            
            vec2 worldPos = dir +attr.xy - dz.xy;
            vec2 screenPos = (worldPos / s.xy) * dz.z * 50.0;
            
            vTexCoord = vec3(50.0/55.0, 0.5, 1.0);
            gl_Position = vec4(screenPos, s.z+.05, 1.0);
    }else if(coord.y>=25){
        //背景格
        int iid=id-7500;
        ivec2 p=ivec2(iid%50,iid/50);
        if((p.x>=2&&p.x<=47&&p.y>=2&&p.y<=27)||
                ((p.x==1||p.x==48)&&p.y>=12&&p.y<=17)||
                ((p.y==1||p.y==28)&&p.x>=22&&p.x<=27)){
            // 棋盘格纹理：44或47号图块，第2行（y=2）
            float tileX = (p.x+p.y)%2==0 ? 44.0 : 47.0;
            vTexCoord=vec3((vec2(tileX, 2.0) + aPosition.xy) / vec2(55.0, 4.0), 1.0);
        }else{
            // 默认纹理：2号图块，第2行
            vTexCoord=vec3((vec2(2.0, 2.0) + aPosition.xy) / vec2(55.0, 4.0), 1.0);
        }
        vec2 temp=vec2(p)+aPosition.xy+0.5;
        vec2 scaled = ((temp- dz.xy )/ s.xy) * (dz.z * 50.0);
        float depth = s.z+0.2;
        gl_Position = vec4(scaled, depth, 1.0);
    }

}

