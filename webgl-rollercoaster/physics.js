import { Vec3 } from './math3d.js';

/**
 * 过山车物理模拟和特征值计算
 */
export class RollerCoasterPhysics {
    constructor(spline, trackGenerator, getPointInfoByDistance = null) {
        this.spline = spline;
        this.trackGenerator = trackGenerator;
        this.getPointInfoByDistance = getPointInfoByDistance; // 从距离获取点信息的函数
        this.gravity = 9.81; // 重力加速度 m/s²
        
        // 物理状态
        this.currentSpeed = 0; // 当前速度 m/s（可以为负，表示反向）
        this.currentAcceleration = 0; // 当前加速度 m/s²
        this.currentDistance = 0; // 当前位置（沿轨道的距离，米）
        
        // 能量守恒相关变量
        this.initialTotalEnergy = 0; // 初始总能量（动能 + 势能）
        this.initialHeight = 0; // 初始高度（米）
        this.initialSpeed = 0; // 初始速度（m/s）
        this.cumulativeFrictionWork = 0; // 累积摩擦力做功（J）
        this.lastDistance = 0; // 上一次的距离，用于计算摩擦力做功
        this.lastHeight = 0; // 上一次的高度
        
        // 摩擦参数
        this.frictionCoefficient = 0.02; // 动摩擦系数（无量纲）
        this.staticFrictionCoefficient = 0.03; // 静摩擦系数（通常比动摩擦系数大）
        this.airResistanceCoefficient = 0.001; // 空气阻力系数（1/m）
        this.mass = 1.0; // 质量（kg），假设为1，简化计算
        
        // 历史数据（用于计算变化率）
        this.speedHistory = [];
        this.accelerationHistory = [];
        this.distanceHistory = [];
        this.heightHistory = [];
        
        // 特征值
        this.metrics = {
            maxSpeed: 0,
            minSpeed: Infinity,
            maxGForce: 0,
            minGForce: Infinity,
            maxVerticalG: 0,
            minVerticalG: Infinity,
            maxLateralG: 0,
            minLateralG: Infinity,
            maxAcceleration: 0,
            minAcceleration: Infinity,
            maxJerk: 0, // 加速度变化率
            screamIndex: 0, // 尖叫指数
            thrillIndex: 0, // 刺激指数
            comfortIndex: 0, // 舒适度指数
            safetyIndex: 0 // 安全指数
        };
    }
    
