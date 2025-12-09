const PARK_SIZE = 60;
const EXPANSION_RING = 1; // 木栅栏外额外一圈可购格
const WORLD_SIZE = PARK_SIZE + EXPANSION_RING * 2;
const HALF_WORLD = WORLD_SIZE / 2;
const TOTAL_PURCHASABLE = WORLD_SIZE * WORLD_SIZE - PARK_SIZE * PARK_SIZE;

const MIN_DISTANCE = 38;
const MAX_DISTANCE = 200;
const ROTATE_SPEED_MOUSE = 0.004;
const ROTATE_SPEED_TOUCH = 0.003;
const WHEEL_SPEED_PX = 0.09;
const WHEEL_SPEED_LINE = 3;
const MIN_PITCH = degToRad(-85);
const MAX_PITCH = degToRad(-15);

const canvas = document.getElementById("viewport");
const gl = canvas.getContext("webgl2", { antialias: true, depth: true });
if (!gl) {
  throw new Error("当前浏览器不支持 WebGL2，请升级或更换浏览器。");
}

const statusEl = document.getElementById("status");
const remainingEl = document.getElementById("remaining");
const purchasedEl = document.getElementById("purchased");

gl.clearColor(0.01, 0.02, 0.05, 1);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.disable(gl.CULL_FACE);

gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

// --------- 数学与矩阵工具 ---------
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const Mat4 = {
  create() {
    return new Float32Array(16);
  },
  identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;

    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;

    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;

    out[12] = 0;
    out[13] = 0;
    out[14] = 2 * far * near * nf;
    out[15] = 0;
    return out;
  },
  multiply(out, a, b) {
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
  },
  invert(out, m) {
    const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    const tmp0 = m22 * m33 - m23 * m32;
    const tmp1 = m21 * m33 - m23 * m31;
    const tmp2 = m21 * m32 - m22 * m31;
    const tmp3 = m20 * m33 - m23 * m30;
    const tmp4 = m20 * m32 - m22 * m30;
    const tmp5 = m20 * m31 - m21 * m30;

    const cof0 = +(m11 * tmp0 - m12 * tmp1 + m13 * tmp2);
    const cof1 = -(m10 * tmp0 - m12 * tmp3 + m13 * tmp4);
    const cof2 = +(m10 * tmp1 - m11 * tmp3 + m13 * tmp5);
    const cof3 = -(m10 * tmp2 - m11 * tmp4 + m12 * tmp5);

    const det = m00 * cof0 + m01 * cof1 + m02 * cof2 + m03 * cof3;
    if (Math.abs(det) < 1e-8) {
      return null;
    }
    const invDet = 1 / det;

    out[0] = cof0 * invDet;
    out[1] = (-(m01 * tmp0 - m02 * tmp1 + m03 * tmp2)) * invDet;
    out[2] = ((m31 * (m02 * m13 - m03 * m12) - m32 * (m01 * m13 - m03 * m11) + m33 * (m01 * m12 - m02 * m11))) * invDet;
    out[3] = (-(m21 * (m02 * m13 - m03 * m12) - m22 * (m01 * m13 - m03 * m11) + m23 * (m01 * m12 - m02 * m11))) * invDet;

    out[4] = cof1 * invDet;
    out[5] = ((m00 * tmp0 - m02 * tmp3 + m03 * tmp4)) * invDet;
    out[6] = (-(m30 * (m02 * m13 - m03 * m12) - m32 * (m00 * m13 - m03 * m10) + m33 * (m00 * m12 - m02 * m10))) * invDet;
    out[7] = ((m20 * (m02 * m13 - m03 * m12) - m22 * (m00 * m13 - m03 * m10) + m23 * (m00 * m12 - m02 * m10))) * invDet;

    out[8] = cof2 * invDet;
    out[9] = (-(m00 * tmp1 - m01 * tmp3 + m03 * tmp5)) * invDet;
    out[10] = ((m30 * (m01 * m13 - m03 * m11) - m31 * (m00 * m13 - m03 * m10) + m33 * (m00 * m11 - m01 * m10))) * invDet;
    out[11] = (-(m20 * (m01 * m13 - m03 * m11) - m21 * (m00 * m13 - m03 * m10) + m23 * (m00 * m11 - m01 * m10))) * invDet;

    out[12] = cof3 * invDet;
    out[13] = ((m00 * tmp2 - m01 * tmp4 + m02 * tmp5)) * invDet;
    out[14] = (-(m30 * (m01 * m12 - m02 * m11) - m31 * (m00 * m12 - m02 * m10) + m32 * (m00 * m11 - m01 * m10))) * invDet;
    out[15] = ((m20 * (m01 * m12 - m02 * m11) - m21 * (m00 * m12 - m02 * m10) + m22 * (m00 * m11 - m01 * m10))) * invDet;

    return out;
  },
  lookAt(out, eye, target, up) {
    const zx = eye[0] - target[0];
    const zy = eye[1] - target[1];
    const zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz);
    if (len === 0) {
      return Mat4.identity(out);
    }
    const zxN = zx / len;
    const zyN = zy / len;
    const zzN = zz / len;

    let xx = up[1] * zzN - up[2] * zyN;
    let xy = up[2] * zxN - up[0] * zzN;
    let xz = up[0] * zyN - up[1] * zxN;
    len = Math.hypot(xx, xy, xz);
    if (len === 0) {
      xx = 1; xy = 0; xz = 0;
    } else {
      xx /= len; xy /= len; xz /= len;
    }

    const yx = zyN * xz - zzN * xy;
    const yy = zzN * xx - zxN * xz;
    const yz = zxN * xy - zyN * xx;

    out[0] = xx;
    out[1] = yx;
    out[2] = zxN;
    out[3] = 0;

    out[4] = xy;
    out[5] = yy;
    out[6] = zyN;
    out[7] = 0;

    out[8] = xz;
    out[9] = yz;
    out[10] = zzN;
    out[11] = 0;

    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zxN * eye[0] + zyN * eye[1] + zzN * eye[2]);
    out[15] = 1;
    return out;
  },
};

