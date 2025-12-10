#version 300 es
precision highp float;

uniform vec3 uColor;

out vec4 fragColor;

void main() {
    // 对于点渲染，使用 gl_PointCoord 来绘制圆形点
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    // 绘制圆形点，边缘稍微柔化
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
    
    fragColor = vec4(uColor, alpha);
}

