const DEG2RAD = Math.PI / 180;
const MATERIAL_DEFAULT = 0;
const MATERIAL_GROUND = 1;

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
  alert("此浏览器不支持 WebGL2");
  throw new Error("WebGL2 not available");
}

/* ---------- 数学工具 ---------- */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function vec3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function lengthVec3(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVec3(v) {
  const len = lengthVec3(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return out;
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ];
}

function mat4LookAt(eye, target, up) {
  const zAxis = normalizeVec3(subVec3(eye, target));
  const xAxis = normalizeVec3(crossVec3(up, zAxis));
  const yAxis = crossVec3(zAxis, xAxis);

  return [
    xAxis[0],
    yAxis[0],
    zAxis[0],
    0,
    xAxis[1],
    yAxis[1],
    zAxis[1],
    0,
    xAxis[2],
    yAxis[2],
    zAxis[2],
    0,
    -(
      xAxis[0] * eye[0] +
      xAxis[1] * eye[1] +
      xAxis[2] * eye[2]
    ),
    -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
    -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]),
    1,
  ];
}

function mat4Invert(m) {
  const inv = new Array(16);
  inv[0] =
    m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];
  inv[4] =
    -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];
  inv[8] =
    m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];
  inv[12] =
    -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];
  inv[1] =
    -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];
  inv[5] =
    m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];
  inv[9] =
    -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];
  inv[13] =
    m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];
  inv[2] =
    m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];
  inv[6] =
    -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];
  inv[10] =
    m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];
  inv[14] =
    -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];
  inv[3] =
    -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];
  inv[7] =
    m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];
  inv[11] =
    -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];
  inv[15] =
    m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];

  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (det === 0) {
    return mat4Identity();
  }

  det = 1.0 / det;
  for (let i = 0; i < 16; i++) {
    inv[i] = inv[i] * det;
  }
  return inv;
}

function transformClipToWorld(ndcX, ndcY, ndcZ, invViewProj) {
  const clip = [ndcX, ndcY, ndcZ, 1];
  const world = [
    invViewProj[0] * clip[0] +
      invViewProj[4] * clip[1] +
      invViewProj[8] * clip[2] +
      invViewProj[12] * clip[3],
    invViewProj[1] * clip[0] +
      invViewProj[5] * clip[1] +
      invViewProj[9] * clip[2] +
      invViewProj[13] * clip[3],
    invViewProj[2] * clip[0] +
      invViewProj[6] * clip[1] +
      invViewProj[10] * clip[2] +
      invViewProj[14] * clip[3],
    invViewProj[3] * clip[0] +
      invViewProj[7] * clip[1] +
      invViewProj[11] * clip[2] +
      invViewProj[15] * clip[3],
  ];
  if (world[3] !== 0) {
    world[0] /= world[3];
    world[1] /= world[3];
    world[2] /= world[3];
  }
  return [world[0], world[1], world[2]];
}

function intersectRayPlane(origin, direction, planeY = 0) {
  const denom = direction[1];
  if (Math.abs(denom) < 1e-5) return null;
  const t = (planeY - origin[1]) / denom;
  if (t < 0) return null;
  return [
    origin[0] + direction[0] * t,
    planeY,
    origin[2] + direction[2] * t,
  ];
}

function distance2D(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function snapToGrid(point, spacing) {
  return [
    Math.round(point[0] / spacing) * spacing,
    point[1],
    Math.round(point[2] / spacing) * spacing,
  ];
}

function wrapAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    case 5:
    default:
      return [v, p, q];
  }
}

function randomCoasterColor() {
  const hue = Math.random();
  const rgb = hsvToRgb(hue, 0.65, 0.9);
  return rgb;
}

function lightenColor(color, amount = 0.2) {
  return [
    clamp(color[0] + amount, 0, 1),
    clamp(color[1] + amount, 0, 1),
    clamp(color[2] + amount, 0, 1),
  ];
}

/* ---------- 轨道相机 ---------- */
class OrbitCamera {
  constructor() {
    this.target = [0, 0, 0];
    this.radius = 45;
    this.theta = Math.PI * 0.2;
    this.phi = Math.PI * 0.35;
    this.minRadius = 10;
    this.maxRadius = 200;
    this.minPhi = 0.1;
    this.maxPhi = Math.PI - 0.1;
    this.aspect = 1;
    this.viewMatrix = mat4Identity();
    this.projMatrix = mat4Identity();
    this.viewProjMatrix = mat4Identity();
    this.invViewProjMatrix = mat4Identity();
    this.updateMatrices();
  }

