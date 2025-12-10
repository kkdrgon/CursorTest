import { Vec3 } from './math3d.js';
import { RollerCoasterPhysics } from './physics.js';

/**
 * 过山车小车
 */
export class Car {
    constructor(spline, trackGenerator, coasterTypeManager = null) {
        this.spline = spline;
        this.trackGenerator = trackGenerator;
        this.coasterTypeManager = coasterTypeManager;
        this.distanceAlongTrack = 0; // 记录沿轨道的真实距离（米）
        this.totalLength = 0;
        
        this.currentPointIndex = 0; // 当前点的索引
        this._cachedPointInfo = null; // 缓存的当前点信息，避免重复查找
        this._cachedPointInfoDistance = -1; // 缓存的点信息对应的距离
        
        // 物理模拟（传入获取点信息的函数）
        this.physics = new RollerCoasterPhysics(spline, trackGenerator, (distance) => this.getPointInfoByDistance(distance));
        // 设置初始速度
        this.physics.currentSpeed = trackGenerator.speed || 5.0;
        this.onLapComplete = null;
        
        // 站台停靠状态
        this.platformWaitTime = 0; // 在站台等待的时间（秒）
        this.platformWaitDuration = 10; // 站台等待时长（秒）
        this.isWaitingAtPlatform = false; // 是否正在站台等待
        this.platformEndDistance = null; // 站台末端的距离
        this.isPlatformLiftActive = false; // 是否处于站台牵引状态
        this.zeroSpeedTime = 0; // 连续速度接近0的累计时间（秒）
        this.lastLapCompleteTime = 0; // 上一次完成一圈的时间（秒）
        this.lastLapCompleteDistance = -1; // 上一次完成一圈时的距离
        this.minLapInterval = 1.0; // 完成一圈的最小时间间隔（秒），防止抖动误触发
        this.minLapDistance = 0; // 完成一圈的最小距离变化（米），将在第一次更新时设置
        this.totalElapsedTime = 0; // 累计经过的时间（秒），用于完成一圈的时间间隔检测
        this.ensurePlatformLiftState();
    }
    
