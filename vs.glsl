#version 300 es
precision highp float;

uniform vec4 dz;
uniform vec4 s;

uniform ivec4 unit[1000];
uniform vec4 attr;//x,y,r,unitcount

in  vec4 aPosition;

out vec3 vTexCoord;

void main() {
    int id = int(aPosition.z);
    int uc=int(attr.w);
    int ts=uc%1024;
    uc=uc/1024;
    if(id < uc) { 
        ivec2 t=id%2==0?unit[id/2].xy:unit[id/2].zw;
        vec2 f =vec2(float(t.y/2048/1024)/128.0-1.0,float(t.y/2048%1024)/128.0-1.0);
        mat2 rotMat = mat2(f.y, -f.x, f.x, f.y);
        vec2 rotated = rotMat * aPosition.xy;
        if(id>ts&&(t.y%8/2)!=0)
            rotated=rotated*1.2;
        vec2 basePos =vec2(t.x/65536,t.x%65536)/100.0-100.0-dz.xy;
        vec2 finalPos = rotated + basePos;
        
        float alpha =t.y%2==1 ? 1.0 : 0.2;
        vTexCoord = vec3((vec2(t.y%2048/8,2) - aPosition.xy) / vec2(55.0, 4.0), alpha);
        
        vec2 scaled = (finalPos / s.xy) * (dz.z * 50.0);
        float depth =s.z+0.1;
        
        gl_Position = vec4(scaled, depth, 1.0);
    }else if(id<uc+ts){
        ivec2 t=(id-uc)%2==0?unit[(id-uc)/2].xy:unit[(id-uc)/2].zw;
        //vec2 f =vec2(float(t.y/2048/1024)/128.0-1.0,float(t.y/2048%1024)/128.0-1.0);
        vec2 f =vec2(0.0,1.0);
        mat2 rotMat = mat2(f.y, -f.x, f.x, f.y);
        vec2 rotated = rotMat * aPosition.xy;
        
        vec2 basePos =vec2(t.x/65536,t.x%65536)/100.0-100.0-dz.xy;
        vec2 finalPos = rotated + basePos;
        
        float alpha =t.y%2==1 ? 1.0 : 0.2;
        //vTexCoord = vec3((vec2(t.y%2048/8,2) - aPosition.xy) / vec2(55.0, 4.0), alpha);
        vTexCoord = vec3((vec2(t.y%8/2*3+2,2) - aPosition.xy) / vec2(55.0, 4.0), alpha);
        
        vec2 scaled = (finalPos / s.xy) * (dz.z * 50.0);
        float depth =s.z+0.1;
        
        gl_Position = vec4(scaled, depth, 1.0);
    }else if(id < uc+ts+1500){
        int iid=id-uc-ts;
        ivec2 p=ivec2(iid%50,iid/50);
        if((p.x>=2&&p.x<=47&&p.y>=2&&p.y<=27)||
                ((p.x==1||p.x==48)&&p.y>=12&&p.y<=17)||
                ((p.y==1||p.y==28)&&p.x>=22&&p.x<=27)){
            vTexCoord=vec3((vec2((p.x+p.y)%2==0?44.0:47.0,2.0)+aPosition.xy)/vec2(55.0,4.0),1.0);
        }else{
            vTexCoord=vec3((vec2(2.0,2.0)+aPosition.xy)/vec2(55.0,4.0),1.0);
        }
        vec2 temp=vec2(p)+aPosition.xy+0.5;
        vec2 scaled = ((temp- dz.xy )/ s.xy) * (dz.z * 50.0);
        float depth = s.z+0.2;
        gl_Position = vec4(scaled, depth, 1.0);
    } else if(id < uc+ts+1500+180) {
            int a = id -uc-1500-ts;
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
    }
}