    /**
     * 更新物理状态（基于能量守恒的物理模拟）
     * 当速度为0时，使用重力在轨道切线上的分量来计算下一时刻速度
     * @param {number} deltaTime - 时间差（秒）
     * @param {number} distance - 当前位置（沿轨道的距离，米）
     */
    update(deltaTime, distance) {
        // 获取当前位置的信息（位置、切线、段索引等）
        let position3d, tangent, segmentIndex, localT;
        
        if (this.getPointInfoByDistance && typeof this.getPointInfoByDistance === 'function') {
            const pointInfo = this.getPointInfoByDistance(distance);
            if (pointInfo) {
                position3d = pointInfo.position;
                tangent = pointInfo.tangent;
                segmentIndex = pointInfo.segmentIndex;
                localT = pointInfo.localT;
            }
        }
        
        // 如果无法从距离获取信息，返回（不应该发生）
        if (!position3d || !tangent || segmentIndex === undefined || segmentIndex === null) {
            return;
        }
        
        const currentHeight = position3d.y;
        const prevSpeed = this.currentSpeed;
        const prevDistance = this.currentDistance || (this.distanceHistory.length > 0 ? this.distanceHistory[this.distanceHistory.length - 1] : distance);
        
        // 确保切线是单位向量
        const normalizedTangent = tangent.normalize();
        
        // 计算轨道倾斜角
        const tangentY = normalizedTangent.y;
        const tangentHorizontal = Math.sqrt(normalizedTangent.x * normalizedTangent.x + normalizedTangent.z * normalizedTangent.z);
        const sinTheta = tangentY; // 倾斜角的正弦值
        const cosTheta = Math.max(0.01, tangentHorizontal); // 倾斜角的余弦值（避免除零）
        
        // 初始化能量状态（如果还没有初始化）
        if (this.initialTotalEnergy === 0 && prevSpeed === 0 && this.lastDistance === 0) {
            // 第一次调用，初始化能量状态
            this.initialHeight = currentHeight;
            this.initialSpeed = 0;
            this.initialTotalEnergy = 0; // 初始能量为0（静止在初始高度）
            this.cumulativeFrictionWork = 0;
            this.lastDistance = distance;
            this.lastHeight = currentHeight;
        }
        
        // 计算距离变化（用于计算摩擦力做功）
        const distanceDelta = Math.abs(distance - this.lastDistance);
        
        // 计算摩擦力做功（只在有速度时）
        const speedAbs = Math.abs(prevSpeed);
        if (speedAbs > 0.01 && distanceDelta > 0) {
            // 摩擦力做功 = 摩擦力 × 距离 = μ * m * g * cos(θ) * distance
            const frictionWork = this.frictionCoefficient * this.mass * this.gravity * cosTheta * distanceDelta;
            this.cumulativeFrictionWork += frictionWork;
        }
        
        // 当速度为0时，使用重力在轨道切线上的分量来计算下一时刻速度
        if (speedAbs < 0.01) {
            // 计算重力在轨道切线上的分量
            // 重力向量是 (0, -g, 0)（向下），在切线方向的分量 = -g * sinTheta
            // 当 sinTheta > 0（上坡）时，分量为负（阻碍向上运动）
            // 当 sinTheta < 0（下坡）时，分量为正（加速向下运动）
            const gravityForceTangent = -this.gravity * sinTheta;
            
            // 计算静摩擦力阈值
            const staticFrictionForce = this.staticFrictionCoefficient * this.gravity * cosTheta;
            
            // 如果重力分量小于静摩擦力，物体保持静止
            if (Math.abs(gravityForceTangent) <= staticFrictionForce) {
                this.currentSpeed = 0;
                this.currentAcceleration = 0;
                // 重置能量状态（因为静止，能量应该基于当前位置重新计算）
                this.initialHeight = currentHeight;
                this.initialSpeed = 0;
                this.initialTotalEnergy = 0;
                this.cumulativeFrictionWork = 0;
            } else {
                // 重力分量超过静摩擦力，物体开始运动
                // 使用重力分量计算加速度：a = F / m = g * sin(θ)
                const acceleration = gravityForceTangent;
                
                // 下一时刻速度：v = a * dt
                // 方向与重力分量方向一致
                this.currentSpeed = acceleration * deltaTime;
                this.currentAcceleration = acceleration;
                
                // 重置能量状态（从当前位置重新开始计算）
                this.initialHeight = currentHeight;
                this.initialSpeed = this.currentSpeed;
                this.initialTotalEnergy = 0.5 * this.mass * this.initialSpeed * this.initialSpeed + this.mass * this.gravity * this.initialHeight;
                this.cumulativeFrictionWork = 0;
            }
        } else {
            // 速度不为0：使用能量守恒计算速度
            // 当前总能量 = 初始总能量 - 累积摩擦力做功
            const currentTotalEnergy = this.initialTotalEnergy - this.cumulativeFrictionWork;
            
            // 当前势能
            const currentPotentialEnergy = this.mass * this.gravity * currentHeight;
            
            // 当前动能 = 总能量 - 势能
            const currentKineticEnergy = currentTotalEnergy - currentPotentialEnergy;
            
            // 如果动能为负或接近0，说明能量已耗尽
            if (currentKineticEnergy <= 0) {
                this.currentSpeed = 0;
                this.currentAcceleration = 0;
                // 重置能量状态
                this.initialHeight = currentHeight;
                this.initialSpeed = 0;
                this.initialTotalEnergy = 0;
                this.cumulativeFrictionWork = 0;
            } else {
                // 计算速度：v = sqrt(2 * E_kinetic / m)
                // 速度方向与之前保持一致（如果之前是反向，保持反向）
                const speedMagnitude = Math.sqrt(2 * currentKineticEnergy / this.mass);
                this.currentSpeed = prevSpeed >= 0 ? speedMagnitude : -speedMagnitude;
                
                // 计算加速度（用于显示和特征值计算）
                // 加速度 = (当前速度 - 之前速度) / deltaTime
                this.currentAcceleration = (this.currentSpeed - prevSpeed) / deltaTime;
            }
        }
        
        // 更新记录的距离和高度
        this.lastDistance = distance;
        this.lastHeight = currentHeight;
        
        // 更新当前位置
        this.currentDistance = distance;
        
        // 保存历史数据
        this.speedHistory.push(this.currentSpeed);
        this.accelerationHistory.push(this.currentAcceleration);
        this.distanceHistory.push(distance);
        this.heightHistory.push(currentHeight);
        
        // 限制历史数据长度（保留最近1000个点）
        if (this.speedHistory.length > 1000) {
            this.speedHistory.shift();
            this.accelerationHistory.shift();
            this.distanceHistory.shift();
            this.heightHistory.shift();
        }
        
        // 更新特征值
        this.updateMetrics();
    }
    
    
    /**
     * 计算当前位置的G力
     * @param {number} distance - 当前位置（沿轨道的距离，米）
     * @returns {Object} {total, vertical, lateral}
     */
    calculateGForces(distance) {
        // 获取当前位置的信息
        let position3d, tangent, segmentIndex, localT, pointInfo;
        
        if (this.getPointInfoByDistance && typeof this.getPointInfoByDistance === 'function') {
            pointInfo = this.getPointInfoByDistance(distance);
            if (pointInfo) {
                position3d = pointInfo.position;
                tangent = pointInfo.tangent;
                segmentIndex = pointInfo.segmentIndex;
                localT = pointInfo.localT;
            }
        }
        
        // 如果无法从距离获取信息，返回默认值（不应该发生）
        if (!position3d || !tangent || segmentIndex === undefined || segmentIndex === null) {
            return {
                total: 0,
                vertical: 0,
                lateral: 0
            };
        }
        
        const curvature = pointInfo.curvature || 0;
        
        // 计算法线（考虑倾斜）
        // 如果 trackGenerator 有 getNormal 方法，使用它；否则使用默认实现
        let baseNormal;
        if (this.trackGenerator && typeof this.trackGenerator.getNormal === 'function') {
            baseNormal = this.trackGenerator.getNormal(tangent);
        } else {
            // 默认法线计算
            const up = new Vec3(0, 1, 0);
            let right = up.cross(tangent).normalize();
            if (right.length() < 0.1) {
                const forward = new Vec3(0, 0, 1);
                right = forward.cross(tangent).normalize();
            }
            baseNormal = tangent.cross(right).normalize();
        }
        
        // 计算侧倾信息
        let bankingInfo;
        if (this.trackGenerator && typeof this.trackGenerator.calculateBankingAngleWithSegment === 'function') {
            bankingInfo = this.trackGenerator.calculateBankingAngleWithSegment(
                position3d, tangent, curvature, segmentIndex, localT, pointInfo, this.currentDistance
            );
        } else {
            // 默认侧倾信息（无侧倾）
            bankingInfo = {
                bankingAngle: 0,
                resultForceDir: new Vec3(0, -1, 0)
            };
        }
        
        let normal;
        if (curvature < 0.0001 || bankingInfo.bankingAngle < 0.001) {
            normal = baseNormal;
        } else {
            normal = bankingInfo.resultForceDir.multiplyScalar(-1);
            const tangentComponent = normal.dot(tangent);
            if (Math.abs(tangentComponent) > 0.0001) {
                normal = normal.subtract(tangent.multiplyScalar(tangentComponent)).normalize();
            }
            if (!normal || normal.length() < 0.1) {
                normal = baseNormal;
            }
        }
        
        // 计算向心加速度
        let centripetalAcceleration = 0;
        if (curvature > 0.0001) {
            const radius = 1.0 / curvature;
            centripetalAcceleration = (this.currentSpeed * this.currentSpeed) / radius;
        }
        
        // 向心加速度方向（指向曲率中心）= -离心力方向
        // 从 pointInfo 中获取离心加速度方向，然后取反
        let curvatureCenterDir;
        if (pointInfo.centrifugalAcceleration && pointInfo.centrifugalAcceleration.length() > 1e-10) {
            curvatureCenterDir = pointInfo.centrifugalAcceleration.normalize().multiplyScalar(-1);
        } else {
            // 如果离心加速度为零，使用向上的法线作为默认值
            curvatureCenterDir = new Vec3(0, 1, 0);
        }
        const centripetalForce = curvatureCenterDir.multiplyScalar(centripetalAcceleration);
        
        // 重力
        const gravityForce = new Vec3(0, -this.gravity, 0);
        
        // 总加速度（向心加速度 + 重力）
        const totalAcceleration = centripetalForce.add(gravityForce);
        
        // 计算G力（相对于重力加速度的倍数）
        const totalG = totalAcceleration.length() / this.gravity;
        
        // 垂直G力（沿法线方向）
        const verticalG = totalAcceleration.dot(normal) / this.gravity;
        
        // 横向G力（垂直于法线和切线）
        const binormal = tangent.cross(normal).normalize();
        const lateralG = totalAcceleration.dot(binormal) / this.gravity;
        
        return {
            total: totalG,
            vertical: verticalG,
            lateral: lateralG
        };
    }
    
