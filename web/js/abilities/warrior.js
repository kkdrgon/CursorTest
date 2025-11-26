const MAX_RANGE = 8;
const IMPACT_RADIUS = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degToRad = (value) => (value * Math.PI) / 180;

export function createWarriorAbility({ collisionSystem }) {
  const label = "战士 · 近战斩击";

  return {
    id: "warrior_melee",
    category: "战士",
    label,
    description: "仅限 8m 内的扇形打击",
    inputs: { yaw: true, distance: true },
    defaults: { yaw: 0, distance: 5 },
    execute({ origin, params }) {
      const yaw = Number.isFinite(params.yaw) ? Number(params.yaw) : 0;
      const requestedDistance = Number.isFinite(params.distance)
        ? Number(params.distance)
        : 5;

      const yawRad = degToRad(yaw);
      const distance = clamp(requestedDistance, 1, MAX_RANGE);

      let target = {
        x: origin.x + Math.cos(yawRad) * distance,
        z: origin.z + Math.sin(yawRad) * distance,
      };

      if (!collisionSystem.isInside(target.x, target.z)) {
        target = collisionSystem.projectOntoBoundary(target.x, target.z);
      }

      const overlays = [
        {
          type: "circle",
          center: { x: origin.x, z: origin.z },
          radius: MAX_RANGE,
          stroke: "#f4a259",
          fill: "rgba(244, 162, 89, 0.07)",
          lineWidth: 1.5,
          dashed: [10, 8],
        },
        {
          type: "line",
          from: { x: origin.x, z: origin.z },
          to: target,
          color: "#f4a259",
          width: 4,
        },
        {
          type: "circle",
          center: target,
          radius: IMPACT_RADIUS,
          stroke: "#ffb347",
          fill: "rgba(255, 179, 71, 0.25)",
          lineWidth: 2,
        },
      ];

      const steps = 16;
      let obstacleImpact = null;
      for (let i = 1; i <= steps; i += 1) {
        const t = (distance / steps) * i;
        const probe = {
          x: origin.x + Math.cos(yawRad) * t,
          z: origin.z + Math.sin(yawRad) * t,
        };
        const hit = collisionSystem.obstacleHit(probe.x, probe.z, origin.y);
        if (hit) {
          obstacleImpact = hit;
          target = probe;
          break;
        }
      }

      let impact;
      let message;
      if (obstacleImpact) {
        impact = {
          layer: obstacleImpact.layer,
          description: `动作受阻：${obstacleImpact.target.type}`,
          point: obstacleImpact.point,
        };
        message = "近战轨迹被静态障碍阻挡";
      } else {
        impact = {
          layer: "melee",
          description: `斩击覆盖半径 ${IMPACT_RADIUS}m`,
          point: { x: target.x, y: origin.y, z: target.z },
          extra: { radius: IMPACT_RADIUS },
        };
        message =
          requestedDistance > MAX_RANGE
            ? `距离超出 ${MAX_RANGE}m，已截断为 ${distance.toFixed(1)}m`
            : "近战斩击范围准备完毕";
      }

      return {
        trajectory: [],
        impact,
        overlays,
        message,
      };
    },
  };
}
