import { Vec3 } from '../math3d.js';
import { RollerCoasterPhysics } from '../physics.js';

/**
 * 基础过山车轨道生成器
 * 所有过山车类型的生成器都应该继承这个基类
 */
export class BaseCoasterGenerator {
    constructor(spline, config = {}) {
        this.spline = spline;
        
        // 通用配置参数
        this.trackWidth = config.trackWidth || 0.5;
        this.trackHeight = config.trackHeight || 0.1;
        this.railHeight = config.railHeight || 0.1;
        this.railThickness = config.railThickness || 0.1;
        this.crossSections = config.crossSections || 8;
        this.sampleInterval = config.sampleInterval || 0.1;
        this.railInterval = config.railInterval || 2.0;
        this.shouldGenerateRails = config.shouldGenerateRails !== false;
        this.speed = typeof config.speed === 'number' ? config.speed : 0.0;
        this.gravity = typeof config.gravity === 'number' ? config.gravity : 9.81;
        
        // 预模拟的速度缓存（距离 -> 速度）
        this.simulatedSpeedCache = new Map();
        this.simulationComplete = false;
    }
    
    /**
     * 生成轨道网格数据
     * 子类必须实现这个方法
     * @returns {Object} 轨道网格数据
     */
    generateTrack() {
        throw new Error('generateTrack() must be implemented by subclass');
    }
    