    /**
     * 更新小车位置（使用物理模拟）
     * @param {number} deltaTime - 时间差（秒）
     */
    update(deltaTime) {
        // 确保缓存的点数组已更新
        const points = this.getCachedPoints();
        // points必然存在
        if (points && points.length > 0) {
            this.totalLength = points[points.length - 1].distance;
        }
        
        // 基于距离检查是否在特殊区域
        const specialInfo = this.getSpecialSectionByDistance(this.distanceAlongTrack);
        
        // 处理站台等待逻辑
        const carStartDistance = this.spline.carStartDistance || 0;
        if (this.distanceAlongTrack <= carStartDistance) {
            // 在站台起点之前，检查是否到达起点
            const currentSpeed = this.physics.currentSpeed || 1.0;
            const nextDistance = this.distanceAlongTrack + currentSpeed * deltaTime;
            
            if (nextDistance >= carStartDistance && !this.isWaitingAtPlatform) {
                // 到达站台起点，开始等待
                this.isWaitingAtPlatform = true;
                this.platformWaitTime = 0.0;
                this.distanceAlongTrack = carStartDistance;
                this.physics.currentSpeed = 0;
                this.physics.currentAcceleration = 0;
            }
        }
        
        // 处理站台等待
        if (this.isWaitingAtPlatform) {
            this.platformWaitTime += deltaTime;
            if (this.platformWaitTime >= this.platformWaitDuration) {
                // 等待结束，离开站台
                this.isWaitingAtPlatform = false;
                this.platformWaitTime = this.platformWaitDuration;
                
                // 等待结束后，检查站台段是否有牵引速度，或者给一个初始速度
                if (specialInfo && specialInfo.type === 'platform' && specialInfo.speed) {
                    // 站台段有牵引速度，使用它
                    this.physics.currentSpeed = specialInfo.speed;
                    this.physics.currentAcceleration = 0;
                    console.log('🚂 [站台等待结束，启动牵引]', {
                        速度: this.physics.currentSpeed.toFixed(3) + ' m/s',
                        当前位置: this.distanceAlongTrack.toFixed(3) + ' m'
                    });
                } else {
                    // 站台段没有牵引速度，检查后面是否有牵引段
                    // 如果没有，给一个初始速度让它开始运动
                    const nextSpecialInfo = this.getSpecialSectionByDistance(this.distanceAlongTrack + 0.1);
                    if (!nextSpecialInfo || nextSpecialInfo.type !== 'lift') {
                        // 后面没有牵引段，给一个初始速度
                        this.physics.currentSpeed = 1.0; // 初始速度 1 m/s
                        this.physics.currentAcceleration = 0;
                        console.log('🚂 [站台等待结束，无牵引段，设置初始速度]', {
                            速度: this.physics.currentSpeed.toFixed(3) + ' m/s',
                            当前位置: this.distanceAlongTrack.toFixed(3) + ' m'
                        });
                    }
                }
            } else {
                // 仍在等待，不更新位置
                return;
            }
        }
        
        // 检测是否刚刚离开牵引段
        const isInLiftSection = specialInfo && (specialInfo.type === 'lift' || specialInfo.type === 'platform');
        if (this.wasInLiftSection && !isInLiftSection) {
            // 刚刚离开牵引段：保证一个最小"脱离速度"，避免数值误差导致速度为0
            const minReleaseSpeed = 2.0; // 脱离牵引时至少 2 m/s
            const speedBeforeReset = this.physics.currentSpeed;
            if (this.physics.currentSpeed < minReleaseSpeed) {
                this.physics.currentSpeed = minReleaseSpeed;
            }
            console.log('🚂 [离开牵引段]', {
                离开前速度: speedBeforeReset.toFixed(3) + ' m/s',
                设置后速度: this.physics.currentSpeed.toFixed(3) + ' m/s',
                当前位置: this.distanceAlongTrack.toFixed(3) + ' m'
            });
            // 基于力的模拟不需要重置能量状态，速度已经设置好了
        }
        this.wasInLiftSection = isInLiftSection;
        
        // 处理特殊区域（站台段、牵引段、电磁加速/制动）
        if (specialInfo) {
            if (specialInfo.type === 'platform') {
                // 站台段：如果有牵引速度，使用它；否则保持当前速度
                if (specialInfo.speed && !this.isWaitingAtPlatform) {
                    this.physics.currentSpeed = specialInfo.speed;
                    this.physics.currentAcceleration = 0;
                }
            } else if (specialInfo.type === 'lift') {
                // 牵引段：保持匀速
                this.physics.currentSpeed = specialInfo.speed || 2.0;
                this.physics.currentAcceleration = 0;
            } else if (specialInfo.type === 'electromagnetic_boost') {
                // 电磁加速：增加速度
                const acceleration = specialInfo.acceleration || 5.0;
                this.physics.currentSpeed += acceleration * deltaTime;
                this.physics.currentAcceleration = acceleration;
            } else if (specialInfo.type === 'electromagnetic_brake') {
                // 电磁制动：减少速度
                const deceleration = specialInfo.acceleration || 5.0;
                this.physics.currentSpeed = Math.max(0, this.physics.currentSpeed - deceleration * deltaTime);
                this.physics.currentAcceleration = -deceleration;
            }
        }
        
        // 更新物理模拟（非牵引段、非站台段和特殊区域使用物理计算）
        if (!specialInfo || (specialInfo.type !== 'lift' && specialInfo.type !== 'platform')) {
            this.physics.update(deltaTime, this.distanceAlongTrack);
        }
        
        // 统计低速（接近0）持续时间，用于自动重置到站台
        const speedAbs = Math.abs(this.physics.currentSpeed);
        if (speedAbs < 0.01) {
            this.zeroSpeedTime += deltaTime;
        } else {
            this.zeroSpeedTime = 0;
        }
        
        // 如果连续10秒速度为0（或接近0），将小车重置回站台起点
        if (this.zeroSpeedTime >= 10) {
            const carStartDistance = this.spline && typeof this.spline.carStartDistance === 'number'
                ? this.spline.carStartDistance
                : 0;
            this.resetProgress(carStartDistance);
            this.ensurePlatformLiftState();
            this.zeroSpeedTime = 0;
            return;
        }
        
        // 注意：不再硬性限制速度，让物理计算决定速度
        // maxSpeed 仅作为参考值，用于显示和统计，不影响实际物理计算
        
        // 根据物理模拟的速度更新位置
        const distanceDelta = this.physics.currentSpeed * deltaTime;
        const currentDistance = this.distanceAlongTrack || 0;
        let newDistance = currentDistance + distanceDelta;
        
        // 处理循环轨道并检查是否完成一圈
        const totalLength = this.totalLength || 0;
        
        // 初始化最小完成一圈距离（轨道长度的50%）
        if (this.minLapDistance === 0 && totalLength > 0) {
            this.minLapDistance = totalLength * 0.5;
        }
        
        // 累计经过的时间
        this.totalElapsedTime += deltaTime;
        
        let completedLap = false;
        
        // 情况1：正向完成一圈（newDistance >= totalLength）
        if (totalLength > 0 && newDistance >= totalLength) {
            newDistance = newDistance % totalLength;
            // 检查时间间隔和距离变化
            const timeSinceLastLap = this.lastLapCompleteTime > 0 
                ? (this.totalElapsedTime - this.lastLapCompleteTime)
                : Infinity; // 第一次完成一圈，时间间隔为无穷大
            const distanceSinceLastLap = this.lastLapCompleteDistance >= 0 
                ? (currentDistance - this.lastLapCompleteDistance + totalLength) % totalLength
                : totalLength;
            
            // 只有当时间间隔足够长且距离变化足够大时才认为是完成一圈
            if (timeSinceLastLap >= this.minLapInterval && distanceSinceLastLap >= this.minLapDistance) {
                completedLap = true;
                this.lastLapCompleteTime = this.totalElapsedTime;
                this.lastLapCompleteDistance = newDistance;
            }
            // 时间间隔太短或距离变化太小，可能是抖动，不触发完成一圈，也不输出警告（避免刷屏）
        }
        
        // 情况2：反向移动（newDistance < 0）
        let wasWrappedFromNegative = false;
        if (newDistance < 0 && totalLength > 0) {
            newDistance = totalLength + (newDistance % totalLength);
            wasWrappedFromNegative = true;
        }
        
        // 情况3：反向完成一圈（newDistance < currentDistance，且距离变化足够大）
        // 注意：这个情况只在反向移动时才会发生，且需要距离变化足够大
        // 只有当距离变化超过一个最小阈值（1米）时才进行检测，避免小幅抖动触发警告
        if (newDistance < currentDistance && totalLength > 0 && !wasWrappedFromNegative) {
            const distanceChange = currentDistance - newDistance;
            const timeSinceLastLap = this.lastLapCompleteTime > 0 
                ? (this.totalElapsedTime - this.lastLapCompleteTime)
                : Infinity;
            
            // 只有当距离变化超过1米时才进行检测（避免数值误差导致的小幅抖动）
            const minChangeThreshold = 1.0; // 最小变化阈值（米）
            if (distanceChange >= minChangeThreshold) {
                // 只有当距离变化足够大（超过轨道长度的50%）且时间间隔足够长时才认为是完成一圈
                // 这样可以避免在顶点附近的小幅抖动被误判为完成一圈
                if (distanceChange >= this.minLapDistance && timeSinceLastLap >= this.minLapInterval) {
                    completedLap = true;
                    this.lastLapCompleteTime = this.totalElapsedTime;
                    this.lastLapCompleteDistance = newDistance;
                }
                // 距离变化在1米到minLapDistance之间时，不输出警告（这是正常的反向移动，但不是完成一圈）
            }
            // 距离变化小于1米时，完全忽略（可能是数值误差或小幅抖动）
        }
        
        // 更新位置和当前点索引
        this.setPositionFromDistance(newDistance);
        
        // 清除缓存的点信息（因为距离已改变）
        this._cachedPointInfo = null;
        this._cachedPointInfoDistance = -1;
        
        if (completedLap && typeof this.onLapComplete === 'function') {
            console.log('✅ [完成一圈]', {
                当前距离: newDistance.toFixed(2) + ' m',
                轨道长度: totalLength.toFixed(2) + ' m'
            });
            this.onLapComplete();
        }
    }
    
