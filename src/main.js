const DEG2RAD = Math.PI / 180;
const MATERIAL_DEFAULT = 0;
const MATERIAL_GROUND = 1;
const STATION_SIZE = Object.freeze({ width: 6, depth: 4, height: 2.5 });
const TIE_HEIGHT = 0.1;
const RAIL_HEIGHT = 0.1;
const RAIL_WIDTH_MIN = 0.05;
const RAIL_WIDTH_MAX = 0.12;
const RAIL_INSET_FACTOR = 0.25;
const RAIL_BASE_OFFSET = 0;
const TIE_LENGTH = 0.45;
const TIE_SPACING = 0.6;
const TIE_EXTRA_WIDTH = 0.4;
const TRACK_CLEARANCE = TIE_HEIGHT;
const SAMPLE_INTERVAL = 0.2;
const TRACK_HALF_WIDTH = 0.75;
const TRACK_DECK_THICKNESS = 0.05;
const RAIL_GAUGE = 1.0;
const PARK_LIGHT_COLOR = [0.2, 0.28, 0.36];
const PARK_DARK_COLOR = [0.14, 0.2, 0.27];

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
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
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
  const a00 = m[0],
    a01 = m[1],
    a02 = m[2],
    a03 = m[3];
  const a10 = m[4],
    a11 = m[5],
    a12 = m[6],
    a13 = m[7];
  const a20 = m[8],
    a21 = m[9],
    a22 = m[10],
    a23 = m[11];
  const a30 = m[12],
    a31 = m[13],
    a32 = m[14],
    a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det =
    b00 * b11 -
    b01 * b10 +
    b02 * b09 +
    b03 * b08 -
    b04 * b07 +
    b05 * b06;

  if (!det) {
    return mat4Identity();
  }
  det = 1.0 / det;

  const out = new Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
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

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function parseTileKey(key) {
  const parts = key.split(",").map((v) => parseInt(v, 10));
  return { ix: parts[0], iz: parts[1] };
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
    this.theta += deltaX * rotSpeed;
    this.phi += deltaY * rotSpeed;
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
      buffer,
      vertexCount,
      mode: gl.TRIANGLES,
    };
  }

  disposeMesh(mesh) {
    if (!mesh) return;
    const gl = this.gl;
    if (mesh.vao) {
      gl.deleteVertexArray(mesh.vao);
    }
    if (mesh.buffer) {
      gl.deleteBuffer(mesh.buffer);
    }
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
    if (scene.parkMeshes && scene.parkMeshes.length) {
      gl.disable(gl.CULL_FACE);
      for (const tileMesh of scene.parkMeshes) {
        this.drawMesh(tileMesh.mesh, tileMesh.color, MATERIAL_GROUND);
      }
      gl.enable(gl.CULL_FACE);
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

void main() {
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;

uniform vec3 uColor;
uniform vec3 uLightDir;
uniform int uMaterial;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  float diff = max(dot(normal, normalize(uLightDir)), 0.0);
  float lighting = 0.25 + diff * 0.9;
  if (uMaterial == 1) {
    lighting = 0.55 + diff * 0.4;
  }
  vec3 color = uColor * lighting;
  outColor = vec4(color, 1.0);
}
`;

/* ---------- 几何构造 ---------- */
function buildCheckerGeometry(tileCoords, cellSize, y = -0.01) {
  const even = { positions: [], normals: [] };
  const odd = { positions: [], normals: [] };

  const appendTile = (target, minX, maxX, minZ, maxZ) => {
    const topLeft = [minX, y, minZ];
    const topRight = [maxX, y, minZ];
    const bottomLeft = [minX, y, maxZ];
    const bottomRight = [maxX, y, maxZ];
    const normal = [0, 1, 0];
    const pushTri = (a, b, c) => {
      target.positions.push(...a, ...b, ...c);
      target.normals.push(...normal, ...normal, ...normal);
    };
    pushTri(topLeft, bottomLeft, bottomRight);
    pushTri(topLeft, bottomRight, topRight);
  };

  for (const { ix, iz } of tileCoords) {
    const minX = ix * cellSize;
    const maxX = minX + cellSize;
    const minZ = iz * cellSize;
    const maxZ = minZ + cellSize;
    const target = (Math.abs(ix + iz) & 1) === 0 ? even : odd;
    appendTile(target, minX, maxX, minZ, maxZ);
  }
  return { even, odd };
}

function createStationGeometry(position, size = STATION_SIZE) {
  const { width, depth, height } = size;
  const hx = width / 2;
  const hz = depth / 2;
  const bottomY = position[1];
  const topY = position[1] + height;
  const x0 = position[0] - hx;
  const x1 = position[0] + hx;
  const z0 = position[2] - hz;
  const z1 = position[2] + hz;

  const corners = {
    bfl: [x0, bottomY, z1],
    bfr: [x1, bottomY, z1],
    bbl: [x0, bottomY, z0],
    bbr: [x1, bottomY, z0],
    tfl: [x0, topY, z1],
    tfr: [x1, topY, z1],
    tbl: [x0, topY, z0],
    tbr: [x1, topY, z0],
  };

  const positions = [];
  const normals = [];

  const pushTri = (a, b, c, normal) => {
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
  };

  const pushQuad = (a, b, c, d, normal) => {
    pushTri(a, b, c, normal);
    pushTri(a, c, d, normal);
  };

  // Top (facing +Y): ensure CCW order when looking downwards
  pushQuad(corners.tfl, corners.tfr, corners.tbr, corners.tbl, [0, 1, 0]);
  // Bottom (facing -Y)
  pushQuad(corners.bfr, corners.bfl, corners.bbl, corners.bbr, [0, -1, 0]);

  // Front (+Z)
  pushQuad(corners.tfl, corners.bfl, corners.bfr, corners.tfr, [0, 0, 1]);
  // Back (-Z)
  pushQuad(corners.tbr, corners.bbr, corners.bbl, corners.tbl, [0, 0, -1]);
  // Left (-X)
  pushQuad(corners.tbl, corners.bbl, corners.bfl, corners.tfl, [-1, 0, 0]);
  // Right (+X)
  pushQuad(corners.tfr, corners.bfr, corners.bbr, corners.tbr, [1, 0, 0]);

  return { positions, normals };
}

function sampleStraightModule(params, startPose) {
  const length = Math.max(0.2, Number(params.length) || 0);
  const rise = Number(params.rise) || 0;
  const forward = [Math.cos(startPose.heading), 0, Math.sin(startPose.heading)];
  const samples = [];
  let prevPos = [...startPose.position];
  let progressed = 0;
  while (progressed < length - 1e-4) {
    const step = Math.min(SAMPLE_INTERVAL, length - progressed);
    progressed += step;
    const t = length === 0 ? 0 : progressed / length;
    const pos = [
      startPose.position[0] + forward[0] * progressed,
      startPose.position[1] + rise * t,
      startPose.position[2] + forward[2] * progressed,
    ];
    const tangent = normalizeOrFallback(subVec3(pos, prevPos), forward);
    samples.push({ position: pos, tangent });
    prevPos = pos;
  }
  return {
    samples,
    endPose: { position: prevPos, heading: startPose.heading },
    totalLength: length,
  };
}

function sampleArcModule(params, startPose) {
  const radius = Math.max(0.5, Number(params.radius) || 0);
  const angleDeg = Number(params.angle) || 0;
  const signedDir = params.direction >= 0 ? 1 : -1;
  const angle = Math.abs(angleDeg) * DEG2RAD;
  const rise = Number(params.rise) || 0;
  const startPoint = startPose.position;
  const tangent = [Math.cos(startPose.heading), 0, Math.sin(startPose.heading)];
  const perpendicular =
    signedDir === 1
      ? [-tangent[2], 0, tangent[0]]
      : [tangent[2], 0, -tangent[0]];
  const center = [
    startPoint[0] + perpendicular[0] * radius,
    startPoint[1],
    startPoint[2] + perpendicular[2] * radius,
  ];
  const startAngle = Math.atan2(
    startPoint[2] - center[2],
    startPoint[0] - center[0]
  );
  const arcLength = radius * angle;
  const steps = Math.max(1, Math.round(arcLength / SAMPLE_INTERVAL));
  const samples = [];
  let prevPos = [...startPoint];
  for (let i = 1; i <= steps; i++) {
    const theta = startAngle + signedDir * angle * (i / steps);
    const pos = [
      center[0] + radius * Math.cos(theta),
      startPoint[1] + rise * (i / steps),
      center[2] + radius * Math.sin(theta),
    ];
    const tangentVec = normalizeOrFallback(subVec3(pos, prevPos), tangent);
    samples.push({ position: pos, tangent: tangentVec });
    prevPos = pos;
  }
  return {
    samples,
    endPose: {
      position: prevPos,
      heading: wrapAngle(startPose.heading + signedDir * angle),
    },
    totalLength: arcLength,
  };
}

function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    mt2 * mt * p0[0] +
      3 * mt2 * t * p1[0] +
      3 * mt * t2 * p2[0] +
      t2 * t * p3[0],
    mt2 * mt * p0[1] +
      3 * mt2 * t * p1[1] +
      3 * mt * t2 * p2[1] +
      t2 * t * p3[1],
    mt2 * mt * p0[2] +
      3 * mt2 * t * p1[2] +
      3 * mt * t2 * p2[2] +
      t2 * t * p3[2],
  ];
}

function sampleBezierModule(params, startPose) {
  const cp1 = [
    Number(params.bz1x) || 5,
    Number(params.bz1y) || 0,
    Number(params.bz1z) || 0,
  ];
  const cp2 = [
    Number(params.bz2x) || 10,
    Number(params.bz2y) || 0,
    Number(params.bz2z) || 0,
  ];
  const cp3 = [
    Number(params.bz3x) || 15,
    Number(params.bz3y) || 0,
    Number(params.bz3z) || 0,
  ];
  const p0 = [...startPose.position];
  const p1 = localToWorldVector(startPose, cp1);
  const p2 = localToWorldVector(startPose, cp2);
  const p3 = localToWorldVector(startPose, cp3);
  const approxLength =
    lengthVec3(subVec3(p1, p0)) +
    lengthVec3(subVec3(p2, p1)) +
    lengthVec3(subVec3(p3, p2));
  const segments = Math.max(
    20,
    Math.round(Math.max(approxLength, 1) / SAMPLE_INTERVAL) * 5
  );
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(cubicBezier(p0, p1, p2, p3, t));
  }
  const samples = [];
  let travelled = 0;
  let nextSampleAt = SAMPLE_INTERVAL;
  let prevPoint = points[0];
  for (let i = 1; i < points.length; i++) {
    const currPoint = points[i];
    const segVec = subVec3(currPoint, prevPoint);
    const segLen = lengthVec3(segVec);
    if (segLen === 0) {
      prevPoint = currPoint;
      continue;
    }
    while (travelled + segLen >= nextSampleAt) {
      const ratio = (nextSampleAt - travelled) / segLen;
      const pos = [
        prevPoint[0] + segVec[0] * ratio,
        prevPoint[1] + segVec[1] * ratio,
        prevPoint[2] + segVec[2] * ratio,
      ];
      const tangent = normalizeVec3(segVec);
      samples.push({ position: pos, tangent });
      nextSampleAt += SAMPLE_INTERVAL;
    }
    travelled += segLen;
    prevPoint = currPoint;
  }
  if (samples.length === 0) {
    const tangent = normalizeVec3(subVec3(p3, p0));
    samples.push({ position: [...p3], tangent });
    travelled = lengthVec3(subVec3(p3, p0));
  }
  const endTangent =
    samples[samples.length - 1]?.tangent ||
    normalizeVec3(subVec3(p3, points[points.length - 2]));
  return {
    samples,
    endPose: {
      position: [...samples[samples.length - 1].position],
      heading: wrapAngle(Math.atan2(endTangent[2], endTangent[0])),
    },
    totalLength: travelled,
  };
}

function sampleModule(module, startPose) {
  if (!module) return { error: "未选择轨道单元。" };
  switch (module.type) {
    case "straight":
      return sampleStraightModule(module.params, startPose);
    case "arc":
      return sampleArcModule(module.params, startPose);
    case "bezier":
      return sampleBezierModule(module.params, startPose);
    default:
      return { error: "未知的轨道单元类型。" };
  }
}

function computeTangents(samples) {
  const tangents = [];
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[i - 1]?.position || samples[i].position;
    const next = samples[i + 1]?.position || samples[i].position;
    tangents[i] = normalizeVec3(subVec3(next, prev));
  }
  return tangents;
}

function buildTrackMeshFromSamples(samples) {
  if (!samples || samples.length < 2) {
    return null;
  }
  const tangents = computeTangents(samples);
  const topInner = [];
  const topOuter = [];
  const bottomInner = [];
  const bottomOuter = [];
  const railCenterLine = [];
  const lateralDirs = [];
  const gaugeValues = [];
  const positions = [];
  const normals = [];

  const pushTri = (a, b, c) => {
    const ab = subVec3(b, a);
    const ac = subVec3(c, a);
    const normal = normalizeVec3(crossVec3(ab, ac));
    positions.push(...a, ...b, ...c);
    normals.push(...normal, ...normal, ...normal);
  };

  const pushQuad = (a, b, c, d) => {
    pushTri(a, b, c);
    pushTri(a, c, d);
  };

  let previousLateral = [1, 0, 0];
  for (let i = 0; i < samples.length; i++) {
    const center = samples[i].position;
    let lateral = crossVec3([0, 1, 0], tangents[i]);
    if (lengthVec3(lateral) < 1e-5) {
      lateral = previousLateral;
    } else {
      lateral = normalizeVec3(lateral);
    }
    previousLateral = lateral;
    const deckTop = center[1] - TIE_HEIGHT;
    const deckBottom = deckTop - TRACK_DECK_THICKNESS;
    const offset = scaleVec3(lateral, TRACK_HALF_WIDTH);
    const innerTop = [
      center[0] - offset[0],
      deckTop,
      center[2] - offset[2],
    ];
    const outerTop = [
      center[0] + offset[0],
      deckTop,
      center[2] + offset[2],
    ];
    const innerBottom = [innerTop[0], deckBottom, innerTop[2]];
    const outerBottom = [outerTop[0], deckBottom, outerTop[2]];
    topInner.push(innerTop);
    topOuter.push(outerTop);
    bottomInner.push(innerBottom);
    bottomOuter.push(outerBottom);
    railCenterLine.push([...center]);
    lateralDirs.push(lateral);
    gaugeValues.push(RAIL_GAUGE);
  }

  for (let i = 0; i < samples.length - 1; i++) {
    pushQuad(topInner[i], topOuter[i], topOuter[i + 1], topInner[i + 1]);
    pushQuad(
      bottomInner[i],
      bottomInner[i + 1],
      bottomOuter[i + 1],
      bottomOuter[i]
    );
    pushQuad(
      bottomOuter[i],
      bottomOuter[i + 1],
      topOuter[i + 1],
      topOuter[i]
    );
    pushQuad(
      bottomInner[i + 1],
      bottomInner[i],
      topInner[i],
      topInner[i + 1]
    );
  }

  const emitStrip = (bottomA, bottomB, topA, topB) => {
    for (let i = 0; i < bottomA.length - 1; i++) {
      pushQuad(topA[i], topB[i], topB[i + 1], topA[i + 1]);
      pushQuad(bottomA[i], bottomA[i + 1], topA[i + 1], topA[i]);
      pushQuad(topB[i], topB[i + 1], bottomB[i + 1], bottomB[i]);
    }
    pushQuad(bottomA[0], bottomB[0], topB[0], topA[0]);
    const last = bottomA.length - 1;
    pushQuad(bottomA[last], topA[last], topB[last], bottomB[last]);
  };

  const buildRailStrip = (useInner) => {
    const bottomInnerEdge = [];
    const bottomOuterEdge = [];
    const topInnerEdge = [];
    const topOuterEdge = [];
    for (let i = 0; i < topInner.length; i++) {
      const lateral = lateralDirs[i];
      const gauge = gaugeValues[i];
      const width = clamp(gauge * 0.15, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX);
      const inset = Math.min(gauge * RAIL_INSET_FACTOR, gauge * 0.4);
      const baseEdge = useInner ? topInner[i] : topOuter[i];
      const baseY = railCenterLine[i][1];
      const direction = useInner ? 1 : -1;
      const baseCenter = [
        baseEdge[0] + lateral[0] * direction * (inset + width * 0.5),
        baseY + RAIL_BASE_OFFSET,
        baseEdge[2] + lateral[2] * direction * (inset + width * 0.5),
      ];
      const halfWidthVec = scaleVec3(lateral, width * 0.5);
      const bottomInnerPoint = subVec3(baseCenter, halfWidthVec);
      const bottomOuterPoint = addVec3(baseCenter, halfWidthVec);
      const heightVec = [0, RAIL_HEIGHT, 0];
      const topInnerPoint = addVec3(bottomInnerPoint, heightVec);
      const topOuterPoint = addVec3(bottomOuterPoint, heightVec);
      bottomInnerEdge.push(bottomInnerPoint);
      bottomOuterEdge.push(bottomOuterPoint);
      topInnerEdge.push(topInnerPoint);
      topOuterEdge.push(topOuterPoint);
    }
    emitStrip(bottomInnerEdge, bottomOuterEdge, topInnerEdge, topOuterEdge);
  };

  buildRailStrip(true);
  buildRailStrip(false);

  const addSleeper = (index) => {
    const topCenter = railCenterLine[index];
    const forward = normalizeOrFallback(tangents[index], [1, 0, 0]);
    const sideDir = lateralDirs[index];
    const halfWidthVec = scaleVec3(
      sideDir,
      (gaugeValues[index] + TIE_EXTRA_WIDTH) * 0.5
    );
    const halfLengthVec = scaleVec3(forward, TIE_LENGTH * 0.5);
    const dropVec = [0, TIE_HEIGHT, 0];

    const topFrontLeft = addVec3(
      addVec3(topCenter, scaleVec3(halfWidthVec, -1)),
      halfLengthVec
    );
    const topFrontRight = addVec3(
      addVec3(topCenter, halfWidthVec),
      halfLengthVec
    );
    const topBackRight = addVec3(
      addVec3(topCenter, halfWidthVec),
      scaleVec3(halfLengthVec, -1)
    );
    const topBackLeft = addVec3(
      addVec3(topCenter, scaleVec3(halfWidthVec, -1)),
      scaleVec3(halfLengthVec, -1)
    );

    const bottomFrontLeft = subVec3(topFrontLeft, dropVec);
    const bottomFrontRight = subVec3(topFrontRight, dropVec);
    const bottomBackRight = subVec3(topBackRight, dropVec);
    const bottomBackLeft = subVec3(topBackLeft, dropVec);

    pushQuad(topFrontLeft, topFrontRight, topBackRight, topBackLeft);
    pushQuad(
      bottomFrontRight,
      bottomFrontLeft,
      bottomBackLeft,
      bottomBackRight
    );
    pushQuad(bottomFrontLeft, bottomBackLeft, topBackLeft, topFrontLeft);
    pushQuad(topFrontRight, topBackRight, bottomBackRight, bottomFrontRight);
    pushQuad(topBackLeft, topBackRight, bottomBackRight, bottomBackLeft);
    pushQuad(
      bottomFrontLeft,
      bottomFrontRight,
      topFrontRight,
      topFrontLeft
    );
  };

  addSleeper(0);
  let accumulated = 0;
  for (let i = 1; i < railCenterLine.length; i++) {
    const segmentLength = lengthVec3(
      subVec3(railCenterLine[i], railCenterLine[i - 1])
    );
    accumulated += segmentLength;
    if (accumulated >= TIE_SPACING || i === railCenterLine.length - 1) {
      addSleeper(i);
      accumulated = 0;
    }
  }

  return { positions, normals };
}

function ensureCoasterSamples(coaster) {
  if (!coaster.samples || coaster.samples.length === 0) {
    const heading = coaster.cursorPose?.heading || 0;
    const tangent = [Math.cos(heading), 0, Math.sin(heading)];
    coaster.samples = [
      {
        position: [...coaster.cursorPose.position],
        tangent,
      },
    ];
  }
}

/* ---------- 游戏状态 ---------- */
class GameState {
  constructor() {
    this.money = 100000000;
    this.stationCost = 500;
    this.tileCost = 200;
    this.segmentCostPerMeter = 120;
    this.stations = [];
    this.coasters = [];
    this.tracks = [];
    this.mode = "idle";
    this.selectedStationId = null;
    this.stationCounter = 0;
    this.coasterCounter = 0;
    this.segmentCounter = 0;
    this.cellSize = 1;
    this.initialParkSize = 60;
    this.purchasedTiles = new Set();
    this.tileBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this.initializePark();
  }

  initializePark() {
    const cellsPerAxis = Math.max(
      1,
      Math.round(this.initialParkSize / this.cellSize)
    );
    const half = Math.floor(cellsPerAxis / 2);
    const start = -half;
    const end = start + cellsPerAxis;
    for (let ix = start; ix < end; ix++) {
      for (let iz = start; iz < end; iz++) {
        this.purchasedTiles.add(tileKey(ix, iz));
      }
    }
    this.tileBounds = {
      minX: start,
      maxX: end - 1,
      minZ: start,
      maxZ: end - 1,
    };
  }

  updateTileBounds(ix, iz) {
    if (this.purchasedTiles.size === 0) {
      this.tileBounds = { minX: ix, maxX: ix, minZ: iz, maxZ: iz };
      return;
    }
    this.tileBounds.minX = Math.min(this.tileBounds.minX, ix);
    this.tileBounds.maxX = Math.max(this.tileBounds.maxX, ix);
    this.tileBounds.minZ = Math.min(this.tileBounds.minZ, iz);
    this.tileBounds.maxZ = Math.max(this.tileBounds.maxZ, iz);
  }

  getParkDimensions() {
    const width =
      (this.tileBounds.maxX - this.tileBounds.minX + 1) * this.cellSize;
    const depth =
      (this.tileBounds.maxZ - this.tileBounds.minZ + 1) * this.cellSize;
    return { width, depth };
  }

  pointToTile(point) {
    return {
      ix: Math.floor(point[0] / this.cellSize),
      iz: Math.floor(point[2] / this.cellSize),
    };
  }

  hasTile(ix, iz) {
    return this.purchasedTiles.has(tileKey(ix, iz));
  }

  isPointInsidePark(point) {
    const { ix, iz } = this.pointToTile(point);
    return this.hasTile(ix, iz);
  }

  isRectangleInsidePark(center, size) {
    const halfW = size.width / 2;
    const halfD = size.depth / 2;
    const corners = [
      [center[0] - halfW, center[1], center[2] - halfD],
      [center[0] - halfW, center[1], center[2] + halfD],
      [center[0] + halfW, center[1], center[2] - halfD],
      [center[0] + halfW, center[1], center[2] + halfD],
    ];
    return corners.every((corner) => this.isPointInsidePark(corner));
  }

  canAffordTile() {
    return this.money >= this.tileCost;
  }

  isTileAdjacent(ix, iz) {
    const neighbors = [
      [ix + 1, iz],
      [ix - 1, iz],
      [ix, iz + 1],
      [ix, iz - 1],
    ];
    return neighbors.some(([nx, nz]) => this.hasTile(nx, nz));
  }

  buyTile(ix, iz) {
    if (this.hasTile(ix, iz)) {
      return { error: "该格子已属于公园。" };
    }
    if (!this.canAffordTile()) {
      return { error: "资金不足，无法购买格子。" };
    }
    if (this.purchasedTiles.size > 0 && !this.isTileAdjacent(ix, iz)) {
      return { error: "新格子需要与现有公园相邻。" };
    }
    this.purchasedTiles.add(tileKey(ix, iz));
    this.updateTileBounds(ix, iz);
    this.money -= this.tileCost;
    return { ix, iz };
  }

  canAffordStation() {
    return this.money >= this.stationCost;
  }

  findStationAt(point) {
    for (const station of this.stations) {
      const halfW = (station.size?.width || STATION_SIZE.width) / 2;
      const halfD = (station.size?.depth || STATION_SIZE.depth) / 2;
      if (
        Math.abs(point[0] - station.position[0]) <= halfW &&
        Math.abs(point[2] - station.position[2]) <= halfD
      ) {
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
    if (!this.isRectangleInsidePark(position, STATION_SIZE)) {
      return { error: "站台必须完全位于公园范围内。" };
    }
    if (!this.canAffordStation()) {
      return { error: "资金不足，无法购买站台。" };
    }
    const stationId = `Station-${++this.stationCounter}`;
    const station = {
      id: stationId,
      label: `站台 ${this.stationCounter}`,
      position: [...position],
      size: { ...STATION_SIZE },
      topY: position[1] + STATION_SIZE.height,
    };
    const coasterId = `Coaster-${++this.coasterCounter}`;
    const color = randomCoasterColor();
    const coaster = {
      id: coasterId,
      stationId: station.id,
      color,
      cursorPose: {
        position: [
          position[0],
          station.topY + TRACK_CLEARANCE,
          position[2],
        ],
        heading: 0,
      },
      modules: [],
      samples: [],
    };
    ensureCoasterSamples(coaster);
    this.money -= this.stationCost;
    this.stations.push(station);
    this.coasters.push(coaster);
    return { station, coaster };
  }

  addModuleToTrack(module) {
    const coaster = this.getSelectedCoaster();
    if (!coaster) {
      return { error: "请先选择站台。" };
    }
    ensureCoasterSamples(coaster);
    const result = sampleModule(module, coaster.cursorPose);
    if (result.error) {
      return result;
    }
    if (!result.samples || result.samples.length === 0) {
      return { error: "该轨道单元长度不足。" };
    }
    for (const sample of result.samples) {
      if (!this.isPointInsidePark(sample.position)) {
        return { error: "轨道超出公园范围，请先扩展公园。" };
      }
    }
    const totalLength =
      result.totalLength ||
      result.samples.reduce((sum, sample, index) => {
        if (index === 0) return sum;
        return (
          sum +
          lengthVec3(
            subVec3(sample.position, result.samples[index - 1].position)
          )
        );
      }, 0);
    const cost = Math.round(totalLength * this.segmentCostPerMeter);
    if (this.money < cost) {
      return { error: "资金不足，无法建造轨道。" };
    }
    this.money -= cost;
    coaster.modules.push({
      id: `Module-${++this.segmentCounter}`,
      templateId: module.id,
      name: module.name,
      type: module.type,
      params: { ...module.params },
      length: totalLength,
    });
    coaster.samples = coaster.samples.concat(result.samples);
    coaster.cursorPose = result.endPose;
    return { coaster, cost };
  }
}

/* ---------- 场景与 UI ---------- */
const renderer = new Renderer(gl);
const camera = new OrbitCamera();
const scene = {
  parkMeshes: [],
  stations: [],
  tracks: [],
};
const game = new GameState();

function rebuildCoasterMesh(coaster) {
  if (!coaster || !coaster.samples || coaster.samples.length < 2) return;
  const meshData = buildTrackMeshFromSamples(coaster.samples);
  if (!meshData) return;
  const existingIndex = scene.tracks.findIndex(
    (t) => t.coasterId === coaster.id
  );
  if (existingIndex !== -1) {
    renderer.disposeMesh(scene.tracks[existingIndex].mesh);
    scene.tracks.splice(existingIndex, 1);
  }
  const mesh = renderer.createMesh(meshData);
  scene.tracks.push({
    id: `${coaster.id}-track`,
    coasterId: coaster.id,
    mesh,
    color: lightenColor(coaster.color, 0.05),
  });
}

function rebuildParkMeshes() {
  if (scene.parkMeshes && scene.parkMeshes.length) {
    for (const tileMesh of scene.parkMeshes) {
      renderer.disposeMesh(tileMesh.mesh);
    }
  }
  const tiles = Array.from(game.purchasedTiles).map(parseTileKey);
  const { even, odd } = buildCheckerGeometry(tiles, game.cellSize, -0.02);
  scene.parkMeshes = [];
  if (even.positions.length > 0) {
    scene.parkMeshes.push({
      mesh: renderer.createMesh(even),
      color: PARK_LIGHT_COLOR,
    });
  }
  if (odd.positions.length > 0) {
    scene.parkMeshes.push({
      mesh: renderer.createMesh(odd),
      color: PARK_DARK_COLOR,
    });
  }
}

const moneyLabel = document.getElementById("moneyLabel");
const modeLabel = document.getElementById("modeLabel");
const buyStationBtn = document.getElementById("buyStationBtn");
const cancelBtn = document.getElementById("cancelBtn");
const selectionInfo = document.getElementById("selectionInfo");
const trackForm = document.getElementById("trackForm");
const stationName = document.getElementById("stationName");
const moduleNameInput = document.getElementById("moduleName");
const moduleTypeSelect = document.getElementById("moduleType");
const straightLengthInput = document.getElementById("straightLength");
const straightRiseInput = document.getElementById("straightRise");
const arcRadiusInput = document.getElementById("arcRadius");
const arcModuleAngleInput = document.getElementById("arcModuleAngle");
const arcModuleDirectionInput = document.getElementById("arcModuleDirection");
const arcRiseInput = document.getElementById("arcRise");
const bezierInputs = {
  bz1x: document.getElementById("bz1x"),
  bz1y: document.getElementById("bz1y"),
  bz1z: document.getElementById("bz1z"),
  bz2x: document.getElementById("bz2x"),
  bz2y: document.getElementById("bz2y"),
  bz2z: document.getElementById("bz2z"),
  bz3x: document.getElementById("bz3x"),
  bz3y: document.getElementById("bz3y"),
  bz3z: document.getElementById("bz3z"),
};
const moduleFieldGroups = {
  straight: document.getElementById("straightFields"),
  arc: document.getElementById("arcFields"),
  bezier: document.getElementById("bezierFields"),
};
const saveModuleBtn = document.getElementById("saveModuleBtn");
const resetModuleBtn = document.getElementById("resetModuleBtn");
const loadModuleBtn = document.getElementById("loadModuleBtn");
const moduleLibrarySelect = document.getElementById("moduleLibrarySelect");
const addModuleBtn = document.getElementById("addModuleBtn");
const trackStatus = document.getElementById("trackStatus");
const parkSizeLabel = document.getElementById("parkSizeLabel");
const buyTileBtn = document.getElementById("buyTileBtn");

rebuildParkMeshes();

function updateHud() {
  moneyLabel.textContent = `¥${game.money.toLocaleString("zh-CN")}`;
  const dimensions = game.getParkDimensions();
  parkSizeLabel.textContent = `${dimensions.width} x ${dimensions.depth}`;
  let modeText = "空闲";
  if (game.mode === "placingStation") modeText = "放置站台";
  if (game.mode === "building") modeText = "建造轨道";
  if (game.mode === "buyingTile") modeText = "购买格子";
  modeLabel.textContent = modeText;
  buyStationBtn.disabled = !game.canAffordStation();
  buyTileBtn.disabled = !game.canAffordTile();
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
    } else if (mode === "buyingTile") {
      selectionInfo.textContent = "点击地面购买相邻格子以扩展公园";
    } else {
      selectionInfo.textContent =
        "点击站台进入建造模式，然后选择轨道单元搭建";
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

buyTileBtn.addEventListener("click", () => {
  if (!game.canAffordTile()) return;
  setMode("buyingTile");
});

cancelBtn.addEventListener("click", () => {
  game.selectedStationId = null;
  setMode("idle");
});

moduleTypeSelect.addEventListener("change", updateModuleFieldVisibility);

saveModuleBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const payload = readModuleForm();
  if (!payload) return;
  upsertModuleDefinition(payload, editingModuleId);
  populateModuleSelect(payload.id);
  editingModuleId = payload.id;
  showTrackStatus(`单元“${payload.name}”已保存`);
});

resetModuleBtn.addEventListener("click", (event) => {
  event.preventDefault();
  resetModuleForm();
  showTrackStatus("已清空单元编辑表单");
});

loadModuleBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const moduleId = moduleLibrarySelect.value;
  const template = moduleLibrary.find((m) => m.id === moduleId);
  if (!template) {
    showTrackStatus("请选择要载入的单元", true);
    return;
  }
  loadModuleToForm(template);
  showTrackStatus(`已载入单元“${template.name}”`);
});

addModuleBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const moduleId = moduleLibrarySelect.value;
  const template = moduleLibrary.find((m) => m.id === moduleId);
  if (!template) {
    showTrackStatus("请选择可用的轨道单元", true);
    return;
  }
  const result = game.addModuleToTrack(template);
  if (result.error) {
    showTrackStatus(result.error, true);
    return;
  }
  rebuildCoasterMesh(result.coaster);
  showTrackStatus(`添加“${template.name}”成功，花费 ¥${result.cost}`);
  updateHud();
});

function updateModuleFieldVisibility() {
  Object.values(moduleFieldGroups).forEach((el) =>
    el.classList.add("hidden")
  );
  const active = moduleFieldGroups[moduleTypeSelect.value];
  if (active) active.classList.remove("hidden");
}

function resetModuleForm() {
  editingModuleId = null;
  moduleNameInput.value = "";
  moduleTypeSelect.value = "straight";
  straightLengthInput.value = 10;
  straightRiseInput.value = 0;
  arcRadiusInput.value = 12;
  arcModuleAngleInput.value = 45;
  arcModuleDirectionInput.value = "1";
  arcRiseInput.value = 0;
  bezierInputs.bz1x.value = 5;
  bezierInputs.bz1y.value = 0;
  bezierInputs.bz1z.value = 3;
  bezierInputs.bz2x.value = 10;
  bezierInputs.bz2y.value = 0;
  bezierInputs.bz2z.value = -3;
  bezierInputs.bz3x.value = 15;
  bezierInputs.bz3y.value = 0;
  bezierInputs.bz3z.value = 0;
  updateModuleFieldVisibility();
}

const moduleLibrary = [];
let moduleCounter = 0;
let editingModuleId = null;

const DEFAULT_MODULES = [
  { name: "直线 8m", type: "straight", params: { length: 8, rise: 0 } },
  {
    name: "圆弧 45°",
    type: "arc",
    params: { radius: 12, angle: 45, direction: 1, rise: 0 },
  },
  {
    name: "S 形贝塞尔",
    type: "bezier",
    params: {
      bz1x: 5,
      bz1y: 0,
      bz1z: 3,
      bz2x: 10,
      bz2y: 0,
      bz2z: -3,
      bz3x: 15,
      bz3y: 0,
      bz3z: 0,
    },
  },
];

function seedDefaultModules() {
  if (moduleLibrary.length > 0) return;
  DEFAULT_MODULES.forEach((def) => {
    upsertModuleDefinition(def);
  });
}

function populateModuleSelect(selectId) {
  moduleLibrarySelect.innerHTML = "";
  moduleLibrary.forEach((module) => {
    const option = document.createElement("option");
    option.value = module.id;
    option.textContent = module.name;
    moduleLibrarySelect.appendChild(option);
  });
  if (moduleLibrary.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无单元";
    moduleLibrarySelect.appendChild(option);
    moduleLibrarySelect.disabled = true;
  } else {
    moduleLibrarySelect.disabled = false;
    moduleLibrarySelect.value =
      selectId || moduleLibrarySelect.value || moduleLibrary[0].id;
  }
}

function readModuleForm() {
  const name = moduleNameInput.value.trim();
  if (!name) {
    showTrackStatus("请输入单元名称", true);
    return null;
  }
  const type = moduleTypeSelect.value;
  let params = {};
  if (type === "straight") {
    const length = Number(straightLengthInput.value);
    const rise = Number(straightRiseInput.value);
    if (isNaN(length) || length <= 0) {
      showTrackStatus("直线长度需为正数", true);
      return null;
    }
    params = { length, rise: isNaN(rise) ? 0 : rise };
  } else if (type === "arc") {
    const radius = Number(arcRadiusInput.value);
    const angle = Number(arcModuleAngleInput.value);
    const rise = Number(arcRiseInput.value);
    if (isNaN(radius) || radius <= 0) {
      showTrackStatus("圆弧半径需大于0", true);
      return null;
    }
    if (isNaN(angle) || angle === 0) {
      showTrackStatus("圆弧弧角需非零", true);
      return null;
    }
    params = {
      radius,
      angle,
      direction: Number(arcModuleDirectionInput.value) >= 0 ? 1 : -1,
      rise: isNaN(rise) ? 0 : rise,
    };
  } else if (type === "bezier") {
    params = Object.fromEntries(
      Object.entries(bezierInputs).map(([key, input]) => [
        key,
        Number(input.value) || 0,
      ])
    );
  } else {
    showTrackStatus("未知的单元类型", true);
    return null;
  }
  const id = editingModuleId || `module-${++moduleCounter}`;
  return { id, name, type, params };
}

function upsertModuleDefinition(definition, existingId) {
  if (existingId) {
    const module = moduleLibrary.find((m) => m.id === existingId);
    if (module) {
      module.name = definition.name;
      module.type = definition.type;
      module.params = { ...definition.params };
      definition.id = module.id;
      return module;
    }
  }
  if (!definition.id) {
    definition.id = `module-${++moduleCounter}`;
  }
  moduleLibrary.push({
    id: definition.id,
    name: definition.name,
    type: definition.type,
    params: { ...definition.params },
  });
  return definition;
}

function loadModuleToForm(module) {
  editingModuleId = module.id;
  moduleNameInput.value = module.name;
  moduleTypeSelect.value = module.type;
  updateModuleFieldVisibility();
  if (module.type === "straight") {
    straightLengthInput.value = module.params.length ?? 10;
    straightRiseInput.value = module.params.rise ?? 0;
  } else if (module.type === "arc") {
    arcRadiusInput.value = module.params.radius ?? 10;
    arcModuleAngleInput.value = module.params.angle ?? 45;
    arcModuleDirectionInput.value =
      module.params.direction >= 0 ? "1" : "-1";
    arcRiseInput.value = module.params.rise ?? 0;
  } else if (module.type === "bezier") {
    Object.entries(bezierInputs).forEach(([key, input]) => {
      input.value = module.params[key] ?? 0;
    });
  }
}

resetModuleForm();
seedDefaultModules();
populateModuleSelect();

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

  if (game.mode === "buyingTile") {
    const { ix, iz } = game.pointToTile(point);
    const result = game.buyTile(ix, iz);
    if (result.error) {
      selectionInfo.textContent = result.error;
    } else {
      rebuildParkMeshes();
      updateHud();
      const dims = game.getParkDimensions();
      selectionInfo.textContent = `成功扩展，当前范围 ${dims.width} x ${dims.depth}`;
    }
    return;
  }

  if (game.mode === "placingStation") {
    const snapped = snapToGrid(point, game.cellSize);
    if (!game.isRectangleInsidePark(snapped, STATION_SIZE)) {
      selectionInfo.textContent = "站台需完全处于已购买的格子内。";
      return;
    }
    const result = game.addStation(snapped);
    if (result.error) {
      selectionInfo.textContent = result.error;
      updateHud();
      return;
    }
    const mesh = renderer.createMesh(
      createStationGeometry(result.station.position, result.station.size)
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

  const station = game.findStationAt(point);
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