    /**
     * 预模拟小车沿着轨道走一遍，计算每个采样点的速度
     * @returns {Map<number, number>} 距离 -> 速度的映射
     */
    preSimulateCarMotion() {
        if (this.simulationComplete && this.simulatedSpeedCache.size > 0) {
            return this.simulatedSpeedCache;
        }
        
        console.log('开始预模拟小车运动...');
        this.simulatedSpeedCache.clear();
        
        const cachedPoints = this.spline.getCachedPoints();
        if (!cachedPoints || cachedPoints.length === 0) {
            return this.simulatedSpeedCache;
        }
        
        const totalLength = cachedPoints[cachedPoints.length - 1].distance;
        if (totalLength <= 0) {
            return this.simulatedSpeedCache;
        }
        
        // 创建物理模拟器（传入 this 作为 trackGenerator，因为预模拟是在 BaseCoasterGenerator 内部调用的）
        const physics = new RollerCoasterPhysics(
            this.spline,
            this, // 传入 this，这样 physics 可以调用 getNormal 和 calculateBankingAngleWithSegment
            (distance) => this.spline.getPointInfoByDistance(distance)
        );
        
        physics.gravity = this.gravity;
        
        // 获取站台起点
        const carStartDistance = this.spline.carStartDistance || 0;
        
        // 辅助函数：获取特殊区域信息
        const getSpecialSectionByDistance = (distance) => {
            const pointInfo = this.spline.getPointInfoByDistance(distance);
            if (!pointInfo) return null;
            
            const segmentIndex = pointInfo.segmentIndex;
            if (segmentIndex < 0 || segmentIndex >= this.spline.pointCount - 1) return null;
            
            const point = this.spline.getControlPoint(segmentIndex);
            if (!point) return null;
            
            // 检查站台段
            if (point.isPlatformSection) {
                return {
                    type: 'platform',
                    speed: point.platformSpeed || 1.0
                };
            }
            
            // 检查牵引段
            if (point.isLiftSection) {
                return {
                    type: 'lift',
                    speed: point.liftSpeed || 2.0
                };
            }
            
            // 检查电磁加速
            if (point.isElectromagneticBoost) {
                return {
                    type: 'electromagnetic_boost',
                    acceleration: point.electromagneticAcceleration || 5.0
                };
            }
            
            // 检查电磁制动
            if (point.isElectromagneticBrake) {
                return {
                    type: 'electromagnetic_brake',
                    acceleration: point.electromagneticAcceleration || 5.0
                };
            }
            
            return null;
        };
        
        // 从站台起点开始模拟
        let currentDistance = carStartDistance;
        
        // 设置初始速度：检查站台段或牵引段
        let initialSpeed = 0;
        const startSpecialInfo = getSpecialSectionByDistance(currentDistance);
        if (startSpecialInfo) {
            if (startSpecialInfo.type === 'platform' || startSpecialInfo.type === 'lift') {
                initialSpeed = startSpecialInfo.speed || 2.0;
            } else {
                // 如果没有站台或牵引，给一个初始速度让它开始运动
                initialSpeed = 1.0;
            }
        } else {
            // 检查后面是否有牵引段
            const nextSpecialInfo = getSpecialSectionByDistance(currentDistance + 0.1);
            if (nextSpecialInfo && nextSpecialInfo.type === 'lift') {
                initialSpeed = nextSpecialInfo.speed || 2.0;
            } else {
                // 给一个初始速度让它开始运动
                initialSpeed = 1.0;
            }
        }
        
        physics.currentSpeed = initialSpeed;
        
        // 模拟参数
        const deltaTime = 0.01; // 10ms 时间步
        const maxSimulationTime = 300; // 最大模拟时间（秒）
        const sampleDistance = this.sampleInterval; // 采样间隔
        
        let simulationTime = 0;
        let lastSampledDistance = -sampleDistance;
        let wasInLiftSection = false;
        let completedLaps = 0;
        const maxLaps = 2; // 最多模拟2圈
        
        // 模拟循环
        while (simulationTime < maxSimulationTime && completedLaps < maxLaps) {
            // 检查特殊区域
            const specialInfo = getSpecialSectionByDistance(currentDistance);
            
            // 处理特殊区域
            if (specialInfo) {
                if (specialInfo.type === 'platform') {
                    // 站台段：如果有牵引速度，使用它
                    if (specialInfo.speed) {
                        physics.currentSpeed = specialInfo.speed;
                        physics.currentAcceleration = 0;
                    }
                } else if (specialInfo.type === 'lift') {
                    // 牵引段：保持匀速
                    physics.currentSpeed = specialInfo.speed || 2.0;
                    physics.currentAcceleration = 0;
                    wasInLiftSection = true;
                } else if (specialInfo.type === 'electromagnetic_boost') {
                    // 电磁加速：增加速度
                    const acceleration = specialInfo.acceleration || 5.0;
                    physics.currentSpeed += acceleration * deltaTime;
                    physics.currentAcceleration = acceleration;
                } else if (specialInfo.type === 'electromagnetic_brake') {
                    // 电磁制动：减少速度
                    const deceleration = specialInfo.acceleration || 5.0;
                    physics.currentSpeed = Math.max(0, physics.currentSpeed - deceleration * deltaTime);
                    physics.currentAcceleration = -deceleration;
                }
            } else {
                // 不在特殊区域，使用物理模拟
                const isInLiftSection = wasInLiftSection;
                wasInLiftSection = false;
                
                // 如果刚刚离开牵引段，保证最小速度
                if (isInLiftSection) {
                    const minReleaseSpeed = 2.0;
                    if (physics.currentSpeed < minReleaseSpeed) {
                        physics.currentSpeed = minReleaseSpeed;
                    }
                }
                
                // 更新物理状态
                physics.update(deltaTime, currentDistance);
            }
            
            // 记录速度（如果距离变化足够大）
            if (currentDistance - lastSampledDistance >= sampleDistance || simulationTime === 0) {
                this.simulatedSpeedCache.set(currentDistance, Math.abs(physics.currentSpeed));
                lastSampledDistance = currentDistance;
            }
            
            // 更新位置
            const speed = physics.currentSpeed;
            currentDistance += speed * deltaTime;
            
            // 处理循环轨道
            if (currentDistance >= totalLength) {
                currentDistance = currentDistance % totalLength;
                completedLaps++;
            }
            
            // 如果速度接近0且已经模拟了一段时间，停止模拟
            if (Math.abs(speed) < 0.01 && simulationTime > 1.0) {
                // 检查是否已经完成一圈或无法继续
                if (currentDistance < 0.1 || simulationTime > 10) {
                    break;
                }
            }
            
            simulationTime += deltaTime;
        }
        
        console.log(`预模拟完成，记录了 ${this.simulatedSpeedCache.size} 个速度点，模拟时间: ${simulationTime.toFixed(2)}s`);
        
        // 调试：输出一些速度信息
        if (this.simulatedSpeedCache.size > 0) {
            const speeds = Array.from(this.simulatedSpeedCache.values());
            const maxSpeed = Math.max(...speeds);
            const minSpeed = Math.min(...speeds);
            const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
            console.log(`速度范围: ${minSpeed.toFixed(2)} - ${maxSpeed.toFixed(2)} m/s, 平均: ${avgSpeed.toFixed(2)} m/s`);
        }
        
        this.simulationComplete = true;
        
        return this.simulatedSpeedCache;
    }
    