    /**
     * 从距离获取点的所有信息（用于物理模拟）
     * @param {number} distance - 沿轨道的距离
     * @returns {Object|null} 包含位置、切线、段索引、局部t等信息
     */
    getPointInfoByDistance(distance) {
        // 如果距离变化很小（小于0.01米），使用缓存的点信息
        if (this._cachedPointInfo && Math.abs(this._cachedPointInfoDistance - distance) < 0.01) {
            return this._cachedPointInfo;
        }
        
        const pointInfo = this.spline.getPointInfoByDistance(distance);
        if (pointInfo) {
            this._cachedPointInfo = pointInfo;
            this._cachedPointInfoDistance = distance;
        }
        return pointInfo;
    }
    
    /**
     * 基于距离获取特殊区域信息
     * @param {number} distance - 沿轨道的距离
     * @returns {Object|null} 特殊区域信息
     */
    getSpecialSectionByDistance(distance) {
        const pointInfo = this.spline.getPointInfoByDistance(distance);
        if (!pointInfo || pointInfo.segmentIndex === undefined) {
            return null;
        }
        
        // 获取该段的控制点
        const controlPoint = this.spline.getControlPoint(pointInfo.segmentIndex);
        if (!controlPoint) {
            return null;
        }
        
        // 检查站台区域
        if (controlPoint.isPlatformSection) {
            return {
                type: 'platform',
                segmentIndex: pointInfo.segmentIndex,
                speed: controlPoint.liftSpeed || 1.0
            };
        }
        
        // 检查电磁区域
        if (controlPoint.isElectromagneticBoost) {
            return {
                type: 'electromagnetic_boost',
                acceleration: Math.max(controlPoint.electromagneticAcceleration || 5.0, 0.1)
            };
        }
        
        if (controlPoint.isElectromagneticBrake) {
            return {
                type: 'electromagnetic_brake',
                acceleration: Math.max(controlPoint.electromagneticAcceleration || 5.0, 0.1)
            };
        }
        
        // 检查牵引区域
        if (controlPoint.isLiftSection) {
            return {
                type: 'lift',
                speed: controlPoint.liftSpeed || 2.0
            };
        }
        
        return null;
    }
    