    /**
     * 计算加速度变化率（Jerk）
     */
    calculateJerk() {
        if (this.accelerationHistory.length < 2) {
            return 0;
        }
        
        const lastAccel = this.accelerationHistory[this.accelerationHistory.length - 1];
        const prevAccel = this.accelerationHistory[this.accelerationHistory.length - 2];
        
        // 简化：假设时间间隔相同
        // 实际应该使用实际时间差
        return Math.abs(lastAccel - prevAccel);
    }
    
    /**
     * 更新所有特征值
     */
    updateMetrics() {
        // 更新速度和加速度范围
        this.metrics.maxSpeed = Math.max(this.metrics.maxSpeed, this.currentSpeed);
        this.metrics.minSpeed = Math.min(this.metrics.minSpeed, this.currentSpeed);
        this.metrics.maxAcceleration = Math.max(this.metrics.maxAcceleration, this.currentAcceleration);
        this.metrics.minAcceleration = Math.min(this.metrics.minAcceleration, this.currentAcceleration);
        
        // 计算G力
        const gForces = this.calculateGForces(this.currentDistance);
        this.metrics.maxGForce = Math.max(this.metrics.maxGForce, gForces.total);
        this.metrics.minGForce = Math.min(this.metrics.minGForce, gForces.total);
        this.metrics.maxVerticalG = Math.max(this.metrics.maxVerticalG, gForces.vertical);
        this.metrics.minVerticalG = Math.min(this.metrics.minVerticalG, gForces.vertical);
        this.metrics.maxLateralG = Math.max(this.metrics.maxLateralG, Math.abs(gForces.lateral));
        this.metrics.minLateralG = Math.min(this.metrics.minLateralG, Math.abs(gForces.lateral));
        
        // 计算Jerk
        const jerk = this.calculateJerk();
        this.metrics.maxJerk = Math.max(this.metrics.maxJerk, jerk);
        
        // 计算尖叫指数（Scream Index）
        // 基于：高G力、快速变化、高速度
        const gForceFactor = Math.max(0, gForces.total - 1.0) * 2; // 超过1G的部分
        const speedFactor = this.currentSpeed / 30.0; // 归一化速度（假设最大30m/s）
        const jerkFactor = jerk / 10.0; // 归一化jerk
        this.metrics.screamIndex = (gForceFactor * 0.4 + speedFactor * 0.3 + jerkFactor * 0.3) * 100;
        
        // 计算刺激指数（Thrill Index）
        // 基于：速度变化、高度变化、G力变化
        const speedChange = this.speedHistory.length > 1 ? 
            Math.abs(this.speedHistory[this.speedHistory.length - 1] - this.speedHistory[this.speedHistory.length - 2]) : 0;
        const speedChangeFactor = speedChange / 5.0; // 归一化
        this.metrics.thrillIndex = (gForceFactor * 0.3 + speedFactor * 0.3 + speedChangeFactor * 0.2 + jerkFactor * 0.2) * 100;
        
        // 计算舒适度指数（Comfort Index）
        // 基于：低jerk、平滑的G力变化、合理的速度
        const comfortScore = 100 - (jerkFactor * 30 + Math.abs(gForces.total - 1.0) * 20 + speedChangeFactor * 20);
        this.metrics.comfortIndex = Math.max(0, Math.min(100, comfortScore));
        
        // 计算安全指数（Safety Index）
        // 基于：G力在安全范围内、速度合理、加速度变化平滑
        const gForceSafety = gForces.total > 5.0 ? 0 : (5.0 - gForces.total) / 5.0 * 100; // 超过5G不安全
        const speedSafety = this.currentSpeed > 40.0 ? 0 : (40.0 - this.currentSpeed) / 40.0 * 100; // 超过40m/s可能不安全
        const jerkSafety = jerk > 20.0 ? 0 : (20.0 - jerk) / 20.0 * 100; // 高jerk不安全
        this.metrics.safetyIndex = (gForceSafety * 0.5 + speedSafety * 0.3 + jerkSafety * 0.2);
    }
    
