import { Vec3 } from './math3d.js';

const TANGENT_EPSILON = 1e-5;

function coerceVec3(value) {
    if (value instanceof Vec3) {
        return value;
    }
    if (value && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number') {
        return new Vec3(value.x, value.y, value.z);
    }
    return new Vec3(0, 0, 0);
}

/**
 * 贝塞尔曲线控制点
 */
export class BezierPoint {
    constructor(position) {
        this.position = position.copy ? position.copy() : new Vec3(position.x || 0, position.y || 0, position.z || 0);
        this._tangentDirection = new Vec3(1, 0, 0); // 单位方向（指向右侧切线方向）
        this._leftTangentLength = 0;
        this._rightTangentLength = 0;
        this.isLiftSection = false; // 是否为牵引区域（匀速运动）
        this.liftSpeed = 1.0; // 牵引区域的速度（m/s）
        this.isElectromagneticBoost = false; // 是否为电磁加速区域（现代过山车）
        this.isElectromagneticBrake = false; // 是否为电磁减速区域（现代过山车）
        this.electromagneticAcceleration = 5.0; // 电磁区域提供的加速度（m/s²）
        this.isPlatformSection = false; // 是否为站台区域
        this.platformHeight = null; // 站台高度（如果为null，使用当前点的高度）
    }

    get tangentDirection() {
        return this._tangentDirection;
    }

    set tangentDirection(direction) {
        const dir = coerceVec3(direction);
        const len = dir.length();
        if (len > TANGENT_EPSILON) {
            this._tangentDirection = dir.normalize();
        }
    }

    get leftTangentLength() {
        return this._leftTangentLength;
    }

    set leftTangentLength(value) {
        this._leftTangentLength = Math.max(0, Number(value) || 0);
    }

    get rightTangentLength() {
        return this._rightTangentLength;
    }

    set rightTangentLength(value) {
        this._rightTangentLength = Math.max(0, Number(value) || 0);
    }

    get leftTangent() {
        return this._tangentDirection.multiplyScalar(-this._leftTangentLength);
    }

    set leftTangent(value) {
        const vec = coerceVec3(value);
        const length = vec.length();
        this._leftTangentLength = length;
        if (length > TANGENT_EPSILON) {
            const dir = vec.normalize();
            this._tangentDirection = dir.multiplyScalar(-1);
        }
    }

    get rightTangent() {
        return this._tangentDirection.multiplyScalar(this._rightTangentLength);
    }

    set rightTangent(value) {
        const vec = coerceVec3(value);
        const length = vec.length();
        this._rightTangentLength = length;
        if (length > TANGENT_EPSILON) {
            this._tangentDirection = vec.normalize();
        }
    }
    
    // 获取左侧控制点的世界坐标
    getLeftControlPoint() {
        return this.position.add(this.leftTangent);
    }
    
    // 获取右侧控制点的世界坐标
    getRightControlPoint() {
        return this.position.add(this.rightTangent);
    }
    
    // 设置左侧控制点（保持右侧切线长度不变，只调整方向）
    setLeftControlPoint(worldPos, tangentLength) {
        const offset = worldPos.subtract(this.position);
        const inferredLength = offset.length();
        const targetLength = tangentLength !== undefined ? tangentLength : inferredLength;
        if (targetLength <= TANGENT_EPSILON || inferredLength <= TANGENT_EPSILON) {
            this.leftTangentLength = 0;
            return;
        }
        const dir = offset.normalize();
        this.leftTangent = dir.multiplyScalar(targetLength);
        
        const rightLength = this.rightTangent.length();
        if (rightLength <= TANGENT_EPSILON) {
            this.rightTangentLength = targetLength;
        }
    }
    
    // 设置右侧控制点（保持左侧切线长度不变，只调整方向）
    setRightControlPoint(worldPos, tangentLength) {
        const offset = worldPos.subtract(this.position);
        const inferredLength = offset.length();
        const targetLength = tangentLength !== undefined ? tangentLength : inferredLength;
        if (targetLength <= TANGENT_EPSILON || inferredLength <= TANGENT_EPSILON) {
            this.rightTangentLength = 0;
            return;
        }
        const dir = offset.normalize();
        this.rightTangent = dir.multiplyScalar(targetLength);
        
        const leftLength = this.leftTangent.length();
        if (leftLength <= TANGENT_EPSILON) {
            this.leftTangentLength = targetLength;
        }
    }
    
