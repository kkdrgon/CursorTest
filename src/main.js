const GRID_SIZE = 60;
const HALF_GRID = GRID_SIZE / 2;

const canvas = document.getElementById("rollerCanvas");
const gl = canvas.getContext("webgl2", { antialias: true });

if (!gl) {
  throw new Error("当前浏览器不支持 WebGL2，请更换或升级浏览器。");
}

// UI 元素
const purchaseStatusEl = document.getElementById("purchaseStatus");
const purchasedCountEl = document.getElementById("purchasedCount");
const remainingCellsEl = document.getElementById("remainingCells");

const vertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aCellCoord;
layout(location = 2) in float aParity;

uniform float uGridHalf;
uniform vec2 uResolution;

out vec2 vCellCoord;
out float vParity;
out vec2 vCellUv;

void main() {
  float aspect = uResolution.y / max(uResolution.x, 1.0);
  vec2 normalized = vec2(aPosition.x / uGridHalf * aspect, aPosition.z / uGridHalf);
  gl_Position = vec4(normalized, 0.0, 1.0);
  vCellCoord = aCellCoord;
  vParity = aParity;
  vec2 worldPos = vec2(aPosition.x + uGridHalf, aPosition.z + uGridHalf);
  vCellUv = fract(worldPos);
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vCellCoord;
in float vParity;
in vec2 vCellUv;

uniform sampler2D uPurchaseState;
uniform float uGridSize;

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
  vec2 uv = (vCellCoord + 0.5) / vec2(uGridSize);
  float purchased = texture(uPurchaseState, uv).r;
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

  vec3 purchasedColor = vec3(0.2, 0.65, 0.35);
  vec3 finalColor = mix(grassColor, purchasedColor, purchased);
  outColor = vec4(finalColor, 1.0);
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

function buildGridGeometry(size) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const half = size / 2;

  for (let x = 0; x < size; x += 1) {
    for (let z = 0; z < size; z += 1) {
      const x0 = x - half;
      const z0 = z - half;
      const x1 = x0 + 1;
      const z1 = z0 + 1;
      const parity = (x + z) % 2;

      // 三角形 1
      positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
      cellCoords.push(x, z, x, z, x, z);
      parities.push(parity, parity, parity);

      // 三角形 2
      positions.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
      cellCoords.push(x, z, x, z, x, z);
      parities.push(parity, parity, parity);
    }
  }

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    vertexCount: positions.length / 3,
  };
}

const gridGeometry = buildGridGeometry(GRID_SIZE);
const program = createProgram(gl, vertexSource, fragmentSource);
const vao = gl.createVertexArray();

if (!vao) {
  throw new Error("无法创建 VAO");
}

gl.bindVertexArray(vao);

function createBufferAndAttribute({ data, location, size }) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error(`绑定 attribute ${location} 时创建缓冲失败`);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

createBufferAndAttribute({
  data: gridGeometry.positions,
  location: 0,
  size: 3,
});

createBufferAndAttribute({
  data: gridGeometry.cellCoords,
  location: 1,
  size: 2,
});

createBufferAndAttribute({
  data: gridGeometry.parities,
  location: 2,
  size: 1,
});

const purchaseStateData = new Uint8Array(GRID_SIZE * GRID_SIZE);
const purchaseTexture = gl.createTexture();
if (!purchaseTexture) {
  throw new Error("无法创建购买状态纹理");
}

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, purchaseTexture);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(
  gl.TEXTURE_2D,
  0,
  gl.R8,
  GRID_SIZE,
  GRID_SIZE,
  0,
  gl.RED,
  gl.UNSIGNED_BYTE,
  purchaseStateData
);

const uniforms = {
  gridHalf: gl.getUniformLocation(program, "uGridHalf"),
  resolution: gl.getUniformLocation(program, "uResolution"),
  gridSize: gl.getUniformLocation(program, "uGridSize"),
  purchaseState: gl.getUniformLocation(program, "uPurchaseState"),
};

const purchasedCells = new Set();

function updatePurchaseTexture(x, z, purchased) {
  const index = z * GRID_SIZE + x;
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

function render() {
  resizeCanvasToDisplaySize();
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.clearColor(0.01, 0.03, 0.06, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform1f(uniforms.gridHalf, HALF_GRID);
  gl.uniform1f(uniforms.gridSize, GRID_SIZE);
  gl.uniform2f(uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1i(uniforms.purchaseState, 0);

  gl.drawArrays(gl.TRIANGLES, 0, gridGeometry.vertexCount);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

function updateUiStatus(message) {
  purchaseStatusEl.textContent = message;
  purchasedCountEl.textContent = purchasedCells.size.toString();
  const remaining = GRID_SIZE * GRID_SIZE - purchasedCells.size;
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
  if (!clip) {
    return null;
  }
  const aspect = gl.drawingBufferHeight / Math.max(gl.drawingBufferWidth, 1);
  const worldX = (clip.x * HALF_GRID) / aspect;
  const worldZ = clip.y * HALF_GRID;
  const cellX = Math.floor(worldX + HALF_GRID);
  const cellZ = Math.floor(worldZ + HALF_GRID);
  if (
    cellX < 0 ||
    cellX >= GRID_SIZE ||
    cellZ < 0 ||
    cellZ >= GRID_SIZE
  ) {
    return null;
  }
  return { x: cellX, z: cellZ };
}

canvas.addEventListener("click", (event) => {
  const cell = getCellFromPointer(event);
  if (!cell) {
    updateUiStatus("点击在棋盘之外，未处理");
    return;
  }

  const key = `${cell.x}-${cell.z}`;
  if (purchasedCells.has(key)) {
    updateUiStatus(`格子 (${cell.x + 1}, ${cell.z + 1}) 已购买`);
    return;
  }

  const confirmed = window.confirm(
    `是否购买格子 (${cell.x + 1}, ${cell.z + 1})？`
  );

  if (!confirmed) {
    updateUiStatus("已取消本次购买");
    return;
  }

  purchasedCells.add(key);
  updatePurchaseTexture(cell.x, cell.z, true);
  updateUiStatus(`成功购买格子 (${cell.x + 1}, ${cell.z + 1})`);
});

updateUiStatus("尚未购买任何格子");
