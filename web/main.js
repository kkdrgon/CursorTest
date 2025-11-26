const MAP_CONFIG = {
  size: { width: 400, height: 300 }, // 米
  canvasScale: 2.5, // px per meter
  oceanPadding: 25,
  gravity: 9.8,
  elevationProfile: { max: 45, centerPlateauRadius: 80 },
  layers: {
    terrain: 1,
    staticObstacle: 2,
    water: 4,
    cliff: 8,
  },
  spawnPoints: [
    { id: "A1", team: "blue", position: { x: -160, z: 0 } },
    { id: "A2", team: "blue", position: { x: -120, z: -110 } },
    { id: "A3", team: "blue", position: { x: 0, z: -120 } },
    { id: "A4", team: "blue", position: { x: -180, z: 70 } },
    { id: "B1", team: "red", position: { x: 160, z: 0 } },
    { id: "B2", team: "red", position: { x: 120, z: 110 } },
    { id: "B3", team: "red", position: { x: 0, z: 120 } },
    { id: "B4", team: "red", position: { x: 180, z: -70 } },
  ],
  spawnCombos: [
    ["A1", "A3", "B1", "B3"],
    ["A2", "A4", "B2", "B4"],
    ["A1", "A2", "B3", "B4"],
  ],
  paths: [
    {
      id: "central_cross",
      from: { x: -200, z: 0 },
      to: { x: 200, z: 0 },
      width: 20,
    },
    {
      id: "north_south",
      from: { x: 0, z: -150 },
      to: { x: 0, z: 150 },
      width: 18,
    },
    {
      id: "diagonal_ne",
      from: { x: -180, z: -120 },
      to: { x: 160, z: 120 },
      width: 12,
    },
    {
      id: "diagonal_se",
      from: { x: -180, z: 120 },
      to: { x: 160, z: -120 },
      width: 12,
    },
  ],
  obstacles: [
    {
      id: "rock_west",
      type: "rock",
      collider: "circle",
      layer: "staticObstacle",
      position: { x: -90, z: 60 },
      radius: 8,
      height: 4,
    },
    {
      id: "rock_center",
      type: "rock",
      collider: "circle",
      layer: "staticObstacle",
      position: { x: 20, z: 40 },
      radius: 6,
      height: 4,
    },
    {
      id: "forest_block",
      type: "treeCluster",
      collider: "circle",
      layer: "staticObstacle",
      position: { x: 60, z: 100 },
      radius: 14,
      height: 6,
    },
    {
      id: "cliff_east",
      type: "cliff",
      collider: "polygon",
      layer: "cliff",
      polygon: [
        { x: 70, z: -40 },
        { x: 120, z: -20 },
        { x: 140, z: 30 },
        { x: 100, z: 60 },
        { x: 60, z: 20 },
      ],
      height: 15,
    },
    {
      id: "cliff_south",
      type: "cliff",
      collider: "polygon",
      layer: "cliff",
      polygon: [
        { x: -40, z: -100 },
        { x: 20, z: -120 },
        { x: 60, z: -110 },
        { x: 30, z: -70 },
        { x: -20, z: -60 },
      ],
      height: 12,
    },
  ],
};

const TEAM_COLORS = {
  blue: "#53c5ff",
  red: "#ff7b7b",
};

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const centerPx = { x: canvas.width / 2, y: canvas.height / 2 };
const scale = MAP_CONFIG.canvasScale;

const state = {
  show: {
    terrain: true,
    zones: true,
    paths: true,
    obstacles: true,
    collision: true,
  },
  spawnSetIndex: 0,
  activeSpawns: [],
  launchOrigin: { x: -160, y: 2, z: 0 },
  trajectoryPoints: [],
  impactInfo: null,
};

const infoElements = {
  origin: document.getElementById("originInfo"),
  layer: document.getElementById("impactLayer"),
  coords: document.getElementById("impactCoords"),
  description: document.getElementById("impactDescription"),
};