    /**
     * 获取站台段的距离范围
     * @param {number} segmentIndex - 段索引
     * @returns {Object} {start, end} 距离范围
     */
    getPlatformDistanceRange(segmentIndex) {
        const points = this.getCachedPoints();
        if (!points || points.length === 0) {
            return { start: 0, end: 0 };
        }
        
        // 找到该段的第一个和最后一个点
        let segmentStartDistance = Infinity;
        let segmentEndDistance = -Infinity;
        
        for (const point of points) {
            if (point.segmentIndex === segmentIndex) {
                if (point.distance < segmentStartDistance) {
                    segmentStartDistance = point.distance;
                }
                if (point.distance > segmentEndDistance) {
                    segmentEndDistance = point.distance;
                }
            }
        }
        
        // 如果没找到，使用默认值
        if (segmentStartDistance === Infinity) {
            segmentStartDistance = 0;
            segmentEndDistance = this.totalLength;
        }
        
        return { start: segmentStartDistance, end: segmentEndDistance };
    }
    
    
    /**
     * 如果当前在站台区域，确保以牵引速度启动
     */
    ensurePlatformLiftState() {
        if (!this.spline) {
            return;
        }
        const special = this.getSpecialSectionByDistance(this.distanceAlongTrack);
        if (special && special.type === 'platform') {
            this.isWaitingAtPlatform = false;
            this.platformWaitTime = 0;
            const platformRange = this.getPlatformDistanceRange(special.segmentIndex);
            this.platformEndDistance = platformRange.end;
            // 直接进入牵引状态
            this.isPlatformLiftActive = true;
            this.physics.currentSpeed = 1.0;
            this.physics.currentAcceleration = 0;
            // 确保小车从站台末端开始移动
            if (this.distanceAlongTrack < platformRange.end) {
                this.distanceAlongTrack = platformRange.end;
            }
        }
    }
    