    // 设置切线方向（保持C2连续性）
    setTangentDirection(direction, leftLength, rightLength) {
        const dir = coerceVec3(direction);
        const normalized = dir.length() > TANGENT_EPSILON ? dir.normalize() : this._tangentDirection;
        this._tangentDirection = normalized;
        this._leftTangentLength = Math.max(0, Number(leftLength) || 0);
        this._rightTangentLength = Math.max(0, Number(rightLength) || 0);
    }
    
}

/**
 * 贝塞尔样条曲线类，支持C2连续（曲率连续）
 */
export class BezierSpline {
    constructor(initialPoints = []) {
        this.points = [];
        this.closed = true; // 循环封闭轨道
        
        // 缓存点数组
        this.cachedPoints = null;
        this.cachedPointsDirty = true;
        this.carStartDistance = 0;
        
        // 如果提供了初始点，则加载并进行C2连续性处理
        if (Array.isArray(initialPoints) && initialPoints.length > 0) {
            for (const pos of initialPoints) {
                const vec = pos instanceof Vec3 ? pos : new Vec3(pos.x || 0, pos.y || 0, pos.z || 0);
                const newPoint = new BezierPoint(vec);
                this.points.push(newPoint);
            }
            
            for (let iter = 0; iter < 3; iter++) {
                for (let i = 0; i < this.points.length; i++) {
                    this.ensureC2Continuity(i);
                }
            }
        }
    }


    get pointCount() {
        return this.points.length;
    }
    
    get segmentCount() {
        return this.closed ? this.points.length : Math.max(0, this.points.length - 1);
    }
    
    /**
     * 添加一个控制点
     */
    addPoint(position) {
        const newPoint = new BezierPoint(position);
        
        if (this.points.length > 0) {
            // 自动计算切线方向以保持平滑
            const lastPoint = this.points[this.points.length - 1];
            const direction = position.subtract(lastPoint.position).normalize();
            const distance = position.distance(lastPoint.position);
            // 默认切线长度为控制点距离的1/3
            const tangentLength = distance / 3;
            
            // 设置前一个点的右侧切线和当前点的左侧切线
            lastPoint.setRightControlPoint(lastPoint.position.add(direction.multiplyScalar(tangentLength)), tangentLength);
            newPoint.setLeftControlPoint(newPoint.position.subtract(direction.multiplyScalar(tangentLength)), tangentLength);
        }
        
        this.points.push(newPoint);
        
        // 如果是闭合曲线且添加了最后一个点，需要连接最后一个点和第一个点
        if (this.closed && this.points.length > 1) {
            const firstPoint = this.points[0];
            const lastPoint = this.points[this.points.length - 1];
            const direction = firstPoint.position.subtract(lastPoint.position).normalize();
            const distance = firstPoint.position.distance(lastPoint.position);
            // 默认切线长度为控制点距离的1/3
            const tangentLength = distance / 3;
            
            lastPoint.setRightControlPoint(lastPoint.position.add(direction.multiplyScalar(tangentLength)), tangentLength);
            firstPoint.setLeftControlPoint(firstPoint.position.subtract(direction.multiplyScalar(tangentLength)), tangentLength);
        }
        
        this.markCachedPointsDirty();
    }
    
    /**
     * 移除指定索引的控制点
     */
    removePoint(index) {
        if (index >= 0 && index < this.points.length && this.points.length > 2) {
            this.points.splice(index, 1);
            this.markCachedPointsDirty();
        }
    }
    