    /**
     * 获取当前所有特征值
     */
    getCurrentMetrics() {
        const gForces = this.calculateGForces(this.currentDistance);
        const jerk = this.calculateJerk();
        
        return {
            speed: this.currentSpeed,
            acceleration: this.currentAcceleration,
            gForce: {
                total: gForces.total,
                vertical: gForces.vertical,
                lateral: gForces.lateral
            },
            jerk: jerk,
            screamIndex: this.metrics.screamIndex,
            thrillIndex: this.metrics.thrillIndex,
            comfortIndex: this.metrics.comfortIndex,
            safetyIndex: this.metrics.safetyIndex
        };
    }
    
    /**
     * 获取历史最大值
     */
    getMaxMetrics() {
        return {
            maxSpeed: this.metrics.maxSpeed,
            minSpeed: this.metrics.minSpeed,
            maxGForce: this.metrics.maxGForce,
            minGForce: this.metrics.minGForce,
            maxVerticalG: this.metrics.maxVerticalG,
            minVerticalG: this.metrics.minVerticalG,
            maxLateralG: this.metrics.maxLateralG,
            maxAcceleration: this.metrics.maxAcceleration,
            minAcceleration: this.metrics.minAcceleration,
            maxJerk: this.metrics.maxJerk
        };
    }
    
