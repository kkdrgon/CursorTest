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
const ROTATE_SPEED_MOUSE = 0.004;
const ROTATE_SPEED_TOUCH = 0.003;
const WHEEL_SPEED_PX = 0.09;
const WHEEL_SPEED_LINE = 3;
const PLAYER_SPEED = 4; // m/s

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

const stations = new Map(); // key: `${x}-${z}`, value: Station object

function vec3Add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function vec3Normalize(a) {
  const len = vec3Length(a);
  if (len === 0) {
    return [0, 0, 0];
  }
  return vec3Scale(a, 1 / len);
}

function rotateVectorAroundAxis(vector, axis, angle) {
  const normalizedAxis = vec3Normalize(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const term1 = vec3Scale(vector, cos);
  const term2 = vec3Scale(vec3Cross(normalizedAxis, vector), sin);
  const term3 = vec3Scale(
    normalizedAxis,
    vec3Dot(normalizedAxis, vector) * (1 - cos)
  );
  return vec3Add(vec3Add(term1, term2), term3);
}

function lerpVec3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function evaluateCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t * t2;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

function evaluateCubicBezierTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt;
  const b = 2 * mt * t;
  const c = t * t;
  return [
    3 * (p1[0] - p0[0]) * a + 3 * (p2[0] - p1[0]) * b + 3 * (p3[0] - p2[0]) * c,
    3 * (p1[1] - p0[1]) * a + 3 * (p2[1] - p1[1]) * b + 3 * (p3[1] - p2[1]) * c,
    3 * (p1[2] - p0[2]) * a + 3 * (p2[2] - p1[2]) * b + 3 * (p3[2] - p2[2]) * c,
  ];
}

const HANDLE_PICK_RADIUS = 18;
const HANDLE_HALF_SIZE = 0.18;