    /**
     * 在指定段和位置插入控制点（使用 de Casteljau 算法细分，保证曲线不变）
     * @param {number} segmentIndex - 段索引
     * @param {number} t - 段内参数t (0-1)
     * @returns {number} 新插入点的索引
     */
    insertPointAtSegment(segmentIndex, t) {
        if (segmentIndex < 0 || segmentIndex >= this.segmentCount) {
            return -1;
        }
        
        t = Math.max(0, Math.min(1, t));
        
        const p0Index = segmentIndex;
        const p1Index = (segmentIndex + 1) % this.points.length;
        const p0 = this.points[p0Index];
        const p1 = this.points[p1Index];
        
        // 获取当前段的四个控制点（三次贝塞尔曲线）
        const P0 = p0.position;
        const P1 = p0.getRightControlPoint();
        const P2 = p1.getLeftControlPoint();
        const P3 = p1.position;
        
        // 使用 de Casteljau 算法细分曲线
        // 第一层插值
        const Q0 = P0.multiplyScalar(1 - t).add(P1.multiplyScalar(t));
        const Q1 = P1.multiplyScalar(1 - t).add(P2.multiplyScalar(t));
        const Q2 = P2.multiplyScalar(1 - t).add(P3.multiplyScalar(t));
        
        // 第二层插值
        const R0 = Q0.multiplyScalar(1 - t).add(Q1.multiplyScalar(t));
        const R1 = Q1.multiplyScalar(1 - t).add(Q2.multiplyScalar(t));
        
        // 第三层插值（新插入的点位置）
        const S = R0.multiplyScalar(1 - t).add(R1.multiplyScalar(t));
        
        // 创建新控制点
        const newPoint = new BezierPoint(S);
        
        // 设置新点的切线
        // 左侧切线：从 S 指向 R0（相对于 S 的偏移）
        const leftTangent = R0.subtract(S);
        // 右侧切线：从 S 指向 R1（相对于 S 的偏移）
        const rightTangent = R1.subtract(S);
        newPoint.leftTangent = leftTangent;
        newPoint.rightTangent = rightTangent;
        
        // 更新 p0 的右侧切线：从 P0 指向 Q0（相对于 P0 的偏移）
        p0.rightTangent = Q0.subtract(P0);
        
        // 更新 p1 的左侧切线：从 P3 指向 Q2（相对于 P3 的偏移）
        p1.leftTangent = Q2.subtract(P3);
        
        // 插入新点
        const insertIndex = segmentIndex + 1;
        this.points.splice(insertIndex, 0, newPoint);
        
        // 注意：de Casteljau 算法保证了细分后的两段曲线连接起来完全等于原来的曲线
        // 因此曲线形状完全不变。虽然修改 p0 和 p1 的切线可能会影响它们与更远相邻点的 C2 连续性，
        // 但这不会改变曲线形状，只是可能在那些点处出现曲率不连续。
        // 新插入的点已经与相邻段保持了 C2 连续性。
        this.markCachedPointsDirty();
        return insertIndex;
    }
    
    /**
     * 获取指定索引的控制点
     */
    getControlPoint(index) {
        return this.points[index];
    }
    
    
    /**
     * 设置控制点位置
     * @param {number} index - 控制点索引
     * @param {Vec3} position - 新位置
     * @param {boolean} maintainContinuity - 是否保持C2连续性（默认true）
     */
    setPointPosition(index, position, maintainContinuity = true) {
        if (index >= 0 && index < this.points.length) {
            const point = this.points[index];
            
            // 如果是站台点，保持水平（Y坐标不变）
            if (point.isPlatformSection && point.platformHeight !== null) {
                position = new Vec3(position.x, point.platformHeight, position.z);
            }
            
            point.position = position.copy ? position.copy() : new Vec3(position.x, position.y, position.z);
            
            // 如果是站台点且platformHeight为null，设置为当前高度
            if (point.isPlatformSection && point.platformHeight === null) {
                point.platformHeight = position.y;
            }
            
            // 如果是站台点，确保切线水平并调整相邻点
            if (point.isPlatformSection) {
                this.ensurePlatformTangent(index);
            }
            
            this.markCachedPointsDirty();
        }
    }
    
    /**
     * 确保站台点的切线水平，并调整前后两个控制点的位置和切线，使站台区域水平笔直
     * @param {number} pointIndex - 站台点的索引
     */
    ensurePlatformTangent(pointIndex) {
        if (pointIndex < 0 || pointIndex >= this.points.length) return;
        
        const platformPoint = this.points[pointIndex];
        if (!platformPoint.isPlatformSection) return;
        
        const platformHeight = platformPoint.platformHeight !== null ? platformPoint.platformHeight : platformPoint.position.y;
        platformPoint.platformHeight = platformHeight;
        
        // 确保站台点的Y坐标正确
        platformPoint.position.y = platformHeight;
        
        // 固定站台方向为X轴正方向
        const horizontalDirection = new Vec3(1, 0, 0);
        
        // 设置站台点的切线为水平方向
        const leftLength = platformPoint.leftTangent.length() || 2.0;
        const rightLength = platformPoint.rightTangent.length() || 2.0;
        platformPoint.leftTangent = horizontalDirection.multiplyScalar(-leftLength);
        platformPoint.rightTangent = horizontalDirection.multiplyScalar(rightLength);
        
        // 以前这里会强制调整前后一个控制点的高度和切线方向，使整段完全水平。
        // 现在只锁定站台点本身的切线方向，其它控制点（包括站台后第一个点）完全自由。
    }
    
