const FIREBALL_MAX_RANGE = 220;
const FIREBALL_HEIGHT = 8;
const FIREBALL_STEP = 0.04;
const METEOR_CHANNEL = 3.5;
const METEOR_RADIUS = 20;
const METEOR_MIN_DISTANCE = 30;
const METEOR_MAX_DISTANCE = 180;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degToRad = (value) => (value * Math.PI) / 180;

export function createMageAbilities({ collisionSystem }) {
  return [createFireballAbility({ collisionSystem }), createMeteorAbility({ collisionSystem })];
}

function createFireballAbility({ collisionSystem }) {
  const label = "法师 · 火球术";

  return {
    id: "mage_fireball",
    category: "法师",
    label,
    description: "直线飞行，命中首个单位或地形",
    inputs: { speed: true, yaw: true },
    defaults: { speed: 70, yaw: 0 },
    execute({ origin, params }) {
      const speed = clamp(Number(params.speed) || 0, 5, 140);
      const yaw = Number.isFinite(params.yaw) ? Number(params.yaw) : 0;
      const sealPower = clamp(Number(params.sealPower) || 0, 0, 1);
      const rapidFire = Boolean(params.sealRapidFire);
      const yawRad = degToRad(yaw);

      const damageMultiplier = 1 + sealPower * 0.8;
      const rangeBoost = 1 + sealPower * 0.25;
      const vx = speed * Math.cos(yawRad);
      const vz = speed * Math.sin(yawRad);
      const height = Math.max(origin.y + 4, FIREBALL_HEIGHT);

      let x = origin.x;
      let z = origin.z;
      const y = height;

      const trajectory = [{ x, y, z }];
      let impact = null;
      let traveled = 0;

      const effectiveRange = FIREBALL_MAX_RANGE * rangeBoost;
      const maxSteps = Math.ceil(
        effectiveRange / (speed * FIREBALL_STEP + Number.EPSILON)
      );

      for (let step = 0; step < maxSteps; step += 1) {
        x += vx * FIREBALL_STEP;
        z += vz * FIREBALL_STEP;
        traveled += speed * FIREBALL_STEP;

        const obstacleHit = collisionSystem.obstacleHit(x, z, y);
        if (obstacleHit) {
          impact = {
            layer: obstacleHit.layer,
            description: `火球命中 ${obstacleHit.target.type}`,
            point: obstacleHit.point,
          };
          break;
        }

        const elevation = collisionSystem.elevationAt(x, z);
        if (y <= elevation + 1.5) {
          impact = {
            layer: "terrain",
            description: "火球撞击地表",
            point: { x, y: elevation, z },
          };
          break;
        }

        if (!collisionSystem.isInside(x, z)) {
          impact = {
            layer: "water",
            description: "火球坠入海面",
            point: { x, y: 0, z },
          };
          break;
        }

        trajectory.push({ x, y, z });

        if (traveled >= FIREBALL_MAX_RANGE) {
          break;
        }
      }

      if (!impact) {
        impact = {
          layer: "range",
          description: "火球能量耗尽",
          point: { x, y, z },
        };
      }

      return {
        trajectory,
        impact,
        overlays: [],
        message: `${impact.description} · 威力x${damageMultiplier
          .toFixed(2)
          .replace(/\.00$/, "")}${rapidFire ? "（连发）" : ""}`,
      };
    },
  };
}

function createMeteorAbility({ collisionSystem }) {
  const label = "法师 · 陨石术";

  return {
    id: "mage_meteor",
    category: "法师",
    label,
    description: "长时间引导后对大范围造成伤害",
    inputs: { yaw: true, distance: true },
    defaults: { yaw: 0, distance: 80 },
    execute({ origin, params }) {
      const yaw = Number.isFinite(params.yaw) ? Number(params.yaw) : 0;
      const sealPower = clamp(Number(params.sealPower) || 0, 0, 1);
      const distance = clamp(
        Number.isFinite(params.distance) ? Number(params.distance) : 80,
        METEOR_MIN_DISTANCE,
        METEOR_MAX_DISTANCE
      );
      const radiusScale = 1 + sealPower * 0.4;
      const channelTime = METEOR_CHANNEL * (1 - sealPower * 0.2);
      const yawRad = degToRad(yaw);

      let target = {
        x: origin.x + Math.cos(yawRad) * distance,
        z: origin.z + Math.sin(yawRad) * distance,
      };

      if (!collisionSystem.isInside(target.x, target.z)) {
        target = collisionSystem.projectOntoBoundary(target.x, target.z);
      }

      const overlays = [
        {
          type: "line",
          from: { x: origin.x, z: origin.z },
          to: target,
          color: "rgba(255, 114, 92, 0.5)",
          width: 2,
          dashed: [8, 6],
        },
        {
          type: "circle",
          center: target,
          radius: METEOR_RADIUS * radiusScale,
          stroke: "#ff724c",
          fill: "rgba(255, 114, 92, 0.2)",
          lineWidth: 2,
          dashed: [12, 8],
        },
      ];

      const impact = {
        layer: "aoe",
        description: `陨石术落点（引导 ${channelTime.toFixed(1)}s · 半径 x${radiusScale.toFixed(
          2
        )})`,
        point: {
          x: target.x,
          y: collisionSystem.elevationAt(target.x, target.z) + 30,
          z: target.z,
        },
        extra: {
          radius: METEOR_RADIUS * radiusScale,
          channel: channelTime,
        },
      };

      return {
        trajectory: [],
        impact,
        overlays,
        message: `陨石术将在 ${channelTime.toFixed(
          1
        )}s 后轰炸半径 ${(METEOR_RADIUS * radiusScale).toFixed(1)}m 区域`,
      };
    },
  };
}