function mat4MultiplyVec4(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

function projectWorldToScreen(point) {
  const clip = mat4MultiplyVec4(camera.viewProjection, [
    point[0],
    point[1],
    point[2],
    1,
  ]);
  if (clip[3] === 0) {
    return null;
  }
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const screenX = (ndcX * 0.5 + 0.5) * rect.width;
  const screenY = (-ndcY * 0.5 + 0.5) * rect.height;
  return { x: screenX, y: screenY };
}

const DEFAULT_PLAYER_CELL_X = Math.floor((CORE_MIN + CORE_MAX) / 2);
const DEFAULT_PLAYER_CELL_Z = Math.floor((CORE_MIN + CORE_MAX) / 2);

const player = {
  cellX: DEFAULT_PLAYER_CELL_X,
  cellZ: DEFAULT_PLAYER_CELL_Z,
  worldX: 0,
  worldY: 0,
  worldZ: 0,
  height: 1.4,
  yaw: 0,
};

function updatePlayerWorldPosition() {
  player.worldX = player.cellX - HALF_WORLD + 0.5;
  player.worldY = 0;
  player.worldZ = player.cellZ - HALF_WORLD + 0.5;
}

updatePlayerWorldPosition();

const STATION_PLATFORM_LENGTH = 10;
const STATION_PLATFORM_WIDTH = 5;
const STATION_PLATFORM_HEIGHT = 3;
const INITIAL_TRACK_HEIGHT = 0.5;
const INITIAL_TRACK_HALF = STATION_PLATFORM_LENGTH / 2;
const TRACK_SAMPLES_PER_SEGMENT = 24;
const TRACK_TIE_SPACING = 1.3;
const TRACK_RAIL_OFFSET = 0.5;
const TRACK_RAIL_HALF_WIDTH = 0.08;
const TRACK_RAIL_HALF_HEIGHT = 0.06;

let playerMoveIntensity = 0;
let playerSeated = false;
let playerStationId = null;
let playerRideProgress = 0;
let playerEditMode = false;
let playerEditIndex = 0;
let playerEditStationId = null;

function createStationKey(cellX, cellZ) {
  return `${cellX}-${cellZ}`;
}

function buildStationPlatformGeometry(center) {
  const halfLength = STATION_PLATFORM_LENGTH / 2;
  const halfWidth = STATION_PLATFORM_WIDTH / 2;
  const height = STATION_PLATFORM_HEIGHT;
  const startCenter = [
    center[0] - halfLength,
    center[1] + height / 2,
    center[2],
  ];
  const endCenter = [
    center[0] + halfLength,
    center[1] + height / 2,
    center[2],
  ];
  const data = {
    positions: [],
    cellCoords: [],
    parities: [],
    types: [],
    segments: [],
  };
  addPrismGeometry({
    positions: data.positions,
    cellCoords: data.cellCoords,
    parities: data.parities,
    types: data.types,
    segments: data.segments,
    startCenter,
    endCenter,
    right: [1, 0, 0],
    up: [0, 1, 0],
    halfWidth,
    halfHeight: height / 2,
    typeValue: 4,
  });
  return data;
}

function createInitialTrackNodes(center) {
  const start = [center[0] - INITIAL_TRACK_HALF, center[1] + INITIAL_TRACK_HEIGHT, center[2]];
  const end = [center[0] + INITIAL_TRACK_HALF, center[1] + INITIAL_TRACK_HEIGHT, center[2]];
  return [
    {
      position: start.slice(),
      handleOut: vec3Add(start, [INITIAL_TRACK_HALF / 2, 0, 0]),
      handleIn: null,
    },
    {
      position: end.slice(),
      handleIn: vec3Add(end, [-INITIAL_TRACK_HALF / 2, 0, 0]),
      handleOut: null,
    },
  ];
}

function evaluateTrackSegmentNodes(nodeA, nodeB) {
  const p0 = nodeA.position;
  const p1 = nodeA.handleOut || lerpVec3(nodeA.position, nodeB.position, 1 / 3);
  const p2 = nodeB.handleIn || lerpVec3(nodeA.position, nodeB.position, 2 / 3);
  const p3 = nodeB.position;
  return { p0, p1, p2, p3 };
}

function buildBezierTrackData(trackNodes) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const segments = [];
  const samples = [];
  let totalLength = 0;
  let prevSample = null;
  for (let i = 0; i < trackNodes.length - 1; i += 1) {
    const { p0, p1, p2, p3 } = evaluateTrackSegmentNodes(
      trackNodes[i],
      trackNodes[i + 1]
    );
    for (let step = 0; step <= TRACK_SAMPLES_PER_SEGMENT; step += 1) {
      const t = step / TRACK_SAMPLES_PER_SEGMENT;
      const position = evaluateCubicBezier(p0, p1, p2, p3, t);
      let tangent = evaluateCubicBezierTangent(p0, p1, p2, p3, t);
      tangent = vec3Normalize(tangent);
      let up = [0, 1, 0];
      let right = vec3Cross(tangent, up);
      if (vec3Length(right) < 1e-4) {
        right = [1, 0, 0];
      }
      right = vec3Normalize(right);
      up = vec3Normalize(vec3Cross(right, tangent));
      if (prevSample) {
        const delta = vec3Sub(position, prevSample.position);
        totalLength += vec3Length(delta);
      }
      const sample = {
        position,
        tangent,
        up,
        right,
        distance: totalLength,
        segmentIndex: i,
        t,
      };
      samples.push(sample);
      prevSample = sample;
    }
  }

  for (let i = 1; i < samples.length; i += 1) {
    const start = samples[i - 1];
    const end = samples[i];
    const forward = vec3Normalize(vec3Sub(end.position, start.position));
    let up = vec3Normalize(vec3Add(start.up, end.up));
    if (vec3Length(up) < 1e-4) {
      up = [0, 1, 0];
    }
    let right = vec3Cross(forward, up);
    if (vec3Length(right) < 1e-4) {
      right = vec3Cross(forward, [0, 0, 1]);
    }
    right = vec3Normalize(right);
    up = vec3Normalize(vec3Cross(right, forward));

    const startCenter = start.position;
    const endCenter = end.position;

    const leftStart = vec3Add(startCenter, vec3Scale(right, -TRACK_RAIL_OFFSET));
    const leftEnd = vec3Add(endCenter, vec3Scale(right, -TRACK_RAIL_OFFSET));
    addPrismGeometry({
      positions,
      cellCoords,
      parities,
      types,
      segments,
      startCenter: leftStart,
      endCenter: leftEnd,
      right,
      up,
      halfWidth: TRACK_RAIL_HALF_WIDTH,
      halfHeight: TRACK_RAIL_HALF_HEIGHT,
      typeValue: 3,
    });

    const rightStart = vec3Add(startCenter, vec3Scale(right, TRACK_RAIL_OFFSET));
    const rightEnd = vec3Add(endCenter, vec3Scale(right, TRACK_RAIL_OFFSET));
    addPrismGeometry({
      positions,
      cellCoords,
      parities,
      types,
      segments,
      startCenter: rightStart,
      endCenter: rightEnd,
      right,
      up,
      halfWidth: TRACK_RAIL_HALF_WIDTH,
      halfHeight: TRACK_RAIL_HALF_HEIGHT,
      typeValue: 3,
    });

    const tieVector = vec3Sub(endCenter, startCenter);
    const tieDistance = vec3Length(tieVector);
    if (tieDistance > TRACK_TIE_SPACING) {
      const steps = Math.floor(tieDistance / TRACK_TIE_SPACING);
      for (let s = 1; s < steps; s += 1) {
        const ratio = s / steps;
        const tieCenter = lerpVec3(startCenter, endCenter, ratio);
        addPrismGeometry({
          positions,
          cellCoords,
          parities,
          types,
          segments,
          startCenter: tieCenter,
          endCenter: tieCenter,
          right,
          up,
          halfWidth: TRACK_RAIL_OFFSET + 0.1,
          halfHeight: TRACK_RAIL_HALF_HEIGHT * 0.8,
          typeValue: 3,
        });
      }
    }
  }

  return {
    geometry: {
      positions: new Float32Array(positions),
      cellCoords: new Float32Array(cellCoords),
      parities: new Float32Array(parities),
      types: new Float32Array(types),
      segments: new Float32Array(segments),
      vertexCount: positions.length / 3,
    },
    samples,
    length: totalLength,
  };
}