const controlsForm = document.getElementById("controls");
const eventLog = document.getElementById("eventLog");
let needsRender = true;

const CollisionSystem = (() => {
  const semiMajor = MAP_CONFIG.size.width / 2;
  const semiMinor = MAP_CONFIG.size.height / 2;

  function isInside(x, z) {
    return x ** 2 / semiMajor ** 2 + z ** 2 / semiMinor ** 2 <= 1;
  }

  function distanceRatio(x, z) {
    return Math.sqrt(x ** 2 / semiMajor ** 2 + z ** 2 / semiMinor ** 2);
  }

  function projectOntoBoundary(x, z) {
    const ratio = distanceRatio(x, z);
    if (ratio === 0 || ratio <= 1) return { x, z };
    return { x: x / ratio, z: z / ratio };
  }

  function elevationAt(x, z) {
    if (!isInside(x, z)) return 0;
    const plateauRadius = MAP_CONFIG.elevationProfile.centerPlateauRadius;
    const distance = Math.hypot(x, z);
    if (distance <= plateauRadius) {
      return MAP_CONFIG.elevationProfile.max * 0.85;
    }
    const edgeFalloff = 1 - distanceRatio(x, z);
    const undulation =
      Math.sin((x + z) * 0.05) * 2 + Math.sin((x - z) * 0.03) * 1.5;
    return Math.max(
      2,
      edgeFalloff * MAP_CONFIG.elevationProfile.max + undulation
    );
  }

  function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].z;
      const xj = polygon[j].x;
      const zj = polygon[j].z;
      const intersect =
        zi > z !== zj > z &&
        x <
          ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) +
            xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function obstacleHit(x, z, y) {
    for (const obstacle of MAP_CONFIG.obstacles) {
      if (obstacle.collider === "circle") {
        const distance = Math.hypot(x - obstacle.position.x, z - obstacle.position.z);
        if (distance <= obstacle.radius && y <= obstacle.height + 1) {
          return { layer: obstacle.layer, target: obstacle, point: { x, y, z } };
        }
      }
      if (obstacle.collider === "polygon") {
        if (pointInPolygon(x, z, obstacle.polygon) && y <= obstacle.height + 2) {
          return { layer: obstacle.layer, target: obstacle, point: { x, y, z } };
        }
      }
    }
    return null;
  }

  return { isInside, projectOntoBoundary, elevationAt, obstacleHit };
})();

function invalidate() {
  needsRender = true;
}

function worldToCanvas(x, z) {
  return {
    x: centerPx.x + x * scale,
    y: centerPx.y - z * scale,
  };
}

function canvasToWorld(x, y) {
  return {
    x: (x - centerPx.x) / scale,
    z: (centerPx.y - y) / scale,
  };
}

function pickSpawnSet(index) {
  const ids =
    MAP_CONFIG.spawnCombos[index % MAP_CONFIG.spawnCombos.length];
  return MAP_CONFIG.spawnPoints.filter((sp) => ids.includes(sp.id));
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawOcean();
  if (state.show.terrain) {
    drawIslandBase();
  }
  if (state.show.zones) {
    drawZones();
  }
  if (state.show.paths) {
    drawPaths();
    drawSpawnPoints();
  } else {
    drawSpawnPoints();
  }
  if (state.show.obstacles) {
    drawObstacles();
  }
  if (state.show.collision) {
    drawCollisionOverlay();
    drawTrajectory();
  } else {
    drawLaunchOrigin();
  }
}