    /**
     * 获取指定距离的速度（从预模拟缓存中获取，或插值）
     * @param {number} distance - 距离
     * @returns {number} 速度
     */
    getSpeedAtDistance(distance) {
        if (this.simulatedSpeedCache.size === 0) {
            // 如果没有缓存，使用固定速度
            return this.speed || 0.0;
        }
        
        // 找到最近的两个采样点进行插值
        let closestDistance1 = -1;
        let closestDistance2 = -1;
        let speed1 = 0;
        let speed2 = 0;
        
        for (const [d, s] of this.simulatedSpeedCache.entries()) {
            if (d <= distance && (closestDistance1 < 0 || d > closestDistance1)) {
                closestDistance1 = d;
                speed1 = s;
            }
            if (d >= distance && (closestDistance2 < 0 || d < closestDistance2)) {
                closestDistance2 = d;
                speed2 = s;
            }
        }
        
        // 如果只有一个点，直接返回
        if (closestDistance1 < 0) {
            return speed2;
        }
        if (closestDistance2 < 0) {
            return speed1;
        }
        
        // 如果距离相同，直接返回
        if (closestDistance1 === closestDistance2) {
            return speed1;
        }
        
        // 线性插值
        const t = (distance - closestDistance1) / (closestDistance2 - closestDistance1);
        return speed1 * (1 - t) + speed2 * t;
    }
    
    /**
     * 根据曲线长度生成采样点
     * @returns {Array} 采样点数组
     */
    generateSamplePoints() {
        // 先进行预模拟
        this.preSimulateCarMotion();
        
        const cachedPoints = this.spline.getCachedPoints();
        if (!cachedPoints || cachedPoints.length === 0) {
            return [];
        }
        
        const totalLength = cachedPoints[cachedPoints.length - 1].distance;
        const samplePoints = [];
        const numSamples = Math.ceil(totalLength / this.sampleInterval);
        
        for (let i = 0; i <= numSamples; i++) {
            const distance = Math.min(i * this.sampleInterval, totalLength);
            
            // 从缓存点中查找并插值
            const pointInfo = this.spline.getPointInfoByDistance(distance);
            if (!pointInfo) {
                continue;
            }
            
            const position = pointInfo.position;
            const tangent = pointInfo.tangent;
            const segmentIndex = pointInfo.segmentIndex;
            const localT = pointInfo.localT;
            
            // 计算曲率
            const curvature = pointInfo.curvature || 0;
            
            // 获取基础法线（垂直于切线，向上）
            const baseNormal = this.getNormal(tangent);
            
            // 计算倾斜角度和力方向（使用预模拟的速度）
            const bankingInfo = this.calculateBankingAngleWithSegment(position, tangent, curvature, segmentIndex, localT, pointInfo, distance);
            const bankingAngle = bankingInfo.bankingAngle;
            const resultForceDir = bankingInfo.resultForceDir;
            const isInverted = bankingInfo.isInverted; // 是否反转（大回环）
            const centrifugalDir = bankingInfo.centrifugalDir;
            
            // 计算倾斜后的法线
            // 侧倾的原理：轨道应该倾斜，使得重力+离心力的合力垂直于轨道表面
            // 因此，法线应该指向合力的反方向（垂直于轨道表面）
            let normal = baseNormal;
            
            if (curvature > 0.0001 && bankingAngle > 0.001) {
                // 直接使用合力方向的反方向作为法线
                // 合力方向的反方向就是轨道表面的法线方向
                normal = resultForceDir.multiplyScalar(-1);
                
                // 确保法线垂直于切线（移除切线方向的分量）
                const tangentComponent = normal.dot(tangent);
                if (Math.abs(tangentComponent) > 0.0001) {
                    normal = normal.subtract(tangent.multiplyScalar(tangentComponent)).normalize();
                }
                
                // 确保法线有效
                if (!normal || normal.length() < 0.1) {
                    normal = baseNormal;
                }
            }
            
            // 如果反转，法线需要翻转180度
            if (isInverted) {
                normal = normal.multiplyScalar(-1);
                // 确保法线仍然垂直于切线
                const tangentComponent = normal.dot(tangent);
                if (Math.abs(tangentComponent) > 0.0001) {
                    normal = normal.subtract(tangent.multiplyScalar(tangentComponent)).normalize();
                }
            }
            
            // 重新计算副法线
            const newBinormal = tangent.cross(normal).normalize();
            
            samplePoints.push({
                position,
                tangent,
                normal,
                binormal: newBinormal,
                distance,
                bankingAngle,
                curvature,
                isInverted
            });
        }
        
        return samplePoints;
    }
    