    /**
     * 获取指定段上的自适应采样点数组（根据曲率自动调整采样密度）已确认，不要修改
     * @param {number} segmentIndex - 段索引
     * @param {number} [tolerance=0.01] - 共线判断容差（米）
     * @param {number} [beginDist=0] - 起始距离（用于累积多段距离）
     * @returns {Array<Object>} 采样点数据数组，每个元素包含 {distance, position}
     */
    getPointsOnSegment(segmentIndex,tolerance = 0.001,beginDist = 0) {
        const p0Index = segmentIndex;
        const p1Index = (segmentIndex + 1) % this.points.length;
        
        const p0 = this.points[p0Index];
        const p1 = this.points[p1Index];
        
        let p0_pos = p0.position;
        const p0_right = p0.getRightControlPoint();
        const p1_left = p1.getLeftControlPoint();
        const p1_pos = p1.position;

        const pointData = []; // 存储 {distance, position} 的临时数据
        
        const liftSection= this.points[segmentIndex].isLiftSection||this.points[segmentIndex].isPlatformSection;
        
        // 递归细分函数
        const subdivide = (tb, te, pb, pe,be,beginDistance) => {
            const tm = (tb + te) / 2;
            const pm = this.bezierCubic(p0_pos, p0_right, p1_left, p1_pos, tm);
            
            const db = pm.distance(pb);
            const de = pm.distance(pe);
            
            // 判断三点是否基本共线
            // 如果 db + de 接近 be，说明三点共线
            if (db + de > be + tolerance) {
                // 不共线，继续细分左右两段，深度遍历
                const dist= subdivide(tb, tm, pb, pm,db,beginDistance);

                pointData.push({segmentIndex:segmentIndex, distance: dist, position: pm,liftSection:liftSection });
                return subdivide(tm, te, pm, pe,de,dist);
            }
            return be+beginDistance;
        };
        
        // 从整个段开始细分
        const dist=subdivide(0.0, 1.0, p0_pos, p1_pos,p0_pos.distance(p1_pos),beginDist);
    
        pointData.push({segmentIndex:segmentIndex, distance: dist, position: p1_pos,liftSection:liftSection });

        return pointData;
    }


    /**
     * 获取整个样条曲线上的所有采样点数组（带缓存）
     * @param {number} [tolerance=0.001] - 共线判断容差（米）
     * @returns 没有返回，直接更新this.cachedPoints和this.carStartDistance
     */
    getPoints(tolerance = 0.001) {
        // 如果缓存有效，直接返回
        if (!this.cachedPointsDirty && this.cachedPoints && this.cachedPoints.length > 0) {
            return {points: this.cachedPoints, carStartDistance: this.carStartDistance};
        }

        const points = [];
        const segments = this.segmentCount;

        let totalLength = 0;
        let carStartDistance = 0;
        for (let i = 0; i < segments; i++) {
            const segmentPoints = this.getPointsOnSegment(i, tolerance, totalLength);

            if (i == 0 && segmentPoints && segmentPoints.length > 0)
                carStartDistance = segmentPoints[segmentPoints.length - 1].distance;

            // 确保有返回的点
            if (segmentPoints && segmentPoints.length > 0) {
                // 添加该段的所有点（不包含起点，因为起点是前一段的终点）
                points.push(...segmentPoints);
                // 更新累积距离为最后一个点的距离
                totalLength = segmentPoints[segmentPoints.length - 1].distance;
            }
        }

        // 如果没有任何点，直接更新缓存为空并返回
        const pointCount = points.length;
        if (pointCount === 0) {
            this.cachedPoints = [];
            this.carStartDistance = 0;
            this.cachedPointsDirty = false;
            return { points: this.cachedPoints, carStartDistance: this.carStartDistance };
        }

        // 计算离心加速度和切线
        const len = points.length;
        for (let i = 0; i < len; i++) {
            const p0 = points[(i - 1 + len) % len].position;
            const p1 = points[i].position;
            const p2 = points[(i + 1) % len].position;
            const centrifugalAcceleration = this.getCentrifugalAcceleration(p0, p1, p2);
            points[i].centrifugalAcceleration = centrifugalAcceleration;
            // 切线方向近似为前后点连线方向
            points[i].tangent = p2.subtract(p0).normalize();
        }

        // 保存到缓存
        this.cachedPoints = points;
        this.carStartDistance = carStartDistance;
        this.cachedPointsDirty = false;

        return { points: this.cachedPoints, carStartDistance: this.carStartDistance };
    }
    
