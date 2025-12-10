#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
in vec2 vTexCoord;

uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uColor;
uniform float uUvScale;
uniform int uIsGround;

out vec4 fragColor;

void main() {
    vec3 normal = normalize(vNormal);
    float lightIntensity = max(dot(normal, -uLightDirection), 0.0);
    
    vec3 lighting = uAmbientColor + uLightColor * lightIntensity;
    vec3 finalColor = uColor * lighting;
    
    // 地面棋盘格
    if (float(uIsGround) > 0.5) {
        float scale = uUvScale > 0.0 ? uUvScale : 200.0;
        vec2 grid = floor(vTexCoord * scale);
        float checker = mod(grid.x + grid.y, 2.0);
        vec3 color1 = vec3(0.45, 0.6, 0.45);
        vec3 color2 = vec3(0.35, 0.45, 0.35);
        vec3 baseColor = mix(color1, color2, checker);
        finalColor = baseColor * (lighting * 0.8);
    }
    
    fragColor = vec4(finalColor, 1.0);
}