    /**
     * 计算倾斜角度（banking angle）基于速度和曲率
     * @param {Vec3} position - 位置
     * @param {Vec3} tangent - 切线方向
     * @param {number} curvature - 曲率
     * @param {number} segmentIndex - 段索引
     * @param {number} localT - 段内参数t
     * @param {Object} pointInfo - 点信息（包含 centrifugalAcceleration）
     * @param {number} distance - 距离（用于获取预模拟的速度）
     * @returns {Object} {bankingAngle, centrifugalDir, gravityDir, resultForceDir, isInverted}
     */
    calculateBankingAngleWithSegment(position, tangent, curvature, segmentIndex, localT, pointInfo = null, distance = 0) {
        if (curvature < 0.0001) {
            return {
                bankingAngle: 0,
                centrifugalDir: new Vec3(0, 0, 0),
                gravityDir: new Vec3(0, -1, 0),
                resultForceDir: new Vec3(0, -1, 0),
                isInverted: false
            };
        }
        
        // 使用预模拟的速度，如果没有则使用固定速度
        const speed = this.getSpeedAtDistance(distance);
        
        // 如果速度太小，不计算侧倾
        if (speed < 0.1) {
            return {
                bankingAngle: 0,
                centrifugalDir: new Vec3(0, 0, 0),
                gravityDir: new Vec3(0, -1, 0),
                resultForceDir: new Vec3(0, -1, 0),
                isInverted: false
            };
        }
        
        const radius = 1.0 / curvature;
        const centrifugalAcceleration = (speed * speed) / radius;
        const gravityAcceleration = this.gravity;
        
        // 离心力方向 = 离心加速度方向（从 pointInfo 中获取）
        let centrifugalDir;
        if (pointInfo && pointInfo.centrifugalAcceleration && pointInfo.centrifugalAcceleration.length() > 1e-10) {
            centrifugalDir = pointInfo.centrifugalAcceleration.normalize();
        } else {
            // 如果无法获取，使用默认值（这种情况不应该发生）
            centrifugalDir = new Vec3(0, 0, 0);
        }
        
        const gravityDir = new Vec3(0, -1, 0);
        
        // 计算合力方向（重力 + 离心力）
        const gravityForce = gravityDir.multiplyScalar(gravityAcceleration);
        const centrifugalForce = centrifugalDir.multiplyScalar(centrifugalAcceleration);
        const resultForce = gravityForce.add(centrifugalForce);
        
        // 检查是否形成大回环：离心力向上分量大于重力
        // 如果离心力在竖直方向的分量（向上）大于重力，则轨道需要反转
        const centrifugalVertical = centrifugalForce.y; // 向上为正
        const isInverted = centrifugalVertical > gravityAcceleration;
        
        // 计算侧倾角度
        // 侧倾角度是合力方向与重力方向的夹角
        let bankingAngle;
        if (isInverted) {
            // 大回环：侧倾角度接近180度
            bankingAngle = Math.PI;
        } else {
            // 正常侧倾：计算合力与重力的夹角
            const resultForceLength = resultForce.length();
            if (resultForceLength > 1e-10) {
                const cosAngle = resultForce.dot(gravityDir) / (resultForceLength * gravityAcceleration);
                bankingAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            } else {
                bankingAngle = 0;
            }
        }
        
        const resultForceDir = resultForce.normalize();
        
        return {
            bankingAngle,
            centrifugalDir,
            gravityDir,
            resultForceDir,
            isInverted
        };
    }
    