  updateMatrices() {
    const sinPhi = Math.sin(this.phi);
    const eye = [
      this.target[0] + this.radius * Math.cos(this.theta) * sinPhi,
      this.target[1] + this.radius * Math.cos(this.phi),
      this.target[2] + this.radius * Math.sin(this.theta) * sinPhi,
    ];
    this.viewMatrix = mat4LookAt(eye, this.target, [0, 1, 0]);
    this.projMatrix = mat4Perspective(50 * DEG2RAD, this.aspect, 0.1, 1000);
    this.viewProjMatrix = mat4Multiply(this.projMatrix, this.viewMatrix);
    this.invViewProjMatrix = mat4Invert(this.viewProjMatrix);
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.updateMatrices();
  }

  orbit(deltaX, deltaY) {
    const rotSpeed = 0.005;
    this.theta -= deltaX * rotSpeed;
    this.phi -= deltaY * rotSpeed;
    this.phi = clamp(this.phi, this.minPhi, this.maxPhi);
    this.updateMatrices();
  }

  zoom(delta) {
    const zoomFactor = 1 + delta * 0.001;
    this.radius = clamp(this.radius * zoomFactor, this.minRadius, this.maxRadius);
    this.updateMatrices();
  }

  getRay(ndcX, ndcY) {
    const nearPoint = transformClipToWorld(ndcX, ndcY, -1, this.invViewProjMatrix);
    const farPoint = transformClipToWorld(ndcX, ndcY, 1, this.invViewProjMatrix);
    const direction = normalizeVec3(subVec3(farPoint, nearPoint));
    return { origin: nearPoint, direction };
  }
}

/* ---------- 渲染器 ---------- */
class Renderer {
  constructor(glContext) {
    this.gl = glContext;
    this.program = this.createProgram(VERT_SRC, FRAG_SRC);
    this.locations = {
      viewProj: glContext.getUniformLocation(this.program, "uViewProj"),
      color: glContext.getUniformLocation(this.program, "uColor"),
      lightDir: glContext.getUniformLocation(this.program, "uLightDir"),
      material: glContext.getUniformLocation(this.program, "uMaterial"),
    };
    this.lightDir = normalizeVec3([-0.3, 1.0, 0.4]);
    glContext.enable(glContext.DEPTH_TEST);
    glContext.enable(glContext.CULL_FACE);
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(vs));
      throw new Error("顶点着色器编译失败");
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(fs));
      throw new Error("片元着色器编译失败");
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      throw new Error("着色器连接失败");
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  createMesh(data) {
    const gl = this.gl;
    const positions = data.positions;
    const normals = data.normals;
    if (!positions || !normals || positions.length !== normals.length) {
      throw new Error("网格数据不完整");
    }
    const vertexCount = positions.length / 3;
    const interleaved = new Float32Array(vertexCount * 6);
    for (let i = 0; i < vertexCount; i++) {
      interleaved[i * 6 + 0] = positions[i * 3 + 0];
      interleaved[i * 6 + 1] = positions[i * 3 + 1];
      interleaved[i * 6 + 2] = positions[i * 3 + 2];
      interleaved[i * 6 + 3] = normals[i * 3 + 0];
      interleaved[i * 6 + 4] = normals[i * 3 + 1];
      interleaved[i * 6 + 5] = normals[i * 3 + 2];
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    return {
      vao,
      vertexCount,
      mode: gl.TRIANGLES,
    };
  }

  drawMesh(mesh, color, material = MATERIAL_DEFAULT) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform3fv(this.locations.color, color);
    gl.uniform1i(this.locations.material, material);
    gl.uniform3fv(this.locations.lightDir, this.lightDir);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.vertexCount);
    gl.bindVertexArray(null);
  }

  render(camera, scene, highlightedStationId) {
    this.resizeCanvas();
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.04, 0.06, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProj, false, camera.viewProjMatrix);
    gl.uniform3fv(this.locations.lightDir, this.lightDir);
    if (scene.ground) {
      this.drawMesh(scene.ground.mesh, scene.ground.color, MATERIAL_GROUND);
    }
    for (const track of scene.tracks) {
      this.drawMesh(track.mesh, track.color, MATERIAL_DEFAULT);
    }
    for (const station of scene.stations) {
      const color =
        station.stationId === highlightedStationId
          ? station.highlightColor
          : station.color;
      this.drawMesh(station.mesh, color, MATERIAL_DEFAULT);
    }
  }

  resizeCanvas() {
    const canvas = this.gl.canvas;
    const pixelRatio = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      camera.setAspect(displayWidth / displayHeight);
    }
  }
}

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;

