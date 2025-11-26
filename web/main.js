import { createAbilityRegistry } from "./js/abilities/index.js";

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

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;
const distance2D = (a, b) =>
  Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? a.z ?? 0) - (b.y ?? b.z ?? 0));

const SEAL_SAMPLE_POINTS = 48;
const SEAL_SCORE_THRESHOLD = 0.45;
const SEAL_DISTANCE_THRESHOLD = 0.28;
const SEAL_BUFF_DURATION = 12000;
const SEAL_MOVE_TOLERANCE = 2.2;
const SEAL_TEMPLATE_PATH = [
  { x: 0.15, y: 0.2 },
  { x: 0.5, y: 0.85 },
  { x: 0.85, y: 0.2 },
];
const SEAL_TEMPLATE_SAMPLES = createTemplateSamples();

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
  abilityOverlays: [],
  activeAbilityId: null,
  seal: {
    drawing: false,
    points: [],
    lastScore: 0,
    statusText: "未结印",
    buff: {
      score: 0,
      expiresAt: 0,
      origin: null,
    },
  },
};

const infoElements = {
  ability: document.getElementById("abilityInfo"),
  origin: document.getElementById("originInfo"),
  layer: document.getElementById("impactLayer"),
  coords: document.getElementById("impactCoords"),
  description: document.getElementById("impactDescription"),
};

const controlsForm = document.getElementById("controls");
const abilitySelect = document.getElementById("abilitySelect");
const sidePanel = document.getElementById("sidePanel");
const panelToggle = document.getElementById("panelToggle");
const inputs = {
  speed: document.getElementById("speedInput"),
  pitch: document.getElementById("pitchInput"),
  yaw: document.getElementById("yawInput"),
  distance: document.getElementById("distanceInput"),
};
const inputGroups = {
  speed: controlsForm.querySelector('[data-input="speed"]'),
  pitch: controlsForm.querySelector('[data-input="pitch"]'),
  yaw: controlsForm.querySelector('[data-input="yaw"]'),
  distance: controlsForm.querySelector('[data-input="distance"]'),
};
const eventLog = document.getElementById("eventLog");
const sealCanvas = document.getElementById("sealCanvas");
const sealCtx = sealCanvas ? sealCanvas.getContext("2d") : null;
const sealStatusEl = document.getElementById("sealStatus");
const clearSealBtn = document.getElementById("clearSealBtn");
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

const abilityRegistry = createAbilityRegistry({
  mapConfig: MAP_CONFIG,
  collisionSystem: CollisionSystem,
});
const abilityMap = new Map(
  abilityRegistry.map((ability) => [ability.id, ability])
);

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
    drawAbilityOverlays();
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