    /**
     * 获取法线方向（垂直于切线）
     * @param {Vec3} tangent - 切线向量
     * @returns {Vec3} 法线向量
     */
    getNormal(tangent) {
        // 防御性检查：如果切线无效，返回默认法线
        if (!tangent || typeof tangent.x !== 'number' || typeof tangent.y !== 'number' || typeof tangent.z !== 'number') {
            return new Vec3(0, 1, 0);
        }
        
        const up = new Vec3(0, 1, 0);
        let right = up.cross(tangent).normalize();
        
        if (right.length() < 0.1) {
            const forward = new Vec3(0, 0, 1);
            right = forward.cross(tangent).normalize();
        }
        
        return tangent.cross(right).normalize();
    }
    
    /**
     * 生成通用轨道表面（顶面或底面）
     * @param {Array} crossSections - 采样点数组
     * @param {Array} vertices - 顶点数组
     * @param {Array} indices - 索引数组
     * @param {Array} normals - 法线数组
     * @param {Array} uvs - UV坐标数组
     * @param {boolean} isTop - 是否为顶面
     */
    generateTrackSurface(crossSections, vertices, indices, normals, uvs, isTop) {
        const startIndex = vertices.length / 3;
        const yOffset = isTop ? this.trackHeight : 0;
        const surfaceNormal = isTop ? new Vec3(0, 1, 0) : new Vec3(0, -1, 0);
        
        // 生成顶点
        for (let i = 0; i < crossSections.length; i++) {
            const cs = crossSections[i];
            
            for (let j = 0; j <= this.crossSections; j++) {
                const u = j / this.crossSections;
                const x = (u - 0.5) * this.trackWidth;
                
                const vertex = cs.position.add(cs.binormal.multiplyScalar(x))
                    .add(cs.normal.multiplyScalar(yOffset));
                
                vertices.push(vertex.x, vertex.y, vertex.z);
                normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
                uvs.push(u, i / crossSections.length);
            }
        }
        
        // 生成三角形
        for (let i = 0; i < crossSections.length - 1; i++) {
            for (let j = 0; j < this.crossSections; j++) {
                const current = startIndex + i * (this.crossSections + 1) + j;
                const next = startIndex + (i + 1) * (this.crossSections + 1) + j;
                
                if (isTop) {
                    indices.push(current, next, current + 1);
                    indices.push(current + 1, next, next + 1);
                } else {
                    indices.push(current, current + 1, next);
                    indices.push(current + 1, next + 1, next);
                }
            }
        }
    }
    
    /**
     * 生成轨道侧面
     * @param {Array} crossSections - 采样点数组
     * @param {Array} vertices - 顶点数组
     * @param {Array} indices - 索引数组
     * @param {Array} normals - 法线数组
     * @param {Array} uvs - UV坐标数组
     */
    generateTrackSides(crossSections, vertices, indices, normals, uvs) {
        const startIndex = vertices.length / 3;
        
        // 左右两侧
        for (let side = 0; side < 2; side++) {
            const xOffset = (side === 0) ? -this.trackWidth * 0.5 : this.trackWidth * 0.5;
            const sideNormal = (side === 0) ? new Vec3(-1, 0, 0) : new Vec3(1, 0, 0);
            
            // 生成顶点
            for (let i = 0; i < crossSections.length; i++) {
                const cs = crossSections[i];
                
                // 底部顶点
                const bottomVertex = cs.position.add(cs.binormal.multiplyScalar(xOffset));
                vertices.push(bottomVertex.x, bottomVertex.y, bottomVertex.z);
                normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
                uvs.push(0, i / crossSections.length);
                
                // 顶部顶点
                const topVertex = cs.position.add(cs.binormal.multiplyScalar(xOffset))
                    .add(cs.normal.multiplyScalar(this.trackHeight));
                vertices.push(topVertex.x, topVertex.y, topVertex.z);
                normals.push(sideNormal.x, sideNormal.y, sideNormal.z);
                uvs.push(1, i / crossSections.length);
            }
            
            // 生成三角形
            const sideStartIndex = startIndex + side * crossSections.length * 2;
            for (let i = 0; i < crossSections.length - 1; i++) {
                const currentBottom = sideStartIndex + i * 2;
                const currentTop = sideStartIndex + i * 2 + 1;
                const nextBottom = sideStartIndex + (i + 1) * 2;
                const nextTop = sideStartIndex + (i + 1) * 2 + 1;
                
                if (side === 0) {
                    indices.push(currentBottom, currentTop, nextBottom);
                    indices.push(currentTop, nextTop, nextBottom);
                } else {
                    indices.push(currentBottom, nextBottom, currentTop);
                    indices.push(currentTop, nextBottom, nextTop);
                }
            }
        }
    }
    