function rebuildStationTrack(station) {
  if (!station.trackNodes || station.trackNodes.length < 2) {
    station.trackSamples = [];
    station.rideLength = 0;
    if (station.trackMesh) {
      deleteMesh(station.trackMesh);
      station.trackMesh = null;
    }
    return;
  }
  const data = buildBezierTrackData(station.trackNodes);
  station.trackSamples = data.samples;
  station.rideLength = data.length;
  if (station.trackMesh) {
    deleteMesh(station.trackMesh);
  }
  station.trackMesh = bindGeometry(data.geometry);
  if (playerSeated && playerStationId === station.id) {
    playerRideProgress = Math.min(playerRideProgress, station.rideLength);
  }
  if (playerEditMode && playerEditStationId === station.id) {
    if (playerEditIndex < 0 || playerEditIndex >= station.trackNodes.length) {
      playerEditMode = false;
      playerEditStationId = null;
      playerEditIndex = -1;
    }
  }
}

function rebuildStationPlatform(station) {
  const geometry = buildStationPlatformGeometry(station.position);
  if (station.platformMesh) {
    deleteMesh(station.platformMesh);
  }
  station.platformMesh = bindGeometry(geometry);
}

function createStationAtCell(cellX, cellZ) {
  const key = createStationKey(cellX, cellZ);
  if (stations.has(key)) {
    return stations.get(key);
  }
  const worldX = cellX - HALF_WORLD + 0.5;
  const worldZ = cellZ - HALF_WORLD + 0.5;
  const station = {
    id: key,
    key,
    cellX,
    cellZ,
    position: [worldX, 0, worldZ],
    rotation: 0,
    trackNodes: createInitialTrackNodes([worldX, 0, worldZ]),
    platformMesh: null,
    trackMesh: null,
    trackSamples: [],
    rideLength: 0,
  };
  rebuildStationPlatform(station);
  rebuildStationTrack(station);
  stations.set(key, station);
  return station;
}

function getTrackSampleAtDistance(station, distance) {
  if (!station.trackSamples || station.trackSamples.length === 0) {
    return null;
  }
  const samples = station.trackSamples;
  if (distance <= 0) {
    return samples[0];
  }
  if (distance >= station.rideLength) {
    return samples[samples.length - 1];
  }
  for (let i = 1; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample.distance >= distance) {
      const prev = samples[i - 1];
      const span = sample.distance - prev.distance || 1;
      const alpha = (distance - prev.distance) / span;
      return {
        position: lerpVec3(prev.position, sample.position, alpha),
        tangent: vec3Normalize(lerpVec3(prev.tangent, sample.tangent, alpha)),
        up: vec3Normalize(lerpVec3(prev.up, sample.up, alpha)),
        right: vec3Normalize(lerpVec3(prev.right, sample.right, alpha)),
        segmentIndex: sample.segmentIndex,
        t: sample.t,
      };
    }
  }
  return samples[samples.length - 1];
}

function insertTrackControlPointAtDistance(station, distance) {
  if (!station.trackNodes || station.trackNodes.length < 2) {
    return null;
  }
  const sample = getTrackSampleAtDistance(station, distance);
  if (!sample) {
    return null;
  }
  const nodes = station.trackNodes;
  const segmentIndex = sample.segmentIndex;
  if (segmentIndex < 0 || segmentIndex >= nodes.length - 1) {
    return null;
  }
  const newNode = {
    position: sample.position.slice(),
    handleIn: vec3Add(sample.position, vec3Scale(sample.tangent, -1)),
    handleOut: vec3Add(sample.position, vec3Scale(sample.tangent, 1)),
  };
  nodes.splice(segmentIndex + 1, 0, newNode);
  rebuildStationTrack(station);
  return segmentIndex + 1;
}

function seatPlayerAtStation(station) {
  if (!station.trackSamples || station.trackSamples.length === 0) {
    return;
  }
  playerSeated = true;
  playerStationId = station.id;
  playerRideProgress = 0;
  playerEditMode = false;
  playerEditStationId = null;
  playerEditIndex = -1;
  const sample = getTrackSampleAtDistance(station, playerRideProgress);
  if (sample) {
    player.worldX = sample.position[0];
    player.worldY = sample.position[1] + 0.35;
    player.worldZ = sample.position[2];
    player.yaw = Math.atan2(sample.tangent[0], sample.tangent[2]);
  }
  updateStatus("已进入站台，使用方向键沿轨道移动，点击站台开始编辑。");
}

