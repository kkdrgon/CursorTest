function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const PARK_SIZE = 60;
const MAX_EXPANSION_MARGIN = 20; // 初始公园外最多可扩展 20 格
const WORLD_SIZE = PARK_SIZE + MAX_EXPANSION_MARGIN * 2;
const HALF_WORLD = WORLD_SIZE / 2;
const CORE_MIN = Math.floor(HALF_WORLD - PARK_SIZE / 2);
const CORE_MAX = CORE_MIN + PARK_SIZE;
const TOTAL_PURCHASABLE = WORLD_SIZE * WORLD_SIZE - PARK_SIZE * PARK_SIZE;

const MIN_DISTANCE = 4;
const MAX_DISTANCE = 30;
const MIN_PITCH = degToRad(20);
const MAX_PITCH = degToRad(80);

const canvas = document.getElementById("viewport");
const gl = canvas.getContext("webgl2", { antialias: true, depth: true });
if (!gl) {
  throw new Error("当前浏览器不支持 WebGL2，请升级或更换浏览器。");
}

gl.clearColor(0.01, 0.02, 0.05, 1);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.disable(gl.CULL_FACE);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

const statusEl = document.getElementById("status");
const remainingEl = document.getElementById("remaining");
const purchasedEl = document.getElementById("purchased");

const occupancy = new Uint8Array(WORLD_SIZE * WORLD_SIZE);

function cellIndex(x, z) {
  return z * WORLD_SIZE + x;
}

function isCellOccupied(x, z) {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) {
    return false;
  }
  return occupancy[cellIndex(x, z)] === 1;
}

function markCellOccupied(cell) {
  occupancy[cellIndex(cell.x, cell.z)] = 1;
}

function hasOccupiedNeighbor(x, z) {
  return (
    isCellOccupied(x + 1, z) ||
    isCellOccupied(x - 1, z) ||
    isCellOccupied(x, z + 1) ||
    isCellOccupied(x, z - 1)
  );
}

(function initializeCoreOccupancy() {
  for (let x = CORE_MIN; x < CORE_MAX; x += 1) {
    for (let z = CORE_MIN; z < CORE_MAX; z += 1) {
      occupancy[cellIndex(x, z)] = 1;
    }
  }
})();

const player = {
  cellX: Math.floor((CORE_MIN + CORE_MAX) / 2),
  cellZ: Math.floor((CORE_MIN + CORE_MAX) / 2),
  worldX: 0,
  worldZ: 0,
};

function updatePlayerWorldPosition() {
  player.worldX = player.cellX - HALF_WORLD + 0.5;
  player.worldZ = player.cellZ - HALF_WORLD + 0.5;
}

updatePlayerWorldPosition();

const movementKeys = {
  ArrowUp: { dx: 0, dz: -1 },
  ArrowDown: { dx: 0, dz: 1 },
  ArrowLeft: { dx: -1, dz: 0 },
  ArrowRight: { dx: 1, dz: 0 },
  w: { dx: 0, dz: -1 },
  s: { dx: 0, dz: 1 },
  a: { dx: -1, dz: 0 },
  d: { dx: 1, dz: 0 },
};

function tryMovePlayer(dx, dz) {
  const targetX = player.cellX + dx;
  const targetZ = player.cellZ + dz;
  if (!isCellOccupied(targetX, targetZ)) {
    return;
  }
  player.cellX = targetX;
  player.cellZ = targetZ;
  updatePlayerWorldPosition();
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const dir = movementKeys[key];
  if (!dir || event.repeat) {
    return;
  }
  event.preventDefault();
  tryMovePlayer(dir.dx, dir.dz);
});

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

class OrbitCamera {
  constructor() {
    this.distance = 8;
    this.yaw = degToRad(-135);
    this.pitch = degToRad(45);
    this.target = [0, 0, 0];
    this.position = [0, 0, 0];
    this.view = Mat4.create();
    this.projection = Mat4.create();
    this.viewProjection = Mat4.create();
    this.inverseViewProjection = Mat4.create();
  }