    /**
     * 获取缓存的点数组
     * @returns {Array} 缓存的点数组
     */
    getCachedPoints() {
        if (this.cachedPointsDirty || !this.cachedPoints || this.cachedPoints.length === 0) {
            this.getPoints(0.001);
        }
        return this.cachedPoints || [];
    }
    
    /**
     * 标记缓存为脏，需要重新计算
     */
    markCachedPointsDirty() {
        this.cachedPointsDirty = true;
    }
    
    /**
     * 基于距离从缓存点中查找并插值获取点信息
     * @param {number} distance - 沿轨道的距离
     * @returns {Object|null} 包含位置、切线、段索引等信息
     */
    getPointInfoByDistance(distance) {
        const points = this.getCachedPoints();
        if (!points || points.length === 0) {
            return null;
        }
        
        const totalLength = points[points.length - 1].distance;
        if (totalLength <= 0) {
            return null;
        }
        
        // 归一化距离
        const normalizedDistance = ((distance % totalLength) + totalLength) % totalLength;
        
        // 使用优化的二分查找查找最近的点
        let closestIndex = this._binarySearchClosestPoint(points, normalizedDistance, totalLength);
        
        // 找到插值区间
        let index1 = closestIndex;
        const point = points[index1];

        if(point.distance>normalizedDistance)
            index1--;
        index1=index1<0?points.length-1:index1;
        let index2=(index1+1+points.length)%points.length;
        
        const point1 = points[index1];
        const point2 = points[index2];
        
        // 计算插值因子
        let dist1 = point1.distance;
        let dist2 = point2.distance;
        
        // 处理循环情况
        if (dist2 < dist1) {
            dist2 += totalLength;
            const normalizedDist2 = normalizedDistance < dist1 ? normalizedDistance + totalLength : normalizedDistance;
            const segmentLength = dist2 - dist1;
            if (segmentLength > 1e-10) {
                const t = (normalizedDist2 - dist1) / segmentLength;
                return this._interpolatePointInfo(point1, point2, Math.max(0, Math.min(1, t)));
            }
        } else {
            const segmentLength = dist2 - dist1;
            if (segmentLength > 1e-10) {
                const t = (normalizedDistance - dist1) / segmentLength;
                return this._interpolatePointInfo(point1, point2, Math.max(0, Math.min(1, t)));
            }
        }
        
        // 如果无法插值，返回最近的点
        // 曲率 = 离心加速度的大小（速度为1时，离心加速度大小 = 1/r = 曲率）
        const centrifugalAcceleration = point1.centrifugalAcceleration || new Vec3(0, 0, 0);
        const curvature = centrifugalAcceleration.length();
        
        // 曲率中心方向 = -离心力方向（从离心加速度方向推导）
        let curvatureCenterDir;
        if (centrifugalAcceleration.length() > 1e-10) {
            curvatureCenterDir = centrifugalAcceleration.normalize().multiplyScalar(-1);
        } else {
            curvatureCenterDir = new Vec3(0, 1, 0);
        }
        
        return {
            position: point1.position,
            tangent: point1.tangent || new Vec3(1, 0, 0),
            segmentIndex: point1.segmentIndex,
            localT: 0,
            distance: normalizedDistance,
            curvature,
            curvatureCenterDir,
            point: point1,
            centrifugalAcceleration
        };
    }
    