uniform mat4 uViewProj;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
  vWorldPos = aPosition;
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;

uniform vec3 uColor;
uniform vec3 uLightDir;
uniform int uMaterial;

out vec4 outColor;

float gridPattern(vec3 pos) {
  float scale = 0.1;
  vec2 coord = pos.xz * scale;
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  float line = min(grid.x, grid.y);
  return 1.0 - clamp(line, 0.0, 1.0);
}

void main() {
  vec3 normal = normalize(vNormal);
  float diff = max(dot(normal, normalize(uLightDir)), 0.0);
  vec3 baseColor = uColor;
  if (uMaterial == 1) {
    float grid = gridPattern(vWorldPos);
    baseColor *= mix(0.4, 1.0, grid);
  }
  vec3 color = baseColor * (0.25 + diff * 0.9);
  outColor = vec4(color, 1.0);
}
`;

/* ---------- 几何构造 ---------- */
function createGroundGeometry(size = 400, y = -0.01) {
  const half = size;
  const positions = [
    -half,
    y,
    -half,
    half,
    y,
    -half,
    half,
    y,
    half,
    -half,
    y,
    -half,
    half,
    y,
    half,
    -half,
    y,
    half,
  ];
  const normals = new Array(positions.length).fill(0);
  for (let i = 1; i < positions.length; i += 3) {
    normals[i - 1] = 0;
    normals[i] = 1;
    normals[i + 1] = 0;
  }
  return { positions, normals };
}

function createStationGeometry(position, radius = 1.5, height = 2.2, segments = 24) {
  const positions = [];
  const normals = [];
  const topY = position[1] + height;
  const bottomY = position[1];

  const pushTri = (a, b, c, normal) => {
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
  };

  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;
    const cos0 = Math.cos(theta0);
    const sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1);
    const sin1 = Math.sin(theta1);
    const p0 = [
      position[0] + radius * cos0,
      bottomY,
      position[2] + radius * sin0,
    ];
    const p1 = [
      position[0] + radius * cos1,
      bottomY,
      position[2] + radius * sin1,
    ];
    const p2 = [
      position[0] + radius * cos1,
      topY,
      position[2] + radius * sin1,
    ];
    const p3 = [
      position[0] + radius * cos0,
      topY,
      position[2] + radius * sin0,
    ];
    const normal = normalizeVec3([cos0 + cos1, 0, sin0 + sin1]);
    pushTri(p0, p1, p2, normal);
    pushTri(p0, p2, p3, normal);
  }

  const centerTop = [position[0], topY, position[2]];
  const centerBottom = [position[0], bottomY, position[2]];
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;
    const v0 = [
      position[0] + radius * Math.cos(theta0),
      topY,
      position[2] + radius * Math.sin(theta0),
    ];
    const v1 = [
      position[0] + radius * Math.cos(theta1),
      topY,
      position[2] + radius * Math.sin(theta1),
    ];
    pushTri(centerTop, v0, v1, [0, 1, 0]);

    const b0 = [
      position[0] + radius * Math.cos(theta0),
      bottomY,
      position[2] + radius * Math.sin(theta0),
    ];
    const b1 = [
      position[0] + radius * Math.cos(theta1),
      bottomY,
      position[2] + radius * Math.sin(theta1),
    ];
    pushTri(centerBottom, b1, b0, [0, -1, 0]);
  }

  return { positions, normals };
}

function buildTrackSegmentGeometry(params, startPose) {
  const {
    arcAngle,
    direction,
    height,
    innerRadiusBottom,
    outerRadiusBottom,
    innerRadiusTop,
    outerRadiusTop,
    subdivisions,
  } = params;

  const signedDir = direction >= 0 ? 1 : -1;
  const arc = Math.max(5, Math.abs(arcAngle)) * DEG2RAD;
  const slices = Math.max(2, Math.floor(subdivisions || 24));
  const startPoint = startPose.position;
  const heading = startPose.heading || 0;
  const tangent = [Math.cos(heading), 0, Math.sin(heading)];
  const perpendicular =
    signedDir === 1
      ? [-tangent[2], 0, tangent[0]]
      : [tangent[2], 0, -tangent[0]];
  const centerlineRadius = (innerRadiusBottom + outerRadiusBottom) * 0.5;
  const center = [
    startPoint[0] + perpendicular[0] * centerlineRadius,
    startPoint[1],
    startPoint[2] + perpendicular[2] * centerlineRadius,
  ];
  const startAngle = Math.atan2(startPoint[2] - center[2], startPoint[0] - center[0]);
  const angleStep = (arc / slices) * signedDir;

  const topInner = [];
  const topOuter = [];
  const bottomInner = [];
  const bottomOuter = [];

  for (let i = 0; i <= slices; i++) {
    const theta = startAngle + angleStep * i;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    bottomInner.push([
      center[0] + innerRadiusBottom * cos,
      startPoint[1],
      center[2] + innerRadiusBottom * sin,
    ]);
    bottomOuter.push([
      center[0] + outerRadiusBottom * cos,
      startPoint[1],
      center[2] + outerRadiusBottom * sin,
    ]);
    topInner.push([
      center[0] + innerRadiusTop * cos,
      startPoint[1] + height,
      center[2] + innerRadiusTop * sin,
    ]);
    topOuter.push([
      center[0] + outerRadiusTop * cos,
      startPoint[1] + height,
      center[2] + outerRadiusTop * sin,
    ]);
  }

  const positions = [];
  const normals = [];

  const pushTri = (a, b, c) => {
    const ab = subVec3(b, a);
    const ac = subVec3(c, a);
    let normal = crossVec3(ab, ac);
    normal = normalizeVec3(normal);
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
  };

  const pushQuad = (a, b, c, d) => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  for (let i = 0; i < slices; i++) {
    pushQuad(topInner[i], topOuter[i], topOuter[i + 1], topInner[i + 1]);
  }

  for (let i = 0; i < slices; i++) {
    pushQuad(
      bottomInner[i],
      bottomInner[i + 1],
      bottomOuter[i + 1],
      bottomOuter[i]
    );
  }

  for (let i = 0; i < slices; i++) {
    pushQuad(
      bottomOuter[i],
      bottomOuter[i + 1],
      topOuter[i + 1],
      topOuter[i]
    );
  }

  for (let i = 0; i < slices; i++) {
    pushQuad(
      bottomInner[i + 1],
      bottomInner[i],
      topInner[i],
      topInner[i + 1]
    );
  }

  const endAngle = startAngle + angleStep * slices;
  const endPoint = [
    center[0] + centerlineRadius * Math.cos(endAngle),
    startPoint[1],
    center[2] + centerlineRadius * Math.sin(endAngle),
  ];
  const endHeading = wrapAngle(heading + angleStep * slices);
  return {
    positions,
    normals,
    endPose: {
      position: endPoint,
      heading: endHeading,
    },
  };
}

/* ---------- 游戏状态 ---------- */
class GameState {
  constructor() {
    this.money = 4000;
    this.stationCost = 500;
    this.segmentCostPerDegree = 18;
    this.stations = [];
    this.coasters = [];
    this.tracks = [];
    this.mode = "idle";
    this.selectedStationId = null;
    this.stationCounter = 0;
    this.coasterCounter = 0;
    this.segmentCounter = 0;
  }

  canAffordStation() {
    return this.money >= this.stationCost;
  }

  findStationAt(point, radius = 2.2) {
    for (const station of this.stations) {
      if (distance2D(station.position, point) <= radius) {
        return station;
      }
    }
    return null;
  }

  getStationById(id) {
    return this.stations.find((s) => s.id === id) || null;
  }

  getCoasterByStationId(stationId) {
    return this.coasters.find((c) => c.stationId === stationId) || null;
  }

  getSelectedCoaster() {
    if (!this.selectedStationId) return null;
    return this.getCoasterByStationId(this.selectedStationId);
  }

  addStation(position) {
    if (!this.canAffordStation()) {
      return { error: "资金不足，无法购买站台。" };
    }
    const stationId = `Station-${++this.stationCounter}`;
    const station = {
      id: stationId,
      label: `站台 ${this.stationCounter}`,
      position: [...position],
      radius: 1.6,
    };
    const coasterId = `Coaster-${++this.coasterCounter}`;
    const color = randomCoasterColor();
    const coaster = {
      id: coasterId,
      stationId: station.id,
      color,
      segments: [],
      cursorPose: {
        position: [...position],
        heading: 0,
      },
    };
    this.money -= this.stationCost;
    this.stations.push(station);
    this.coasters.push(coaster);
    return { station, coaster };
  }

  computeSegmentCost(params) {
    const arc = Math.max(10, Math.abs(params.arcAngle));
    return Math.round(
      arc * this.segmentCostPerDegree + params.height * 40
    );
  }

  addTrackSegment(params) {
    const coaster = this.getSelectedCoaster();
    if (!coaster) {
      return { error: "请先选择站台。" };
    }
    const cost = this.computeSegmentCost(params);
    if (this.money < cost) {
      return { error: "资金不足，无法建造轨道。" };
    }
    const build = buildTrackSegmentGeometry(params, coaster.cursorPose);
    coaster.cursorPose = {
      position: [...build.endPose.position],
      heading: build.endPose.heading,
    };
    const segmentId = `Segment-${++this.segmentCounter}`;
    const segment = {
      id: segmentId,
      params,
      cost,
    };
    coaster.segments.push(segment);
    this.money -= cost;
    return { segment, build, coaster };
  }
}

/* ---------- 场景与 UI ---------- */
const renderer = new Renderer(gl);
const camera = new OrbitCamera();
const scene = {
  ground: {
    mesh: renderer.createMesh(createGroundGeometry(400, -0.02)),
    color: [0.15, 0.21, 0.28],
  },
  stations: [],
  tracks: [],
};
const game = new GameState();

const moneyLabel = document.getElementById("moneyLabel");
const modeLabel = document.getElementById("modeLabel");
const buyStationBtn = document.getElementById("buyStationBtn");
const cancelBtn = document.getElementById("cancelBtn");
const selectionInfo = document.getElementById("selectionInfo");
const trackForm = document.getElementById("trackForm");
const stationName = document.getElementById("stationName");
const arcAngleInput = document.getElementById("arcAngle");
const arcDirectionInput = document.getElementById("arcDirection");
const heightInput = document.getElementById("segmentHeight");
const innerBottomInput = document.getElementById("innerBottom");
const outerBottomInput = document.getElementById("outerBottom");
const innerTopInput = document.getElementById("innerTop");
const outerTopInput = document.getElementById("outerTop");
const subdivisionsInput = document.getElementById("subdivisions");
const addTrackBtn = document.getElementById("addTrackBtn");
const trackStatus = document.getElementById("trackStatus");

function updateHud() {
  moneyLabel.textContent = `¥${game.money.toLocaleString("zh-CN")}`;
  let modeText = "空闲";
  if (game.mode === "placingStation") modeText = "放置站台";
  if (game.mode === "building") modeText = "建造轨道";
  modeLabel.textContent = modeText;
  buyStationBtn.disabled = !game.canAffordStation();
}

function setMode(mode) {
  game.mode = mode;
  if (mode === "building" && game.selectedStationId) {
    selectionInfo.classList.add("hidden");
    trackForm.classList.remove("hidden");
    stationName.textContent =
      game.getStationById(game.selectedStationId)?.label ?? "";
  } else {
    trackForm.classList.add("hidden");
    selectionInfo.classList.remove("hidden");
    if (mode === "placingStation") {
      selectionInfo.textContent = "在地面单击放置新的过山车站台";
    } else {
      selectionInfo.textContent = "点击站台进入建造模式";
    }
  }
  updateHud();
}

function selectStation(station) {
  if (!station) {
    game.selectedStationId = null;
    setMode("idle");
    return;
  }
  game.selectedStationId = station.id;
  stationName.textContent = station.label;
  trackStatus.textContent = "";
  setMode("building");
}

function showTrackStatus(message, isError = false) {
  trackStatus.textContent = message;
  trackStatus.style.color = isError ? "#ff8a8a" : "#9ad1ff";
}

buyStationBtn.addEventListener("click", () => {
  if (!game.canAffordStation()) return;
  setMode("placingStation");
});

cancelBtn.addEventListener("click", () => {
  game.selectedStationId = null;
  setMode("idle");
});

addTrackBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const params = readTrackParams();
  if (!params) return;
  const result = game.addTrackSegment(params);
  if (result.error) {
    showTrackStatus(result.error, true);
    return;
  }
  const mesh = renderer.createMesh({
    positions: result.build.positions,
    normals: result.build.normals,
  });
  scene.tracks.push({
    id: result.segment.id,
    mesh,
    color: lightenColor(result.coaster.color, 0.05),
  });
  showTrackStatus(`轨道建造完成，花费 ¥${result.segment.cost}`);
  updateHud();
});

function readTrackParams() {
  const arcAngle = Number(arcAngleInput.value);
  const direction = Number(arcDirectionInput.value);
  const height = Number(heightInput.value);
  const innerBottom = Number(innerBottomInput.value);
  const outerBottom = Number(outerBottomInput.value);
  const innerTop = Number(innerTopInput.value);
  const outerTop = Number(outerTopInput.value);
  const subdivisions = Number(subdivisionsInput.value);

  if (
    isNaN(arcAngle) ||
    isNaN(height) ||
    isNaN(innerBottom) ||
    isNaN(outerBottom) ||
    isNaN(innerTop) ||
    isNaN(outerTop)
  ) {
    showTrackStatus("参数不完整", true);
    return null;
  }
  if (outerBottom <= innerBottom || outerTop <= innerTop) {
    showTrackStatus("外径需大于内径", true);
    return null;
  }

  return {
    arcAngle,
    direction,
    height,
    innerRadiusBottom: innerBottom,
    outerRadiusBottom: outerBottom,
    innerRadiusTop: innerTop,
    outerRadiusTop: outerTop,
    subdivisions,
  };
}

/* ---------- 交互控制 ---------- */
let pointerTracking = {
  active: false,
  lastX: 0,
  lastY: 0,
  dragging: false,
};

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  pointerTracking = {
    active: true,
    lastX: event.clientX,
    lastY: event.clientY,
    dragging: false,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerTracking.active) return;
  const dx = event.clientX - pointerTracking.lastX;
  const dy = event.clientY - pointerTracking.lastY;
  if (!pointerTracking.dragging && Math.hypot(dx, dy) > 3) {
    pointerTracking.dragging = true;
  }
  if (pointerTracking.dragging) {
    camera.orbit(dx, dy);
  }
  pointerTracking.lastX = event.clientX;
  pointerTracking.lastY = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  if (!pointerTracking.active) return;
  canvas.releasePointerCapture(event.pointerId);
  if (!pointerTracking.dragging && event.button === 0) {
    handleCanvasClick(event);
  }
  pointerTracking.active = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  camera.zoom(event.deltaY);
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  const ray = camera.getRay(ndcX, ndcY);
  const point = intersectRayPlane(ray.origin, ray.direction, 0);
  if (!point) return;

  if (game.mode === "placingStation") {
    const snapped = snapToGrid(point, 2);
    const result = game.addStation(snapped);
    if (result.error) {
      selectionInfo.textContent = result.error;
      updateHud();
      return;
    }
    const mesh = renderer.createMesh(
      createStationGeometry(result.station.position, 1.6, 2.5, 24)
    );
    const baseColor = lightenColor(result.coaster.color, 0.05);
    const highlightColor = lightenColor(result.coaster.color, 0.25);
    scene.stations.push({
      stationId: result.station.id,
      mesh,
      color: baseColor,
      highlightColor,
    });
    selectStation(result.station);
    updateHud();
    return;
  }

  const station = game.findStationAt(point, 1.8);
  if (station) {
    selectStation(station);
  } else {
    selectStation(null);
  }
}

/* ---------- 动画循环 ---------- */
function renderLoop() {
  renderer.render(camera, scene, game.selectedStationId);
  requestAnimationFrame(renderLoop);
}

window.addEventListener("resize", () => renderer.resizeCanvas());
setMode("idle");
renderer.resizeCanvas();
updateHud();
renderLoop();