function dismountPlayer() {
  playerSeated = false;
  playerStationId = null;
  playerRideProgress = 0;
  playerEditMode = false;
  playerEditStationId = null;
  playerEditIndex = -1;
  player.worldY = 0;
  player.cellX = Math.floor(player.worldX + HALF_WORLD);
  player.cellZ = Math.floor(player.worldZ + HALF_WORLD);
  updateStatus("已离开站台。");
}

function toggleStationEditing(station) {
  if (!playerSeated || playerStationId !== station.id) {
    return;
  }
  if (!playerEditMode) {
    const index = insertTrackControlPointAtDistance(
      station,
      playerRideProgress
    );
    if (index == null) {
      return;
    }
    playerEditMode = true;
    playerEditStationId = station.id;
    playerEditIndex = index;
    updateStatus("编辑模式：使用 Q/R 上下调整轨道。再次点击站台完成。");
  } else {
    playerEditMode = false;
    playerEditStationId = null;
    playerEditIndex = -1;
    updateStatus("已退出轨道编辑模式。");
  }
}


const inputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  editForward: false,
  editBackward: false,
};

const keyBindings = {
  ArrowUp: "forward",
  w: "forward",
  ArrowDown: "back",
  s: "back",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
  e: "interact",
  q: "editBackward",
  r: "editForward",
};

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

function handleMovementKey(event, isDown) {
  const action = keyBindings[normalizeKey(event.key)];
  if (!action) {
    return;
  }
  event.preventDefault();
  if (action === "interact") {
    if (isDown && playerSeated) {
      dismountPlayer();
    }
    return;
  }
  inputState[action] = isDown;
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }
  handleMovementKey(event, true);
});

window.addEventListener("keyup", (event) => {
  handleMovementKey(event, false);
});

function isWalkableWorldPosition(worldX, worldZ) {
  const cellX = Math.floor(worldX + HALF_WORLD);
  const cellZ = Math.floor(worldZ + HALF_WORLD);
  return isCellOccupied(cellX, cellZ);
}

function setPlayerWorldPosition(worldX, worldZ) {
  player.worldX = worldX;
  player.worldZ = worldZ;
  player.cellX = Math.floor(worldX + HALF_WORLD);
  player.cellZ = Math.floor(worldZ + HALF_WORLD);
}

function trySetPlayerPosition(worldX, worldZ) {
  if (!isWalkableWorldPosition(worldX, worldZ)) {
    return false;
  }
  setPlayerWorldPosition(worldX, worldZ);
  return true;
}

function shortestAngleDelta(current, target) {
  let diff = target - current;
  while (diff > Math.PI) {
    diff -= Math.PI * 2;
  }
  while (diff < -Math.PI) {
    diff += Math.PI * 2;
  }
  return diff;
}

function handleTrackEditing(station, deltaSeconds) {
  if (!playerEditMode || playerEditStationId !== station.id) {
    return;
  }
  const node = station.trackNodes[playerEditIndex];
  if (!node) {
    playerEditMode = false;
    playerEditStationId = null;
    playerEditIndex = -1;
    return;
  }
  const delta =
    (inputState.editForward ? 1 : 0) - (inputState.editBackward ? 1 : 0);
  if (delta === 0) {
    return;
  }
  const moveAmount = delta * deltaSeconds * 2;
  node.position[1] += moveAmount;
  if (node.handleIn) {
    node.handleIn[1] += moveAmount;
  }
  if (node.handleOut) {
    node.handleOut[1] += moveAmount;
  }
  rebuildStationTrack(station);
}

function updatePlayerRide(deltaSeconds) {
  if (!playerStationId) {
    dismountPlayer();
    return;
  }
  const station = stations.get(playerStationId);
  if (!station || !station.trackSamples || station.trackSamples.length === 0) {
    dismountPlayer();
    return;
  }
  const moveDir =
    (inputState.forward ? 1 : 0) - (inputState.back ? 1 : 0);
  const rideSpeed = 4;
  playerRideProgress = Math.max(
    0,
    Math.min(
      station.rideLength,
      playerRideProgress + moveDir * rideSpeed * deltaSeconds
    )
  );
  const sample = getTrackSampleAtDistance(station, playerRideProgress);
  if (sample) {
    player.worldX = sample.position[0];
    player.worldY = sample.position[1] + 0.35;
    player.worldZ = sample.position[2];
    player.yaw = Math.atan2(sample.tangent[0], sample.tangent[2]);
    const targetIntensity = Math.abs(moveDir);
    const blend = Math.min(deltaSeconds * 8.0, 1.0);
    playerMoveIntensity += (targetIntensity - playerMoveIntensity) * blend;
  }
  handleTrackEditing(station, deltaSeconds);
}