    /**
     * 二分查找最近的点（优化性能）
     * @param {Array} points - 点数组（已按 distance 排序）
     * @param {number} targetDistance - 目标距离
     * @param {number} totalLength - 总长度
     * @returns {number} 最近点的索引
     */
    _binarySearchClosestPoint(points, targetDistance, totalLength) {
        const len = points.length;
        if (len === 0) return 0;
        if (len === 1) return 0;
        
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
            
            // 处理循环情况：如果目标距离在数组末尾附近，可能需要检查开头
            if (midDistance < targetDistance) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        
        // 检查循环边界情况（最后一个点和第一个点之间）
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
     * 在两个点之间插值计算点信息
     * @param {Object} point1 - 第一个点
     * @param {Object} point2 - 第二个点
     * @param {number} t - 插值因子 (0-1)
     * @returns {Object} 插值后的点信息
     */
    _interpolatePointInfo(point1, point2, t) {
        // 插值位置
        const position = point1.position.multiplyScalar(1 - t).add(point2.position.multiplyScalar(t));
        
        // 插值切线（使用距离插值）
        let tangent;
        if (point1.tangent && point2.tangent) {
            tangent = point1.tangent.multiplyScalar(1 - t).add(point2.tangent.multiplyScalar(t)).normalize();
        } else {
            tangent = point1.tangent || point2.tangent || new Vec3(1, 0, 0);
        }
        
        // 插值离心加速度向量（大小为曲率，方向为离心力方向）
        // 速度为1时，离心加速度大小 = 1/r = 曲率
        let centrifugalAcceleration;
        if (point1.centrifugalAcceleration && point2.centrifugalAcceleration) {
            // 直接插值向量（保持大小和方向）
            centrifugalAcceleration = point1.centrifugalAcceleration.multiplyScalar(1 - t)
                .add(point2.centrifugalAcceleration.multiplyScalar(t));
        } else {
            centrifugalAcceleration = point1.centrifugalAcceleration || point2.centrifugalAcceleration || new Vec3(0, 0, 0);
        }
        
        // 段索引和局部t（使用第一个点的段索引）
        const segmentIndex = point1.segmentIndex;
        const localT = t;
        
        // 曲率 = 离心加速度的大小（速度为1时，离心加速度大小 = 1/r = 曲率）
        const curvature = centrifugalAcceleration.length();
        
        // 曲率中心方向 = -离心力方向（从离心加速度方向推导）
        let curvatureCenterDir;
        if (centrifugalAcceleration && centrifugalAcceleration.length() > 1e-10) {
            curvatureCenterDir = centrifugalAcceleration.normalize().multiplyScalar(-1);
        } else {
            // 如果离心加速度为零，返回向上的法线作为默认值
            curvatureCenterDir = new Vec3(0, 1, 0);
        }
        
        return {
            position,
            tangent,
            segmentIndex,
            localT,
            distance: point1.distance * (1 - t) + point2.distance * t,
            curvature,
            curvatureCenterDir,
            point: point1,
            centrifugalAcceleration
        };
    }

    /**
     * 通过三点计算共圆圆心，并返回速度为1时的离心加速度向量
     * @param {Vec3} p0 - 第一个点
     * @param {Vec3} p1 - 第二个点（中间点）
     * @param {Vec3} p2 - 第三个点
     * @returns {Vec3} 离心加速度向量（方向远离圆心，大小为1/r，其中r是半径）
     */
    getCentrifugalAcceleration(p0, p1, p2) {
        // 计算三个点之间的向量
        const v1 = p1.subtract(p0); // p0 -> p1
        const v2 = p2.subtract(p1); // p1 -> p2
        
        // 计算法向量（垂直于三点所在平面）
        const normal = v1.cross(v2);
        const normalLength = normal.length();
        
        // 如果三点共线或几乎共线，无法确定唯一的圆
        if (normalLength < 1e-10) {
            return new Vec3(0, 0, 0);
        }
        
        const normalNorm = normal.multiplyScalar(1.0 / normalLength);
        
        // 计算 p0 和 p1 的中点
        const mid1 = p0.add(p1).multiplyScalar(0.5);
        // 计算 p1 和 p2 的中点
        const mid2 = p1.add(p2).multiplyScalar(0.5);
        
        // 计算垂直平分线的方向向量
        // 垂直平分线方向 = 法向量 × 原向量（在平面内垂直于原向量）
        const perp1 = normalNorm.cross(v1).normalize(); // p0-p1 的垂直平分线方向
        const perp2 = normalNorm.cross(v2).normalize(); // p1-p2 的垂直平分线方向
        
        // 计算从 mid1 指向 mid2 的向量
        const midVec = mid2.subtract(mid1);
        
        // 计算两条垂直平分线的交点
        // 设圆心在 mid1 + t*perp1 上，也在 mid2 + s*perp2 上
        // 求解：mid1 + t*perp1 = mid2 + s*perp2
        // 即：t*perp1 - s*perp2 = mid2 - mid1 = midVec
        
        // 由于三点不共线，两条垂直平分线必然相交，可以直接求解
        // 使用向量投影方法：将 midVec 投影到 perp1 和 perp2 上
        const perp1DotPerp2 = perp1.dot(perp2);
        const denom = 1.0 - perp1DotPerp2 * perp1DotPerp2;
        
        // 求解参数 t
        // t*perp1 - s*perp2 = midVec
        // 两边同时点乘 perp2：t*(perp1·perp2) - s = midVec·perp2
        // 两边同时点乘 perp1：t - s*(perp1·perp2) = midVec·perp1
        // 联立求解得到：t = (midVec·perp1 - midVec·perp2 * (perp1·perp2)) / (1 - (perp1·perp2)²)
        const midVecDotPerp1 = midVec.dot(perp1);
        const midVecDotPerp2 = midVec.dot(perp2);
        
        const t = (midVecDotPerp1 - midVecDotPerp2 * perp1DotPerp2) / denom;
        
        // 计算圆心
        const center = mid1.add(perp1.multiplyScalar(t));
        
        // 计算半径（从圆心到 p1 的距离）
        const fromCenter = p1.subtract(center); // 从圆心指向 p1（离心方向）
        const r = fromCenter.length();
        
        // 如果半径太小，返回零向量
        if (r < 1e-10) {
            return new Vec3(0, 0, 0);
        }
        
        // 速度为1时的离心加速度向量
        // 大小 = v²/r = 1/r，方向远离圆心（从圆心指向 p1，即离心方向）
        return fromCenter.normalize().multiplyScalar(1.0 / r);
    }
    /**
     * 获取曲线的总长度（近似值）
     * 优先使用缓存点的总长度，避免重复计算
     */
    getApproximateLength() {
        // 如果缓存点存在，直接使用最后一个点的距离作为总长度
        this.getCachedPoints();

        if (!this.cachedPoints || this.cachedPoints.length === 0) {
            return 0;
        }

        return this.cachedPoints[this.cachedPoints.length - 1].distance;
    }
    
    /**
     * 三次贝塞尔曲线计算
     */
    bezierCubic(p0, p1, p2, p3, t) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        return p0.multiplyScalar(uuu)
            .add(p1.multiplyScalar(3 * uu * t))
            .add(p2.multiplyScalar(3 * u * tt))
            .add(p3.multiplyScalar(ttt));
    }
    