    /**
     * 获取当前速度
     */
    getSpeed() {
        return this.physics.currentSpeed;
    }
    
    /**
     * 获取当前加速度
     */
    getAcceleration() {
        return this.physics.currentAcceleration;
    }
    
    /**
     * 获取物理特征值
     */
    getPhysicsMetrics() {
        return this.physics.getCurrentMetrics();
    }
    
    /**
     * 获取历史最大值
     */
    getMaxMetrics() {
        return this.physics.getMaxMetrics();
    }
    
    /**
     * 获取小车当前位置（在轨道上方0.2米）
     * @returns {Vec3}
     */
    getPosition() {
        const pointInfo = this.spline.getPointInfoByDistance(this.distanceAlongTrack);
        if (!pointInfo) {
            return new Vec3(0, 0.2, 0); // 默认高度0.2米
        }
        
        // 获取法线方向（向上方向）
        const direction = pointInfo.tangent || new Vec3(1, 0, 0);
        const baseNormal = this.trackGenerator ? this.trackGenerator.getNormal(direction) : new Vec3(0, 1, 0);
        
        // 计算向上的偏移（沿法线方向向上0.2米），使用copy避免修改原始对象
        const heightOffset = baseNormal.copy ? baseNormal.copy().multiplyScalar(0.2) : new Vec3(baseNormal.x * 0.2, baseNormal.y * 0.2, baseNormal.z * 0.2);
        
        // 返回轨道位置加上高度偏移
        return pointInfo.position.add(heightOffset);
    }
    
    /**
     * 获取小车当前方向（切线方向）
     * @returns {Vec3}
     */
    getDirection() {
        const pointInfo = this.spline.getPointInfoByDistance(this.distanceAlongTrack);
        return pointInfo ? pointInfo.tangent : new Vec3(1, 0, 0);
    }
    
    /**
     * 获取小车的变换矩阵
     * @returns {Float32Array} 4x4变换矩阵
     */
    getTransformMatrix() {
        const pointInfo = this.spline.getPointInfoByDistance(this.distanceAlongTrack);
        if (!pointInfo) {
            return new Float32Array(16);
        }
        
        const position = pointInfo.position;
        const direction = pointInfo.tangent;
        const segmentIndex = pointInfo.segmentIndex || 0;
        const localT = pointInfo.localT || 0;
        const curvature = pointInfo.curvature || 0;
        const bankingInfo = this.trackGenerator.calculateBankingAngleWithSegment(
            position, direction, curvature, segmentIndex, localT, pointInfo
        );
        
        // 计算法线（考虑倾斜）
        const baseNormal = this.trackGenerator.getNormal(direction);
        let normal;
        if (curvature < 0.0001 || bankingInfo.bankingAngle < 0.001) {
            normal = baseNormal;
        } else {
            normal = bankingInfo.resultForceDir.multiplyScalar(-1);
            const tangentComponent = normal.dot(direction);
            if (Math.abs(tangentComponent) > 0.0001) {
                normal = normal.subtract(direction.multiplyScalar(tangentComponent)).normalize();
            }
            if (!normal || normal.length() < 0.1) {
                normal = baseNormal;
            }
        }
        
        const binormal = direction.cross(normal).normalize();
        
        // 小车位置在轨道上方0.2米（沿法线方向向上偏移）
        const carHeightOffset = 0.2; // 米
        const heightOffset = normal.copy ? normal.copy().multiplyScalar(carHeightOffset) : new Vec3(normal.x * carHeightOffset, normal.y * carHeightOffset, normal.z * carHeightOffset);
        const carPosition = position.add(heightOffset);
        
        // 构建变换矩阵（直接创建 Float32Array）
        // 小车的X轴指向副法线方向（轨道宽度方向）
        // 小车的Y轴指向法线方向（向上）
        // 小车的Z轴指向切线方向（前进方向）
        const matrix = new Float32Array([
            binormal.x, binormal.y, binormal.z, 0,  // 第一列（X轴）
            normal.x, normal.y, normal.z, 0,        // 第二列（Y轴）
            direction.x, direction.y, direction.z, 0, // 第三列（Z轴）
            carPosition.x, carPosition.y, carPosition.z, 1   // 第四列（平移，在轨道上方0.5米）
        ]);
        
        return matrix;
    }
    
