import { createProgram } from './gl.js';
import { mat4 } from './math.js';

const VS_SOURCE = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_viewProj;

out vec3 v_normal;
out vec3 v_worldPos;

void main() {
  vec4 worldPos = u_model * vec4(a_position, 1.0);
  v_worldPos = worldPos.xyz;
  v_normal = mat3(u_model) * a_normal;
  gl_Position = u_viewProj * worldPos;
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
out vec4 outColor;

uniform vec3 u_color;
uniform vec3 u_lightDir;
uniform bool u_isTarget;  // 是否是目标点（发光球体）
uniform float u_time;      // 时间（用于动画）

void main() {
  if (u_isTarget) {
    // 发光球体效果
    vec3 n = normalize(v_normal);
    vec3 viewDir = normalize(-v_worldPos);
    
    // 基础发光
    float glow = 0.6 + 0.4 * sin(u_time * 2.0);
    
    // 边缘发光（菲涅尔效果）
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
    glow += fresnel * 0.8;
    
    // 高光
    vec3 lightDir = normalize(-u_lightDir);
    float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 32.0);
    glow += spec * 0.5;
    
    // 发光颜色（金色到黄色）
    vec3 glowColor = u_color * glow;
    outColor = vec4(glowColor, 0.9);
  } else {
    // 普通物体
    vec3 n = normalize(v_normal);
    float diff = max(dot(n, -u_lightDir), 0.0);
    float ambient = 0.5;  // 增加环境光（从0.2增加到0.5）
    float lighting = ambient + diff * 0.6;  // 调整漫反射光
    outColor = vec4(u_color * lighting, 1.0);
  }
}
`;

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, VS_SOURCE, FS_SOURCE);
    this.uniforms = {
      u_model: gl.getUniformLocation(this.program, 'u_model'),
      u_viewProj: gl.getUniformLocation(this.program, 'u_viewProj'),
      u_color: gl.getUniformLocation(this.program, 'u_color'),
      u_lightDir: gl.getUniformLocation(this.program, 'u_lightDir'),
      u_isTarget: gl.getUniformLocation(this.program, 'u_isTarget'),
      u_time: gl.getUniformLocation(this.program, 'u_time'),
    };
    this.viewProj = mat4.create();
    this.startTime = Date.now();
    this._initCubeGeometry();
    this._initSphereGeometry();
  }

  _initCubeGeometry() {
    const gl = this.gl;
    // 立方体（边长 1，中心在原点）
    const positions = new Float32Array([
      // 前
      -0.5, -0.5, 0.5,
       0.5, -0.5, 0.5,
       0.5,  0.5, 0.5,
      -0.5,  0.5, 0.5,
      // 后
      -0.5, -0.5, -0.5,
      -0.5,  0.5, -0.5,
       0.5,  0.5, -0.5,
       0.5, -0.5, -0.5,
      // 上
      -0.5, 0.5,  0.5,
       0.5, 0.5,  0.5,
       0.5, 0.5, -0.5,
      -0.5, 0.5, -0.5,
      // 下
      -0.5, -0.5,  0.5,
      -0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,
       0.5, -0.5,  0.5,
      // 右
       0.5, -0.5,  0.5,
       0.5, -0.5, -0.5,
       0.5,  0.5, -0.5,
       0.5,  0.5,  0.5,
      // 左
      -0.5, -0.5,  0.5,
      -0.5,  0.5,  0.5,
      -0.5,  0.5, -0.5,
      -0.5, -0.5, -0.5,
    ]);

    const normals = new Float32Array([
      // 前
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // 后
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      // 上
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      // 下
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      // 右
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      // 左
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);

    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3,       // 前
      4, 5, 6, 4, 6, 7,       // 后
      8, 9, 10, 8, 10, 11,    // 上
      12,13,14, 12,14,15,     // 下
      16,17,18, 16,18,19,     // 右
      20,21,22, 20,22,23,     // 左
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const norBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    this.cubeVAO = vao;
    this.cubeIndexCount = indices.length;
  }

  _initSphereGeometry() {
    const gl = this.gl;
    // 生成球体几何体（细分球体）
    const segments = 16;
    const rings = 16;
    const positions = [];
    const normals = [];
    const indices = [];

    for (let ring = 0; ring <= rings; ring++) {
      const theta = (ring * Math.PI) / rings;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let seg = 0; seg <= segments; seg++) {
        const phi = (seg * 2 * Math.PI) / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        positions.push(x * 0.5, y * 0.5, z * 0.5);
        normals.push(x, y, z);
      }
    }

    for (let ring = 0; ring < rings; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const a = ring * (segments + 1) + seg;
        const b = a + segments + 1;

        indices.push(a, b, a + 1);
        indices.push(b, b + 1, a + 1);
      }
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const norBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    this.sphereVAO = vao;
    this.sphereIndexCount = indices.length;
  }

  setViewProj(viewProj) {
    this.viewProj = viewProj;
  }

  beginFrame() {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0.15, 0.18, 0.22, 1.0);  // 调亮背景色
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_viewProj, false, this.viewProj);
    gl.uniform3f(this.uniforms.u_lightDir, 0.4, 1.0, 0.6);  // 调整光照方向，更亮
    
    // 更新时间（用于发光动画）
    const time = (Date.now() - this.startTime) / 1000.0;
    gl.uniform1f(this.uniforms.u_time, time);
    
    gl.bindVertexArray(this.cubeVAO);
  }

  drawCube(modelMatrix, color, isTarget = false) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uniforms.u_model, false, modelMatrix);
    gl.uniform3f(this.uniforms.u_color, color[0], color[1], color[2]);
    gl.uniform1i(this.uniforms.u_isTarget, isTarget ? 1 : 0);
    
    if (isTarget) {
      // 目标点使用球体
      gl.bindVertexArray(this.sphereVAO);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, this.sphereIndexCount, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.cubeVAO);
    } else {
      // 普通物体使用立方体
      gl.drawElements(gl.TRIANGLES, this.cubeIndexCount, gl.UNSIGNED_SHORT, 0);
    }
  }
}