    /**
     * 根据距离获取曲率（使用缓存数据插值）
     * @param {number} distance - 沿轨道的距离
     * @returns {number} 曲率值
     */
    getCurvatureByDistance(distance) {
        const pointInfo = this.getPointInfoByDistance(distance);
        if (!pointInfo) {
            return 0;
        }
        return pointInfo.curvature || 0;
    }
    
    /**
     * 保证当前控制点左右切线相反
     * @param {number} pointIndex
     * @param {boolean} skipCurrentPoint
     */
    ensureC2Continuity(pointIndex, skipCurrentPoint = false) {
        if (skipCurrentPoint) return;
        if (pointIndex < 0 || pointIndex >= this.points.length) return;
        
        const point = this.points[pointIndex];
        if (!point || point.isPlatformSection) return;
        
        const rightLength = point.rightTangent.length();
        const leftLength = point.leftTangent.length();
        let direction = null;
        
        if (rightLength > 0.0001) {
            direction = point.rightTangent.normalize();
        } else if (leftLength > 0.0001) {
            // leftTangent 指向左控制点（通常为反方向），需要取反得到右向
            direction = point.leftTangent.normalize().multiplyScalar(-1);
        } else {
            direction = new Vec3(1, 0, 0);
        }
        
        const targetRightLength = rightLength > 0.0001 ? rightLength : (leftLength > 0.0001 ? leftLength : 1);
        const targetLeftLength = leftLength > 0.0001 ? leftLength : targetRightLength;
        
        point.rightTangent = direction.multiplyScalar(targetRightLength);
        point.leftTangent = direction.multiplyScalar(-targetLeftLength);
    }
    
    /**
     * 设置控制点的左侧切线长度
     */
    setLeftTangentLength(pointIndex, length) {
        if (pointIndex >= 0 && pointIndex < this.points.length) {
            const point = this.points[pointIndex];
            const currentLength = point.leftTangent.length();
            
            if (currentLength > 0.01) {
                // 保持原有方向，只改变长度
                const direction = point.leftTangent.normalize();
                point.leftTangent = direction.multiplyScalar(length);
            } else {
                // 如果没有方向，使用默认方向
                if (pointIndex > 0) {
                    const prevPoint = this.points[pointIndex - 1];
                    const direction = point.position.subtract(prevPoint.position).normalize();
                    point.leftTangent = direction.multiplyScalar(-length);
                } else if (this.closed && this.points.length > 1) {
                    // 闭合曲线的第一个点，使用最后一个点的方向
                    const lastPoint = this.points[this.points.length - 1];
                    const direction = point.position.subtract(lastPoint.position).normalize();
                    point.leftTangent = direction.multiplyScalar(-length);
                } else {
                    // 使用默认方向（X轴负方向）
                    point.leftTangent = new Vec3(-length, 0, 0);
                }
            }
            
            this.markCachedPointsDirty();
        }
    }
    