function drawAbilityOverlays() {
  if (!state.abilityOverlays.length) return;
  ctx.save();
  state.abilityOverlays.forEach((overlay) => {
    if (overlay.type === "line") {
      const from = worldToCanvas(overlay.from.x, overlay.from.z);
      const to = worldToCanvas(overlay.to.x, overlay.to.z);
      ctx.strokeStyle = overlay.color || "#ffffff";
      ctx.lineWidth = overlay.width || 2;
      if (overlay.dashed) {
        ctx.setLineDash(overlay.dashed);
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      if (overlay.dashed) {
        ctx.setLineDash([]);
      }
    }
    if (overlay.type === "circle") {
      const center = worldToCanvas(overlay.center.x, overlay.center.z);
      ctx.beginPath();
      ctx.arc(center.x, center.y, overlay.radius * scale, 0, Math.PI * 2);
      if (overlay.fill) {
        ctx.fillStyle = overlay.fill;
        ctx.fill();
      }
      if (overlay.stroke) {
        if (overlay.dashed) {
          ctx.setLineDash(overlay.dashed);
        }
        ctx.strokeStyle = overlay.stroke;
        ctx.lineWidth = overlay.lineWidth || 1;
        ctx.stroke();
        if (overlay.dashed) {
          ctx.setLineDash([]);
        }
      }
    }
  });
  ctx.restore();
}

function executeActiveAbility() {
  const ability = abilityMap.get(state.activeAbilityId);
  if (!ability) {
    logEvent("未找到对应技能。");
    return;
  }

  const params = collectAbilityParams();
  const sealContext = prepareSealForAbility(ability);
  const enrichedParams = {
    ...params,
    sealPower: sealContext.power,
    sealRapidFire: sealContext.rapidFire,
  };
  const result = ability.execute({
    origin: state.launchOrigin,
    params: enrichedParams,
  });

  state.trajectoryPoints = result.trajectory || [];
  state.impactInfo = result.impact || null;
  state.abilityOverlays = result.overlays || [];
  updateInfoPanel();

  let message = result.message || "技能已执行。";
  if (state.impactInfo?.point) {
    const point = state.impactInfo.point;
    message = `${message}，坐标 (${point.x.toFixed(1)}, ${point.z.toFixed(
      1
    )})`;
  }
  logEvent(`【${ability.label}】${message}`);
  handleSealAfterCast(ability, sealContext);
  invalidate();
}

function collectAbilityParams() {
  return {
    speed: Number(inputs.speed.value),
    pitch: Number(inputs.pitch.value),
    yaw: Number(inputs.yaw.value),
    distance: Number(inputs.distance.value),
  };
}

function prepareSealForAbility(ability) {
  refreshSealBuff();
  if (!ability || ability.category !== "法师") {
    return { power: 0, rapidFire: false };
  }
  let power = clamp01(state.seal.lastScore || 0);
  let rapidFire = false;
  const buff = state.seal.buff;
  if (buff.score > 0 && buff.origin) {
    const now = performance.now();
    const anchorDist = distance2D(
      { x: state.launchOrigin.x, y: state.launchOrigin.z },
      { x: buff.origin.x, y: buff.origin.z }
    );
    const active =
      now < buff.expiresAt && anchorDist <= SEAL_MOVE_TOLERANCE;
    if (active) {
      power = Math.max(power, clamp01(buff.score));
      if (ability.id === "mage_fireball") {
        rapidFire = true;
      }
    }
  }
  return { power, rapidFire };
}

function handleSealAfterCast(ability, sealContext) {
  if (!ability || ability.category !== "法师") {
    return;
  }
  if (sealContext.power < SEAL_SCORE_THRESHOLD) {
    updateSealStatus("结印效果较弱，可重新绘制。", false);
    return;
  }
  const percentage = Math.round(clamp01(sealContext.power) * 100);
  if (sealContext.rapidFire && ability.id === "mage_fireball") {
    state.seal.buff.expiresAt = performance.now() + SEAL_BUFF_DURATION;
    updateSealStatus(`连发中（${percentage}%）`, true);
  } else {
    updateSealStatus(`结印生效（${percentage}%）`, true);
  }
}

function updateSealStatus(text, success) {
  state.seal.statusText = text;
  if (sealStatusEl) {
    sealStatusEl.textContent = text;
    sealStatusEl.style.color = success ? "#58f3c5" : "#f0f4ff";
  }
}

function refreshSealBuff() {
  const buff = state.seal.buff;
  if (buff.score > 0 && performance.now() > buff.expiresAt) {
    state.seal.buff = { score: 0, expiresAt: 0, origin: null };
    updateSealStatus("结印已过期，请重新绘制。", false);
  }
}

function resetTrajectory() {
  state.trajectoryPoints = [];
  state.impactInfo = null;
  state.abilityOverlays = [];
  updateInfoPanel();
  logEvent("已清除轨迹与技能覆盖。");
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

function initializeAbilityControls() {
  abilityRegistry.forEach((ability) => {
    const option = document.createElement("option");
    option.value = ability.id;
    option.textContent = ability.label;
    abilitySelect.appendChild(option);
  });

  const defaultAbility = abilityRegistry[0];
  if (defaultAbility) {
    setActiveAbility(defaultAbility.id, false);
  }

  abilitySelect.addEventListener("change", (event) => {
    setActiveAbility(event.target.value, true);
  });
}

function setActiveAbility(abilityId, shouldLog) {
  if (!abilityMap.has(abilityId)) return;
  state.activeAbilityId = abilityId;
  abilitySelect.value = abilityId;
  const ability = abilityMap.get(abilityId);
  applyAbilityDefaults(ability);
  refreshAbilityInputVisibility(ability);
  updateInfoPanel();
  if (shouldLog) {
    logEvent(`切换技能：${ability.label}`);
  }
}

function applyAbilityDefaults(ability) {
  const defaults = ability.defaults || {};
  Object.entries(inputs).forEach(([key, input]) => {
    if (defaults[key] !== undefined) {
      input.value = defaults[key];
    }
  });
}

function refreshAbilityInputVisibility(ability) {
  const required = ability.inputs || {};
  Object.entries(inputGroups).forEach(([key, group]) => {
    if (!group) return;
    const enabled = !!required[key];
    group.classList.toggle("input-hidden", !enabled);
    const field = inputs[key];
    if (field) {
      field.disabled = !enabled;
    }
  });
}

function initializePanelToggle() {
  if (!panelToggle || !sidePanel) return;
  let collapsed = false;
  const updateLabel = () => {
    panelToggle.textContent = collapsed ? "展开面板" : "折叠面板";
    panelToggle.setAttribute("aria-expanded", (!collapsed).toString());
  };
  panelToggle.addEventListener("click", () => {
    collapsed = !collapsed;
    sidePanel.classList.toggle("collapsed", collapsed);
    updateLabel();
  });
  updateLabel();
}

function initializeSealCanvas() {
  if (!sealCanvas || !sealCtx) return;
  sealCanvas.addEventListener("pointerdown", onSealPointerDown);
  sealCanvas.addEventListener("pointermove", onSealPointerMove);
  sealCanvas.addEventListener("pointerup", onSealPointerUp);
  sealCanvas.addEventListener("pointercancel", onSealPointerUp);
  sealCanvas.addEventListener("pointerleave", onSealPointerUp);
  if (clearSealBtn) {
    clearSealBtn.addEventListener("click", () => clearSealGesture(true));
  }
  drawSealCanvas();
  updateSealStatus(state.seal.statusText, false);
}

function onSealPointerDown(event) {
  if (!sealCanvas) return;
  event.preventDefault();
  sealCanvas.setPointerCapture(event.pointerId);
  state.seal.drawing = true;
  state.seal.points = [getSealCanvasPoint(event)];
  drawSealCanvas();
}

function onSealPointerMove(event) {
  if (!state.seal.drawing) return;
  event.preventDefault();
  state.seal.points.push(getSealCanvasPoint(event));
  drawSealCanvas();
}

function onSealPointerUp(event) {
  if (!state.seal.drawing) return;
  if (sealCanvas?.hasPointerCapture(event.pointerId)) {
    sealCanvas.releasePointerCapture(event.pointerId);
  }
  state.seal.drawing = false;
  finalizeSealGesture();
}

function getSealCanvasPoint(event) {
  const rect = sealCanvas.getBoundingClientRect();
  const ratioX = sealCanvas.width / rect.width;
  const ratioY = sealCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * ratioX,
    y: (event.clientY - rect.top) * ratioY,
  };
}

function finalizeSealGesture() {
  if (!state.seal.points.length) {
    return;
  }
  const normalized = normalizePath(state.seal.points);
  if (!normalized) {
    updateSealStatus("轨迹过短，未结印。", false);
    state.seal.points = [];
    drawSealCanvas();
    return;
  }
  const sampled = resamplePath(normalized, SEAL_SAMPLE_POINTS);
  const avgDistance = averageDistance(sampled, SEAL_TEMPLATE_SAMPLES);
  const score = clamp01(1 - avgDistance / SEAL_DISTANCE_THRESHOLD);
  state.seal.lastScore = score;
  const success = score >= SEAL_SCORE_THRESHOLD;
  const percentage = Math.round(score * 100);
  if (success) {
    state.seal.buff = {
      score,
      expiresAt: performance.now() + SEAL_BUFF_DURATION,
      origin: { x: state.launchOrigin.x, z: state.launchOrigin.z },
    };
    updateSealStatus(`结印成功（${percentage}%）`, true);
    logEvent(`结印成功：拟合 ${percentage}%`);
  } else {
    state.seal.buff = { score: 0, expiresAt: 0, origin: null };
    updateSealStatus(`结印失败（${percentage}%）`, false);
    logEvent(`结印失败：拟合 ${percentage}%`);
  }
  drawSealCanvas();
}

function clearSealGesture(silent = false) {
  state.seal.points = [];
  state.seal.lastScore = 0;
  state.seal.buff = { score: 0, expiresAt: 0, origin: null };
  updateSealStatus("未结印", false);
  drawSealCanvas();
  if (!silent) {
    logEvent("已清除结印。");
  }
}

function drawSealCanvas() {
  if (!sealCtx || !sealCanvas) return;
  const { width, height } = sealCanvas;
  sealCtx.clearRect(0, 0, width, height);
  sealCtx.fillStyle = "rgba(4, 10, 18, 0.6)";
  sealCtx.fillRect(0, 0, width, height);

  // Template guide
  sealCtx.strokeStyle = "rgba(83, 183, 255, 0.35)";
  sealCtx.lineWidth = 4;
  sealCtx.lineCap = "round";
  sealCtx.beginPath();
  const pad = 20;
  SEAL_TEMPLATE_PATH.forEach((point, index) => {
    const x = pad + point.x * (width - pad * 2);
    const y = pad + point.y * (height - pad * 2);
    if (index === 0) {
      sealCtx.moveTo(x, y);
    } else {
      sealCtx.lineTo(x, y);
    }
  });
  sealCtx.stroke();

  if (state.seal.points.length > 1) {
    sealCtx.strokeStyle = state.seal.lastScore >= SEAL_SCORE_THRESHOLD
      ? "#58f3c5"
      : "#f7b32b";
    if (state.seal.drawing) {
      sealCtx.strokeStyle = "#ffd37b";
    }
    sealCtx.lineWidth = 5;
    sealCtx.beginPath();
    state.seal.points.forEach((point, index) => {
      if (index === 0) {
        sealCtx.moveTo(point.x, point.y);
      } else {
        sealCtx.lineTo(point.x, point.y);
      }
    });
    sealCtx.stroke();
  }
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
  handleSealMovement(world);
  updateInfoPanel();
  logEvent(
    `发射点更新为 (${world.x.toFixed(1)}, ${world.z.toFixed(1)})${
      snapped ? "（已吸附至岛内）" : ""
    }`
  );
  invalidate();
}

function handleSealMovement(newOrigin) {
  const buff = state.seal.buff;
  if (!buff.origin || buff.score <= 0) return;
  const dist = distance2D(
    { x: newOrigin.x, y: newOrigin.z },
    { x: buff.origin.x, y: buff.origin.z }
  );
  if (dist > SEAL_MOVE_TOLERANCE) {
    state.seal.buff = { score: 0, expiresAt: 0, origin: null };
    updateSealStatus("已移动，需重新结印。", false);
  }
}

function updateInfoPanel() {
  const ability = abilityMap.get(state.activeAbilityId);
  infoElements.ability.textContent = ability ? ability.label : "-";
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
  document.getElementById("fireBtn").addEventListener("click", executeActiveAbility);
  document
    .getElementById("resetTrajectoryBtn")
    .addEventListener("click", resetTrajectory);
  document
    .getElementById("shuffleSpawnsBtn")
    .addEventListener("click", shuffleSpawnPoints);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
    }
    setLaunchOriginFromCanvas(event);
  });
}