function transformClipToWorld(matrix, x, y, z) {
  const clip = [x, y, z, 1];
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

// --------- 相机与指针交互 ---------
class OrbitCamera {
  constructor() {
    this.distance = 120;
    this.yaw = degToRad(-130);
    this.pitch = degToRad(-30);
    this.target = [0, 0, 0];
    this.position = [0, 0, 0];
    this.view = Mat4.create();
    this.projection = Mat4.create();
    this.viewProjection = Mat4.create();
    this.inverseViewProjection = Mat4.create();
  }

  rotate(deltaX, deltaY, speed) {
    this.yaw += deltaX * speed;
    this.pitch = clamp(this.pitch + deltaY * speed, MIN_PITCH, MAX_PITCH);
  }

  dolly(delta) {
    this.distance = clamp(this.distance + delta, MIN_DISTANCE, MAX_DISTANCE);
  }

  setDistance(next) {
    this.distance = clamp(next, MIN_DISTANCE, MAX_DISTANCE);
  }

  update(aspect) {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.position[0] = cy * cp * this.distance;
    this.position[1] = sp * this.distance;
    this.position[2] = sy * cp * this.distance;

    Mat4.lookAt(this.view, this.position, this.target, [0, 1, 0]);
    Mat4.perspective(this.projection, degToRad(50), aspect, 0.1, 400);
    Mat4.multiply(this.viewProjection, this.projection, this.view);
    Mat4.invert(this.inverseViewProjection, this.viewProjection);
  }
}

const camera = new OrbitCamera();
const pointerMap = new Map();
let dragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pinchBaseline = null;
let pinchDistanceStart = null;

function pointerEntries() {
  return Array.from(pointerMap.values());
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  pointerMap.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    type: event.pointerType,
  });
  canvas.setPointerCapture(event.pointerId);
  if (pointerMap.size === 1) {
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.classList.add("dragging");
  } else if (pointerMap.size === 2) {
    dragging = false;
    canvas.classList.remove("dragging");
    const [p1, p2] = pointerEntries();
    pinchBaseline = pointerDistance(p1, p2);
    pinchDistanceStart = camera.distance;
  }
});