    /**
     * 生成小车网格数据（简单的立方体）
     * @returns {Object} {vertices, indices, normals, colors}
     */
    static generateMesh() {
        const size = 0.3; // 小车大小
        const halfSize = size * 0.5;
        
        // 定义小车的8个顶点（立方体）
        const vertices = [
            // 前面4个顶点
            -halfSize, -halfSize, halfSize,   // 0: 左下前
            halfSize, -halfSize, halfSize,    // 1: 右下前
            halfSize, halfSize, halfSize,     // 2: 右上前
            -halfSize, halfSize, halfSize,    // 3: 左上前
            // 后面4个顶点
            -halfSize, -halfSize, -halfSize,  // 4: 左下后
            halfSize, -halfSize, -halfSize,   // 5: 右下后
            halfSize, halfSize, -halfSize,    // 6: 右上后
            -halfSize, halfSize, -halfSize    // 7: 左上后
        ];
        
        // 定义12个三角形（立方体的6个面，每个面2个三角形）
        const indices = [
            // 前面
            0, 1, 2,  0, 2, 3,
            // 后面
            4, 6, 5,  4, 7, 6,
            // 左面
            4, 0, 3,  4, 3, 7,
            // 右面
            1, 5, 6,  1, 6, 2,
            // 上面
            3, 2, 6,  3, 6, 7,
            // 下面
            4, 5, 1,  4, 1, 0
        ];
        
        // 法线（每个顶点一个法线，计算平均法线）
        // 为8个顶点计算法线
        const vertexNormals = new Array(8).fill(null).map(() => new Vec3(0, 0, 0));
        
        // 每个面的法线方向
        const faceNormals = [
            new Vec3(0, 0, 1),   // 前面
            new Vec3(0, 0, -1),  // 后面
            new Vec3(-1, 0, 0),  // 左面
            new Vec3(1, 0, 0),   // 右面
            new Vec3(0, 1, 0),   // 上面
            new Vec3(0, -1, 0)   // 下面
        ];
        
        // 每个面的顶点索引
        const faces = [
            [0, 1, 2, 3],  // 前面
            [4, 6, 5, 7],  // 后面
            [4, 0, 3, 7],  // 左面
            [1, 5, 6, 2],  // 右面
            [3, 2, 6, 7],  // 上面
            [4, 5, 1, 0]   // 下面
        ];
        
        // 为每个面的顶点累加法线
        for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
            const face = faces[faceIdx];
            const normal = faceNormals[faceIdx];
            for (const vertexIdx of face) {
                vertexNormals[vertexIdx] = vertexNormals[vertexIdx].add(normal);
            }
        }
        
        // 归一化所有法线
        for (let i = 0; i < 8; i++) {
            if (vertexNormals[i].length() > 0.001) {
                vertexNormals[i] = vertexNormals[i].normalize();
            } else {
                vertexNormals[i] = new Vec3(0, 1, 0); // 默认向上
            }
        }
        
        // 转换为数组（8个顶点，每个3个分量）
        const normals = [];
        for (let i = 0; i < 8; i++) {
            normals.push(vertexNormals[i].x, vertexNormals[i].y, vertexNormals[i].z);
        }
        
