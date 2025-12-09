const PARK_SIZE = 60; // 单位：米，对应核心公园 60 × 60
const PURCHASE_RING_WIDTH = 1; // 木栅栏外可购买的一圈格子厚度（米）
const WORLD_SIZE = PARK_SIZE + PURCHASE_RING_WIDTH * 2;
const HALF_WORLD = WORLD_SIZE / 2;
const TOTAL_PURCHASABLE_CELLS = WORLD_SIZE * WORLD_SIZE - PARK_SIZE * PARK_SIZE;
const MIN_DISTANCE = 38;
const MAX_DISTANCE = 180;
const ROTATE_SPEED_MOUSE = 0.003;
const ROTATE_SPEED_TOUCH = 0.002;
const ZOOM_SPEED_WHEEL = 0.08;
const ZOOM_SPEED_LINE = 2.5;
const MIN_PITCH = degToRad(-80);
const MAX_PITCH = degToRad(-15);

let cameraDistance = 120;
let orbitYaw = degToRad(-135);
let orbitPitch = degToRad(-35);
const cameraPosition = [0, 0, 0];
const pointerTracker = new Map();
let isOrbitingPointer = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pinchStartDistance = null;
let pinchStartCameraDistance = null;

const canvas = document.getElementById("rollerCanvas");
const gl = canvas.getContext("webgl2", { antialias: true, depth: true });

if (!gl) {
  throw new Error("当前浏览器不支持 WebGL2，请更换或升级浏览器。");
}

gl.clearColor(0.01, 0.03, 0.06, 1.0);
gl.disable(gl.CULL_FACE); // 栅栏需要双面可见
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.clearDepth(1.0);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

// UI 元素
const purchaseStatusEl = document.getElementById("purchaseStatus");
const purchasedCountEl = document.getElementById("purchasedCount");
const remainingCellsEl = document.getElementById("remainingCells");

// --- 数学工具 ---
function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

function invertMat4(m) {
  const out = new Float32Array(16);
  const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
  const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
  const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
  const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

  const p00 = m00 * m11 - m01 * m10;
  const p01 = m00 * m12 - m02 * m10;
  const p02 = m00 * m13 - m03 * m10;
  const p03 = m01 * m12 - m02 * m11;
  const p04 = m01 * m13 - m03 * m11;
  const p05 = m02 * m13 - m03 * m12;
  const p06 = m20 * m31 - m21 * m30;
  const p07 = m20 * m32 - m22 * m30;
  const p08 = m20 * m33 - m23 * m30;
  const p09 = m21 * m32 - m22 * m31;
  const p10 = m21 * m33 - m23 * m31;
  const p11 = m22 * m33 - m23 * m32;

  const det = p00 * p11 - p01 * p10 + p02 * p09 + p03 * p08 - p04 * p07 + p05 * p06;

  if (Math.abs(det) < 1e-8) {
    return null;
  }

  const invDet = 1 / det;

  out[0] = (m11 * p11 - m12 * p10 + m13 * p09) * invDet;
  out[1] = (m02 * p10 - m01 * p11 - m03 * p09) * invDet;
  out[2] = (m31 * p05 - m32 * p04 + m33 * p03) * invDet;
  out[3] = (m22 * p04 - m21 * p05 - m23 * p03) * invDet;

  out[4] = (m12 * p08 - m10 * p11 - m13 * p07) * invDet;
  out[5] = (m00 * p11 - m02 * p08 + m03 * p07) * invDet;
  out[6] = (m32 * p02 - m30 * p05 - m33 * p01) * invDet;
  out[7] = (m20 * p05 - m22 * p02 + m23 * p01) * invDet;

  out[8] = (m10 * p10 - m11 * p08 + m13 * p06) * invDet;
  out[9] = (m01 * p08 - m00 * p10 - m03 * p06) * invDet;
  out[10] = (m30 * p04 - m31 * p02 + m33 * p00) * invDet;
  out[11] = (m21 * p02 - m20 * p04 - m23 * p00) * invDet;

  out[12] = (m11 * p07 - m10 * p09 - m12 * p06) * invDet;
  out[13] = (m00 * p09 - m01 * p07 + m02 * p06) * invDet;
  out[14] = (m31 * p01 - m30 * p03 - m32 * p00) * invDet;
  out[15] = (m20 * p03 - m21 * p01 + m22 * p00) * invDet;

  return out;
}