canvas.addEventListener("pointermove", (event) => {
  const entry = pointerMap.get(event.pointerId);
  if (!entry) {
    return;
  }
  entry.x = event.clientX;
  entry.y = event.clientY;

  if (pointerMap.size === 1 && dragging) {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const speed = entry.type === "touch" ? ROTATE_SPEED_TOUCH : ROTATE_SPEED_MOUSE;
    camera.rotate(dx, dy, speed);
  } else if (pointerMap.size === 2 && pinchBaseline) {
    const [p1, p2] = pointerEntries();
    const current = pointerDistance(p1, p2);
    if (current > 0.1) {
      const scale = pinchBaseline / current;
      camera.setDistance(pinchDistanceStart * scale);
    }
  }
});

function releasePointer(id) {
  if (!pointerMap.has(id)) {
    return;
  }
  pointerMap.delete(id);
  try {
    canvas.releasePointerCapture(id);
  } catch (error) {
    // ignore capture release errors
  }

  if (pointerMap.size === 1) {
    const [remain] = pointerEntries();
    lastPointerX = remain.x;
    lastPointerY = remain.y;
    dragging = true;
    canvas.classList.add("dragging");
  } else {
    dragging = false;
    canvas.classList.remove("dragging");
  }
  if (pointerMap.size < 2) {
    pinchBaseline = null;
    pinchDistanceStart = null;
  }
}

canvas.addEventListener("pointerup", (event) => releasePointer(event.pointerId));
canvas.addEventListener("pointercancel", (event) => releasePointer(event.pointerId));
canvas.addEventListener("pointerleave", (event) => releasePointer(event.pointerId));

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const scale = event.deltaMode === 0 ? WHEEL_SPEED_PX : WHEEL_SPEED_LINE;
  camera.dolly(event.deltaY * scale);
});

// --------- Shader ---------
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
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
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
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}

vec3 renderGrass(float parity, vec2 uv, vec2 id) {
  float checker = clamp(mod(parity, 2.0), 0.0, 1.0);
  vec3 dark = vec3(0.05, 0.11, 0.18);
  vec3 light = vec3(0.16, 0.26, 0.32);
  vec3 base = mix(dark, light, checker);
  vec2 tile = uv * 4.0 + id * 0.07;
  float blade = fbm(tile * 3.0 + vec2(uv.y, uv.x) * 9.0);
  float streak = smoothstep(0.15, 0.85, abs(sin((tile.x + tile.y) * 6.2831)));
  vec3 tint = vec3(0.05, 0.16, 0.07) * blade;
  vec3 shadow = vec3(-0.03, -0.05, -0.02) * streak;
  return clamp(base + tint + shadow, 0.0, 1.0);
}

vec3 renderFence(vec2 uv) {
  vec2 woodUv = vec2(uv.x * 4.0, uv.y * 6.0);
  float grain = fbm(woodUv * 2.0);
  vec3 base = vec3(0.36, 0.22, 0.11);
  vec3 highlight = vec3(0.6, 0.42, 0.21);
  vec3 color = mix(base, highlight, grain);
  color += vec3(0.04, 0.02, 0.01) * smoothstep(0.0, 1.0, uv.y);
  return color;
}