function renderLoop() {
  if (needsRender) {
    drawScene();
    needsRender = false;
  }
  requestAnimationFrame(renderLoop);
}

function averageDistance(pointsA, pointsB) {
  const len = Math.min(pointsA.length, pointsB.length);
  if (!len) return 1;
  let total = 0;
  for (let i = 0; i < len; i += 1) {
    total += distanceXY(pointsA[i], pointsB[i]);
  }
  return total / len;
}

function normalizePath(points) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);
  if (maxDim < 10) {
    return null;
  }
  return points.map((point) => ({
    x: (point.x - minX) / maxDim,
    y: (point.y - minY) / maxDim,
  }));
}

function resamplePath(points, sampleCount) {
  if (!points.length) return [];
  if (points.length === 1) return Array(sampleCount).fill(points[0]);
  const totalLength = pathLength(points);
  if (totalLength === 0) {
    return Array(sampleCount).fill(points[0]);
  }
  const interval = totalLength / Math.max(sampleCount - 1, 1);
  const newPoints = [points[0]];
  let accumulated = 0;
  for (let i = 1; i < points.length; i += 1) {
    let prev = points[i - 1];
    let curr = points[i];
    let segment = distanceXY(prev, curr);
    if (!segment) continue;
    while (accumulated + segment >= interval && newPoints.length < sampleCount) {
      const t = (interval - accumulated) / segment;
      const nx = lerp(prev.x, curr.x, t);
      const ny = lerp(prev.y, curr.y, t);
      const newPoint = { x: nx, y: ny };
      newPoints.push(newPoint);
      prev = newPoint;
      segment = distanceXY(prev, curr);
      accumulated = 0;
    }
    accumulated += segment;
  }
  while (newPoints.length < sampleCount) {
    newPoints.push({ ...points[points.length - 1] });
  }
  return newPoints;
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceXY(points[i - 1], points[i]);
  }
  return total;
}

function distanceXY(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function createTemplateSamples() {
  return resamplePath(SEAL_TEMPLATE_PATH, SEAL_SAMPLE_POINTS);
}

function bootstrap() {
  state.activeSpawns = pickSpawnSet(state.spawnSetIndex);
  initializeAbilityControls();
  initializePanelToggle();
  initializeSealCanvas();
  updateInfoPanel();
  logEvent("初始化完成，可开始交互。");
  attachEvents();
  invalidate();
  renderLoop();
}

bootstrap();