    /**
     * 设置控制点的右侧切线长度
     */
    setRightTangentLength(pointIndex, length) {
        if (pointIndex >= 0 && pointIndex < this.points.length) {
            const point = this.points[pointIndex];
            const currentLength = point.rightTangent.length();
            
            if (currentLength > 0.01) {
                // 保持原有方向，只改变长度
                const direction = point.rightTangent.normalize();
                point.rightTangent = direction.multiplyScalar(length);
            } else {
                // 如果没有方向，使用默认方向
                if (pointIndex < this.points.length - 1) {
                    const nextPoint = this.points[pointIndex + 1];
                    const direction = nextPoint.position.subtract(point.position).normalize();
                    point.rightTangent = direction.multiplyScalar(length);
                } else if (this.closed && this.points.length > 1) {
                    // 闭合曲线的最后一个点，使用第一个点的方向
                    const firstPoint = this.points[0];
                    const direction = firstPoint.position.subtract(point.position).normalize();
                    point.rightTangent = direction.multiplyScalar(length);
                } else {
                    // 使用默认方向（X轴正方向）
                    point.rightTangent = new Vec3(length, 0, 0);
                }
            }
            
            this.markCachedPointsDirty();
        }
    }
    
    /**
     * 将样条数据序列化为可保存的JSON结构
     */
    serialize() {
        return {
            closed: this.closed,
            points: this.points.map(point => ({
                position: { x: point.position.x, y: point.position.y, z: point.position.z },
                leftTangent: { x: point.leftTangent.x, y: point.leftTangent.y, z: point.leftTangent.z },
                rightTangent: { x: point.rightTangent.x, y: point.rightTangent.y, z: point.rightTangent.z },
                isLiftSection: !!point.isLiftSection,
                liftSpeed: point.liftSpeed,
                isElectromagneticBoost: !!point.isElectromagneticBoost,
                isElectromagneticBrake: !!point.isElectromagneticBrake,
                electromagneticAcceleration: point.electromagneticAcceleration,
                isPlatformSection: !!point.isPlatformSection,
                platformHeight: point.platformHeight
            }))
        };
    }

    /**
     * 使用已有的序列化数据恢复样条
     * @param {Object} data
     * @returns {boolean} 是否恢复成功
     */
    loadFromData(data) {
        if (!data || !Array.isArray(data.points) || data.points.length < 3) {
            return false;
        }

        const toVec3 = (source, fallback = { x: 0, y: 0, z: 0 }) => new Vec3(
            Number.isFinite(source?.x) ? source.x : fallback.x,
            Number.isFinite(source?.y) ? source.y : fallback.y,
            Number.isFinite(source?.z) ? source.z : fallback.z
        );

        this.closed = data.closed !== undefined ? !!data.closed : this.closed;

        this.points = data.points.map(pointData => {
            const point = new BezierPoint(toVec3(pointData.position));
            point.leftTangent = toVec3(pointData.leftTangent);
            point.rightTangent = toVec3(pointData.rightTangent);
            point.isLiftSection = !!pointData.isLiftSection;
            if (typeof pointData.liftSpeed === 'number') {
                point.liftSpeed = pointData.liftSpeed;
            }
            point.isElectromagneticBoost = !!pointData.isElectromagneticBoost;
            point.isElectromagneticBrake = !!pointData.isElectromagneticBrake;
            if (typeof pointData.electromagneticAcceleration === 'number') {
                point.electromagneticAcceleration = pointData.electromagneticAcceleration;
            }
            point.isPlatformSection = !!pointData.isPlatformSection;
            if (typeof pointData.platformHeight === 'number') {
                point.platformHeight = pointData.platformHeight;
            } else if (point.isPlatformSection) {
                // 如果是站台区域但没有高度，使用当前位置的高度
                point.platformHeight = point.position.y;
            }
            return point;
        });

        // 不再自动调整曲率，仅返回成功
        return true;
    }
}