  rotate(deltaX, deltaY, speed) {
    this.yaw += deltaX * speed;
    this.pitch = clamp(this.pitch - deltaY * speed, MIN_PITCH, MAX_PITCH);
  }

  dolly(delta) {
    this.distance = clamp(this.distance + delta, MIN_DISTANCE, MAX_DISTANCE);
  }

  setDistance(next) {
    this.distance = clamp(next, MIN_DISTANCE, MAX_DISTANCE);
  }

  setTarget(x, y, z) {
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
  }

  update(aspect) {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.position[0] = this.target[0] + cy * cp * this.distance;
    this.position[1] = this.target[1] + sp * this.distance;
    this.position[2] = this.target[2] + sy * cp * this.distance;

    Mat4.lookAt(this.view, this.position, this.target, [0, 1, 0]);
    Mat4.perspective(this.projection, degToRad(50), aspect, 0.1, 400);
    Mat4.multiply(this.viewProjection, this.projection, this.view);
    Mat4.invert(this.inverseViewProjection, this.viewProjection);
  }
}

const camera = new OrbitCamera();

const vertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aCellCoord;
layout(location = 2) in float aParity;
layout(location = 3) in float aType;

uniform mat4 uViewProjection;
uniform float uWorldHalf;
uniform vec3 uPlayerOffset;

out vec2 vCellCoord;
out float vParity;
out vec2 vCellUv;
out float vType;

