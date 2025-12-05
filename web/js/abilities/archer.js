const STEP_TIME = 0.05;
const MAX_STEPS = 1200;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degToRad = (value) => (value * Math.PI) / 180;

export function createArcherAbility({ mapConfig, collisionSystem }) {
  const label = "弓箭手 · 蓄力射击";

  return {
    id: "archer_shot",
    category: "弓箭手",
    label,
    description: "无锁定抛物线攻击",
    inputs: { speed: true, pitch: true, yaw: true },
    defaults: { speed: 55, pitch: 38, yaw: 0 },
    execute({ origin, params }) {
      const speed = clamp(Number(params.speed) || 0, 5, 120);
      const pitch = clamp(Number(params.pitch) || 38, 5, 80);
      const yaw = Number.isFinite(params.yaw) ? Number(params.yaw) : 0;

      const pitchRad = degToRad(pitch);
      const yawRad = degToRad(yaw);

      let vx = speed * Math.cos(pitchRad) * Math.cos(yawRad);
      let vz = speed * Math.cos(pitchRad) * Math.sin(yawRad);
      let vy = speed * Math.sin(pitchRad);

      let x = origin.x;
      let y = origin.y;
      let z = origin.z;

      const trajectory = [{ x, y, z }];
      let impact = null;

      for (let step = 0; step < MAX_STEPS; step += 1) {
        x += vx * STEP_TIME;
        z += vz * STEP_TIME;
        vy -= mapConfig.gravity * STEP_TIME;
        y += vy * STEP_TIME;

        const obstacleHit = collisionSystem.obstacleHit(x, z, y);
        if (obstacleHit) {
          impact = {
            layer: obstacleHit.layer,
            description: `命中 ${obstacleHit.target.type}`,
            point: obstacleHit.point,
          };
          break;
        }

        const elevation = collisionSystem.elevationAt(x, z);
        if (y <= elevation) {
          impact = {
            layer: "terrain",
            description: "命中地形",
            point: { x, y: elevation, z },
          };
          break;
        }

        if (!collisionSystem.isInside(x, z) && y <= 0) {
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
            description: "超出模拟空间",
            point: { x, y, z },
          };
          break;
        }
      }

      const message = impact
        ? impact.description
        : "轨迹到达模拟上限，未检测到命中";

      return {
        trajectory,
        impact,
        overlays: [],
        message,
      };
    },
  };
}