function drawGrid() {
  const spacing = scale * 50;
  ctx.save();
  ctx.strokeStyle = "rgba(83, 183, 255, 0.04)";
  ctx.lineWidth = 1;
  for (let x = centerPx.x % spacing; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = centerPx.y % spacing; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOcean() {
  ctx.save();
  ctx.fillStyle = "#021327";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawIslandBase() {
  const semiMajor = MAP_CONFIG.size.width / 2;
  const semiMinor = MAP_CONFIG.size.height / 2;
  ctx.save();
  const gradient = ctx.createRadialGradient(
    centerPx.x,
    centerPx.y,
    50,
    centerPx.x,
    centerPx.y,
    semiMajor * scale
  );
  gradient.addColorStop(0, "#235b3a");
  gradient.addColorStop(1, "#143020");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let firstPoint = true;
  for (let angle = 0; angle <= Math.PI * 2 + 0.01; angle += 0.05) {
    const x = semiMajor * Math.cos(angle);
    const z = semiMinor * Math.sin(angle);
    const { x: px, y: py } = worldToCanvas(x, z);
    if (firstPoint) {
      ctx.moveTo(px, py);
      firstPoint = false;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawZones() {
  ctx.save();
  // 中央高地
  ctx.fillStyle = "rgba(228, 255, 188, 0.22)";
  drawEllipse(MAP_CONFIG.elevationProfile.centerPlateauRadius, 65);
  // 森林带
  ctx.fillStyle = "rgba(77, 138, 89, 0.26)";
  drawEllipse(150, 115);
  // 海岸环带
  ctx.fillStyle = "rgba(255, 209, 140, 0.2)";
  drawEllipse(190, 140);
  ctx.restore();
}

function drawEllipse(radiusX, radiusZ) {
  ctx.beginPath();
  let firstPoint = true;
  for (let angle = 0; angle <= Math.PI * 2 + 0.01; angle += 0.05) {
    const x = radiusX * Math.cos(angle);
    const z = radiusZ * Math.sin(angle);
    const pos = worldToCanvas(x, z);
    if (firstPoint) {
      ctx.moveTo(pos.x, pos.y);
      firstPoint = false;
    } else {
      ctx.lineTo(pos.x, pos.y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function drawPaths() {
  ctx.save();
  ctx.lineCap = "round";
  for (const path of MAP_CONFIG.paths) {
    const start = worldToCanvas(path.from.x, path.from.z);
    const end = worldToCanvas(path.to.x, path.to.z);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = path.width * scale;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = "#ffd37b";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawSpawnPoints() {
  ctx.save();
  for (const spawn of state.activeSpawns) {
    const pos = worldToCanvas(spawn.position.x, spawn.position.z);
    ctx.fillStyle = TEAM_COLORS[spawn.team];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b0f14";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0b0f14";
    ctx.font = "700 12px 'Noto Sans SC'";
    ctx.textAlign = "center";
    ctx.fillText(spawn.id, pos.x, pos.y - 12);
  }
  ctx.restore();
}

function drawObstacles() {
  ctx.save();
  for (const obstacle of MAP_CONFIG.obstacles) {
    if (obstacle.collider === "circle") {
      const pos = worldToCanvas(obstacle.position.x, obstacle.position.z);
      ctx.beginPath();
      ctx.fillStyle =
        obstacle.type === "treeCluster"
          ? "rgba(29, 94, 60, 0.65)"
          : "rgba(71, 94, 110, 0.7)";
      ctx.strokeStyle =
        obstacle.type === "treeCluster" ? "#63d471" : "#8fb6ff";
      ctx.lineWidth = 2;
      ctx.arc(pos.x, pos.y, obstacle.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (obstacle.collider === "polygon") {
      ctx.beginPath();
      const first = worldToCanvas(obstacle.polygon[0].x, obstacle.polygon[0].z);
      ctx.moveTo(first.x, first.y);
      obstacle.polygon.forEach((point) => {
        const pos = worldToCanvas(point.x, point.z);
        ctx.lineTo(pos.x, pos.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(129, 103, 73, 0.6)";
      ctx.strokeStyle = "#f9c784";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLaunchOrigin() {
  const pos = worldToCanvas(state.launchOrigin.x, state.launchOrigin.z);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawCollisionOverlay() {
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(83, 183, 255, 0.4)";
  ctx.lineWidth = 2;
  const semiMajor = MAP_CONFIG.size.width / 2;
  const semiMinor = MAP_CONFIG.size.height / 2;
  ctx.beginPath();
  let firstPoint = true;
  for (let angle = 0; angle <= Math.PI * 2 + 0.01; angle += 0.05) {
    const x = (semiMajor + MAP_CONFIG.oceanPadding) * Math.cos(angle);
    const z = (semiMinor + MAP_CONFIG.oceanPadding) * Math.sin(angle);
    const pos = worldToCanvas(x, z);
    if (firstPoint) {
      ctx.moveTo(pos.x, pos.y);
      firstPoint = false;
    } else {
      ctx.lineTo(pos.x, pos.y);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  drawLaunchOrigin();
  ctx.restore();
}

function drawTrajectory() {
  if (!state.trajectoryPoints.length) return;
  ctx.save();
  ctx.strokeStyle = "#ff6b81";
  ctx.lineWidth = 3;
  ctx.beginPath();
  state.trajectoryPoints.forEach((point, index) => {
    const pos = worldToCanvas(point.x, point.z);
    if (index === 0) {
      ctx.moveTo(pos.x, pos.y);
    } else {
      ctx.lineTo(pos.x, pos.y);
    }
  });
  ctx.stroke();

  const last = state.impactInfo;
  if (last) {
    const impactPos = worldToCanvas(last.point.x, last.point.z);
    ctx.strokeStyle =
      last.layer === "staticObstacle" ? "#f7b32b" : "#ff3864";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(impactPos.x - 10, impactPos.y);
    ctx.lineTo(impactPos.x + 10, impactPos.y);
    ctx.moveTo(impactPos.x, impactPos.y - 10);
    ctx.lineTo(impactPos.x, impactPos.y + 10);
    ctx.stroke();
  }
  ctx.restore();
}

function simulateTrajectory() {
  const speed = Number(document.getElementById("speedInput").value);
  const pitch = Number(document.getElementById("pitchInput").value);
  const yaw = Number(document.getElementById("yawInput").value);
  if (Number.isNaN(speed) || Number.isNaN(pitch) || Number.isNaN(yaw)) {
    logEvent("请输入合法的发射参数。");
    return;
  }

  const pitchRad = (pitch * Math.PI) / 180;
  const yawRad = (yaw * Math.PI) / 180;
  const dt = 0.05;
  const maxSteps = 1200;

  let vx = speed * Math.cos(pitchRad) * Math.cos(yawRad);
  let vz = speed * Math.cos(pitchRad) * Math.sin(yawRad);
  let vy = speed * Math.sin(pitchRad);
  let x = state.launchOrigin.x;
  let y = state.launchOrigin.y;
  let z = state.launchOrigin.z;

  const trajectory = [{ x, y, z }];
  let impact = null;

  for (let step = 0; step < maxSteps; step += 1) {
    x += vx * dt;
    z += vz * dt;
    vy -= MAP_CONFIG.gravity * dt;
    y += vy * dt;

    const obstacleHit = CollisionSystem.obstacleHit(x, z, y);
    if (obstacleHit) {
      impact = {
        layer: obstacleHit.layer,
        description: `命中 ${obstacleHit.target.type}`,
        point: obstacleHit.point,
      };
      break;
    }

    const elevation = CollisionSystem.elevationAt(x, z);
    if (y <= elevation) {
      impact = {
        layer: "terrain",
        description: "命中地形",
        point: { x, y: elevation, z },
      };
      break;
    }

    if (!CollisionSystem.isInside(x, z) && y <= 0) {
      impact = {
        layer: "water",
        description: "坠入海水",
        point: { x, y: 0, z },
      };
      break;
    }

    trajectory.push({ x, y, z });
    if (y < -10) {
      impact = {
        layer: "void",
        description: "超出范围",
        point: { x, y, z },
      };
      break;
    }
  }

  state.trajectoryPoints = trajectory;
  state.impactInfo = impact;
  updateInfoPanel();
  if (impact) {
    logEvent(
      `箭矢 ${impact.description}，坐标 (${impact.point.x.toFixed(
        1
      )}, ${impact.point.z.toFixed(1)})`
    );
  } else {
    logEvent("箭矢尚未命中，轨迹已达到最大模拟帧。");
  }
  invalidate();
}

function resetTrajectory() {
  state.trajectoryPoints = [];
  state.impactInfo = null;
  updateInfoPanel();
  logEvent("已清除轨迹。");
  invalidate();
}

function shuffleSpawnPoints() {
  state.spawnSetIndex =
    (state.spawnSetIndex + 1) % MAP_CONFIG.spawnCombos.length;
  state.activeSpawns = pickSpawnSet(state.spawnSetIndex);
  logEvent(
    `刷点组合 ${state.spawnSetIndex + 1}：${state.activeSpawns
      .map((sp) => sp.id)
      .join(", ")}`
  );
  invalidate();
}

function setLaunchOriginFromCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let world = canvasToWorld(x, y);
  let snapped = false;
  if (!CollisionSystem.isInside(world.x, world.z)) {
    world = CollisionSystem.projectOntoBoundary(world.x, world.z);
    snapped = true;
  }
  state.launchOrigin = { x: world.x, y: 2, z: world.z };
  updateInfoPanel();
  logEvent(
    `发射点更新为 (${world.x.toFixed(1)}, ${world.z.toFixed(1)})${
      snapped ? "（已吸附至岛内）" : ""
    }`
  );
  invalidate();
}

function updateInfoPanel() {
  infoElements.origin.textContent = `(${state.launchOrigin.x.toFixed(
    1
  )}, ${state.launchOrigin.z.toFixed(1)}, ${state.launchOrigin.y.toFixed(1)})`;
  if (!state.impactInfo) {
    infoElements.layer.textContent = "-";
    infoElements.coords.textContent = "-";
    infoElements.description.textContent = "等待发射";
    return;
  }
  infoElements.layer.textContent = state.impactInfo.layer;
  infoElements.coords.textContent = `(${state.impactInfo.point.x.toFixed(
    1
  )}, ${state.impactInfo.point.z.toFixed(1)}, ${state.impactInfo.point.y.toFixed(
    1
  )})`;
  infoElements.description.textContent = state.impactInfo.description;
}

function logEvent(message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
  const entry = document.createElement("span");
  entry.textContent = `[${timestamp}] ${message}`;
  eventLog.prepend(entry);
  const children = eventLog.querySelectorAll("span");
  if (children.length > 15) {
    eventLog.removeChild(children[children.length - 1]);
  }
}

function attachEvents() {
  controlsForm
    .querySelectorAll("input[data-layer]")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const layer = event.target.dataset.layer;
        state.show[layer] = event.target.checked;
        invalidate();
      });
    });
  document.getElementById("fireBtn").addEventListener("click", simulateTrajectory);
  document
    .getElementById("resetTrajectoryBtn")
    .addEventListener("click", resetTrajectory);
  document
    .getElementById("shuffleSpawnsBtn")
    .addEventListener("click", shuffleSpawnPoints);
  canvas.addEventListener("click", setLaunchOriginFromCanvas);
}

function renderLoop() {
  if (needsRender) {
    drawScene();
    needsRender = false;
  }
  requestAnimationFrame(renderLoop);
}

function bootstrap() {
  state.activeSpawns = pickSpawnSet(state.spawnSetIndex);
  updateInfoPanel();
  logEvent("初始化完成，可开始交互。");
  attachEvents();
  invalidate();
  renderLoop();
}

bootstrap();