function updatePlayerPosition(deltaSeconds) {
  if (playerSeated) {
    updatePlayerRide(deltaSeconds);
    return;
  }
  const moveX =
    (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
  const moveZ =
    (inputState.forward ? 1 : 0) - (inputState.back ? 1 : 0);

  const prevX = player.worldX;
  const prevZ = player.worldZ;

  if (moveX === 0 && moveZ === 0) {
    const decay = Math.min(deltaSeconds * 6.0, 1.0);
    playerMoveIntensity += (0.0 - playerMoveIntensity) * decay;
    return;
  }

  const yaw = camera.yaw;
  const forwardX = -Math.cos(yaw);
  const forwardZ = -Math.sin(yaw);
  const rightX = Math.sin(yaw);
  const rightZ = -Math.cos(yaw);

  let worldMoveX = moveX * rightX + moveZ * forwardX;
  let worldMoveZ = moveX * rightZ + moveZ * forwardZ;
  const length = Math.hypot(worldMoveX, worldMoveZ);
  if (length < 1e-4) {
    return;
  }
  worldMoveX /= length;
  worldMoveZ /= length;

  const desiredYaw = Math.atan2(worldMoveX, worldMoveZ);
  player.yaw += shortestAngleDelta(player.yaw, desiredYaw) * Math.min(deltaSeconds * 12.0, 1.0);

  const step = PLAYER_SPEED * deltaSeconds;
  const targetX = player.worldX + worldMoveX * step;
  const targetZ = player.worldZ + worldMoveZ * step;

  const currentX = player.worldX;
  const currentZ = player.worldZ;
  if (!trySetPlayerPosition(targetX, targetZ)) {
    if (!trySetPlayerPosition(currentX, targetZ)) {
      trySetPlayerPosition(targetX, currentZ);
    }
  }

  const dx = player.worldX - prevX;
  const dz = player.worldZ - prevZ;
  const distanceMoved = Math.hypot(dx, dz);
  const targetIntensity =
    deltaSeconds > 1e-4
      ? Math.min(distanceMoved / (PLAYER_SPEED * deltaSeconds + 1e-5), 1.0)
      : 0.0;
  const blend = Math.min(deltaSeconds * 8.0, 1.0);
  playerMoveIntensity += (targetIntensity - playerMoveIntensity) * blend;
  player.worldY = 0;
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

const pointerMap = new Map();
let orbiting = false;
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
    orbiting = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.classList.add("dragging");
  } else if (pointerMap.size === 2) {
    orbiting = false;
    canvas.classList.remove("dragging");
    const [first, second] = pointerEntries();
    pinchBaseline = pointerDistance(first, second);
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

  if (pointerMap.size === 1 && orbiting) {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const speed =
      entry.type === "touch" ? ROTATE_SPEED_TOUCH : ROTATE_SPEED_MOUSE;
    camera.rotate(dx, dy, speed);
  } else if (pointerMap.size === 2 && pinchBaseline) {
    const [first, second] = pointerEntries();
    const current = pointerDistance(first, second);
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
  } catch {
    // ignore errors
  }

  if (pointerMap.size === 1) {
    const [remaining] = pointerEntries();
    lastPointerX = remaining.x;
    lastPointerY = remaining.y;
    orbiting = true;
    canvas.classList.add("dragging");
  } else {
    orbiting = false;
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

const vertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aCellCoord;
layout(location = 2) in float aParity;
layout(location = 3) in float aType;
layout(location = 4) in float aSegment;

uniform mat4 uViewProjection;
uniform float uWorldHalf;
uniform vec3 uPlayerOffset;
uniform float uTime;
uniform float uMoveIntensity;
uniform float uPlayerRotation;

out vec2 vCellCoord;
out float vParity;
out vec2 vCellUv;
out float vType;

const float PI = 3.14159265;

vec3 rotateAroundX(vec3 point, float angle, float pivotY) {
  float s = sin(angle);
  float c = cos(angle);
  float y = point.y - pivotY;
  float z = point.z;
  float newY = y * c - z * s;
  float newZ = y * s + z * c;
  return vec3(point.x, newY + pivotY, newZ);
}

vec3 rotateAroundZ(vec3 point, float angle, float pivotX, float pivotY) {
  float s = sin(angle);
  float c = cos(angle);
  float x = point.x - pivotX;
  float y = point.y - pivotY;
  float newX = x * c - y * s;
  float newY = x * s + y * c;
  return vec3(newX + pivotX, newY + pivotY, point.z);
}

vec3 rotateAroundY(vec3 point, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  float x = point.x;
  float z = point.z;
  return vec3(x * c - z * s, point.y, x * s + z * c);
}

vec3 applyStickAnimation(vec3 pos, float segment) {
  float movePhase = uMoveIntensity;
  float cycle = uTime * 6.0;
  if (segment < 0.5) {
    return pos;
  }

  if (segment < 1.5) {
    pos.y += sin(cycle * 0.5) * 0.03 * movePhase;
  } else if (segment < 2.5) {
    pos.y += sin(cycle * 0.5 + 0.3) * 0.02 * movePhase;
  } else if (segment < 3.5) {
    float swing = sin(cycle) * 0.6 * movePhase;
    pos = rotateAroundX(pos, swing, 0.9);
    pos = rotateAroundZ(pos, 0.2 * sin(cycle * 0.5) * movePhase, -0.3, 0.9);
  } else if (segment < 4.5) {
    float swing = sin(cycle + PI) * 0.6 * movePhase;
    pos = rotateAroundX(pos, swing, 0.9);
    pos = rotateAroundZ(pos, -0.2 * sin(cycle * 0.5) * movePhase, 0.3, 0.9);
  } else if (segment < 5.5) {
    pos = rotateAroundX(pos, sin(cycle + PI) * 0.8 * movePhase, 0.6);
  } else {
    pos = rotateAroundX(pos, sin(cycle) * 0.8 * movePhase, 0.6);
  }

  float idle = sin(uTime * 2.0) * 0.01;
  pos.y += idle * (segment < 2.5 ? 1.0 : 0.5);
  return pos;
}

void main() {
  vec3 worldPosition = aPosition;
  bool isPlayer = aType > 3.5;
  if (isPlayer) {
    worldPosition = applyStickAnimation(worldPosition, aSegment);
    worldPosition = rotateAroundY(worldPosition, uPlayerRotation);
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

  if (vType < 3.5) {
    vec3 steel = vec3(0.75, 0.78, 0.86);
    vec3 tint = vec3(0.05, 0.05, 0.08) * fbm(vCellUv * 8.0);
    outColor = vec4(steel + tint, 1.0);
    return;
  }

  if (vType < 4.5) {
    vec3 deck = vec3(0.55, 0.51, 0.45);
    vec3 highlight = vec3(0.1, 0.08, 0.05) * fbm(vCellUv * 4.0);
    outColor = vec4(deck + highlight, 1.0);
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

  const vertexCount = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    segments: new Float32Array(vertexCount),
    vertexCount,
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
    segments: new Float32Array(positions.length / 3),
    vertexCount: positions.length / 3,
  };
}

function addPrismGeometry({
  positions,
  cellCoords,
  parities,
  types,
  segments,
  startCenter,
  endCenter,
  right,
  up,
  halfWidth,
  halfHeight,
  typeValue,
}) {
  const forward = vec3Normalize(vec3Sub(endCenter, startCenter));
  const startCorners = [
    vec3Add(vec3Add(startCenter, vec3Scale(right, halfWidth)), vec3Scale(up, halfHeight)),
    vec3Add(vec3Sub(startCenter, vec3Scale(right, halfWidth)), vec3Scale(up, halfHeight)),
    vec3Sub(vec3Sub(startCenter, vec3Scale(right, halfWidth)), vec3Scale(up, halfHeight)),
    vec3Sub(vec3Add(startCenter, vec3Scale(right, halfWidth)), vec3Scale(up, halfHeight)),
  ];
  const endCorners = startCorners.map((corner) =>
    vec3Add(corner, vec3Scale(forward, vec3Length(vec3Sub(endCenter, startCenter))))
  );

  const faces = [
    [startCorners[0], startCorners[1], startCorners[2], startCorners[3]],
    [endCorners[1], endCorners[0], endCorners[3], endCorners[2]],
    [startCorners[1], endCorners[1], endCorners[2], startCorners[2]],
    [endCorners[0], startCorners[0], startCorners[3], endCorners[3]],
    [startCorners[0], endCorners[0], endCorners[1], startCorners[1]],
    [startCorners[3], startCorners[2], endCorners[2], endCorners[3]],
  ];

  for (const face of faces) {
    positions.push(
      ...face[0],
      ...face[1],
      ...face[2],
      ...face[0],
      ...face[2],
      ...face[3]
    );
    for (let i = 0; i < 6; i += 1) {
      cellCoords.push(0, 0);
      parities.push(0);
      types.push(typeValue);
      segments.push(0);
    }
  }
}

function buildRollerCoasterGeometry(moduleSequence, startPosition, startForward) {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const segments = [];

  let position = startPosition.slice();
  let forward = vec3Normalize(startForward);
  let up = [0, 1, 0];
  let right = vec3Normalize(vec3Cross(forward, up));
  up = vec3Normalize(vec3Cross(right, forward));

  for (const module of moduleSequence) {
    const pitch = degToRad(module.pitch);
    const bank = degToRad(module.bank);
    forward = vec3Normalize(rotateVectorAroundAxis(forward, right, pitch));
    up = vec3Normalize(rotateVectorAroundAxis(up, right, pitch));
    right = vec3Normalize(vec3Cross(forward, up));
    up = vec3Normalize(vec3Cross(right, forward));

    right = vec3Normalize(rotateVectorAroundAxis(right, forward, bank));
    up = vec3Normalize(rotateVectorAroundAxis(up, forward, bank));

    const nextPosition = vec3Add(position, vec3Scale(forward, module.length));

    const railOffset = 0.5;
    const railHalfWidth = 0.07;
    const railHalfHeight = 0.05;

    const leftRailStart = vec3Add(position, vec3Scale(right, -railOffset));
    const leftRailEnd = vec3Add(nextPosition, vec3Scale(right, -railOffset));
    addPrismGeometry({
      positions,
      cellCoords,
      parities,
      types,
      segments,
      startCenter: vec3Add(leftRailStart, vec3Scale(up, 0.3)),
      endCenter: vec3Add(leftRailEnd, vec3Scale(up, 0.3)),
      right,
      up,
      halfWidth: railHalfWidth,
      halfHeight: railHalfHeight,
      typeValue: 3,
    });

    const rightRailStart = vec3Add(position, vec3Scale(right, railOffset));
    const rightRailEnd = vec3Add(nextPosition, vec3Scale(right, railOffset));
    addPrismGeometry({
      positions,
      cellCoords,
      parities,
      types,
      segments,
      startCenter: vec3Add(rightRailStart, vec3Scale(up, 0.3)),
      endCenter: vec3Add(rightRailEnd, vec3Scale(up, 0.3)),
      right,
      up,
      halfWidth: railHalfWidth,
      halfHeight: railHalfHeight,
      typeValue: 3,
    });

    const tieSpacing = 1.2;
    const tieHalfWidth = railOffset + 0.1;
    const tieHalfHeight = 0.04;
    const distance = module.length;
    const steps = Math.max(2, Math.floor(distance / tieSpacing));
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const tiePos = vec3Add(
        position,
        vec3Scale(forward, distance * t)
      );
      addPrismGeometry({
        positions,
        cellCoords,
        parities,
        types,
        segments,
        startCenter: vec3Add(tiePos, vec3Scale(up, 0.25)),
        endCenter: vec3Add(vec3Add(tiePos, vec3Scale(up, 0.25)), vec3Scale(forward, 0.05)),
        right,
        up,
        halfWidth: tieHalfWidth,
        halfHeight: tieHalfHeight,
        typeValue: 3,
      });
    }

    position = nextPosition;
  }

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    segments: new Float32Array(segments),
    vertexCount: positions.length / 3,
  };
}

function buildPlayerGeometry() {
  const positions = [];
  const cellCoords = [];
  const parities = [];
  const types = [];
  const segments = [];

  const SEG_TORSO = 1.0;
  const SEG_HEAD = 2.0;
  const SEG_ARM_LEFT = 3.0;
  const SEG_ARM_RIGHT = 4.0;
  const SEG_LEG_LEFT = 5.0;
  const SEG_LEG_RIGHT = 6.0;

  function addBox(minX, minY, minZ, maxX, maxY, maxZ, segmentId) {
    const faces = [
      [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]],
      [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]],
      [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]],
      [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]],
      [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]],
      [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]],
    ];
    for (const face of faces) {
      positions.push(
        ...face[0], ...face[1], ...face[2],
        ...face[0], ...face[2], ...face[3]
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
        segments.push(segmentId);
      }
    }
  }

  addBox(-0.06, 0.5, -0.04, 0.06, 1.2, 0.04, SEG_TORSO);
  addBox(-0.1, 1.2, -0.1, 0.1, 1.4, 0.1, SEG_HEAD);
  addBox(-0.6, 0.85, -0.025, -0.02, 0.93, 0.025, SEG_ARM_LEFT);
  addBox(0.02, 0.85, -0.025, 0.6, 0.93, 0.025, SEG_ARM_RIGHT);
  addBox(-0.12, 0.0, -0.03, -0.04, 0.6, 0.03, SEG_LEG_LEFT);
  addBox(0.04, 0.0, -0.03, 0.12, 0.6, 0.03, SEG_LEG_RIGHT);

  return {
    positions: new Float32Array(positions),
    cellCoords: new Float32Array(cellCoords),
    parities: new Float32Array(parities),
    types: new Float32Array(types),
    segments: new Float32Array(segments),
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

  const segmentBuffer = gl.createBuffer();
  buffers.push(segmentBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer);
  const segmentData =
    geometry.segments ||
    new Float32Array(geometry.vertexCount);
  gl.bufferData(gl.ARRAY_BUFFER, segmentData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);

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
  time: gl.getUniformLocation(program, "uTime"),
  moveIntensity: gl.getUniformLocation(program, "uMoveIntensity"),
  playerRotation: gl.getUniformLocation(program, "uPlayerRotation"),
};