vec3 renderExpansion(vec2 uv, vec2 id, float purchased) {
  vec3 soil = vec3(0.18, 0.12, 0.08);
  float noiseVal = fbm(id * 0.15 + uv * 8.0);
  vec3 soilTint = soil + vec3(0.05, 0.03, 0.02) * noiseVal;
  vec3 purchaseColor = vec3(0.21, 0.64, 0.36);
  return mix(soilTint, purchaseColor, purchased);
}

void main() {
  vec2 uv = (vCellCoord + 0.5) / vec2(uWorldSize);
  float purchased = texture(uPurchaseState, uv).r;

  if (vType < 0.5) {
    vec3 grass = renderGrass(vParity, vCellUv, vCellCoord);
    outColor = vec4(grass, 1.0);
    return;
  }

  if (vType < 1.5) {
    vec3 fence = renderFence(vCellUv);
    outColor = vec4(fence, 1.0);
    return;
  }

  vec3 expansion = renderExpansion(vCellUv, vCellCoord, purchased);
  outColor = vec4(expansion, 1.0);
}
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("无法创建 shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader 编译失败: ${info}`);
  }
  return shader;
}

function createProgram(vertexSrc, fragmentSrc) {
  const vertexShader = createShader(gl.VERTEX_SHADER, vertexSrc);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("无法创建 program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program 链接失败: ${info}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

// --------- 几何 ---------
function buildGroundGeometry(totalSize, parkSize) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const half = totalSize / 2;
  const ring = (totalSize - parkSize) / 2;

  for (let x = 0; x < totalSize; x += 1) {
    for (let z = 0; z < totalSize; z += 1) {
      const worldX = x - half;
      const worldZ = z - half;
      const parity = (x + z) % 2;
      const isExpansion =
        x < ring || x >= totalSize - ring || z < ring || z >= totalSize - ring;
      const cellType = isExpansion ? 2 : 0;

      const x0 = worldX;
      const z0 = worldZ;
      const x1 = worldX + 1;
      const z1 = worldZ + 1;

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
  const height = 4;
  const offset = 0.02;

  function pushWallZ(zPos) {
    const xStart = -half;
    const xEnd = half;
    positions.push(
      xStart, 0, zPos,
      xEnd, 0, zPos,
      xEnd, height, zPos,
      xStart, 0, zPos,
      xEnd, height, zPos,
      xStart, height, zPos
    );
    cellCoords.push(
      0, 0,
      1, 0,
      1, 1,
      0, 0,
      1, 1,
      0, 1
    );
    for (let i = 0; i < 6; i += 1) {
      parities.push(0);
      types.push(1);
    }
  }

  function pushWallX(xPos) {
    const zStart = -half;
    const zEnd = half;
    positions.push(
      xPos, 0, zStart,
      xPos, 0, zEnd,
      xPos, height, zEnd,
      xPos, 0, zStart,
      xPos, height, zEnd,
      xPos, height, zStart
    );
    cellCoords.push(
      0, 0,
      1, 0,
      1, 1,
      0, 0,
      1, 1,
      0, 1
    );
    for (let i = 0; i < 6; i += 1) {
      parities.push(0);
      types.push(1);
    }
  }

  pushWallZ(half + offset);
  pushWallZ(-half - offset);
  pushWallX(half + offset);
  pushWallX(-half - offset);

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
const program = createProgram(vertexSource, fragmentSource);

gl.useProgram(program);

function bindGeometry(geometry) {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("无法创建 VAO");
  }
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const coordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, coordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.cellCoords, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

  const parityBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, parityBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.parities, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  const typeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, typeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.types, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, vertexCount: geometry.vertexCount };
}

const groundMesh = bindGeometry(groundGeometry);
const fenceMesh = bindGeometry(fenceGeometry);

const purchaseState = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
const purchaseTexture = gl.createTexture();
if (!purchaseTexture) {
  throw new Error("无法创建购买纹理");
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
  purchaseState
);

gl.useProgram(program);

const uniforms = {
  viewProjection: gl.getUniformLocation(program, "uViewProjection"),
  worldHalf: gl.getUniformLocation(program, "uWorldHalf"),
  worldSize: gl.getUniformLocation(program, "uWorldSize"),
  purchaseState: gl.getUniformLocation(program, "uPurchaseState"),
};

gl.uniform1f(uniforms.worldHalf, HALF_WORLD);
gl.uniform1f(uniforms.worldSize, WORLD_SIZE);
gl.uniform1i(uniforms.purchaseState, 0);

gl.bindVertexArray(null);

const purchasedCells = new Set();
const ringOffset = (WORLD_SIZE - PARK_SIZE) / 2;
let inverseViewProjection = null;

function updatePurchaseTexture(x, z, purchased) {
  const index = z * WORLD_SIZE + x;
  purchaseState[index] = purchased ? 255 : 0;
  const pixel = new Uint8Array([purchaseState[index]]);
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
    pixel
  );
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function render() {
  resizeCanvas();
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
  camera.update(aspect);
  inverseViewProjection = camera.inverseViewProjection;
  gl.uniformMatrix4fv(uniforms.viewProjection, false, camera.viewProjection);

  gl.bindVertexArray(groundMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, groundMesh.vertexCount);

  gl.bindVertexArray(fenceMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, fenceMesh.vertexCount);

  gl.bindVertexArray(null);
  requestAnimationFrame(render);
}

requestAnimationFrame(render);

function clipSpaceFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * -2 + 1;
  return { x, y };
}

function pickCell(event) {
  const clip = clipSpaceFromPointer(event);
  if (!clip || !inverseViewProjection) {
    return null;
  }
  const nearPoint = transformClipToWorld(inverseViewProjection, clip.x, clip.y, -1);
  const farPoint = transformClipToWorld(inverseViewProjection, clip.x, clip.y, 1);
  if (!nearPoint || !farPoint) {
    return null;
  }
  const dir = [
    farPoint[0] - nearPoint[0],
    farPoint[1] - nearPoint[1],
    farPoint[2] - nearPoint[2],
  ];
  if (Math.abs(dir[1]) < 1e-6) {
    return null;
  }
  const t = -nearPoint[1] / dir[1];
  if (t < 0) {
    return null;
  }
  const worldX = nearPoint[0] + dir[0] * t;
  const worldZ = nearPoint[2] + dir[2] * t;
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

function isPurchasable(cell) {
  const { x, z } = cell;
  return (
    x < ringOffset ||
    x >= WORLD_SIZE - ringOffset ||
    z < ringOffset ||
    z >= WORLD_SIZE - ringOffset
  );
}

function updateStatus(message) {
  statusEl.textContent = message;
  purchasedEl.textContent = purchasedCells.size.toString();
  const remaining = Math.max(TOTAL_PURCHASABLE - purchasedCells.size, 0);
  remainingEl.textContent = remaining.toString();
}

canvas.addEventListener("click", (event) => {
  const cell = pickCell(event);
  if (!cell) {
    updateStatus("点击位置超出地块范围，未处理。");
    return;
  }
  if (!isPurchasable(cell)) {
    updateStatus("核心 60 m × 60 m 公园区域已开放，无需购买。");
    return;
  }
  const key = `${cell.x}-${cell.z}`;
  if (purchasedCells.has(key)) {
    updateStatus(`扩展格 (${cell.x + 1}, ${cell.z + 1}) 已购入。`);
    return;
  }

  const confirmed = window.confirm(
    `是否购买靠近木栅栏的扩展格 (${cell.x + 1}, ${cell.z + 1})？`
  );
  if (!confirmed) {
    updateStatus("已取消本次购买。");
    return;
  }

  purchasedCells.add(key);
  updatePurchaseTexture(cell.x, cell.z, true);
  updateStatus(`成功购入扩展格 (${cell.x + 1}, ${cell.z + 1})！`);
});

updateStatus("尚未进行任何购买。");
