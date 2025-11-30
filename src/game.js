(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const elements = {
    wave: document.getElementById("wave"),
    lives: document.getElementById("lives"),
    money: document.getElementById("money"),
    status: document.getElementById("status"),
    log: document.getElementById("log"),
    startBtn: document.getElementById("startBtn"),
    resetBtn: document.getElementById("resetBtn"),
  };

  const PATH = [
    { x: 40, y: 260 },
    { x: 260, y: 260 },
    { x: 260, y: 120 },
    { x: 560, y: 120 },
    { x: 560, y: 420 },
    { x: 900, y: 420 },
  ];

  const BUILD_SLOTS = [
    { x: 160, y: 180, radius: 26 },
    { x: 160, y: 360, radius: 26 },
    { x: 360, y: 180, radius: 26 },
    { x: 360, y: 360, radius: 26 },
    { x: 640, y: 220, radius: 26 },
    { x: 740, y: 360, radius: 26 },
  ].map((slot, idx) => ({ ...slot, id: `slot-${idx}` }));

  const COLORS = {
    background: "#050710",
    grid: "rgba(255,255,255,0.04)",
    path: "#152436",
    pathBorder: "#1f3b5c",
    enemy: "#ffb347",
    tower: "#5ad8ff",
    towerAlt: "#8a7dff",
    hover: "rgba(95, 223, 255, 0.2)",
  };

  const ENEMY_TYPES = [
    {
      id: "prism",
      label: "棱镜方阵",
      shape: "square",
      color: "#ffb347",
      size: 24,
      speedBase: 56,
      speedScale: 2.2,
      hpBase: 70,
      hpScale: 22,
      rewardBase: 6,
      rewardScale: 0.85,
      batch: 1,
      unlockWave: 1,
      weight: 1,
      weightGrowth: 0.04,
      description: "标准矩阵敌人，攻守兼备。",
    },
    {
      id: "raptor",
      label: "三角疾行者",
      shape: "triangle",
      color: "#ffd166",
      size: 22,
      speedBase: 92,
      speedScale: 3,
      hpBase: 45,
      hpScale: 14,
      rewardBase: 5,
      rewardScale: 0.6,
      batch: 1,
      unlockWave: 2,
      weight: 0.6,
      weightGrowth: 0.05,
      description: "速度极快但身板脆弱的侦察单位。",
    },
    {
      id: "bulwark",
      label: "六边碉堡",
      shape: "hex",
      color: "#ff6b6b",
      size: 30,
      speedBase: 36,
      speedScale: 1.2,
      hpBase: 140,
      hpScale: 38,
      rewardBase: 10,
      rewardScale: 1.2,
      batch: 1,
      unlockWave: 4,
      weight: 0.45,
      weightGrowth: 0.06,
      description: "行动缓慢但装甲厚实，难以击破。",
    },
    {
      id: "swarm",
      label: "圆核蜂群",
      shape: "circle",
      color: "#7dd3fc",
      size: 18,
      speedBase: 72,
      speedScale: 2.4,
      hpBase: 38,
      hpScale: 12,
      rewardBase: 3,
      rewardScale: 0.45,
      batch: 2,
      unlockWave: 3,
      weight: 0.5,
      weightGrowth: 0.07,
      description: "成群结队的小型单位，善于淹没防线。",
    },
  ];

  const CONSTANTS = {
    towerCost: 40,
    baseLives: 15,
    baseMoney: 120,
    maxLogLines: 6,
  };

  const state = {
    lives: CONSTANTS.baseLives,
    money: CONSTANTS.baseMoney,
    wave: 0,
    running: false,
    isGameOver: false,
    enemies: [],
    towers: [],
    beams: [],
    messages: ["指挥官，欢迎来到几何塔防试验场。"],
    waveController: null,
    hoverSlot: null,
    cursor: null,
    statusText: "等待指令",
    discoveredTypes: new Set(),
  };

  class Enemy {
    constructor(strength, blueprint) {
      this.blueprint = blueprint;
      this.size = blueprint.size;
      this.shape = blueprint.shape;
      this.color = blueprint.color;
      this.speed = blueprint.speedBase + strength * blueprint.speedScale + Math.random() * 10;
      this.maxHp = blueprint.hpBase + strength * blueprint.hpScale;
      this.hp = this.maxHp;
      this.reward = Math.max(1, Math.round(blueprint.rewardBase + strength * blueprint.rewardScale));
      this.pathIndex = 0;
      this.x = PATH[0].x;
      this.y = PATH[0].y;
      this.finished = false;
      this.hitBase = false;
      this.typeId = blueprint.id;
      this.label = blueprint.label;
    }

    update(delta) {
      if (this.finished) return;
      const target = PATH[this.pathIndex + 1];
      if (!target) {
        this.finished = true;
        this.hitBase = true;
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) {
        this.pathIndex += 1;
        return;
      }
      const move = this.speed * delta;
      if (move >= dist) {
        this.x = target.x;
        this.y = target.y;
        this.pathIndex += 1;
      } else {
        const ratio = move / dist;
        this.x += dx * ratio;
        this.y += dy * ratio;
      }
    }

    takeDamage(amount) {
      this.hp -= amount;
      if (this.hp <= 0) {
        this.finished = true;
        this.hp = 0;
        return true;
      }
      return false;
    }

    draw(context) {
      context.save();
      context.translate(this.x, this.y);
      context.fillStyle = this.color;
      context.strokeStyle = "#1d1d1d";
      context.lineWidth = 2;
      context.beginPath();
      const half = this.size / 2;
      switch (this.shape) {
        case "triangle":
          context.moveTo(0, -half);
          context.lineTo(half, half);
          context.lineTo(-half, half);
          break;
        case "diamond":
          context.moveTo(0, -half);
          context.lineTo(half, 0);
          context.lineTo(0, half);
          context.lineTo(-half, 0);
          break;
        case "circle":
          context.arc(0, 0, half, 0, Math.PI * 2);
          break;
        case "hex":
          for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const px = Math.cos(angle) * half;
            const py = Math.sin(angle) * half;
            if (i === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
          }
          break;
        default:
          context.rect(-half, -half, this.size, this.size);
          break;
      }
      context.closePath();
      context.fill();
      context.stroke();

      const hpRatio = this.hp / this.maxHp;
      context.fillStyle = "#0f172a";
      context.fillRect(-half, -half - 10, this.size, 4);
      context.fillStyle = hpRatio > 0.4 ? "#22d3ee" : "#fb7185";
      context.fillRect(-half, -half - 10, this.size * hpRatio, 4);
      context.restore();
    }
  }

  class Tower {
    constructor(slot, index) {
      this.x = slot.x;
      this.y = slot.y;
      this.range = 150;
      this.fireDelay = 0.7;
      this.cooldown = 0;
      this.damage = 40;
      this.size = 28;
      this.color = index % 2 === 0 ? COLORS.tower : COLORS.towerAlt;
    }

    update(delta, enemies) {
      if (this.cooldown > 0) {
        this.cooldown -= delta;
        return null;
      }
      const target = findTarget(enemies, this.x, this.y, this.range);
      if (!target) return null;
      target.takeDamage(this.damage);
      this.cooldown = this.fireDelay;
      return new Beam({ x: this.x, y: this.y }, { x: target.x, y: target.y });
    }

    draw(context, showRange = false) {
      context.save();
      context.translate(this.x, this.y);
      if (showRange) {
        context.fillStyle = "rgba(90, 216, 255, 0.08)";
        context.beginPath();
        context.arc(0, 0, this.range, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = this.color;
      context.strokeStyle = "#04121c";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(0, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  class Beam {
    constructor(from, to) {
      this.from = from;
      this.to = { ...to };
      this.ttl = 0.12;
      this.maxTtl = 0.12;
    }

    update(delta) {
      this.ttl -= delta;
    }

    draw(context) {
      const alpha = Math.max(this.ttl / this.maxTtl, 0);
      context.save();
      context.strokeStyle = `rgba(79, 223, 255, ${alpha})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(this.from.x, this.from.y);
      context.lineTo(this.to.x, this.to.y);
      context.stroke();
      context.restore();
    }

    get alive() {
      return this.ttl > 0;
    }
  }

  function findTarget(enemies, x, y, range) {
    let best = null;
    let bestProgress = -Infinity;
    for (const enemy of enemies) {
      if (enemy.finished) continue;
      const dist = distance(enemy, { x, y });
      if (dist > range) continue;
      const progress = enemy.pathIndex + dist * -0.001;
      if (progress > bestProgress) {
        best = enemy;
        bestProgress = progress;
      }
    }
    return best;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function startWave() {
    if (state.isGameOver) return;
    if (state.waveController && state.waveController.active) {
      pushMessage("当前波次尚未结束。");
      return;
    }
    if (state.enemies.length > 0) {
      pushMessage("清理残余敌人后再发动新一波。");
      return;
    }
    state.wave += 1;
    const size = Math.min(12 + state.wave * 2, 40);
    state.waveController = {
      active: true,
      remaining: size,
      timer: 0,
      interval: Math.max(0.35, 1.1 - state.wave * 0.06),
      strength: state.wave,
    };
    state.running = true;
    state.statusText = `第 ${state.wave} 波进行中`;
    pushMessage(`第 ${state.wave} 波来袭（敌人数：${size}）`);
    updateHUD();
  }

  function resetGame() {
    state.lives = CONSTANTS.baseLives;
    state.money = CONSTANTS.baseMoney;
    state.wave = 0;
    state.running = false;
    state.isGameOver = false;
    state.enemies = [];
    state.towers = [];
    state.beams = [];
    state.waveController = null;
    state.statusText = "等待指令";
    state.messages = ["战场已重置，准备部署。"];
    state.discoveredTypes = new Set();
    BUILD_SLOTS.forEach((slot) => {
      slot.occupied = false;
      slot.tower = null;
    });
    renderLog();
    updateHUD();
  }

  function tryPlaceTower(slot) {
    if (state.isGameOver) return;
    if (slot.occupied) {
      pushMessage("该位置已部署塔。");
      return;
    }
    if (state.money < CONSTANTS.towerCost) {
      pushMessage("能量不足，无法部署塔。");
      return;
    }
    state.money -= CONSTANTS.towerCost;
    const tower = new Tower(slot, state.towers.length);
    state.towers.push(tower);
    slot.occupied = true;
    slot.tower = tower;
    pushMessage("新的塔已上线！");
    updateHUD();
  }

  function pushMessage(text) {
    state.messages.unshift(text);
    state.messages = state.messages.slice(0, CONSTANTS.maxLogLines);
    renderLog();
  }

  function renderLog() {
    elements.log.innerHTML = "";
    state.messages.forEach((msg) => {
      const li = document.createElement("li");
      li.textContent = msg;
      elements.log.appendChild(li);
    });
  }

  function updateHUD() {
    elements.wave.textContent = state.wave.toString();
    elements.lives.textContent = state.lives.toString();
    elements.money.textContent = state.money.toString();
    elements.status.textContent = state.statusText;
    const waveActive = Boolean(state.waveController && state.waveController.active);
    elements.startBtn.disabled = waveActive || state.isGameOver;
  }

  function update(delta) {
    if (state.isGameOver) {
      state.beams.forEach((beam) => beam.update(delta));
      state.beams = state.beams.filter((beam) => beam.alive);
      return;
    }

    if (state.waveController && state.waveController.active) {
      state.waveController.timer -= delta;
      if (state.waveController.timer <= 0 && state.waveController.remaining > 0) {
        const type = pickEnemyType(state.waveController.strength);
        const batchSize = Math.min(type.batch || 1, state.waveController.remaining);
        spawnEnemy(state.waveController.strength, type, batchSize);
        state.waveController.remaining -= batchSize;
        state.waveController.timer = state.waveController.interval;
      }
    }

    state.enemies.forEach((enemy) => enemy.update(delta));

    state.towers.forEach((tower) => {
      const beam = tower.update(delta, state.enemies);
      if (beam) state.beams.push(beam);
    });

    let escapedCount = 0;
    let loot = 0;
    const survivors = [];
    state.enemies.forEach((enemy) => {
      if (enemy.hitBase) {
        escapedCount += 1;
        return;
      }
      if (enemy.finished) {
        loot += enemy.reward;
        return;
      }
      survivors.push(enemy);
    });
    state.enemies = survivors;

    if (escapedCount > 0) {
      state.lives -= escapedCount;
      state.statusText = state.lives > 0 ? "基地受到攻击" : "基地沦陷";
      pushMessage(`${escapedCount} 名敌人突破防线！`);
      if (state.lives <= 0) {
        state.isGameOver = true;
        state.running = false;
        state.waveController = null;
        pushMessage("任务失败，点击重置重新挑战。");
      }
      updateHUD();
    }

    if (loot > 0) {
      state.money += loot;
      pushMessage(`击毁敌人，获得能量 +${loot}`);
      updateHUD();
    }

    if (
      state.waveController &&
      state.waveController.active &&
      state.waveController.remaining <= 0 &&
      state.enemies.length === 0
    ) {
      state.waveController.active = false;
      state.running = false;
      state.statusText = "等待指令";
      pushMessage(`第 ${state.wave} 波结束，战场暂时安全。`);
      updateHUD();
    }

    state.beams.forEach((beam) => beam.update(delta));
    state.beams = state.beams.filter((beam) => beam.alive);
  }

  function spawnEnemy(strength, blueprint = ENEMY_TYPES[0], count = 1) {
    discoverType(blueprint);
    for (let i = 0; i < count; i += 1) {
      state.enemies.push(new Enemy(strength, blueprint));
    }
  }

  function pickEnemyType(wave) {
    const candidates = ENEMY_TYPES.map((type) => ({
      type,
      weight: getTypeWeight(type, wave),
    })).filter((entry) => entry.weight > 0);
    if (candidates.length === 0) return ENEMY_TYPES[0];
    const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of candidates) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.type;
      }
    }
    return candidates[candidates.length - 1].type;
  }

  function getTypeWeight(type, wave) {
    if (wave < type.unlockWave) return 0;
    const growth = type.weightGrowth || 0;
    const base = type.weight || 0.1;
    return Math.max(base + (wave - type.unlockWave) * growth, 0.05);
  }

  function discoverType(type) {
    if (!state.discoveredTypes.has(type.id)) {
      state.discoveredTypes.add(type.id);
      pushMessage(`侦测到新敌人【${type.label}】：${type.description}`);
    }
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const grid = 60;
    for (let x = 0; x < canvas.width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.lineWidth = 28;
    ctx.lineCap = "round";
    ctx.strokeStyle = COLORS.path;
    ctx.beginPath();
    PATH.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.strokeStyle = COLORS.pathBorder;
    ctx.stroke();
  }

  function drawSlots() {
    BUILD_SLOTS.forEach((slot) => {
      ctx.save();
      ctx.translate(slot.x, slot.y);
      ctx.beginPath();
      ctx.arc(0, 0, slot.radius, 0, Math.PI * 2);
      ctx.strokeStyle = slot.occupied ? COLORS.tower : "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!slot.occupied && state.hoverSlot === slot) {
        ctx.fillStyle = COLORS.hover;
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawCursor() {
    if (!state.cursor) return;
    ctx.save();
    ctx.translate(state.cursor.x, state.cursor.y);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawSlots();
    state.towers.forEach((tower) => {
      const highlight = state.hoverSlot && state.hoverSlot.tower === tower;
      tower.draw(ctx, highlight);
    });
    state.beams.forEach((beam) => beam.draw(ctx));
    state.enemies.forEach((enemy) => enemy.draw(ctx));
    drawCursor();
  }

  function loop(timestamp) {
    if (!loop.last) loop.last = timestamp;
    const delta = Math.min((timestamp - loop.last) / 1000, 0.05);
    loop.last = timestamp;
    update(delta);
    draw();
    requestAnimationFrame(loop);
  }

  function getCanvasPosition(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerMove(evt) {
    const pos = getCanvasPosition(evt);
    state.cursor = pos;
    state.hoverSlot = BUILD_SLOTS.find((slot) => distance(slot, pos) <= slot.radius);
  }

  function handlePointerLeave() {
    state.cursor = null;
    state.hoverSlot = null;
  }

  function handlePointerDown(evt) {
    const pos = getCanvasPosition(evt);
    const slot = BUILD_SLOTS.find((s) => distance(s, pos) <= s.radius);
    if (slot) {
      tryPlaceTower(slot);
    }
  }

  elements.startBtn.addEventListener("click", startWave);
  elements.resetBtn.addEventListener("click", resetGame);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("pointerdown", handlePointerDown);

  resetGame();
  requestAnimationFrame(loop);
})();