gl.uniform1f(uniforms.worldHalf, HALF_WORLD);
gl.uniform1f(uniforms.worldSize, WORLD_SIZE);
gl.uniform1i(uniforms.purchaseState, 0);
gl.uniform3f(uniforms.playerOffset, 0, 0, 0);
gl.uniform1f(uniforms.time, 0);
gl.uniform1f(uniforms.moveIntensity, 0);
gl.uniform1f(uniforms.playerRotation, 0);

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

let lastFrameTime = null;

function render(time) {
  if (lastFrameTime === null) {
    lastFrameTime = time;
  }
  const deltaSeconds = Math.min((time - lastFrameTime) / 1000, 0.1);
  lastFrameTime = time;

  updatePlayerPosition(deltaSeconds);
  resizeCanvas();
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
  camera.setTarget(player.worldX, player.worldY + player.height * 0.6, player.worldZ);
  camera.update(aspect);
  inverseViewProjection = camera.inverseViewProjection;
  gl.uniformMatrix4fv(uniforms.viewProjection, false, camera.viewProjection);
  gl.uniform1f(uniforms.time, time * 0.001);
  gl.uniform1f(uniforms.moveIntensity, playerMoveIntensity);
  gl.uniform1f(uniforms.playerRotation, player.yaw);

  gl.bindVertexArray(groundMesh.vao);
  gl.uniform3f(uniforms.playerOffset, 0, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, groundMesh.vertexCount);

  gl.bindVertexArray(fenceMesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, fenceMesh.vertexCount);

  stations.forEach((station) => {
    if (station.platformMesh) {
      gl.bindVertexArray(station.platformMesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, station.platformMesh.vertexCount);
    }
    if (station.trackMesh) {
      gl.bindVertexArray(station.trackMesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, station.trackMesh.vertexCount);
    }
  });

  gl.bindVertexArray(playerMesh.vao);
  gl.uniform3f(uniforms.playerOffset, player.worldX, player.worldY, player.worldZ);
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
  const key = createStationKey(cell.x, cell.z);
  if (stations.has(key)) {
    const station = stations.get(key);
    const choice = window.prompt(
      "输入 1 乘坐/退出，2 切换编辑模式，3 新增轨道控制点，其他键取消："
    );
    if (choice === "1") {
      if (!playerSeated || playerStationId !== station.id) {
        seatPlayerAtStation(station);
      } else {
        dismountPlayer();
      }
    } else if (choice === "2") {
      toggleStationEditing(station);
    } else if (choice === "3") {
      const index = insertTrackControlPointAtDistance(
        station,
        playerRideProgress
      );
      if (index != null) {
        playerEditMode = true;
        playerEditStationId = station.id;
        playerEditIndex = index;
        updateStatus("已插入控制点，使用 Q/R 调整高度。");
      }
    } else {
      updateStatus("已取消操作。");
    }
    return;
  }
  if (isCellOccupied(cell.x, cell.z)) {
    const choice = window.prompt(
      "输入 1 建造站台，2 添加站台起始轨道扩展控制点，其他键取消："
    );
    if (choice === "1") {
      const station = createStationAtCell(cell.x, cell.z);
      updateStatus(
        `已在 (${cell.x + 1}, ${cell.z + 1}) 建站台，点击可乘坐或编辑。`
      );
    } else if (choice === "2") {
      const stationKey = window.prompt("输入站台坐标（例：10,15）");
      if (stationKey) {
        const parts = stationKey.split(",");
        if (parts.length === 2) {
          const sx = parseInt(parts[0], 10) - 1;
          const sz = parseInt(parts[1], 10) - 1;
          const skey = createStationKey(sx, sz);
          const station = stations.get(skey);
          if (station) {
            const nodeIndex = insertTrackControlPointAtDistance(
              station,
              station.rideLength * 0.5
            );
            if (nodeIndex != null) {
              updateStatus("已在该站台轨道添加控制点。");
            }
          } else {
            updateStatus("未找到对应站台。");
          }
        }
      }
    } else {
      updateStatus("已取消操作。");
    }
    return;
  }
  if (!isPurchasable(cell)) {
    updateStatus("该区域未解锁，无法进行操作。");
    return;
  }

  const purchaseKey = `${cell.x}-${cell.z}`;
  const choice = window.prompt(
    `位置 (${cell.x + 1}, ${cell.z + 1}) 尚未开发。输入 1 购买扩展格，2 建站台并自动购买，其他键取消：`
  );
  if (choice === "1") {
    const confirmed = window.confirm(
      `是否购买靠近木栅栏的扩展格 (${cell.x + 1}, ${cell.z + 1})？`
    );
    if (!confirmed) {
      updateStatus("已取消购买。");
      return;
    }
    purchasedCells.add(purchaseKey);
    updatePurchaseTexture(cell.x, cell.z, true);
    markCellOccupied(cell);
    rebuildFenceMesh();
    updateStatus(`成功购入扩展格 (${cell.x + 1}, ${cell.z + 1})！`);
  } else if (choice === "2") {
    purchasedCells.add(purchaseKey);
    updatePurchaseTexture(cell.x, cell.z, true);
    markCellOccupied(cell);
    rebuildFenceMesh();
    const station = createStationAtCell(cell.x, cell.z);
    updateStatus(
      `已购买并建站台 (${cell.x + 1}, ${cell.z + 1})，点击可乘坐或编辑。`
    );
  } else {
    updateStatus("已取消操作。");
  }
});

updateStatus("点击公园地块可购买、建站或编辑轨道。");