function createPerspectiveMatrix(fovRadians, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRadians / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function normalizeVec3(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function subtractVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossVec3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function createLookAtMatrix(eye, target, up) {
  const zAxis = normalizeVec3(subtractVec3(eye, target));
  const xAxis = normalizeVec3(crossVec3(up, zAxis));
  const yAxis = crossVec3(zAxis, xAxis);

  const out = new Float32Array(16);
  out[0] = xAxis[0];
  out[1] = xAxis[1];
  out[2] = xAxis[2];
  out[3] = 0;

  out[4] = yAxis[0];
  out[5] = yAxis[1];
  out[6] = yAxis[2];
  out[7] = 0;

  out[8] = zAxis[0];
  out[9] = zAxis[1];
  out[10] = zAxis[2];
  out[11] = 0;

  out[12] = -(
    xAxis[0] * eye[0] +
    xAxis[1] * eye[1] +
    xAxis[2] * eye[2]
  );
  out[13] = -(
    yAxis[0] * eye[0] +
    yAxis[1] * eye[1] +
    yAxis[2] * eye[2]
  );
  out[14] = -(
    zAxis[0] * eye[0] +
    zAxis[1] * eye[1] +
    zAxis[2] * eye[2]
  );
  out[15] = 1;
  return out;
}

function updateCameraPosition() {
  const cosPitch = Math.cos(orbitPitch);
  const sinPitch = Math.sin(orbitPitch);
  const cosYaw = Math.cos(orbitYaw);
  const sinYaw = Math.sin(orbitYaw);
  cameraPosition[0] = cosYaw * cosPitch * cameraDistance;
  cameraPosition[1] = sinPitch * cameraDistance;
  cameraPosition[2] = sinYaw * cosPitch * cameraDistance;
}

function transformClipToWorld(matrix, ndcX, ndcY, ndcZ) {
  if (!matrix) {
    return null;
  }
  const clip = [ndcX, ndcY, ndcZ, 1];
  const out = [
    matrix[0] * clip[0] + matrix[4] * clip[1] + matrix[8] * clip[2] + matrix[12] * clip[3],
    matrix[1] * clip[0] + matrix[5] * clip[1] + matrix[9] * clip[2] + matrix[13] * clip[3],
    matrix[2] * clip[0] + matrix[6] * clip[1] + matrix[10] * clip[2] + matrix[14] * clip[3],
    matrix[3] * clip[0] + matrix[7] * clip[1] + matrix[11] * clip[2] + matrix[15] * clip[3],
  ];
  if (Math.abs(out[3]) < 1e-6) {
    return null;
  }
  return [out[0] / out[3], out[1] / out[3], out[2] / out[3]];
}

// --- Shader ---
const vertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aCellCoord;
layout(location = 2) in float aParity;
layout(location = 3) in float aType;

uniform mat4 uViewProjection;
uniform float uWorldHalf;

out vec2 vCellCoord;
out float vParity;
out vec2 vCellUv;
out float vType;

void main() {
  vec4 world = vec4(aPosition, 1.0);
  gl_Position = uViewProjection * world;
  vCellCoord = aCellCoord;
  vParity = aParity;
  vec2 worldPos = vec2(aPosition.x + uWorldHalf, aPosition.z + uWorldHalf);
  vCellUv = fract(worldPos);
  vType = aType;
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vCellCoord;
in float vParity;
in vec2 vCellUv;
in float vType;

uniform sampler2D uPurchaseState;
uniform float uWorldSize;

out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (vCellCoord + 0.5) / vec2(uWorldSize);
  float purchased = texture(uPurchaseState, uv).r;

  if (vType > 1.5) {
    vec3 soilBase = vec3(0.16, 0.12, 0.07);
    float soilNoise = fbm(vCellUv * 6.0 + vCellCoord * 0.08);
    vec3 soilColor = soilBase + vec3(0.08, 0.05, 0.03) * soilNoise;
    vec3 purchasedColor = vec3(0.24, 0.58, 0.34);
    vec3 finalColor = mix(soilColor, purchasedColor, purchased);
    outColor = vec4(finalColor, 1.0);
    return;
  }

  if (vType > 0.5) {
    vec2 woodUv = vec2(vCellCoord.x * 4.0, vCellCoord.y * 8.0) + vCellUv * 2.0;
    float grain = fbm(woodUv * 1.5);
    vec3 woodBase = vec3(0.36, 0.22, 0.11);
    vec3 woodHighlight = vec3(0.58, 0.39, 0.21);
    vec3 woodColor = mix(woodBase, woodHighlight, grain);
    outColor = vec4(woodColor, 1.0);
    return;
  }

  float isLight = clamp(mod(vParity, 2.0), 0.0, 1.0);
  vec3 darkColor = vec3(0.07, 0.11, 0.18);
  vec3 lightColor = vec3(0.18, 0.25, 0.35);
  vec3 baseColor = mix(darkColor, lightColor, isLight);

  vec2 grassUv = vCellUv * 4.0 + vCellCoord * 0.05;
  float blade = fbm(grassUv * 3.0 + vec2(uv.y, uv.x) * 10.0);
  float direction = smoothstep(0.2, 0.8, abs(sin((grassUv.x + grassUv.y) * 6.2831)));
  vec3 grassTint = vec3(0.04, 0.13, 0.06) * blade;
  vec3 grassShadow = vec3(-0.03, -0.05, -0.02) * direction;
  vec3 grassColor = clamp(baseColor + grassTint + grassShadow, 0.0, 1.0);

  outColor = vec4(grassColor, 1.0);
}
`;

function createShader(glCtx, type, source) {
  const shader = glCtx.createShader(type);
  if (!shader) {
    throw new Error("无法创建 shader");
  }
  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    const info = glCtx.getShaderInfoLog(shader);
    glCtx.deleteShader(shader);
    throw new Error(`Shader 编译失败: ${info}`);
  }
  return shader;
}

function createProgram(glCtx, vsSource, fsSource) {
  const vertexShader = createShader(glCtx, glCtx.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(glCtx, glCtx.FRAGMENT_SHADER, fsSource);
  const program = glCtx.createProgram();
  if (!program) {
    throw new Error("无法创建 program");
  }
  glCtx.attachShader(program, vertexShader);
  glCtx.attachShader(program, fragmentShader);
  glCtx.linkProgram(program);
  if (!glCtx.getProgramParameter(program, glCtx.LINK_STATUS)) {
    const info = glCtx.getProgramInfoLog(program);
    glCtx.deleteProgram(program);
    throw new Error(`Program 链接失败: ${info}`);
  }
  glCtx.deleteShader(vertexShader);
  glCtx.deleteShader(fragmentShader);
  return program;
}

function buildGroundGeometry(totalSize, parkSize) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const half = totalSize / 2;
  const ring = (totalSize - parkSize) / 2;

  for (let x = 0; x < totalSize; x += 1) {
    for (let z = 0; z < totalSize; z += 1) {
      const x0 = x - half;
      const z0 = z - half;
      const x1 = x0 + 1;
      const z1 = z0 + 1;
      const parity = (x + z) % 2;
      const isExpansion =
        x < ring ||
        x >= totalSize - ring ||
        z < ring ||
        z >= totalSize - ring;
      const cellType = isExpansion ? 2 : 0;

      positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
      cellCoords.push(x, z, x, z, x, z);
      parities.push(parity, parity, parity);
      types.push(cellType, cellType, cellType);

      positions.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
      cellCoords.push(x, z, x, z, x, z);
      parities.push(parity, parity, parity);
      types.push(cellType, cellType, cellType);
    }
  }

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    vertexCount: positions.length / 3,
  };
}

function buildFenceGeometry(parkSize) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const half = parkSize / 2;
  const fenceHeight = 3.5;
  const heightInv = 1 / fenceHeight;
  const offset = 0.02;

  function pushWallX(zPos) {
    const xStart = -half;
    const xEnd = half;
    const span = xEnd - xStart;
    positions.push(
      xStart,
      0,
      zPos,
      xEnd,
      0,
      zPos,
      xEnd,
      fenceHeight,
      zPos,
      xStart,
      0,
      zPos,
      xEnd,
      fenceHeight,
      zPos,
      xStart,
      fenceHeight,
      zPos
    );
    const addUv = (vx, vy) => {
      cellCoords.push((vx - xStart) / span, vy * heightInv);
      parities.push(0);
      types.push(1);
    };
    addUv(xStart, 0);
    addUv(xEnd, 0);
    addUv(xEnd, fenceHeight);
    addUv(xStart, 0);
    addUv(xEnd, fenceHeight);
    addUv(xStart, fenceHeight);
  }

  function pushWallZ(xPos) {
    const zStart = -half;
    const zEnd = half;
    const span = zEnd - zStart;
    positions.push(
      xPos,
      0,
      zStart,
      xPos,
      0,
      zEnd,
      xPos,
      fenceHeight,
      zEnd,
      xPos,
      0,
      zStart,
      xPos,
      fenceHeight,
      zEnd,
      xPos,
      fenceHeight,
      zStart
    );
    const addUv = (vz, vy) => {
      cellCoords.push((vz - zStart) / span, vy * heightInv);
      parities.push(0);
      types.push(1);
    };
    addUv(zStart, 0);
    addUv(zEnd, 0);
    addUv(zEnd, fenceHeight);
    addUv(zStart, 0);
    addUv(zEnd, fenceHeight);
    addUv(zStart, fenceHeight);
  }

  pushWallX(half + offset);
  pushWallX(-half - offset);
  pushWallZ(half + offset);
  pushWallZ(-half - offset);

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    vertexCount: positions.length / 3,
  };
}

const groundGeometry = buildGroundGeometry(WORLD_SIZE, PARK_SIZE);
const fenceGeometry = buildFenceGeometry(PARK_SIZE);
const program = createProgram(gl, vertexSource, fragmentSource);

gl.useProgram(program);

function createBufferAndAttribute({ data, location, size }) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error(`绑定 attribute ${location} 时创建缓冲失败`);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  return buffer;
}

function createVaoFromGeometry(geometry) {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("无法创建 VAO");
  }
  gl.bindVertexArray(vao);
  createBufferAndAttribute({ data: geometry.positions, location: 0, size: 3 });
  createBufferAndAttribute({ data: geometry.cellCoords, location: 1, size: 2 });
  createBufferAndAttribute({ data: geometry.parities, location: 2, size: 1 });
  createBufferAndAttribute({ data: geometry.types, location: 3, size: 1 });
  return vao;
}

const groundVao = createVaoFromGeometry(groundGeometry);
const fenceVao = createVaoFromGeometry(fenceGeometry);

const purchaseStateData = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
const purchaseTexture = gl.createTexture();
if (!purchaseTexture) {
  throw new Error("无法创建购买状态纹理");
}

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, purchaseTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(
  gl.TEXTURE_2D,
  0,
  gl.R8,
  WORLD_SIZE,
  WORLD_SIZE,
  0,
  gl.RED,
  gl.UNSIGNED_BYTE,
  purchaseStateData
);

gl.useProgram(program);

const uniforms = {
  viewProjection: gl.getUniformLocation(program, "uViewProjection"),
  worldHalf: gl.getUniformLocation(program, "uWorldHalf"),
  worldSize: gl.getUniformLocation(program, "uWorldSize"),
  purchaseState: gl.getUniformLocation(program, "uPurchaseState"),
};

gl.uniform1i(uniforms.purchaseState, 0);

gl.uniform1f(uniforms.worldHalf, HALF_WORLD);
gl.uniform1f(uniforms.worldSize, WORLD_SIZE);

gl.bindVertexArray(null);

const purchasedCells = new Set();
const ringOffset = (WORLD_SIZE - PARK_SIZE) / 2;
let inverseViewProjectionMatrix = null;

const cameraTarget = [0, 0, 0];
const cameraUp = [0, 1, 0];
const cameraFov = degToRad(50);

function isPurchasableCell(x, z) {
  return (
    x < ringOffset ||
    x >= WORLD_SIZE - ringOffset ||
    z < ringOffset ||
    z >= WORLD_SIZE - ringOffset
  );
}

function updatePurchaseTexture(x, z, purchased) {
  const index = z * WORLD_SIZE + x;
  purchaseStateData[index] = purchased ? 255 : 0;
  const singlePixel = new Uint8Array([purchaseStateData[index]]);
  gl.bindTexture(gl.TEXTURE_2D, purchaseTexture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    x,
    z,
    1,
    1,
    gl.RED,
    gl.UNSIGNED_BYTE,
    singlePixel
  );
}

function resizeCanvasToDisplaySize() {
  const pixelRatio = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
  const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
}

function computeCameraMatrices() {
  const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
  updateCameraPosition();
  const projection = createPerspectiveMatrix(cameraFov, aspect, 0.1, 400.0);
  const view = createLookAtMatrix(cameraPosition, cameraTarget, cameraUp);
  const viewProjection = multiplyMat4(projection, view);
  inverseViewProjectionMatrix = invertMat4(viewProjection);
  gl.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);
}

function render() {
  resizeCanvasToDisplaySize();
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  computeCameraMatrices();

  gl.bindVertexArray(groundVao);
  gl.drawArrays(gl.TRIANGLES, 0, groundGeometry.vertexCount);

  gl.bindVertexArray(fenceVao);
  gl.drawArrays(gl.TRIANGLES, 0, fenceGeometry.vertexCount);

  gl.bindVertexArray(null);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

function updateUiStatus(message) {
  purchaseStatusEl.textContent = message;
  purchasedCountEl.textContent = purchasedCells.size.toString();
  const remaining = Math.max(
    TOTAL_PURCHASABLE_CELLS - purchasedCells.size,
    0
  );
  remainingCellsEl.textContent = remaining.toString();
}

function clipSpaceFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * -2 + 1;
  return { x, y };
}

function getCellFromPointer(event) {
  const clip = clipSpaceFromEvent(event);
  if (!clip || !inverseViewProjectionMatrix) {
    return null;
  }
  const nearPoint = transformClipToWorld(
    inverseViewProjectionMatrix,
    clip.x,
    clip.y,
    -1
  );
  const farPoint = transformClipToWorld(
    inverseViewProjectionMatrix,
    clip.x,
    clip.y,
    1
  );
  if (!nearPoint || !farPoint) {
    return null;
  }
  const direction = [
    farPoint[0] - nearPoint[0],
    farPoint[1] - nearPoint[1],
    farPoint[2] - nearPoint[2],
  ];
  if (Math.abs(direction[1]) < 1e-6) {
    return null;
  }
  const t = -nearPoint[1] / direction[1];
  if (t < 0) {
    return null;
  }
  const worldX = nearPoint[0] + direction[0] * t;
  const worldZ = nearPoint[2] + direction[2] * t;
  if (
    worldX < -HALF_WORLD ||
    worldX >= HALF_WORLD ||
    worldZ < -HALF_WORLD ||
    worldZ >= HALF_WORLD
  ) {
    return null;
  }
  const cellX = Math.floor(worldX + HALF_WORLD);
  const cellZ = Math.floor(worldZ + HALF_WORLD);
  return { x: cellX, z: cellZ };
}

function getPointerDistance(a, b) {
  if (!a || !b) {
    return 0;
  }
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPointerEntries() {
  return Array.from(pointerTracker.values());
}

function handlePointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  pointerTracker.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    type: event.pointerType,
  });
  canvas.setPointerCapture(event.pointerId);
  if (pointerTracker.size === 1) {
    isOrbitingPointer = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.classList.add("dragging");
  } else if (pointerTracker.size === 2) {
    isOrbitingPointer = false;
    canvas.classList.remove("dragging");
    const [first, second] = getPointerEntries();
    pinchStartDistance = getPointerDistance(first, second);
    pinchStartCameraDistance = cameraDistance;
  }
}

function handlePointerMove(event) {
  const entry = pointerTracker.get(event.pointerId);
  if (!entry) {
    return;
  }
  entry.x = event.clientX;
  entry.y = event.clientY;

  if (pointerTracker.size === 1 && isOrbitingPointer) {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const speed = entry.type === "touch" ? ROTATE_SPEED_TOUCH : ROTATE_SPEED_MOUSE;
    orbitYaw += dx * speed;
    orbitPitch = clamp(orbitPitch + dy * speed, MIN_PITCH, MAX_PITCH);
  } else if (pointerTracker.size >= 2 && pinchStartDistance) {
    const [first, second] = getPointerEntries();
    const currentDistance = getPointerDistance(first, second);
    if (currentDistance > 0.01) {
      const scale = pinchStartDistance / currentDistance;
      cameraDistance = clamp(
        pinchStartCameraDistance * scale,
        MIN_DISTANCE,
        MAX_DISTANCE
      );
    }
  }
}

function handlePointerUp(event) {
  if (pointerTracker.has(event.pointerId)) {
    pointerTracker.delete(event.pointerId);
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // 忽略捕获释放错误
    }
  }

  if (pointerTracker.size === 1) {
    const [remaining] = getPointerEntries();
    if (remaining) {
      lastPointerX = remaining.x;
      lastPointerY = remaining.y;
      isOrbitingPointer = true;
      canvas.classList.add("dragging");
    }
    pinchStartDistance = null;
  } else if (pointerTracker.size === 0) {
    isOrbitingPointer = false;
    pinchStartDistance = null;
    pinchStartCameraDistance = null;
    canvas.classList.remove("dragging");
  }
}

function handleWheel(event) {
  event.preventDefault();
  const speed = event.deltaMode === 0 ? ZOOM_SPEED_WHEEL : ZOOM_SPEED_LINE;
  cameraDistance = clamp(
    cameraDistance + event.deltaY * speed,
    MIN_DISTANCE,
    MAX_DISTANCE
  );
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("pointerleave", handlePointerUp);
canvas.addEventListener("wheel", handleWheel, { passive: false });

canvas.addEventListener("click", (event) => {
  const cell = getCellFromPointer(event);
  if (!cell) {
    updateUiStatus("点击超出可规划区域，未处理。");
    return;
  }

  if (!isPurchasableCell(cell.x, cell.z)) {
    updateUiStatus("核心 60m × 60m 公园已开放，此区域无需购买。");
    return;
  }

  const key = `${cell.x}-${cell.z}`;
  if (purchasedCells.has(key)) {
    updateUiStatus(`扩展格 (${cell.x + 1}, ${cell.z + 1}) 已购入。`);
    return;
  }

  const confirmed = window.confirm(
    `是否购买靠近木栅栏的扩展格 (${cell.x + 1}, ${cell.z + 1})？`
  );

  if (!confirmed) {
    updateUiStatus("已取消本次购买。");
    return;
  }

  purchasedCells.add(key);
  updatePurchaseTexture(cell.x, cell.z, true);
  updateUiStatus(`成功购入扩展格 (${cell.x + 1}, ${cell.z + 1})！`);
});

updateUiStatus("核心公园 60m × 60m 已铺设，尚未购买额外地块。");