    /**
     * 生成护栏
     * @param {Array} vertices - 顶点数组
     * @param {Array} indices - 索引数组
     * @param {Array} normals - 法线数组
     * @param {Array} uvs - UV坐标数组
     */
    generateRails(vertices, indices, normals, uvs) {
        const totalLength = this.spline.getApproximateLength();
        const numRails = Math.floor(totalLength / this.railInterval);
        const railPositions = [];
        
        // 根据栏杆间隔生成栏杆位置
        for (let i = 0; i <= numRails; i++) {
            const distance = Math.min(i * this.railInterval, totalLength);
            
            // 从缓存点中查找并插值
            const pointInfo = this.spline.getPointInfoByDistance(distance);
            if (!pointInfo) {
                continue;
            }
            
            const position = pointInfo.position;
            const tangent = pointInfo.tangent;
            const normal = this.getNormal(tangent);
            const binormal = tangent.cross(normal).normalize();
            
            railPositions.push({
                position,
                tangent,
                normal,
                binormal
            });
        }
        
        // 左右两侧护栏
        for (let side = 0; side < 2; side++) {
            const xOffset = (side === 0) ? -this.trackWidth * 0.5 : this.trackWidth * 0.5;
            const yOffset = this.trackHeight;
            
            this.generateRail(railPositions, vertices, indices, normals, uvs, xOffset, yOffset);
        }
    }
    
    /**
     * 生成单侧护栏
     * @param {Array} railPositions - 护栏位置数组
     * @param {Array} vertices - 顶点数组
     * @param {Array} indices - 索引数组
     * @param {Array} normals - 法线数组
     * @param {Array} uvs - UV坐标数组
     * @param {number} xOffset - X轴偏移
     * @param {number} yOffset - Y轴偏移
     */
    generateRail(railPositions, vertices, indices, normals, uvs, xOffset, yOffset) {
        const startIndex = vertices.length / 3;
        const halfThickness = this.railThickness * 0.5;
        
        // 为每个栏杆位置生成护栏柱
        for (let i = 0; i < railPositions.length; i++) {
            const cs = railPositions[i];
            
            const basePos = cs.position.add(cs.binormal.multiplyScalar(xOffset))
                .add(cs.normal.multiplyScalar(yOffset));
            const topPos = basePos.add(cs.normal.multiplyScalar(this.railHeight));
            
            // 护栏柱（简化的立方体，只生成前面和后面）
            const baseIdx = startIndex + i * 8;
            
            // 底部四个角
            const corners = [
                basePos.add(cs.binormal.multiplyScalar(-halfThickness)).add(cs.tangent.multiplyScalar(-halfThickness)),
                basePos.add(cs.binormal.multiplyScalar(halfThickness)).add(cs.tangent.multiplyScalar(-halfThickness)),
                basePos.add(cs.binormal.multiplyScalar(halfThickness)).add(cs.tangent.multiplyScalar(halfThickness)),
                basePos.add(cs.binormal.multiplyScalar(-halfThickness)).add(cs.tangent.multiplyScalar(halfThickness)),
                // 顶部四个角
                topPos.add(cs.binormal.multiplyScalar(-halfThickness)).add(cs.tangent.multiplyScalar(-halfThickness)),
                topPos.add(cs.binormal.multiplyScalar(halfThickness)).add(cs.tangent.multiplyScalar(-halfThickness)),
                topPos.add(cs.binormal.multiplyScalar(halfThickness)).add(cs.tangent.multiplyScalar(halfThickness)),
                topPos.add(cs.binormal.multiplyScalar(-halfThickness)).add(cs.tangent.multiplyScalar(halfThickness))
            ];
            
            for (const corner of corners) {
                vertices.push(corner.x, corner.y, corner.z);
                normals.push(cs.normal.x, cs.normal.y, cs.normal.z);
                uvs.push(0, 0);
            }
            
            // 前面
            indices.push(baseIdx, baseIdx + 1, baseIdx + 4);
            indices.push(baseIdx + 1, baseIdx + 5, baseIdx + 4);
            
            // 后面
            indices.push(baseIdx + 2, baseIdx + 3, baseIdx + 6);
            indices.push(baseIdx + 3, baseIdx + 7, baseIdx + 6);
        }
    }
}