    /**
     * 重置所有特征值
     */
    /**
     * 重置能量状态（用于离开牵引段时）
     * @param {number} distance - 当前位置（沿轨道的距离，米），可选
     */
    resetEnergyState(distance = null) {
        if (distance !== null && this.getPointInfoByDistance) {
            const pointInfo = this.getPointInfoByDistance(distance);
            if (pointInfo && pointInfo.position) {
                const currentHeight = pointInfo.position.y;
                const currentSpeed = this.currentSpeed;
                
                // 基于当前速度和高度重新计算初始能量
                this.initialHeight = currentHeight;
                this.initialSpeed = currentSpeed;
                this.initialTotalEnergy = 0.5 * this.mass * this.initialSpeed * this.initialSpeed + this.mass * this.gravity * this.initialHeight;
                this.cumulativeFrictionWork = 0;
                this.lastDistance = distance;
                this.lastHeight = currentHeight;
            }
        }
    }
    
    /**
     * 重置所有特征值
     * @param {number} initialSpeed - 初始速度（可选）
     */
    reset(initialSpeed = null) {
        this.currentSpeed = initialSpeed !== null ? initialSpeed : 0;
        this.currentAcceleration = 0;
        this.currentDistance = 0;
        this.speedHistory = [];
        this.accelerationHistory = [];
        this.distanceHistory = [];
        this.heightHistory = [];
        
        // 重置能量状态
        this.initialTotalEnergy = 0;
        this.initialHeight = 0;
        this.initialSpeed = 0;
        this.cumulativeFrictionWork = 0;
        this.lastDistance = 0;
        this.lastHeight = 0;
        
        this.metrics = {
            maxSpeed: 0,
            minSpeed: Infinity,
            maxGForce: 0,
            minGForce: Infinity,
            maxVerticalG: 0,
            minVerticalG: Infinity,
            maxLateralG: 0,
            minLateralG: Infinity,
            maxAcceleration: 0,
            minAcceleration: Infinity,
            maxJerk: 0,
            screamIndex: 0,
            thrillIndex: 0,
            comfortIndex: 0,
            safetyIndex: 0
        };
    }
}

