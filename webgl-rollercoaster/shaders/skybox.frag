precision mediump float;

varying vec3 vDir;

void main() {
    // 使用方向的 y 分量做简单渐变天空
    float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 topColor = vec3(0.4, 0.65, 1.0);   // 天空蓝
    vec3 bottomColor = vec3(0.9, 0.9, 0.95); // 近地淡色
    vec3 color = mix(bottomColor, topColor, t);
    gl_FragColor = vec4(color, 1.0);
}

