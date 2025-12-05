const DEG2RAD = Math.PI / 180;
const MATERIAL_DEFAULT = 0;
const MATERIAL_GROUND = 1;
const STATION_SIZE = Object.freeze({ width: 6, depth: 4, height: 2.5 });
const TRACK_CLEARANCE = 0.2;
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
    this.tileCost = 200;
    this.segmentCostPerDegree = 18;
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
      segments: [],
      cursorPose: {
        position: [
          position[0],
          station.topY + TRACK_CLEARANCE,
          position[2],
        ],
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
    if (!this.isPointInsidePark(coaster.cursorPose.position)) {
      return { error: "轨道起点不在公园范围内。" };
    }
    const cost = this.computeSegmentCost(params);
    if (this.money < cost) {
      return { error: "资金不足，无法建造轨道。" };
    }
    const build = buildTrackSegmentGeometry(params, coaster.cursorPose);
    if (!this.isPointInsidePark(build.endPose.position)) {
      return { error: "轨道终点超出公园范围，请先扩展公园。" };
    }
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
  parkMeshes: [],
  stations: [],
  tracks: [],
};
const game = new GameState();

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

buyTileBtn.addEventListener("click", () => {
  if (!game.canAffordTile()) return;
  setMode("buyingTile");
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