        // 颜色（蓝色小车）
        const colors = [];
        for (let i = 0; i < 8; i++) {
            colors.push(0.2, 0.4, 0.8); // 蓝色
        }
        
        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors)
        };
    }

    /**
     * 获取或刷新缓存的点数组
     * @returns {Array} 缓存的点数组
     */
    getCachedPoints() {
        return this.spline.getCachedPoints();
    }

    /**
     * 标记缓存为脏，需要重新获取
     */
    markCachedPointsDirty() {
        this.spline.markCachedPointsDirty();
    }

    /**
     * 归一化距离到 [0, totalLength)
     * @param {number} distance - 原始距离
     * @param {number} totalLength - 总长度
     * @returns {number} 归一化后的距离
     */
    _normalizeDistance(distance, totalLength) {
        if (totalLength > 0) {
            return ((distance % totalLength) + totalLength) % totalLength;
        }
        return 0;
    }

    /**
     * 设置小车位置（基于距离）
     * @param {number} distance - 沿轨道的距离
     */
    setPositionFromDistance(distance) {
        const { points: cachedPoints } = this.spline.getPoints();
        const totalLength = Math.max(this.totalLength || (cachedPoints && cachedPoints.length > 0 ? cachedPoints[cachedPoints.length - 1].distance : 0), 0);
        const normalizedDistance = this._normalizeDistance(distance, totalLength);
        
        this.distanceAlongTrack = normalizedDistance;
        
        // 更新当前点索引（使用优化的二分查找，从当前位置开始）
        if (cachedPoints && cachedPoints.length > 0) {
            this.currentPointIndex = this._findClosestPointIndex(cachedPoints, normalizedDistance, totalLength);
        }
    }
    
    /**
     * 查找最近的点的索引（优化：优先从当前位置附近搜索）
     * @param {Array} points - 点数组
     * @param {number} targetDistance - 目标距离
     * @param {number} totalLength - 总长度
     * @returns {number} 最近点的索引
     */
    _findClosestPointIndex(points, targetDistance, totalLength) {
        const len = points.length;
        if (len === 0) return 0;
        if (len === 1) return 0;
        
        // 优先从当前位置附近开始搜索（小车连续运动，新位置通常在当前点附近）
        if (this.currentPointIndex >= 0 && this.currentPointIndex < len) {
            const startIndex = this.currentPointIndex;
            const startDist = points[startIndex].distance;
            
            // 检查当前位置及其相邻点（最常见的情况）
            const nextIdx = (startIndex + 1) % len;
            const prevIdx = (startIndex - 1 + len) % len;
            
            const startDiff = Math.abs(startDist - targetDistance);
            const nextDist = points[nextIdx].distance;
            const prevDist = points[prevIdx].distance;
            
            // 处理循环情况
            let nextDiff = Math.abs(nextDist - targetDistance);
            if (nextDist < startDist) {
                nextDiff = Math.min(nextDiff, Math.abs(nextDist + totalLength - targetDistance));
            }
            
            let prevDiff = Math.abs(prevDist - targetDistance);
            if (startDist < prevDist) {
                prevDiff = Math.min(prevDiff, Math.abs(prevDist - totalLength - targetDistance));
            }
            
            // 如果当前位置或相邻点足够接近，直接返回
            if (startDiff < 0.1) return startIndex;
            if (nextDiff < startDiff && nextDiff < 0.1) return nextIdx;
            if (prevDiff < startDiff && prevDiff < 0.1) return prevIdx;
        }
        
        // 如果局部搜索没找到，使用二分查找
        let low = 0;
        let high = len - 1;
        let closestIndex = 0;
        let minDiff = Infinity;
        
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midDistance = points[mid].distance;
            const diff = Math.abs(midDistance - targetDistance);
            
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = mid;
            }
            
            if (midDistance < targetDistance) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        // 检查循环边界情况
        const lastPoint = points[len - 1];
        const firstPoint = points[0];
        const lastDiff = Math.abs(lastPoint.distance - targetDistance);
        const firstDiff = Math.abs(firstPoint.distance + totalLength - targetDistance);
        
        if (firstDiff < minDiff) {
            closestIndex = 0;
        }
        
        return closestIndex;
    }

    /**
     * 重置小车进度
     * @param {number} distance - 沿轨道的距离（默认0）
     */
    resetProgress(distance = 0) {
        this.setPositionFromDistance(distance);
        this.isWaitingAtPlatform = false;
        this.platformWaitTime = 0;
        this.platformEndDistance = null;
        this.isPlatformLiftActive = false;
        this.physics.reset();
        // 重置完成一圈的状态
        this.lastLapCompleteTime = 0;
        this.lastLapCompleteDistance = -1;
        this.totalElapsedTime = 0;
    }
}