void main() {
  vec3 worldPosition = aPosition;
  if (aType > 2.5) {
    worldPosition += uPlayerOffset;
  }
  gl_Position = uViewProjection * vec4(worldPosition, 1.0);
  vCellCoord = aCellCoord;
  vParity = aParity;
  vec2 worldPos = vec2(worldPosition.x + uWorldHalf, worldPosition.z + uWorldHalf);
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

void main() {
  vec2 uv = (vCellCoord + 0.5) / vec2(uWorldSize);

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

  if (vType < 2.5) {
    vec3 expansionGrass = renderGrass(vParity, vCellUv, vCellCoord);
    outColor = vec4(expansionGrass, 1.0);
    return;
  }

  vec3 playerColor = vec3(0.95, 0.85, 0.32);
  outColor = vec4(playerColor, 1.0);
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

function buildFenceGeometryFromOccupancy() {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];

  const POST_SIZE = 0.1;
  const POST_HALF = POST_SIZE / 2;
  const POST_HEIGHT = 1.0;
  const RAIL_THICKNESS = 0.08;
  const RAIL_HALF = RAIL_THICKNESS / 2;
  const RAIL_CENTER = 0.55;

  function pushBox(minBX, minBY, minBZ, maxBX, maxBY, maxBZ) {
    if (maxBX - minBX <= 0 || maxBY - minBY <= 0 || maxBZ - minBZ <= 0) {
      return;
    }
    const width = Math.max(maxBX - minBX, 0.0001);
    const height = Math.max(maxBY - minBY, 0.0001);
    const depth = Math.max(maxBZ - minBZ, 0.0001);

    function uv(value, min, range) {
      return range === 0 ? 0 : (value - min) / range;
    }

    function addFace(v0, v1, v2, v3, axisU, axisV) {
      const verts = [v0, v1, v2, v0, v2, v3];
      for (const vert of verts) {
        positions.push(vert[0], vert[1], vert[2]);
        const u =
          axisU === "x" ? uv(vert[0], minBX, width) :
          axisU === "y" ? uv(vert[1], minBY, height) :
          uv(vert[2], minBZ, depth);
        const v =
          axisV === "x" ? uv(vert[0], minBX, width) :
          axisV === "y" ? uv(vert[1], minBY, height) :
          uv(vert[2], minBZ, depth);
        cellCoords.push(u, v);
        parities.push(0);
        types.push(1);
      }
    }

    addFace(
      [minBX, minBY, maxBZ],
      [maxBX, minBY, maxBZ],
      [maxBX, maxBY, maxBZ],
      [minBX, maxBY, maxBZ],
      "x",
      "y"
    );
    addFace(
      [maxBX, minBY, minBZ],
      [minBX, minBY, minBZ],
      [minBX, maxBY, minBZ],
      [maxBX, maxBY, minBZ],
      "x",
      "y"
    );
    addFace(
      [minBX, minBY, minBZ],
      [minBX, minBY, maxBZ],
      [minBX, maxBY, maxBZ],
      [minBX, maxBY, minBZ],
      "z",
      "y"
    );
    addFace(
      [maxBX, minBY, maxBZ],
      [maxBX, minBY, minBZ],
      [maxBX, maxBY, minBZ],
      [maxBX, maxBY, maxBZ],
      "z",
      "y"
    );
    addFace(
      [minBX, maxBY, maxBZ],
      [maxBX, maxBY, maxBZ],
      [maxBX, maxBY, minBZ],
      [minBX, maxBY, minBZ],
      "x",
      "z"
    );
    addFace(
      [minBX, minBY, minBZ],
      [maxBX, minBY, minBZ],
      [maxBX, minBY, maxBZ],
      [minBX, minBY, maxBZ],
      "x",
      "z"
    );
  }

  function addPost(px, pz) {
    pushBox(
      px - POST_HALF,
      0,
      pz - POST_HALF,
      px + POST_HALF,
      POST_HEIGHT,
      pz + POST_HALF
    );
  }

  function addRailAlongZ(xCoord, zStart, zEnd) {
    pushBox(
      xCoord - RAIL_HALF,
      RAIL_CENTER - RAIL_HALF,
      zStart,
      xCoord + RAIL_HALF,
      RAIL_CENTER + RAIL_HALF,
      zEnd
    );
  }

  function addRailAlongX(zCoord, xStart, xEnd) {
    pushBox(
      xStart,
      RAIL_CENTER - RAIL_HALF,
      zCoord - RAIL_HALF,
      xEnd,
      RAIL_CENTER + RAIL_HALF,
      zCoord + RAIL_HALF
    );
  }

  function addEdgeAlongZ(xCoord, zStart, zEnd) {
    addPost(xCoord, zStart);
    addPost(xCoord, zEnd);
    addRailAlongZ(xCoord, zStart, zEnd);
  }

  function addEdgeAlongX(zCoord, xStart, xEnd) {
    addPost(xStart, zCoord);
    addPost(xEnd, zCoord);
    addRailAlongX(zCoord, xStart, xEnd);
  }

  for (let x = 0; x < WORLD_SIZE; x += 1) {
    for (let z = 0; z < WORLD_SIZE; z += 1) {
      if (!isCellOccupied(x, z)) {
        continue;
      }
      const worldX = x - HALF_WORLD;
      const worldZ = z - HALF_WORLD;
      const x0 = worldX;
      const x1 = worldX + 1;
      const z0 = worldZ;
      const z1 = worldZ + 1;

      if (!isCellOccupied(x + 1, z)) {
        addEdgeAlongZ(x1, z0, z1);
      }
      if (!isCellOccupied(x - 1, z)) {
        addEdgeAlongZ(x0, z0, z1);
      }
      if (!isCellOccupied(x, z + 1)) {
        addEdgeAlongX(z1, x0, x1);
      }
      if (!isCellOccupied(x, z - 1)) {
        addEdgeAlongX(z0, x0, x1);
      }
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

function buildPlayerGeometry() {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];

  const width = 0.4;
  const depth = 0.4;
  const height = 1.4;
  const halfW = width / 2;
  const halfD = depth / 2;

  function addFace(a, b, c, d) {
    positions.push(
      ...a, ...b, ...c,
      ...a, ...c, ...d
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
      types.push(3);
    }
  }

  const top = height;
  addFace(
    [-halfW, 0, halfD],
    [halfW, 0, halfD],
    [halfW, top, halfD],
    [-halfW, top, halfD]
  );
  addFace(
    [halfW, 0, -halfD],
    [-halfW, 0, -halfD],
    [-halfW, top, -halfD],
    [halfW, top, -halfD]
  );
  addFace(
    [-halfW, 0, -halfD],
    [-halfW, 0, halfD],
    [-halfW, top, halfD],
    [-halfW, top, -halfD]
  );
  addFace(
    [halfW, 0, halfD],
    [halfW, 0, -halfD],
    [halfW, top, -halfD],
    [halfW, top, halfD]
  );
  addFace(
    [-halfW, top, halfD],
    [halfW, top, halfD],
    [halfW, top, -halfD],
    [-halfW, top, -halfD]
  );
  addFace(
    [-halfW, 0, -halfD],
    [halfW, 0, -halfD],
    [halfW, 0, halfD],
    [-halfW, 0, halfD]
  );

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    vertexCount: positions.length / 3,
  };
}

function bindGeometry(geometry) {
  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error("无法创建 VAO");
  }
  gl.bindVertexArray(vao);
  const buffers = [];

  const positionBuffer = gl.createBuffer();
  buffers.push(positionBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const coordBuffer = gl.createBuffer();
  buffers.push(coordBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, coordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.cellCoords, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

  const parityBuffer = gl.createBuffer();
  buffers.push(parityBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, parityBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.parities, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  const typeBuffer = gl.createBuffer();
  buffers.push(typeBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, typeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.types, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, vertexCount: geometry.vertexCount, buffers };
}

function deleteMesh(mesh) {
  if (!mesh) {
    return;
  }
  gl.deleteVertexArray(mesh.vao);
  mesh.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
}

const groundGeometry = buildGroundGeometry(WORLD_SIZE, PARK_SIZE);
const groundMesh = bindGeometry(groundGeometry);
const playerGeometry = buildPlayerGeometry();
const playerMesh = bindGeometry(playerGeometry);

function createFenceMeshFromOccupancy() {
  const geometry = buildFenceGeometryFromOccupancy();
  return bindGeometry(geometry);
}

let fenceMesh = createFenceMeshFromOccupancy();

function rebuildFenceMesh() {
  deleteMesh(fenceMesh);
  fenceMesh = createFenceMeshFromOccupancy();
}

const program = createProgram(vertexSource, fragmentSource);
gl.useProgram(program);

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

const uniforms = {
  viewProjection: gl.getUniformLocation(program, "uViewProjection"),
  worldHalf: gl.getUniformLocation(program, "uWorldHalf"),
  worldSize: gl.getUniformLocation(program, "uWorldSize"),
  purchaseState: gl.getUniformLocation(program, "uPurchaseState"),
  playerOffset: gl.getUniformLocation(program, "uPlayerOffset"),
};

gl.uniform1f(uniforms.worldHalf, HALF_WORLD);
gl.uniform1f(uniforms.worldSize, WORLD_SIZE);
gl.uniform1i(uniforms.purchaseState, 0);
gl.uniform3f(uniforms.playerOffset, 0, 0, 0);

const purchasedCells = new Set();
let inverseViewProjection = camera.inverseViewProjection;

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
  camera.setTarget(player.worldX, 0.8, player.worldZ);
  camera.update(aspect);
  inverseViewProjection = camera.inverseViewProjection;
  gl.uniformMatrix4fv(uniforms.viewProjection, false, camera.viewProjection);

  gl.bindVertexArray(groundMesh.vao);
  gl.uniform3f(uniforms.playerOffset, 0, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, groundMesh.vertexCount);

  gl.bindVertexArray(fenceMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, fenceMesh.vertexCount);

  gl.bindVertexArray(playerMesh.vao);
  gl.uniform3f(uniforms.playerOffset, player.worldX, 0, player.worldZ);
  gl.drawArrays(gl.TRIANGLES, 0, playerMesh.vertexCount);

  gl.bindVertexArray(null);
  gl.uniform3f(uniforms.playerOffset, 0, 0, 0);
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

function transformClipToWorld(matrix, x, y, z) {
  if (!matrix) {
    return null;
  }
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
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) {
    return false;
  }
  if (isCellOccupied(x, z)) {
    return false;
  }
  return hasOccupiedNeighbor(x, z);
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
    updateStatus("核心 60 m × 60 m 公园区域已开放，此处无需购买。");
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
  markCellOccupied(cell);
  rebuildFenceMesh();
  updateStatus(`成功购入扩展格 (${cell.x + 1}, ${cell.z + 1})！`);
});

updateStatus("尚未进行任何购买。");
