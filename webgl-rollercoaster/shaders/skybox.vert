attribute vec3 aPosition;

uniform mat4 uProjection;
uniform mat4 uView;

varying vec3 vDir;

void main() {
    // 方向向量，用于在片元着色器做渐变
    vDir = aPosition;
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}

