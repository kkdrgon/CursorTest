import { Vec3, Mat4 } from './math3d.js';
import { BezierSpline, BezierPoint } from './bezier-spline.js';
import { TrackGenerator } from './track-generator.js';
import { Renderer } from './renderer.js';
import { Car } from './car.js';
import { CoasterTypeManager } from './coaster-types.js';
import { AchievementManager } from './achievements.js';
import { ParkManager } from './park-manager.js';
import { CoasterManager } from './coaster-manager.js';

const LOCAL_STORAGE_KEY = 'webgl-rollercoaster:state:v1';
const GAME_TRACK_STORAGE_KEY = 'webgl-rollercoaster:game-track:v1'; // 游戏轨道自动保存
const EXPORT_FILE_PREFIX = 'webgl-rollercoaster-track';

/**
 * 交互式编辑器
 */
export class Editor {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);

        // 公园管理系统
        this.parkManager = new ParkManager();

        // 过山车管理系统
        this.coasterManager = new CoasterManager(this.parkManager);

        // 创建第一个过山车
        const firstCoasterId = this.coasterManager.createCoaster('wooden', { x: 0, y: 5, z: 0 });
        const firstCoaster = this.coasterManager.getCoaster(firstCoasterId);

        // 为了向后兼容，保留原有的属性，但指向当前选中的过山车
        // 正式轨道（游戏/物理/成就用）
        this.gameSpline = firstCoaster.gameSpline;
        // 预编辑轨道（编辑模式用）
        this.spline = firstCoaster.spline;

        this.coasterTypeManager = firstCoaster.coasterTypeManager;

        // 轨道生成器与小车始终基于正式轨道
        this.trackGenerator = firstCoaster.trackGenerator;
        this.car = firstCoaster.car;
        this.achievementManager = new AchievementManager();

        // 设置成就解锁回调
        this.achievementManager.setOnUnlockCallback((achievement) => {
            this.handleAchievementUnlock(achievement);
        });

        // 经济与升级系统
        this.screamCoins = 200;
        this.trackLengthLevels = [120, 180, 240, 320];
        this.trackLengthCosts = [150, 250, 400];
        this.trackLengthLevel = 0;
        this.maxTrackLength = this.trackLengthLevels[this.trackLengthLevel];
        this.trackLengthExceeded = false;

        // 站台配置
        this.platformLength = 10.0; // 站台长度（米），可以通过升级改变
        this.platformHeight = 5.0; // 站台高度
        this.platformStartIndex = -1; // 站台起始控制点索引（站台尾）
        this.platformEndIndex = -1; // 站台结束控制点索引（站台头，也是轨道起点）
        this.boostAccelerationLimit = 5;
        this.brakeAccelerationLimit = 5;
        this.boostAccelerationStep = 5;
        this.brakeAccelerationStep = 5;
        this.boostAccelerationCap = 35;
        this.brakeAccelerationCap = 35;

        this.selectedPointIndex = -1;
        this.lastTime = performance.now();
        this.selectedTangentIndex = -1; // -1: 无, 0: 左侧, 1: 右侧
        this.selectedAxis = -1; // -1: 无, 0: X轴, 1: Y轴, 2: Z轴
        this.isDragging = false;
        this.isRotating = false;
        this.isZooming = false;
        this.isEditMode = false; // 编辑模式标志，只有编辑模式下才显示和选中控制点
        this.trackUpdatePending = false; // 标记轨道更新是否待处理
        this.lastTrackUpdateTime = 0; // 上次轨道更新时间
        this.trackUpdateThrottle = 50; // 轨道更新节流时间（毫秒）
        this.dragUpdateDelay = 150; // 拖动时延迟执行重型更新
        this.dragUpdateTimer = null; // 拖动时延迟更新定时器
        this.previewUpdateThrottle = 50; // 预览更新节流（约20fps，拖动时降低更新频率以提高性能）
        this.lastPreviewUpdateTime = 0;
        this.previewUpdatePending = false;
        this.dragStartPos = null;
        this.rotationCenter = null;
        this.didModifyControlPoint = false;
        this.dragStartMousePos = null;
        this.rotationStartMousePos = null;
        this.initialPinchDistance = 0;
        this.initialCameraDistance = 0;

        // 相机模式：'free'（自由视角）或 'follow'（跟随过山车）
        this.cameraMode = 'free';
        this.savedCameraPosition = null;
        this.savedCameraTarget = null;
        this.savedCameraUp = null;

        // 游戏状态管理（从当前过山车同步）
        this.gameState = firstCoaster.gameState;

        // 初始化相机旋转角度
        const camera = this.renderer.camera;
        const toCamera = camera.position.subtract(camera.target);
        const distance = toCamera.length();
        const normalized = toCamera.multiplyScalar(1.0 / distance);

        this.cameraRotation = {
            yaw: Math.atan2(normalized.z, normalized.x),
            pitch: Math.asin(normalized.y)
        };

        this.setupEventListeners();

        // 等待渲染器初始化完成后再更新轨道和开始渲染
        this.init();
    }

    /**
     * 同步当前选中的过山车到编辑器属性（向后兼容）
     */
    syncCurrentCoaster() {
        const coaster = this.coasterManager.getCurrentCoaster();
        if (!coaster) {
            return;
        }

        // 同步属性
        this.gameSpline = coaster.gameSpline;
        this.spline = coaster.spline;
        this.coasterTypeManager = coaster.coasterTypeManager;
        this.trackGenerator = coaster.trackGenerator;
        this.car = coaster.car;
        // 注意：gameState 是引用，所以修改 this.gameState 会直接修改过山车的 gameState
        // 但为了确保引用正确，我们重新赋值
        this.gameState = coaster.gameState;
    }

    /**
     * 切换当前选中的过山车
     * @param {string} coasterId - 过山车ID
     */
    switchCoaster(coasterId) {
        if (this.coasterManager.setCurrentCoaster(coasterId)) {
            this.syncCurrentCoaster();
            // 更新轨道显示
            this.updateTrack();
            // 触发UI更新
            if (window.updateCoasterList) {
                window.updateCoasterList();
            }
        }
    }

    /**
     * 从UI更新选中控制点的位置
     * @param {{x:number,y:number,z:number}} position
     */
    updateSelectedPointPositionFromUI(position) {
        if (!this.isEditMode || this.selectedPointIndex < 0 || this.selectedPointIndex >= this.spline.pointCount) {
            return;
        }
        if (typeof position?.x !== 'number' || typeof position?.y !== 'number' || typeof position?.z !== 'number') {
            return;
        }
        const point = this.spline.getControlPoint(this.selectedPointIndex);
        if (!point) {
            return;
        }

        const newPos = new Vec3(position.x, position.y, position.z);
        this.spline.setPointPosition(this.selectedPointIndex, newPos, true);
        this.didModifyControlPoint = true;
        this.requestCurvePreviewUpdate();
        this.scheduleTrackUpdate();
        if (window.updateTangentUI) {
            window.updateTangentUI();
        }
    }

    /**
     * 从UI更新选中控制点的切线方向
     * @param {'left'|'right'} which
     * @param {{x:number,y:number,z:number}} direction
     */
    updateSelectedPointTangentDirection(which, direction) {
        if (!this.isEditMode || this.selectedPointIndex < 0 || this.selectedPointIndex >= this.spline.pointCount) {
            return;
        }
        if (!direction || typeof direction.x !== 'number' || typeof direction.y !== 'number' || typeof direction.z !== 'number') {
            return;
        }
        const point = this.spline.getControlPoint(this.selectedPointIndex);
        if (!point) {
            return;
        }

        const dirVec = new Vec3(direction.x, direction.y, direction.z);
        if (dirVec.length() < 0.0001) {
            return;
        }
        const normalized = dirVec.normalize();

        if (which === 'left') {
            const targetLength = point.leftTangent.length() || 1;
            point.leftTangent = normalized.multiplyScalar(targetLength);
        } else if (which === 'right') {
            const targetLength = point.rightTangent.length() || 1;
            point.rightTangent = normalized.multiplyScalar(targetLength);
        } else {
            return;
        }

        if (point.isPlatformSection) {
            this.spline.ensurePlatformTangent(this.selectedPointIndex);
        }

        // 切线更新会改变曲线形状，需要重新计算采样点
        if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
            this.spline.markCachedPointsDirty();
        }

        this.didModifyControlPoint = true;
        this.requestCurvePreviewUpdate();
        this.scheduleTrackUpdate();
        if (window.updateTangentUI) {
            window.updateTangentUI();
        }
    }

    async init() {
        let waitCount = 0;
        // 等待着色器加载完成（最多等待10秒）
        while (!this.renderer.shadersReady && waitCount < 200) {
            await new Promise(resolve => setTimeout(resolve, 50));
            waitCount++;
        }

        if (!this.renderer.shadersReady) {
            console.error('着色器加载超时！');
            alert('着色器加载超时，请检查控制台错误信息');
            return;
        }

        // 确保初始使用木架过山车类型（如果没有本地存档）
        // 注意：如果有本地存档，会在 loadProjectStateFromLocal 中加载类型，这里不覆盖

        const currentType = this.coasterTypeManager.getCurrentType();

        // 首先尝试自动加载游戏轨道（gameSpline）
        const gameTrackLoaded = this.loadGameTrack && this.loadGameTrack();

        // 检查是否有编辑轨道存档（槽位）
        const hasLocalSave = this.hasLocalSave && this.hasLocalSave();
        if (hasLocalSave) {
            // 有存档，尝试自动加载槽0（主存档）的编辑轨道
            try {
                if (this.hasLocalSave(0)) {
                    console.log('检测到槽1有编辑轨道存档，自动加载...');
                    this.loadProjectStateFromLocal(0);
                } else {
                    // 槽0没有，尝试加载第一个有存档的槽
                    for (let i = 0; i < 10; i++) {
                        if (this.hasLocalSave(i)) {
                            console.log(`检测到槽${i + 1}有编辑轨道存档，自动加载...`);
                            this.loadProjectStateFromLocal(i);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error('自动加载编辑轨道存档失败:', e);
            }
        }

        // 如果游戏轨道未加载成功，尝试从编辑轨道复制或生成默认轨道
        if (!gameTrackLoaded) {
            if (this.spline && this.spline.pointCount >= 2) {
                // 有编辑轨道，复制到游戏轨道
                try {
                    const data = this.spline.serialize();
                    if (!this.gameSpline) {
                        this.gameSpline = new BezierSpline();
                    }
                    this.gameSpline.loadFromData(data);
                    if (this.trackGenerator) {
                        this.trackGenerator.spline = this.gameSpline;
                        if (this.trackGenerator.clearGeneratorCache) {
                            this.trackGenerator.clearGeneratorCache();
                        }
                    }
                    console.log('从编辑轨道复制到游戏轨道，点数:', this.gameSpline.pointCount);
                    // 自动保存游戏轨道
                    if (this.saveGameTrack) {
                        this.saveGameTrack();
                    }
                } catch (e) {
                    console.error('从编辑轨道复制到游戏轨道失败:', e);
                }
            } else {
                // 没有编辑轨道，生成默认轨道
                if (!currentType || currentType.name !== 'wooden') {
                    this.coasterTypeManager.setCurrentType('wooden');
                }
                if (this.spline.pointCount === 0) {
                    this.generateDefaultTrack(20.0);
                    // generateDefaultTrack 会初始化 gameSpline，这里自动保存
                    if (this.saveGameTrack) {
                        this.saveGameTrack();
                    }
                }
            }
        }

        // 清除生成器缓存，确保使用正确的类型
        if (this.trackGenerator && this.trackGenerator.clearGeneratorCache) {
            this.trackGenerator.clearGeneratorCache();
        }

        this.updateTrack();
        this.refreshAllTracks();
        this.initCar();
        if (this.car) {
            this.car.onLapComplete = () => {
                this.incrementLap();
                this.handleLapReward();
            };
        }
        this.startRenderLoop();
        this.updateEconomyUI();

        // 检查第一个轨道成就
        this.checkTrackDesignAchievements();

        // 初始化过山车类型UI
        if (window.updateCoasterTypeUI) {
            window.updateCoasterTypeUI();
        }

        // 初始化成就UI
        if (window.updateAchievementsUI) {
            window.updateAchievementsUI(this.achievementManager);
        }
    }

    /**
     * 生成默认轨道（包含固定站台区域）
     * @param {number} diameter - 圆形轨道直径（米），默认20米
     */
    generateDefaultTrack(diameter = 20.0) {
        const radius = diameter / 2.0;
        const centerY = 5.0;

        // 清除现有控制点
        this.spline.points = [];

        // 创建站台区域
        // 站台尾：(-platformLength, 5, 0)
        // 站台头：(0, 5, 0) - 这也是轨道起点
        const platformTail = new BezierPoint(new Vec3(-this.platformLength, this.platformHeight, 0));
        platformTail.isPlatformSection = true;
        platformTail.platformHeight = this.platformHeight;
        const platformHead = new BezierPoint(new Vec3(0, this.platformHeight, 0));
        platformHead.isPlatformSection = true;
        platformHead.platformHeight = this.platformHeight;

        // 站台方向（X轴正方向，水平）
        const platformDirection = new Vec3(1, 0, 0);
        const platformDistance = platformHead.position.distance(platformTail.position);
        const platformTangentLength = platformDistance / 3;

        // 设置站台点的切线（水平共线）
        platformTail.setTangentDirection(platformDirection, platformTangentLength, platformTangentLength);
        platformHead.setTangentDirection(platformDirection, platformTangentLength, platformTangentLength);

        // 添加站台控制点
        this.spline.points.push(platformTail);
        this.spline.points.push(platformHead);

        // 记录站台索引
        this.platformStartIndex = 0;
        this.platformEndIndex = 1;
        this.spline.platformStartIndex = this.platformStartIndex;
        this.spline.platformEndIndex = this.platformEndIndex;

        // 创建圆形轨道的控制点（4个点形成圆形）
        const trackPoints = [
            new Vec3(3.5, centerY, 0),      // 起点
            new Vec3(10, 5 + centerY, 0),      // 牵引坡顶
            new Vec3(13, 3 + centerY, diameter / 4),      // 牵引坡顶1
            new Vec3(7, -1 + centerY, diameter / 2),      // 右转下坡
            new Vec3(5, centerY, diameter / 2),      // 右转下坡1
            new Vec3(-10, 1 + centerY, diameter / 2),     // 左侧
            new Vec3(-12, -1 + centerY, diameter / 4)      // 后方
        ];

        // 添加轨道控制点
        for (const pos of trackPoints) {
            const point = new BezierPoint(pos);
            this.spline.points.push(point);
        }

        // 设置每个轨道点的切线，使其默认长度为相邻控制点距离的1/3
        for (let i = 0; i < trackPoints.length; i++) {
            const pointIndex = i + 2; // 跳过站台点
            this.setDefaultTangentByNeighbors(pointIndex);
        }

        // 确保站台头与第一个轨道点的连接平滑
        const firstTrackPoint = this.spline.points[2];
        const toFirstTrack = firstTrackPoint.position.subtract(platformHead.position);
        const toFirstTrackDir = new Vec3(toFirstTrack.x, 0, toFirstTrack.z);
        if (toFirstTrackDir.length() > 0.01) {
            const horizontalDir = toFirstTrackDir.normalize();
            const rightLength = platformHead.rightTangent.length() || platformTangentLength;
            platformHead.rightTangent = horizontalDir.multiplyScalar(rightLength);
            platformHead.leftTangent = horizontalDir.multiplyScalar(-(platformHead.leftTangent.length() || platformTangentLength));
        }

        // 确保C2连续性
        for (let iter = 0; iter < 2; iter++) {
            for (let i = 0; i < this.spline.points.length; i++) {
                this.spline.ensureC2Continuity(i);
            }
        }

        // 最后确保站台区域保持水平共线
        this.updatePlatformPoints();

        // 如果当前还没有正式轨道，用默认编辑轨道初始化正式轨道
        if (this.gameSpline && this.gameSpline.pointCount === 0) {
            try {
                const data = this.spline.serialize();
                this.gameSpline.loadFromData(data);
                if (this.trackGenerator) {
                    this.trackGenerator.spline = this.gameSpline;
                }
                if (this.car) {
                    this.car.totalLength = this.gameSpline.getApproximateLength();
                    if (this.car.physics) {
                        this.car.physics.spline = this.gameSpline;
                        this.car.physics.trackGenerator = this.trackGenerator;
                        this.car.physics.reset();
                    }
                }
            } catch (e) {
                console.warn('初始化正式轨道失败，将在后续应用编辑轨道时重试', e);
            }
        }

        // 自动保存游戏轨道（如果已初始化）
        if (this.gameSpline && this.gameSpline.pointCount >= 2 && this.saveGameTrack) {
            this.saveGameTrack();
        }
    }

    /**
     * 更新站台控制点，确保站台保持水平共线
     * 站台尾在(-platformLength, 5, 0)，站台头在(0, 5, 0)
     */
    updatePlatformPoints() {
        if (this.platformStartIndex < 0 || this.platformEndIndex < 0 ||
            this.platformStartIndex >= this.spline.pointCount ||
            this.platformEndIndex >= this.spline.pointCount) {
            return;
        }

        const platformTail = this.spline.points[this.platformStartIndex];
        const platformHead = this.spline.points[this.platformEndIndex];
        platformTail.isPlatformSection = true;
        platformTail.platformHeight = this.platformHeight;
        platformHead.isPlatformSection = true;
        platformHead.platformHeight = this.platformHeight;

        // 设置站台尾位置
        platformTail.position = new Vec3(-this.platformLength, this.platformHeight, 0);

        // 设置站台头位置
        platformHead.position = new Vec3(0, this.platformHeight, 0);

        // 站台方向（X轴正方向）
        const platformDirection = new Vec3(1, 0, 0);
        const platformDistance = platformHead.position.distance(platformTail.position);
        const defaultLength = platformDistance / 3;

        platformTail.setTangentDirection(platformDirection, defaultLength, defaultLength);
        platformHead.setTangentDirection(platformDirection, defaultLength, defaultLength);
    }

    /**
     * 根据相邻控制点距离设置默认切线长度（距离的1/3）
     */
    setDefaultTangentByNeighbors(pointIndex) {
        if (!this.spline || this.spline.pointCount < 3) {
            return;
        }
        if (pointIndex < 0 || pointIndex >= this.spline.pointCount) {
            return;
        }

        const point = this.spline.points[pointIndex];
        const prevIndex = (pointIndex - 1 + this.spline.pointCount) % this.spline.pointCount;
        const nextIndex = (pointIndex + 1) % this.spline.pointCount;
        const prevPoint = this.spline.points[prevIndex];
        const nextPoint = this.spline.points[nextIndex];

        const toPrev = point.position.subtract(prevPoint.position);
        const toNext = nextPoint.position.subtract(point.position);

        const prevDistance = toPrev.length();
        const nextDistance = toNext.length();

        if (prevDistance > 0.001) {
            const dirToPrev = toPrev.multiplyScalar(1 / prevDistance);
            point.leftTangent = dirToPrev.multiplyScalar(-prevDistance / 3);
        }

        if (nextDistance > 0.001) {
            const dirToNext = toNext.multiplyScalar(1 / nextDistance);
            point.rightTangent = dirToNext.multiplyScalar(nextDistance / 3);
        }
    }

    /**
     * 检查位置是否在站台区域内
     * @param {number} t - 参数t (0-1)
     * @returns {Object|null} {type: 'platform', startT: number, endT: number} 或 null
     */
    isInPlatformSection(t) {
        if (this.platformStartIndex < 0 || this.platformEndIndex < 0) {
            return null;
        }

        // 计算站台区域对应的t值范围
        // 站台从站台尾到站台头，对应从0到站台头在总曲线中的t值
        const totalSegments = this.spline.segmentCount;
        if (totalSegments === 0) return null;

        // 站台尾在段0，站台头在段1
        // 计算站台头对应的t值
        const platformHeadT = (this.platformEndIndex + 1) / totalSegments;

        // 检查t是否在站台区域内（从0到platformHeadT）
        if (t >= 0 && t <= platformHeadT) {
            return {
                type: 'platform',
                startT: 0,
                endT: platformHeadT
            };
        }

        return null;
    }

    /**
     * 初始化小车
     */
    initCar() {
        const carMesh = Car.generateMesh();
        this.renderer.setCarMesh(carMesh);
        // 初始化小车变换矩阵
        if (this.car) {
            const carTransform = this.car.getTransformMatrix();
            this.renderer.setCarTransform(carTransform);
        } else {
            console.warn('小车对象不存在');
        }
    }

    setupEventListeners() {
        // 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));

        // 触摸事件（移动端支持）
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }

    /**
     * 将屏幕坐标转换为世界坐标（使用射线投射）
     * 返回从相机位置出发的射线
     */
    screenToRay(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const camera = this.renderer.camera;
        
        // 获取设备像素比
        const dpr = window.devicePixelRatio || 1;
        
        // 获取canvas的CSS显示尺寸（逻辑像素）
        const clientWidth = this.canvas.clientWidth || rect.width;
        const clientHeight = this.canvas.clientHeight || rect.height;
        
        // 获取canvas的内部分辨率（物理像素）
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // 计算宽高比（使用内部分辨率）
        const aspect = canvasWidth / canvasHeight;

        // 判断是绝对屏幕坐标还是相对于 canvas 的坐标
        let canvasX, canvasY;
        if (x > clientWidth || y > clientHeight) {
            // 绝对屏幕坐标（逻辑像素）
            canvasX = x - rect.left;
            canvasY = y - rect.top;
        } else {
            // 相对于 canvas 的坐标（逻辑像素）
            canvasX = x;
            canvasY = y;
        }
        
        // 将逻辑像素坐标转换为canvas内部分辨率坐标
        // 注意：canvas的内部分辨率 = clientWidth * dpr
        const physicalX = (canvasX / clientWidth) * canvasWidth;
        const physicalY = (canvasY / clientHeight) * canvasHeight;

        // 标准化设备坐标 (NDC: -1 到 1)
        // 使用canvas内部分辨率计算NDC
        const ndcX = (physicalX / canvasWidth) * 2 - 1;
        const ndcY = 1 - (physicalY / canvasHeight) * 2; // Y轴翻转

        // 计算相机坐标系中的方向向量
        const forward = camera.target.subtract(camera.position).normalize();
        const right = camera.up.cross(forward).normalize();
        const up = forward.cross(right);

        // 计算视口在世界空间中的尺寸（在近平面）
        const fovRad = camera.fov * Math.PI / 180;
        const nearHeight = 2 * Math.tan(fovRad / 2) * camera.near;
        const nearWidth = nearHeight * aspect;

        // 在近平面上的偏移
        const offsetX = ndcX * nearWidth * 0.5;
        const offsetY = ndcY * nearHeight * 0.5;

        // 计算近平面上的点（在相机坐标系中）
        const nearPoint = camera.position
            .add(forward.multiplyScalar(camera.near))
            .add(right.multiplyScalar(offsetX))
            .add(up.multiplyScalar(offsetY));

        // 射线方向（从相机位置指向近平面上的点）
        const direction = nearPoint.subtract(camera.position).normalize();

        return {
            origin: camera.position,
            direction: direction
        };
    }

    /**
     * 计算射线到点的最短距离
     */
    rayToPointDistance(ray, point) {
        if (!ray || !point) {
            return Infinity;
        }

        const toPoint = point.subtract(ray.origin);
        const projectionLength = toPoint.dot(ray.direction);

        if (projectionLength < 0) {
            // 点在射线后方
            return toPoint.length();
        }

        const projection = ray.direction.multiplyScalar(projectionLength);
        const perpendicular = toPoint.subtract(projection);
        return perpendicular.length();
    }

    /**
     * 将屏幕坐标转换为世界坐标（在目标平面上）
     */
    screenToWorldOnPlane(x, y, planePoint, planeNormal) {
        const ray = this.screenToRay(x, y);

        // 计算射线与平面的交点
        const toPlane = planePoint.subtract(ray.origin);
        const denom = ray.direction.dot(planeNormal);

        if (Math.abs(denom) < 0.0001) {
            // 射线与平面平行，返回平面上的投影
            const dist = toPlane.dot(planeNormal);
            return ray.origin.add(ray.direction.multiplyScalar(dist / denom));
        }

        const t = toPlane.dot(planeNormal) / denom;
        return ray.origin.add(ray.direction.multiplyScalar(t));
    }

    /**
     * 将世界坐标转换为屏幕坐标
     */
    worldToScreen(worldPos) {
        const camera = this.renderer.camera;
        const canvas = this.canvas;
        const aspect = canvas.width / canvas.height;
        const fov = camera.fov;

        // 计算视图矩阵和投影矩阵
        const viewMatrix = Mat4.lookAt(camera.position, camera.target, camera.up);
        const projectionMatrix = Mat4.perspective(fov, aspect, 0.1, 1000.0);

        // 将世界坐标转换为齐次坐标（Vec3转4D向量）
        const worldVec4 = [worldPos.x, worldPos.y, worldPos.z, 1.0];

        // 应用视图矩阵
        const viewVec4 = [
            viewMatrix[0] * worldVec4[0] + viewMatrix[4] * worldVec4[1] + viewMatrix[8] * worldVec4[2] + viewMatrix[12] * worldVec4[3],
            viewMatrix[1] * worldVec4[0] + viewMatrix[5] * worldVec4[1] + viewMatrix[9] * worldVec4[2] + viewMatrix[13] * worldVec4[3],
            viewMatrix[2] * worldVec4[0] + viewMatrix[6] * worldVec4[1] + viewMatrix[10] * worldVec4[2] + viewMatrix[14] * worldVec4[3],
            viewMatrix[3] * worldVec4[0] + viewMatrix[7] * worldVec4[1] + viewMatrix[11] * worldVec4[2] + viewMatrix[15] * worldVec4[3]
        ];

        // 应用投影矩阵
        const clipVec4 = [
            projectionMatrix[0] * viewVec4[0] + projectionMatrix[4] * viewVec4[1] + projectionMatrix[8] * viewVec4[2] + projectionMatrix[12] * viewVec4[3],
            projectionMatrix[1] * viewVec4[0] + projectionMatrix[5] * viewVec4[1] + projectionMatrix[9] * viewVec4[2] + projectionMatrix[13] * viewVec4[3],
            projectionMatrix[2] * viewVec4[0] + projectionMatrix[6] * viewVec4[1] + projectionMatrix[10] * viewVec4[2] + projectionMatrix[14] * viewVec4[3],
            projectionMatrix[3] * viewVec4[0] + projectionMatrix[7] * viewVec4[1] + projectionMatrix[11] * viewVec4[2] + projectionMatrix[15] * viewVec4[3]
        ];

        // 透视除法
        if (Math.abs(clipVec4[3]) < 0.0001) {
            return { x: -1, y: -1, depth: 0 }; // 点在相机后方
        }

        const ndcX = clipVec4[0] / clipVec4[3];
        const ndcY = clipVec4[1] / clipVec4[3];

        // 转换为屏幕坐标
        const screenX = (ndcX + 1) * 0.5 * canvas.width;
        const screenY = (1 - ndcY) * 0.5 * canvas.height;

        return { x: screenX, y: screenY, depth: clipVec4[2] / clipVec4[3] };
    }

    /**
     * 获取鼠标下的控制点索引或箭头（使用屏幕空间距离）
     */
    getPointUnderMouse(x, y) {
        if (!this.spline || this.spline.pointCount === 0) {
            return null;
        }

        const screenThreshold = 30.0; // 屏幕空间选择阈值（像素）- 增大以便更容易选中
        const arrowScreenThreshold = 20.0; // 箭头屏幕空间选择阈值（像素）
        let closestHit = null;
        let closestDistance = screenThreshold;

        // 如果已选中控制点，先检查箭头
        if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount) {
            const selectedPoint = this.spline.getControlPoint(this.selectedPointIndex);
            if (selectedPoint && selectedPoint.position) {
                const pos = selectedPoint.position;
                const arrowLength = 2.0;

                // 将箭头端点转换为屏幕坐标
                const posScreen = this.worldToScreen(pos);
                const xArrowEnd = new Vec3(pos.x + arrowLength, pos.y, pos.z);
                const xArrowEndScreen = this.worldToScreen(xArrowEnd);
                const yArrowEnd = new Vec3(pos.x, pos.y + arrowLength, pos.z);
                const yArrowEndScreen = this.worldToScreen(yArrowEnd);
                const zArrowEnd = new Vec3(pos.x, pos.y, pos.z + arrowLength);
                const zArrowEndScreen = this.worldToScreen(zArrowEnd);

                // 检查X轴箭头（使用屏幕空间距离）
                if (posScreen.x >= 0 && xArrowEndScreen.x >= 0) {
                    const xDist = this.pointToLineSegmentDistance(x, y, posScreen.x, posScreen.y, xArrowEndScreen.x, xArrowEndScreen.y);
                    if (xDist < arrowScreenThreshold && xDist < closestDistance) {
                        closestDistance = xDist;
                        closestHit = { index: this.selectedPointIndex, type: 'arrow', axis: 0 }; // X轴
                    }
                }

                // 检查Y轴箭头
                if (posScreen.x >= 0 && yArrowEndScreen.x >= 0) {
                    const yDist = this.pointToLineSegmentDistance(x, y, posScreen.x, posScreen.y, yArrowEndScreen.x, yArrowEndScreen.y);
                    if (yDist < arrowScreenThreshold && yDist < closestDistance) {
                        closestDistance = yDist;
                        closestHit = { index: this.selectedPointIndex, type: 'arrow', axis: 1 }; // Y轴
                    }
                }

                // 检查Z轴箭头
                if (posScreen.x >= 0 && zArrowEndScreen.x >= 0) {
                    const zDist = this.pointToLineSegmentDistance(x, y, posScreen.x, posScreen.y, zArrowEndScreen.x, zArrowEndScreen.y);
                    if (zDist < arrowScreenThreshold && zDist < closestDistance) {
                        closestDistance = zDist;
                        closestHit = { index: this.selectedPointIndex, type: 'arrow', axis: 2 }; // Z轴
                    }
                }
            }
        }

        for (let i = 0; i < this.spline.pointCount; i++) {
            // 跳过站台控制点，站台控制点是固定的，不能被选中
            if (i === this.platformStartIndex || i === this.platformEndIndex) {
                continue;
            }

            const point = this.spline.getControlPoint(i);
            if (!point || !point.position) {
                continue;
            }

            // 将控制点位置转换为屏幕坐标
            const screenPos = this.worldToScreen(point.position);
            if (screenPos.x < 0) continue; // 点在相机后方，跳过

            const pointDist = Math.sqrt((x - screenPos.x) ** 2 + (y - screenPos.y) ** 2);

            // 检查控制点（使用屏幕空间距离）
            if (pointDist < closestDistance) {
                closestDistance = pointDist;
                closestHit = { index: i, type: 'point' };
            }

            // 只检查选中控制点的切线控制点（优先级高于控制点本身）
            if (i === this.selectedPointIndex) {
                // 检查左侧切线
                if (point.leftTangent && point.leftTangent.length() > 0.01) {
                    const leftControl = point.getLeftControlPoint();
                    if (leftControl) {
                        const leftScreenPos = this.worldToScreen(leftControl);
                        if (leftScreenPos.x >= 0) {
                            const leftDist = Math.sqrt((x - leftScreenPos.x) ** 2 + (y - leftScreenPos.y) ** 2);
                            const arrowScreenThreshold = 20.0; // 切线控制点选择阈值
                            if (leftDist < arrowScreenThreshold && leftDist < closestDistance) {
                                closestDistance = leftDist;
                                closestHit = { index: i, type: 'leftTangent' };
                            }
                        }
                    }
                }

                // 检查右侧切线
                if (point.rightTangent && point.rightTangent.length() > 0.01) {
                    const rightControl = point.getRightControlPoint();
                    if (rightControl) {
                        const rightScreenPos = this.worldToScreen(rightControl);
                        if (rightScreenPos.x >= 0) {
                            const rightDist = Math.sqrt((x - rightScreenPos.x) ** 2 + (y - rightScreenPos.y) ** 2);
                            const arrowScreenThreshold = 20.0; // 切线控制点选择阈值
                            if (rightDist < arrowScreenThreshold && rightDist < closestDistance) {
                                closestDistance = rightDist;
                                closestHit = { index: i, type: 'rightTangent' };
                            }
                        }
                    }
                }
            }
        }

        return closestHit;
    }

    /**
     * 计算射线到线段的最近距离
     */
    rayToLineSegmentDistance(ray, lineStart, lineEnd) {
        const lineDir = lineEnd.subtract(lineStart);
        const lineLength = lineDir.length();
        if (lineLength < 0.0001) {
            return this.rayToPointDistance(ray, lineStart);
        }

        const normalizedLineDir = lineDir.multiplyScalar(1.0 / lineLength);
        const toStart = lineStart.subtract(ray.origin);
        const toEnd = lineEnd.subtract(ray.origin);

        // 计算射线方向与线段方向的叉积
        const cross = ray.direction.cross(normalizedLineDir);
        const crossLength = cross.length();

        if (crossLength < 0.0001) {
            // 射线与线段平行，返回到起点的距离
            return this.rayToPointDistance(ray, lineStart);
        }

        // 计算从射线起点到线段的距离
        const toStartProjection = toStart.dot(ray.direction);
        const toEndProjection = toEnd.dot(ray.direction);

        // 找到线段上最近的点
        let closestPointOnLine;
        if (toStartProjection < 0 && toEndProjection < 0) {
            closestPointOnLine = lineStart;
        } else if (toStartProjection > 0 && toEndProjection > 0) {
            closestPointOnLine = lineEnd;
        } else {
            // 计算射线与线段的最近点
            const t = toStart.dot(normalizedLineDir) / normalizedLineDir.length();
            const clampedT = Math.max(0, Math.min(1, t));
            closestPointOnLine = lineStart.add(normalizedLineDir.multiplyScalar(clampedT * lineLength));
        }

        return this.rayToPointDistance(ray, closestPointOnLine);
    }

    /**
     * 计算点到线段的距离（屏幕空间）
     */
    pointToLineSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length2 = dx * dx + dy * dy;

        if (length2 < 0.0001) {
            // 线段退化为点
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }

        // 计算投影参数t
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2));

        // 计算线段上最近的点
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        // 返回点到最近点的距离
        return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 只处理左键（移动端通过触摸事件处理）
        if (e.button === 0) {
            // 只在编辑模式下检测控制点点击
            let hit = null;
            if (this.isEditMode) {
                hit = this.getPointUnderMouse(x, y);
            }
            if (hit) {
                if (hit.type === 'arrow') {
                    // 点击到箭头，准备沿轴拖动
                    this.selectedPointIndex = hit.index;
                    this.selectedAxis = hit.axis;
                    this.selectedTangentIndex = -1;
                    this.isDragging = true;
                    this.isRotating = false;
                    this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                    const point = this.spline.getControlPoint(hit.index);
                    this.dragStartPos = point.position.copy();
                    if (point && point.position) {
                        this.rotationCenter = point.position.copy ? point.position.copy() : new Vec3(point.position.x, point.position.y, point.position.z);
                    }
                    this.didModifyControlPoint = false;
                } else {
                    // 点击到控制点，准备拖动控制点
                    this.selectedPointIndex = hit.index;
                    this.selectedAxis = -1;
                    if (hit.type === 'leftTangent') {
                        this.selectedTangentIndex = 0;
                    } else if (hit.type === 'rightTangent') {
                        this.selectedTangentIndex = 1;
                    } else {
                        this.selectedTangentIndex = -1;
                    }
                    // 如果选中了切线，立即开始拖动
                    if (this.selectedTangentIndex >= 0) {
                        this.isDragging = true;
                    } else {
                        this.isDragging = false; // 先设为false，只有真正拖动时才设为true
                    }
                    this.isRotating = false; // 确保不旋转
                    this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                    const point = this.spline.getControlPoint(hit.index);
                    if (this.selectedTangentIndex === -1) {
                        this.dragStartPos = point.position.copy();
                    } else if (this.selectedTangentIndex === 0) {
                        this.dragStartPos = point.getLeftControlPoint().copy();
                    } else {
                        this.dragStartPos = point.getRightControlPoint().copy();
                    }
                    if (point && point.position) {
                        this.rotationCenter = point.position.copy ? point.position.copy() : new Vec3(point.position.x, point.position.y, point.position.z);
                    }
                    this.didModifyControlPoint = false;
                    // 更新UI（显示控制点操作面板）
                    if (window.updateControlPointUI) {
                        window.updateControlPointUI();
                    }
                    if (window.updateTangentUI) {
                        window.updateTangentUI();
                    }
                    if (window.updateLiftStatus) {
                        window.updateLiftStatus();
                    }
                    if (window.updateElectromagneticStatus) {
                        window.updateElectromagneticStatus();
                    }
                }
                // 仅更新预览以反映选中状态，无需重新生成整条轨道
                this.updateCurvePreview();
                // 触发UI更新
                if (window.updateControlPointUI) {
                    window.updateControlPointUI();
                }
                if (window.updateTangentUI) {
                    window.updateTangentUI();
                }
                if (window.updateLiftStatus) {
                    window.updateLiftStatus();
                } else {
                    // 如果函数不存在，延迟调用
                    setTimeout(() => {
                        if (window.updateLiftStatus) {
                            window.updateLiftStatus();
                        }
                    }, 100);
                }
                if (window.updateElectromagneticStatus) {
                    window.updateElectromagneticStatus();
                }
                // 更新添加按钮状态
                this.updateAddButtonState();
            } else {
                // 没有选中控制点，左键按下时准备旋转相机
                // 但如果已经选中了控制点，应该围绕该控制点旋转（不清除选中状态）
                this.isRotating = true;
                this.isDragging = false; // 确保不拖动
                // 不清除选中状态，这样旋转时会围绕选中的控制点
                this.selectedTangentIndex = -1;
                this.selectedAxis = -1;
                this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                this.rotationStartMousePos = { x: e.clientX, y: e.clientY }; // 保存旋转起始位置
                if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount) {
                    const selectedPoint = this.spline.getControlPoint(this.selectedPointIndex);
                    if (selectedPoint && selectedPoint.position) {
                        this.rotationCenter = selectedPoint.position.copy ? selectedPoint.position.copy() : new Vec3(selectedPoint.position.x, selectedPoint.position.y, selectedPoint.position.z);
                    } else {
                        this.rotationCenter = this.getCurveCenter();
                    }
                } else {
                    this.rotationCenter = this.getCurveCenter();
                }
                this.didModifyControlPoint = false;
            }
        }

        e.preventDefault();
    }

    onMouseMove(e) {
        // 只有在按下鼠标并拖动时才执行操作
        if (!this.isDragging && !this.isRotating) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 如果正在旋转，优先处理旋转（不拖动控制点）
        if (this.isRotating && !this.isDragging) {
            // 旋转相机（只有在没有拖动控制点时才旋转）
            // 使用旋转起始位置计算增量，避免累积误差
            const startPos = this.rotationStartMousePos || this.dragStartMousePos;
            const deltaX = (e.clientX - startPos.x) * 0.01;
            const deltaY = (e.clientY - startPos.y) * 0.01;

            const rotateCenter = this.rotationCenter || this.getCurveCenter();

            if (rotateCenter) {
                // deltaY 对应垂直旋转，保持向上拖动镜头抬起
                this.rotateCameraAroundPoint(rotateCenter, deltaX, -deltaY);
                // 更新旋转起始位置，用于下次计算
                if (!this.rotationStartMousePos) {
                    this.rotationStartMousePos = { x: e.clientX, y: e.clientY };
                } else {
                    this.rotationStartMousePos.x = e.clientX;
                    this.rotationStartMousePos.y = e.clientY;
                }
            }
            return; // 旋转时不再处理拖动
        }

        // 拖动控制点（只有在没有旋转时才处理）
        // 检查是否真的在拖动（鼠标移动了足够距离）
        const mouseMoved = this.dragStartMousePos &&
            (Math.abs(e.clientX - this.dragStartMousePos.x) > 2 ||
                Math.abs(e.clientY - this.dragStartMousePos.y) > 2);

        // 如果选中了切线，即使移动距离小也要开始拖动（只在编辑模式下）
        if (this.isEditMode) {
            if (this.selectedTangentIndex >= 0 && this.selectedPointIndex >= 0) {
                if (!this.isDragging) {
                    this.isDragging = true;
                }
            } else if (mouseMoved && this.selectedPointIndex >= 0) {
                if (!this.isDragging) {
                    this.isDragging = true; // 现在才开始拖动
                }
            }
        }

        if (this.isDragging && this.selectedPointIndex >= 0 && this.isEditMode) {
            const point = this.spline.getControlPoint(this.selectedPointIndex);
            const camera = this.renderer.camera;

            // 计算移动平面（垂直于相机视线）
            const forward = camera.target.subtract(camera.position).normalize();
            const planeNormal = forward;

            // 获取鼠标移动的偏移量（反转Y轴，因为屏幕Y轴向下，世界Y轴向上）
            // 注意：deltaX 和 deltaY 是屏幕空间的移动，需要转换为世界空间
            const deltaX = (e.clientX - this.dragStartMousePos.x) * 0.01;
            const deltaY = -(e.clientY - this.dragStartMousePos.y) * 0.01; // Y轴反转

            // 计算相机的右向量和上向量（用于将屏幕移动转换为世界移动）
            const right = camera.up.cross(forward).normalize();
            const up = forward.cross(right).normalize();

            // 计算移动方向（在相机平面上）
            // 鼠标向右移动 -> deltaX > 0 -> 世界空间向右移动
            // 鼠标向上移动 -> deltaY > 0 (因为已经反转) -> 世界空间向上移动
            // moveDir 是世界空间中鼠标移动的方向
            // 注意：moveDir 的方向应该与鼠标移动方向一致
            const moveDir = right.multiplyScalar(deltaX).add(up.multiplyScalar(deltaY));

            // 计算新的位置
            let newPos;

            if (this.selectedAxis >= 0) {
                // 沿轴拖动
                // 根据选中的轴，确定世界空间中的轴方向
                let axisDir;
                if (this.selectedAxis === 0) {
                    axisDir = new Vec3(1, 0, 0); // X轴
                } else if (this.selectedAxis === 1) {
                    axisDir = new Vec3(0, 1, 0); // Y轴
                } else {
                    axisDir = new Vec3(0, 0, 1); // Z轴
                }

                // 计算屏幕移动方向（相机空间的右和上向量）
                // deltaX和deltaY是屏幕空间的像素移动，需要转换为世界空间移动
                const screenMoveRight = right.multiplyScalar(deltaX);
                const screenMoveUp = up.multiplyScalar(deltaY);
                const screenMove = screenMoveRight.add(screenMoveUp);

                // 将屏幕移动投影到选中的轴上
                // 计算屏幕移动在轴方向上的投影长度（点积）
                const moveAmount = screenMove.dot(axisDir);

                // 沿轴移动（使用更大的移动系数，使拖动更灵敏）
                const moveVector = axisDir.multiplyScalar(moveAmount * 1.5);
                newPos = this.dragStartPos.add(moveVector);
                // 拖动控制点时，不保持C2连续性（避免卡顿），只在松开时再计算
                this.spline.setPointPosition(this.selectedPointIndex, newPos, false);
                // 标记缓存为脏，确保预览会重新计算
                if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
                    this.spline.markCachedPointsDirty();
                }
                this.didModifyControlPoint = true;

                // 如果是站台点，确保切线水平
                if (point.isPlatformSection) {
                    this.spline.ensurePlatformTangent(this.selectedPointIndex);
                }
                // 拖动时更新曲线预览，但不生成轨道网格（避免卡顿）
                this.requestCurvePreviewUpdate();
            } else if (this.selectedTangentIndex === -1) {
                // 移动控制点（自由拖动）
                newPos = this.dragStartPos.add(moveDir);
                // 检查是否是站台控制点，站台控制点不能被拖动
                if (this.selectedPointIndex === this.platformStartIndex ||
                    this.selectedPointIndex === this.platformEndIndex) {
                    // 站台控制点是固定的，不允许拖动
                    return;
                }

                // 拖动控制点时，不保持C2连续性（避免卡顿），只在松开时再计算
                this.spline.setPointPosition(this.selectedPointIndex, newPos, false);
                // 标记缓存为脏，确保预览会重新计算
                if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
                    this.spline.markCachedPointsDirty();
                }
                this.didModifyControlPoint = true;

                // 更新站台控制点（如果拖动的是站台相邻点）
                if (this.selectedPointIndex === this.platformEndIndex + 1) {
                    // 拖动站台头后的第一个点，更新站台
                    this.updatePlatformPoints();
                } else {
                    // 检查是否是站台点的相邻点
                    const prevIndex = this.selectedPointIndex > 0 ? this.selectedPointIndex - 1 :
                        (this.spline.closed ? this.spline.pointCount - 1 : -1);
                    const nextIndex = this.selectedPointIndex < this.spline.pointCount - 1 ? this.selectedPointIndex + 1 :
                        (this.spline.closed ? 0 : -1);

                    if (prevIndex >= 0) {
                        const prevPoint = this.spline.getControlPoint(prevIndex);
                        if (prevPoint && prevPoint.isPlatformSection) {
                            this.spline.ensurePlatformTangent(prevIndex);
                        }
                    }
                    if (nextIndex >= 0) {
                        const nextPoint = this.spline.getControlPoint(nextIndex);
                        if (nextPoint && nextPoint.isPlatformSection) {
                            this.spline.ensurePlatformTangent(nextIndex);
                        }
                    }
                }
                // 拖动时更新曲线预览，但不生成轨道网格（避免卡顿）
                this.requestCurvePreviewUpdate();
            } else if (this.selectedTangentIndex === 0) {
                // 移动左侧切线（调整方向和长度）
                // newPos 是拖动后的新位置（左侧切线控制点的世界坐标）
                // 注意：moveDir 是鼠标移动的方向，所以 newPos 应该跟随鼠标移动
                newPos = this.dragStartPos.add(moveDir);

                // 计算从控制点位置到新拖动位置的方向向量
                // getLeftControlPoint() = position + leftTangent
                // 所以 leftTangent = 左侧控制点世界坐标 - position
                // 拖动时，newPos 是左侧控制点的新位置
                // 因此 leftTangent = newPos - position（直接等于 toNewPos）
                const toNewPos = newPos.subtract(point.position);
                const leftLength = toNewPos.length();

                if (leftLength > 0.01) {
                    // 归一化方向（从 position 指向 newPos，这是左侧控制点的方向）
                    const direction = toNewPos.normalize();
                    const rightLength = point.rightTangent.length(); // 保持右侧长度

                    // 左侧切线：直接存储从 position 指向左侧控制点的向量
                    // getLeftControlPoint() = position + leftTangent，所以 leftTangent = toNewPos
                    point.leftTangent = toNewPos.copy();

                    // 保持右侧切线长度，调整方向使其与左侧共线但方向相反
                    // 右侧切线应该指向与左侧相反的方向（正方向）
                    // 这样已经保证了当前点的左右切线共线（C2连续性的必要条件），无需重新计算
                    if (rightLength > 0.01) {
                        point.rightTangent = direction.multiplyScalar(rightLength);
                    } else {
                        point.rightTangent = direction.multiplyScalar(leftLength);
                    }

                    // 如果是站台点，确保切线水平
                    if (point.isPlatformSection) {
                        this.spline.ensurePlatformTangent(this.selectedPointIndex);
                    }

                    // 检查下一个点是否是站台点，如果是，则更新站台点
                    const nextIndex = this.selectedPointIndex < this.spline.pointCount - 1 ?
                        this.selectedPointIndex + 1 :
                        (this.spline.closed ? 0 : -1);
                    if (nextIndex >= 0) {
                        const nextPoint = this.spline.getControlPoint(nextIndex);
                        if (nextPoint && nextPoint.isPlatformSection) {
                            this.spline.ensurePlatformTangent(nextIndex);
                        }
                    }
                }
                // 切线改变，标记样条缓存为脏
                if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
                    this.spline.markCachedPointsDirty();
                }
                this.didModifyControlPoint = true;
                // 拖动时更新曲线预览，但不生成轨道网格（避免卡顿）
                this.requestCurvePreviewUpdate();
            } else if (this.selectedTangentIndex === 1) {
                // 移动右侧切线（调整方向和长度）
                // newPos 是拖动后的新位置（右侧切线控制点的世界坐标）
                // 注意：moveDir 是鼠标移动的方向，所以 newPos 应该跟随鼠标移动
                newPos = this.dragStartPos.add(moveDir);

                // 计算从控制点位置到新拖动位置的方向向量
                // getRightControlPoint() = position + rightTangent
                // 所以 rightTangent = 右侧控制点世界坐标 - position
                // 拖动时，newPos 是右侧控制点的新位置
                // 因此 rightTangent = newPos - position（直接等于 toNewPos）
                const toNewPos = newPos.subtract(point.position);
                const rightLength = toNewPos.length();

                if (rightLength > 0.01) {
                    // 归一化方向（从 position 指向 newPos，这是右侧控制点的方向）
                    const direction = toNewPos.normalize();
                    const leftLength = point.leftTangent.length(); // 保持左侧长度

                    // 右侧切线：直接存储从 position 指向右侧控制点的向量
                    // getRightControlPoint() = position + rightTangent，所以 rightTangent = toNewPos
                    point.rightTangent = toNewPos.copy();

                    // 保持左侧切线长度，调整方向使其与右侧共线但方向相反
                    // 左侧切线应该指向与右侧相反的方向（负方向）
                    // 这样已经保证了当前点的左右切线共线（C2连续性的必要条件），无需重新计算
                    if (leftLength > 0.01) {
                        point.leftTangent = direction.multiplyScalar(-leftLength);
                    } else {
                        point.leftTangent = direction.multiplyScalar(-rightLength);
                    }

                    // 如果是站台点，确保切线水平
                    if (point.isPlatformSection) {
                        this.spline.ensurePlatformTangent(this.selectedPointIndex);
                    }

                    // 检查下一个点是否是站台点，如果是，则更新站台点
                    const nextIndex = this.selectedPointIndex < this.spline.pointCount - 1 ?
                        this.selectedPointIndex + 1 :
                        (this.spline.closed ? 0 : -1);
                    if (nextIndex >= 0) {
                        const nextPoint = this.spline.getControlPoint(nextIndex);
                        if (nextPoint && nextPoint.isPlatformSection) {
                            this.spline.ensurePlatformTangent(nextIndex);
                        }
                    }
                }
                // 切线改变，标记样条缓存为脏
                if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
                    this.spline.markCachedPointsDirty();
                }
                this.didModifyControlPoint = true;
                // 拖动时更新曲线预览，但不生成轨道网格（避免卡顿）
                this.requestCurvePreviewUpdate();
            }
            // 更新切线长度UI
            if (window.updateTangentUI) {
                window.updateTangentUI();
            }
        }

        // 如果正在拖动控制点，同时更新相机旋转中心（但不旋转，只是更新目标）
        // 这样在拖动结束后，相机可以围绕新的位置旋转
        if (this.isDragging && this.selectedPointIndex >= 0) {
            const point = this.spline.getControlPoint(this.selectedPointIndex);
            if (point && point.position) {
                // 更新相机目标为当前控制点位置，但不改变相机位置
                // 这样下次旋转时会围绕新的位置
                // 注意：这里不改变相机位置，只是为下次旋转做准备
            }
        }
    }

    /**
     * 获取曲线的中心点
     */
    getCurveCenter() {
        if (!this.spline || this.spline.pointCount === 0) {
            return new Vec3(0, 0, 0);
        }

        let sum = new Vec3(0, 0, 0);
        let count = 0;
        for (let i = 0; i < this.spline.pointCount; i++) {
            const point = this.spline.getControlPoint(i);
            if (point && point.position) {
                sum = sum.add(point.position);
                count++;
            }
        }

        if (count === 0) {
            return new Vec3(0, 0, 0);
        }

        return sum.multiplyScalar(1.0 / count);
    }

    /**
     * 绕指定点旋转相机
     */
    rotateCameraAroundPoint(center, deltaX, deltaY) {
        if (!center) {
            center = new Vec3(0, 0, 0);
        }

        const camera = this.renderer.camera;
        if (!camera || !camera.position) {
            return;
        }

        // 更新旋转角度
        this.cameraRotation.yaw += deltaX;
        this.cameraRotation.pitch += deltaY;

        // 限制垂直旋转角度
        this.cameraRotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraRotation.pitch));

        // 计算相机到中心的距离
        const toCamera = camera.position.subtract(center);
        const distance = toCamera.length();

        if (distance < 0.001) {
            // 距离太近，使用默认距离
            const defaultDistance = 20;
            camera.position = center.add(new Vec3(0, 0, defaultDistance));
            return;
        }

        // 计算新的相机位置（球坐标系）
        const x = distance * Math.cos(this.cameraRotation.pitch) * Math.cos(this.cameraRotation.yaw);
        const y = distance * Math.sin(this.cameraRotation.pitch);
        const z = distance * Math.cos(this.cameraRotation.pitch) * Math.sin(this.cameraRotation.yaw);

        camera.position = center.add(new Vec3(x, y, z));
        camera.target = center.copy ? center.copy() : new Vec3(center.x, center.y, center.z);
    }

    onMouseUp(e) {
        if (!e.button || e.button === 0) {
            // 左键释放（触摸事件可能没有button属性）

            if (this.isDragging && this.selectedPointIndex >= 0 && this.isEditMode) {
                // 更新拖拽起始位置
                const point = this.spline.getControlPoint(this.selectedPointIndex);
                if (this.selectedTangentIndex === -1) {
                    this.dragStartPos = point.position.copy();
                } else if (this.selectedTangentIndex === 0) {
                    this.dragStartPos = point.getLeftControlPoint().copy();
                } else {
                    this.dragStartPos = point.getRightControlPoint().copy();
                }
            }
            const shouldUpdateTrack = this.didModifyControlPoint;
            this.isDragging = false;
            this.isRotating = false;
            this.rotationStartMousePos = null; // 清除旋转起始位置
            this.rotationCenter = null;

            // 拖动结束后，更新轨道（不需要重新计算C2连续性，因为拖动时已经保证了当前点的左右切线共线）
            if (shouldUpdateTrack && this.selectedPointIndex >= 0) {
                // 在编辑模式下，拖动控制点后不立即生成网格，延迟生成以避免卡顿
                if (this.isEditMode) {
                    // 清除之前的定时器
                    if (this.dragUpdateTimer) {
                        clearTimeout(this.dragUpdateTimer);
                        this.dragUpdateTimer = null;
                    }
                    // 延迟500ms后生成网格，如果在这期间又有拖动操作，会重置延迟
                    this.trackUpdatePending = true;
                    this.dragUpdateTimer = setTimeout(() => {
                        if (this.trackUpdatePending) {
                            this.updateTrack();
                            this.trackUpdatePending = false;
                        }
                        this.dragUpdateTimer = null;
                    }, 500);
                } else {
                    // 非编辑模式（游戏模式）下，立即更新轨道
                    if (this.dragUpdateTimer) {
                        clearTimeout(this.dragUpdateTimer);
                        this.dragUpdateTimer = null;
                    }
                    this.updateTrack();
                    this.trackUpdatePending = false;
                }
            }
            // 旋转相机不需要更新轨道，因为轨道形状没有改变
            this.didModifyControlPoint = false;
        }
    }

    onWheel(e) {
        e.preventDefault();
        const camera = this.renderer.camera;
        const forward = camera.target.subtract(camera.position).normalize();
        const delta = e.deltaY * 0.01;
        camera.position = camera.position.add(forward.multiplyScalar(delta));
    }

    onKeyDown(e) {
        const isEditableElement = (el) => {
            if (!el) return false;
            const tag = el.tagName;
            return (
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                el.isContentEditable
            );
        };

        if (isEditableElement(document.activeElement) || isEditableElement(e.target)) {
            return;
        }

        // 调整切线长度
        if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount) {
            const point = this.spline.getControlPoint(this.selectedPointIndex);
            if (point) {
                let changed = false;

                // [ / ] 调整左侧切线长度
                if (e.key === '[' || e.key === '{') {
                    e.preventDefault();
                    const currentLength = point.leftTangent.length();
                    const newLength = Math.max(0, currentLength - 0.5);
                    this.spline.setLeftTangentLength(this.selectedPointIndex, newLength);
                    // 不再调用 ensureC2Continuity，因为 setLeftTangentLength 已经处理了
                    changed = true;
                } else if (e.key === ']' || e.key === '}') {
                    e.preventDefault();
                    const currentLength = point.leftTangent.length();
                    const newLength = currentLength + 0.5;
                    this.spline.setLeftTangentLength(this.selectedPointIndex, newLength);
                    // 不再调用 ensureC2Continuity，因为 setLeftTangentLength 已经处理了
                    changed = true;
                }

                // - / = 调整右侧切线长度
                if (e.key === '-' || e.key === '_') {
                    e.preventDefault();
                    const currentLength = point.rightTangent.length();
                    const newLength = Math.max(0, currentLength - 0.5);
                    this.spline.setRightTangentLength(this.selectedPointIndex, newLength);
                    // 不再调用 ensureC2Continuity，因为 setRightTangentLength 已经处理了
                    changed = true;
                } else if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    const currentLength = point.rightTangent.length();
                    const newLength = currentLength + 0.5;
                    this.spline.setRightTangentLength(this.selectedPointIndex, newLength);
                    // 不再调用 ensureC2Continuity，因为 setRightTangentLength 已经处理了
                    changed = true;
                }

                if (changed) {
                    this.updateTrack();
                    // 触发UI更新事件
                    if (window.updateTangentUI) {
                        window.updateTangentUI();
                    }
                    return;
                }
            }
        }

        if (e.key === 'l' || e.key === 'L') {
            // 切换牵引区域
            e.preventDefault();
            if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount) {
                const point = this.spline.getControlPoint(this.selectedPointIndex);
                if (point) {
                    // 如果切换到牵引区域，先清除其他区域
                    if (!point.isLiftSection) {
                        point.isPlatformSection = false;
                        point.isElectromagneticBoost = false;
                        point.isElectromagneticBrake = false;
                    }
                    point.isLiftSection = !point.isLiftSection;
                    this.updateTrack();
                    // 触发UI更新
                    if (window.updateLiftStatus) {
                        window.updateLiftStatus();
                    }
                    if (window.updatePlatformStatus) {
                        window.updatePlatformStatus();
                    }
                }
            }
            return;
        }

        // 站台区域已固定，不再需要手动设置（P键功能已移除）

        // 站台区域已固定，不再需要手动设置（P键功能已移除）

        if (e.key === 'a' || e.key === 'A') {
            // 添加新点
            e.preventDefault();
            let newPos;
            let insertIndex = -1;

            if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount) {
                // 在选中点和前一个点之间插入
                const selectedPoint = this.spline.getControlPoint(this.selectedPointIndex);
                if (selectedPoint && selectedPoint.position) {
                    if (this.selectedPointIndex > 0) {
                        // 有前一个点，在中间插入
                        const prevPoint = this.spline.getControlPoint(this.selectedPointIndex - 1);
                        if (prevPoint && prevPoint.position) {
                            newPos = selectedPoint.position.add(prevPoint.position).multiplyScalar(0.5);
                            insertIndex = this.selectedPointIndex;
                        } else {
                            newPos = selectedPoint.position.add(new Vec3(5, 0, 0));
                        }
                    } else {
                        // 第一个点，在它前面插入（对于闭合曲线，在最后一个点和第一个点之间）
                        if (this.spline.closed && this.spline.pointCount > 0) {
                            const lastPoint = this.spline.getControlPoint(this.spline.pointCount - 1);
                            if (lastPoint && lastPoint.position) {
                                newPos = selectedPoint.position.add(lastPoint.position).multiplyScalar(0.5);
                                insertIndex = 0;
                            } else {
                                newPos = selectedPoint.position.add(new Vec3(5, 0, 0));
                            }
                        } else {
                            newPos = selectedPoint.position.add(new Vec3(5, 0, 0));
                        }
                    }
                } else {
                    newPos = new Vec3(0, 0, 0);
                }
            } else {
                // 没有选中点，在最后一个点后添加
                if (this.spline.pointCount > 0) {
                    const lastPoint = this.spline.getControlPoint(this.spline.pointCount - 1);
                    if (lastPoint && lastPoint.position) {
                        newPos = lastPoint.position.add(new Vec3(5, 0, 0));
                    } else {
                        newPos = new Vec3(0, 0, 0);
                    }
                } else {
                    newPos = new Vec3(0, 0, 0);
                }
            }

            if (insertIndex >= 0) {
                // 插入点
                this.spline.points.splice(insertIndex, 0, new BezierPoint(newPos));
                this.spline.ensureC2Continuity(insertIndex);
                this.selectedPointIndex = insertIndex;
            } else {
                // 添加点
                this.spline.addPoint(newPos);
                this.selectedPointIndex = this.spline.pointCount - 1;
            }

            this.selectedTangentIndex = -1;
            this.selectedAxis = -1;
            this.updateTrack();
            // 触发UI更新
            if (window.updateTangentUI) {
                window.updateTangentUI();
            }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            // 删除点
            e.preventDefault();
            if (this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount && this.spline.pointCount > 2) {
                this.spline.removePoint(this.selectedPointIndex);
                this.selectedPointIndex = Math.max(0, Math.min(this.selectedPointIndex, this.spline.pointCount - 1));
                this.selectedTangentIndex = -1;
                this.updateTrack();
                // 触发UI更新
                if (window.updateTangentUI) {
                    window.updateTangentUI();
                }
            }
        }
    }

    onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            // 单指触摸：选择/拖动控制点或旋转相机（只在编辑模式下检测控制点）
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            let hit = null;
            if (this.isEditMode) {
                hit = this.getPointUnderMouse(x, y);
            }
            if (hit) {
                // 点击到控制点或切线
                this.onMouseDown({
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0
                });
            } else {
                // 点击空白处：准备旋转相机
                this.isRotating = true;
                this.isDragging = false;
                this.selectedTangentIndex = -1;
                this.selectedAxis = -1;
                this.dragStartMousePos = { x: touch.clientX, y: touch.clientY };
            }
        } else if (e.touches.length === 2) {
            // 双指触摸：准备缩放
            this.isZooming = true;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
            this.initialCameraDistance = this.renderer.camera.position.distance(this.renderer.camera.target);
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && (this.isDragging || this.isRotating)) {
            // 单指拖动
            const touch = e.touches[0];
            this.onMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0,
                buttons: 1
            });
        } else if (e.touches.length === 2 && this.isZooming) {
            // 双指缩放
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const scale = currentDistance / this.initialPinchDistance;
            const newDistance = this.initialCameraDistance / scale;

            const camera = this.renderer.camera;
            const direction = camera.position.subtract(camera.target).normalize();
            camera.position = camera.target.add(direction.multiplyScalar(newDistance));
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) {
            // 所有手指抬起
            this.isZooming = false;
            this.onMouseUp({});
        } else if (e.touches.length === 1) {
            // 从双指变为单指，重置状态
            this.isZooming = false;
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            let hit = null;
            if (this.isEditMode) {
                hit = this.getPointUnderMouse(x, y);
            }
            if (hit) {
                this.onMouseDown({
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0
                });
            } else {
                this.isRotating = true;
                this.isDragging = false;
                this.dragStartMousePos = { x: touch.clientX, y: touch.clientY };
            }
        }
    }

    /**
     * 节流更新轨道（避免频繁重新计算）
     */
    scheduleTrackUpdate() {
        const now = performance.now();

        // 拖动时优先更新预览，并延迟重型更新
        if (this.isDragging) {
            this.requestCurvePreviewUpdate();
            this.trackUpdatePending = true;
            // 不在拖动过程中生成轨道网格，等松开后再统一计算
            return;
        }

        if (now - this.lastTrackUpdateTime < this.trackUpdateThrottle) {
            // 如果距离上次更新太近，延迟更新
            if (!this.trackUpdatePending) {
                this.trackUpdatePending = true;
                requestAnimationFrame(() => {
                    if (this.trackUpdatePending) {
                        this.updateTrack();
                        this.trackUpdatePending = false;
                        this.lastTrackUpdateTime = performance.now();
                    }
                });
            }
            return;
        }

        // 立即更新
        this.updateTrack();
        this.lastTrackUpdateTime = now;
        this.trackUpdatePending = false;
    }

    /**
     * 仅更新曲线与控制点的预览，不重新生成轨道网格
     */
    updateCurvePreview() {
        if (!this.spline) {
            return;
        }

        // 只在编辑模式下显示曲线
        if (this.isEditMode) {
            const points = this.spline.getCachedPoints();
            if (!points || points.length === 0) {
                this.renderer.setCurveLineMesh([], false);
                if (this.renderer.setCurveDangerLineMesh) {
                    this.renderer.setCurveDangerLineMesh([], false);
                }
                return;
            }

            const safePoints = [];
            const dangerPoints = [];
            const curvatureThreshold = 0.6; // 曲率阈值，超过则标红

            // 拖动时使用更少的采样点以提高性能
            const step = this.isDragging ? Math.max(1, Math.floor(points.length / 30)) : Math.max(1, Math.floor(points.length / 100));

            // 按段构建线段顶点：每一小段用两点表示（用于 LINES 绘制）
            for (let i = 0; i < points.length; i += step) {
                const point1 = points[i];
                const point2 = points[(i + step) % points.length];

                const p0 = point1.position;
                const p1 = point2.position;

                // 计算该段中点对应的曲率（使用第一个点的段索引）
                let isDanger = false;
                if (point1.segmentIndex !== undefined && this.spline.pointCount >= 2) {
                    // 使用中点位置估算曲率（简化处理）
                    // 使用中点距离估算曲率
                    const midDistance = (point1.distance + point2.distance) / 2;
                    const curvature = this.spline.getCurvatureByDistance(midDistance);
                    if (curvature > curvatureThreshold) {
                        isDanger = true;
                    }
                }

                if (isDanger) {
                    dangerPoints.push(p0, p1);
                } else {
                    safePoints.push(p0, p1);
                }
            }

            this.renderer.setCurveLineMesh(safePoints, this.isDragging);
            this.renderer.setCurveDangerLineMesh(dangerPoints, this.isDragging);
        } else {
            // 非编辑模式下清空曲线
            this.renderer.setCurveLineMesh([], false);
            if (this.renderer.setCurveDangerLineMesh) {
                this.renderer.setCurveDangerLineMesh([], false);
            }
        }

        // 拖动时只更新控制点位置，不重建整个网格
        if (this.isEditMode) {
            if (this.isDragging && this.selectedPointIndex >= 0) {
                // 拖动时只更新选中的控制点，不重建整个网格
                this.renderer.updateControlPointPosition(
                    this.selectedPointIndex,
                    this.spline.getControlPoint(this.selectedPointIndex),
                    this.selectedAxis
                );
            } else {
                // 非拖动时或没有选中点时，重建整个网格
                const controlPoints = [];
                for (let i = 0; i < this.spline.pointCount; i++) {
                    const point = this.spline.getControlPoint(i);
                    if (point) {
                        controlPoints.push(point);
                    }
                }
                this.renderer.setControlPointsMesh(controlPoints, this.selectedPointIndex, this.selectedAxis);
            }
        } else {
            this.renderer.setControlPointsMesh([], -1, -1);
            this.selectedPointIndex = -1;
            this.selectedAxis = -1;
            this.selectedTangentIndex = -1;
        }
    }

    /**
     * 请求一次预览更新（带节流）
     */
    requestCurvePreviewUpdate() {
        const now = performance.now();
        if (now - this.lastPreviewUpdateTime < this.previewUpdateThrottle) {
            if (!this.previewUpdatePending) {
                this.previewUpdatePending = true;
                requestAnimationFrame(() => {
                    this.updateCurvePreview();
                    this.previewUpdatePending = false;
                    this.lastPreviewUpdateTime = performance.now();
                });
            }
            return;
        }

        this.updateCurvePreview();
        this.lastPreviewUpdateTime = now;
    }

    /**
     * 更新轨道
     */
    updateTrack() {
        // 先更新预览（控制点与曲线，只在编辑模式下）
        if (this.isEditMode) {
            this.updateCurvePreview();

            // 编辑模式下，使用编辑轨道（spline）生成轨道网格预览
            // 这样用户可以看到轨道如何跟随曲线变化
            if (this.spline && this.spline.pointCount >= 2 && this.trackGenerator) {
                // 保存当前的 spline 引用
                const originalSpline = this.trackGenerator.spline;

                // 临时切换到编辑轨道
                this.trackGenerator.spline = this.spline;

                // 清除生成器缓存，确保使用新的 spline
                if (this.trackGenerator.clearGeneratorCache) {
                    this.trackGenerator.clearGeneratorCache();
                }

                // 生成预览轨道网格
                try {
                    const meshData = this.trackGenerator.generateTrack();
                    if (meshData) {
                        const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
                        this.renderer.setTrackMesh(currentId, meshData);

                        // 更新地面网格，根据编辑轨道位置创建凹陷
                        try {
                            const trackPoints = this.spline.getPoints ? this.spline.getPoints() : null;
                            if (trackPoints && trackPoints.points) {
                                this.renderer.initGroundMesh(trackPoints.points);
                            } else {
                                const cachedPoints = this.spline.getCachedPoints ? this.spline.getCachedPoints() : null;
                                if (cachedPoints && cachedPoints.length > 0) {
                                    this.renderer.initGroundMesh(cachedPoints);
                                } else {
                                    this.renderer.initGroundMesh(null);
                                }
                            }
                        } catch (e) {
                            console.warn('更新地面网格失败:', e);
                            this.renderer.initGroundMesh(null);
                        }
                    } else {
                        // 生成失败，清空轨道网格
                        const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
                        this.renderer.setTrackMesh(currentId, null);
                    }
                } catch (e) {
                    console.warn('生成预览轨道网格失败:', e);
                    const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
                    this.renderer.setTrackMesh(currentId, null);
                }

                // 恢复原来的 spline 引用（游戏轨道）
                this.trackGenerator.spline = originalSpline;

                // 清除生成器缓存，确保下次使用游戏轨道时重新创建
                if (this.trackGenerator.clearGeneratorCache) {
                    this.trackGenerator.clearGeneratorCache();
                }
            } else {
                // 编辑轨道点数不足，清空轨道网格
                const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
                this.renderer.setTrackMesh(currentId, null);
            }

            // 编辑模式下不更新游戏轨道，只显示预览
            return;
        }

        // 非编辑模式下，清空曲线和控制点
        this.renderer.setCurveLineMesh([], false);
        if (this.renderer.setCurveDangerLineMesh) {
            this.renderer.setCurveDangerLineMesh([], false);
        }
        this.renderer.setControlPointsMesh([], -1, -1);

        if (this.dragUpdateTimer) {
            clearTimeout(this.dragUpdateTimer);
            this.dragUpdateTimer = null;
        }
        this.trackUpdatePending = false;

        // 确保 gameSpline 有足够的点，如果不足且 spline 有足够的点，则从 spline 复制
        // 注意：这只在非编辑模式下执行，编辑模式下不会更新 gameSpline
        let splineChanged = false;
        if (this.gameSpline && this.gameSpline.pointCount < 2 && this.spline && this.spline.pointCount >= 2) {
            try {
                const data = this.spline.serialize();
                this.gameSpline.loadFromData(data);
                splineChanged = true;
            } catch (e) {
                console.warn('无法从编辑轨道复制到游戏轨道:', e);
            }
        }

        // 确保 trackGenerator 使用正确的 spline 引用
        if (this.trackGenerator && this.gameSpline && this.gameSpline.pointCount >= 2) {
            // 如果 spline 引用改变了，需要清除生成器缓存，因为生成器保存了旧的 spline 引用
            if (this.trackGenerator.spline !== this.gameSpline || splineChanged) {
                this.trackGenerator.spline = this.gameSpline;
                // 清除生成器缓存，让生成器用新的 spline 重新创建
                if (this.trackGenerator.clearGeneratorCache) {
                    this.trackGenerator.clearGeneratorCache();
                }
            }
        }

        // 如果 gameSpline 仍然点数不足，跳过生成
        if (!this.gameSpline || this.gameSpline.pointCount < 2) {
            // 清空轨道网格
            const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
            this.renderer.setTrackMesh(currentId, null);
            return;
        }

        // 再次检查 trackGenerator 的 spline 是否有足够的点
        if (!this.trackGenerator || !this.trackGenerator.spline || this.trackGenerator.spline.pointCount < 2) {
            console.warn('轨道生成器的样条点数不足，跳过生成', {
                hasTrackGenerator: !!this.trackGenerator,
                hasSpline: !!this.trackGenerator?.spline,
                pointCount: this.trackGenerator?.spline?.pointCount
            });
            const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
            this.renderer.setTrackMesh(currentId, null);
            return;
        }

        // 获取当前过山车类型
        const currentType = this.coasterTypeManager ? this.coasterTypeManager.getCurrentType() : null;
        const coasterTypeName = currentType ? currentType.name : 'unknown';

        // 生成轨道网格（使用 gameSpline）
        const meshData = this.trackGenerator.generateTrack();
        if (meshData) {
            const currentId = this.coasterManager ? this.coasterManager.currentCoasterId : 'default';
            this.renderer.setTrackMesh(currentId, meshData);

            // 更新地面网格，根据轨道位置创建凹陷（使用 gameSpline）
            try {
                // 获取轨道点位置
                const trackPoints = this.gameSpline.getPoints ? this.gameSpline.getPoints() : null;
                if (trackPoints && trackPoints.points) {
                    this.renderer.initGroundMesh(trackPoints.points);
                } else {
                    // 如果没有 getPoints，尝试从缓存点获取
                    const cachedPoints = this.gameSpline.getCachedPoints ? this.gameSpline.getCachedPoints() : null;
                    if (cachedPoints && cachedPoints.length > 0) {
                        this.renderer.initGroundMesh(cachedPoints);
                    } else {
                        // 没有轨道点，使用默认地面
                        this.renderer.initGroundMesh(null);
                    }
                }
            } catch (e) {
                console.warn('更新地面网格失败:', e);
                // 失败时使用默认地面
                this.renderer.initGroundMesh(null);
            }
        } else {
            console.warn('轨道网格生成失败，当前类型:', coasterTypeName);
            // 轨道生成失败，使用默认地面
            this.renderer.initGroundMesh(null);
        }

        // 更新轨道长度限制状态（基于正式轨道）
        const splineForGame = this.gameSpline || this.spline;
        const totalLength = splineForGame.getApproximateLength();
        this.updateTrackLengthWarning(totalLength);

        // 更新小车总长度（轨道可能已改变）
        if (this.car) {
            this.car.totalLength = totalLength;
            // 标记小车缓存为脏，需要重新获取点数组
            if (typeof this.car.markCachedPointsDirty === 'function') {
                this.car.markCachedPointsDirty();
            }
        }

        // 更新添加按钮状态与经济UI
        this.updateAddButtonState();
        this.updateEconomyUI();

        // 检查轨道设计相关成就（基于正式轨道）
        this.checkTrackDesignAchievements();
    }

    /**
     * 刷新所有过山车的轨道显示
     */
    refreshAllTracks() {
        if (!this.coasterManager) return;

        const coasters = this.coasterManager.getAllCoasters();
        for (const coaster of coasters) {
            // 如果是当前正在编辑的过山车，且处于编辑模式，updateTrack会处理它
            if (this.isEditMode && coaster.id === this.coasterManager.currentCoasterId) {
                continue;
            }

            // 使用游戏轨道(gameSpline)生成显示网格
            const trackGen = coaster.trackGenerator;
            const spline = coaster.gameSpline;

            if (trackGen && spline && spline.pointCount >= 2) {
                // 临时保存 generator 的 spline
                const oldSpline = trackGen.spline;
                trackGen.spline = spline;

                try {
                    if (trackGen.clearGeneratorCache) {
                        trackGen.clearGeneratorCache();
                    }
                    const meshData = trackGen.generateTrack();
                    if (meshData) {
                        this.renderer.setTrackMesh(coaster.id, meshData);
                    }
                } catch (e) {
                    console.warn(`Failed to generate track for coaster ${coaster.id}`, e);
                }

                // 恢复
                trackGen.spline = oldSpline;
            }
        }
    }

    /**
     * 设置编辑模式
     * @param {boolean} enabled - 是否启用编辑模式
     */
    setEditMode(enabled) {
        this.isEditMode = enabled;

        // 如果退出编辑模式，清除选中状态和曲线显示
        if (!enabled) {
            this.selectedPointIndex = -1;
            this.selectedAxis = -1;
            this.selectedTangentIndex = -1;
            this.isDragging = false;
            this.isRotating = false;

            // 清空曲线和控制点显示
            this.renderer.setCurveLineMesh([], false);
            this.renderer.setControlPointsMesh([], -1, -1);

            // 清除控制点UI显示
            if (typeof window !== 'undefined') {
                if (window.updateControlPointUI) window.updateControlPointUI();
                if (window.updateTangentUI) window.updateTangentUI();
                if (window.updateLiftStatus) window.updateLiftStatus();
                if (window.updateElectromagneticStatus) window.updateElectromagneticStatus();
            }

            // 退出编辑模式时，如果有待更新的轨道，立即生成网格
            if (this.trackUpdatePending) {
                // 清除延迟定时器
                if (this.dragUpdateTimer) {
                    clearTimeout(this.dragUpdateTimer);
                    this.dragUpdateTimer = null;
                }
                // 立即生成网格
                this.updateTrack();
                this.trackUpdatePending = false;
            }
        } else {
            // 进入编辑模式，立即显示控制点
            const controlPoints = [];
            for (let i = 0; i < this.spline.pointCount; i++) {
                const point = this.spline.getControlPoint(i);
                if (point) {
                    controlPoints.push(point);
                }
            }
            this.renderer.setControlPointsMesh(controlPoints, this.selectedPointIndex, this.selectedAxis);
        }

        // 立即更新轨道和控制点显示
        this.updateTrack();
    }

    /**
     * 渲染循环
     */
    startRenderLoop() {
        let frameCount = 0;
        const loop = (currentTime) => {
            // 计算时间差
            const deltaTime = (currentTime - this.lastTime) / 1000.0; // 转换为秒
            this.lastTime = currentTime;

            // 更新所有过山车（支持多个过山车同时运行）
            this.coasterManager.updateAll(deltaTime);

            // 更新当前选中的过山车（用于UI显示和相机跟随）
            if (this.car) {
                // 更新小车变换矩阵（每帧更新，确保小车位置正确）
                const carTransform = this.car.getTransformMatrix();
                this.renderer.setCarTransform(carTransform);
                
                // 同步全局状态（兼容现有代码）
                if (typeof window !== 'undefined') {
                    window.gameRunning = this.gameState.running;
                    window.gamePaused = this.gameState.paused;
                }

                // 更新物理数据UI（仅当前选中的过山车）
                if (this.gameState.running && !this.gameState.paused) {
                    this.updatePhysicsUI();
                }

                // 更新相机跟随（如果是跟随模式，无论游戏是否运行都更新）
                if (this.cameraMode === 'follow') {
                    this.updateFollowCamera();
                }
            }

            this.renderer.render();
            this.renderControlPoints();

            // 每60帧输出一次调试信息
            if (frameCount % 60 === 0) {
                const gl = this.renderer.gl;
                const error = gl.getError();
                if (error !== gl.NO_ERROR) {
                    console.warn('WebGL错误:', error);
                }
            }
            frameCount++;

            requestAnimationFrame(loop);
        };
        this.lastTime = performance.now();
        requestAnimationFrame(loop);
    }

    /**
     * 渲染控制点（使用2D canvas overlay）
     */
    renderControlPoints() {
        // 这里可以使用额外的canvas来渲染控制点UI
        // 或者使用WebGL点渲染
        // 简化版：在控制台输出选中点信息
        if (this.selectedPointIndex >= 0) {
            const point = this.spline.getControlPoint(this.selectedPointIndex);
        }
    }

    /**
     * 更新跟随相机（第一人称视角）
     */
    updateFollowCamera() {
        if (!this.car) return;

        const carPosition = this.car.getPosition(); // 已经在轨道上方0.2米
        const carDirection = this.car.getDirection();

        if (!carPosition || !carDirection) return;

        // 获取轨道点信息以计算法线
        const pointInfo = this.gameSpline.getPointInfoByDistance(this.car.distanceAlongTrack);
        if (!pointInfo) return;

        // 计算法线方向（向上方向）
        const direction = pointInfo.tangent || carDirection;
        const baseNormal = this.trackGenerator ? this.trackGenerator.getNormal(direction) : new Vec3(0, 1, 0);

        // 主视角相机在轨道上方0.5米
        const cameraHeightOffset = 0.5; // 轨道上方0.5米
        const trackPosition = pointInfo.position;
        const heightOffset = baseNormal.copy ? baseNormal.copy().multiplyScalar(cameraHeightOffset) : new Vec3(baseNormal.x * cameraHeightOffset, baseNormal.y * cameraHeightOffset, baseNormal.z * cameraHeightOffset);
        const cameraBasePosition = trackPosition.add(heightOffset);

        // 相机位置稍微向后偏移一点，避免完全重叠
        const backwardOffset = carDirection.copy().multiplyScalar(-0.3); // 向后偏移0.3米
        const cameraPosition = cameraBasePosition.add(backwardOffset);

        // 相机看向前方（沿着轨道方向，从相机位置看向前方）
        const lookAhead = carDirection.copy().multiplyScalar(10); // 看向前方10米
        const cameraTarget = cameraBasePosition.add(lookAhead);

        // 使用法线作为向上方向
        const up = baseNormal.copy ? baseNormal.copy() : new Vec3(baseNormal.x, baseNormal.y, baseNormal.z);

        // 更新相机
        this.renderer.camera.position = cameraPosition;
        this.renderer.camera.target = cameraTarget;
        this.renderer.camera.up = up;
    }

    /**
     * 切换相机模式
     * @param {string} mode - 'free' 或 'follow'
     */
    setCameraMode(mode) {
        if (mode === this.cameraMode) return;

        if (mode === 'follow') {
            // 切换到跟随模式：保存当前相机位置和up向量
            this.savedCameraPosition = this.renderer.camera.position.copy ?
                this.renderer.camera.position.copy() :
                new Vec3(this.renderer.camera.position.x, this.renderer.camera.position.y, this.renderer.camera.position.z);
            this.savedCameraTarget = this.renderer.camera.target.copy ?
                this.renderer.camera.target.copy() :
                new Vec3(this.renderer.camera.target.x, this.renderer.camera.target.y, this.renderer.camera.target.z);
            this.savedCameraUp = this.renderer.camera.up.copy ?
                this.renderer.camera.up.copy() :
                new Vec3(this.renderer.camera.up.x, this.renderer.camera.up.y, this.renderer.camera.up.z);

            // 立即更新到跟随视角
            this.updateFollowCamera();
        } else if (mode === 'free') {
            // 切换回自由模式：恢复保存的相机位置，并重置up向量为垂直向上
            if (this.savedCameraPosition && this.savedCameraTarget) {
                this.renderer.setCamera(this.savedCameraPosition, this.savedCameraTarget);
                // 重置up向量为垂直向上，避免视角歪斜
                this.renderer.camera.up = new Vec3(0, 1, 0);
            } else {
                // 如果没有保存的位置，使用默认位置
                this.renderer.setCamera(
                    new Vec3(0, 15, 30),
                    new Vec3(0, 0, 0)
                );
                // 确保up向量是垂直向上的
                this.renderer.camera.up = new Vec3(0, 1, 0);
            }
        }

        this.cameraMode = mode;
    }

    /**
     * 获取当前相机模式
     */
    getCameraMode() {
        return this.cameraMode;
    }

    /**
     * 更新添加按钮状态
     */
    updateAddButtonState() {
        const btnAddPoint = document.getElementById('btnAddPoint');
        if (btnAddPoint) {
            const hasSelection = this.selectedPointIndex >= 0 && this.selectedPointIndex < this.spline.pointCount;
            btnAddPoint.disabled = !hasSelection || this.trackLengthExceeded;
        }
    }

    /**
     * 奖励惊叫币
     */
    addScreamCoins(amount) {
        if (!amount || Number.isNaN(amount)) return;
        const added = Math.max(0, Math.round(amount));
        this.screamCoins += added;
        this.updateEconomyUI();

        // 触发惊叫币收集动画
        if (typeof window !== 'undefined' && window.showCoinAnimation && added > 0) {
            window.showCoinAnimation(added);
        }

        return added;
    }

    spendScreamCoins(cost) {
        if (cost > this.screamCoins) {
            alert('惊叫币不足！');
            return false;
        }
        this.screamCoins -= cost;
        this.updateEconomyUI();
        return true;
    }

    handleLapReward() {
        const metrics = this.car ? this.car.getPhysicsMetrics() : null;
        // 评分：综合尖叫、刺激、舒适与安全四个指数，范围大致 0-100
        let rating = 0;
        if (metrics) {
            const scream = metrics.screamIndex || 0;
            const thrill = metrics.thrillIndex || 0;
            const comfort = metrics.comfortIndex || 0;
            const safety = metrics.safetyIndex || 0;
            rating = (scream + thrill + comfort + safety) / 4;
        }
        // 每圈获得“评分”数量的惊叫币，限制最小值，避免前期太少
        const coinReward = Math.max(10, Math.round(rating));
        this.addScreamCoins(coinReward);

        // 更新统计数据
        if (this.achievementManager) {
            this.achievementManager.stats.totalLaps += 1;
            this.achievementManager.stats.totalCoinsEarned += coinReward;
            this.achievementManager.stats.consecutiveLaps += 1;
            this.achievementManager.stats.bestConsecutiveLaps = Math.max(
                this.achievementManager.stats.bestConsecutiveLaps,
                this.achievementManager.stats.consecutiveLaps
            );

            // 检查进度类成就
            this.achievementManager.updateStats({});
        }

        // 检查物理指标相关成就
        this.checkPhysicsAchievements();
    }

    /**
     * 汇总轨道用于经济系统的统计数据
     * - totalLength: 轨道总长
     * - liftLength: 牵引段总长
     * - platformLength: 站台长度
     * - electromagneticCount: 电磁加速/减速控制点数量
     */
    getTrackEconomyStats(source = 'game') {
        const spline = source === 'edit'
            ? (this.spline || this.gameSpline)
            : (this.gameSpline || this.spline);

        const totalLength = spline ? spline.getApproximateLength() : 0;
        let liftLength = 0;
        let electromagneticCount = 0;

        if (spline) {
            // 基于采样点估算牵引段长度（点上有 liftSection 标记）
            const pts = spline.getCachedPoints();
            for (let i = 1; i < pts.length; i++) {
                const prev = pts[i - 1];
                const cur = pts[i];
                if (cur.liftSection || prev.liftSection) {
                    liftLength += Math.max(0, cur.distance - prev.distance);
                }
            }

            // 统计电磁控制点数量
            for (let i = 0; i < spline.pointCount; i++) {
                const p = spline.getControlPoint(i);
                if (!p) continue;
                if (p.isElectromagneticBoost || p.isElectromagneticBrake) {
                    electromagneticCount++;
                }
            }
        }

        // 站台长度：使用已有配置
        const platformLength = this.platformLength || 0;

        return {
            totalLength,
            liftLength,
            platformLength,
            electromagneticCount
        };
    }

    /**
     * 计算升级到目标过山车类型所需的惊叫币（基于当前正式轨道）
     * @param {string} targetTypeName 'steel' 或 'modern'
     */
    computeCoasterUpgradeCost(targetTypeName) {
        const stats = this.getTrackEconomyStats('game');
        // 基础价格，根据类型不同
        let base;
        if (targetTypeName === 'steel') {
            base = 500;
        } else if (targetTypeName === 'modern') {
            base = 2000;
        } else {
            base = 0;
        }

        // 轨道越长、牵引越多、电磁越多，升级越贵
        const lengthFactor = stats.totalLength * 0.5;
        const liftFactor = stats.liftLength * 1.0;
        const platformFactor = stats.platformLength * 0.2;
        const electromagneticFactor = stats.electromagneticCount * 80;

        const rawCost = base + lengthFactor + liftFactor + platformFactor + electromagneticFactor;
        return Math.max(0, Math.round(rawCost));
    }

    /**
     * 升级到下一种过山车类型（使用惊叫币，并推动成就解锁）
     */
    upgradeCoasterType() {
        if (!this.coasterTypeManager || !this.coasterTypeManager.canUpgrade()) {
            alert('当前已是最高等级过山车类型');
            return;
        }

        const currentType = this.coasterTypeManager.getCurrentType();
        const allTypes = this.coasterTypeManager.getAllTypes();
        const currentIndex = allTypes.findIndex(t => t === currentType);
        const nextType = allTypes[currentIndex + 1];
        if (!nextType) {
            alert('没有可升级的过山车类型');
            return;
        }

        const cost = this.computeCoasterUpgradeCost(nextType.name);
        if (!this.spendScreamCoins(cost)) {
            alert(`升级到 ${nextType.displayName} 需要 ${cost} 惊叫币`);
            return;
        }

        // 解锁并切换类型
        nextType.unlocked = true;
        this.coasterTypeManager.setCurrentType(nextType.name);

        // 清除生成器缓存，确保使用新的类型
        if (this.trackGenerator && this.trackGenerator.clearGeneratorCache) {
            this.trackGenerator.clearGeneratorCache();
        }

        // 统计已解锁类型数量并更新成就
        if (this.achievementManager) {
            const unlockedTypes = this.coasterTypeManager.getAllTypes().filter(t => t.unlocked).length;
            this.achievementManager.stats.coasterTypesUnlocked = unlockedTypes;
            this.achievementManager.updateStats({});
        }

        // 重新生成轨道
        this.updateTrack();

        if (typeof window !== 'undefined' && window.updateCoasterTypeUI) {
            window.updateCoasterTypeUI();
        }

        alert(`升级成功！已解锁并切换到 ${nextType.displayName}`);
    }

    /**
     * 计算将当前编辑轨道应用到游戏中的花费
     */
    computeApplyEditTrackCost() {
        const stats = this.getTrackEconomyStats('edit');
        const base = 100;
        const lengthFactor = stats.totalLength * 0.3;
        const liftFactor = stats.liftLength * 0.5;
        const platformFactor = stats.platformLength * 0.1;
        const electromagneticFactor = stats.electromagneticCount * 50;
        const rawCost = base + lengthFactor + liftFactor + platformFactor + electromagneticFactor;
        return Math.max(50, Math.round(rawCost));
    }

    /**
     * 将当前编辑轨道（this.spline）应用为正式游戏轨道（this.gameSpline），需要消耗惊叫币
     * @param {boolean} askToSaveIfInsufficient - 如果币不足，是否询问是否保存（默认true）
     * @returns {boolean} - 是否成功应用
     */
    applyEditTrackToGame(askToSaveIfInsufficient = true) {
        if (!this.spline) return false;

        const cost = this.computeApplyEditTrackCost();

        // 检查惊叫币是否足够
        if (cost > this.screamCoins) {
            if (askToSaveIfInsufficient) {
                const shouldSave = confirm(`应用当前轨道需要 ${cost} 惊叫币，但您只有 ${this.screamCoins} 惊叫币。\n\n是否保存当前编辑轨道？`);
                if (shouldSave) {
                    // 保存到默认槽位（槽1）
                    this.saveProjectStateToLocal(0);
                    this.notifySaveStatus('已保存当前编辑轨道。');
                }
            } else {
                alert(`应用当前轨道需要 ${cost} 惊叫币，但您只有 ${this.screamCoins} 惊叫币`);
            }
            return false;
        }

        // 扣除惊叫币
        if (!this.spendScreamCoins(cost)) {
            return false;
        }

        try {
            // 将编辑样条序列化后加载到正式样条
            const data = this.spline.serialize();
            if (!this.gameSpline) {
                this.gameSpline = new BezierSpline();
            }
            this.gameSpline.loadFromData(data);

            // 更新生成器与物理系统引用
            if (this.trackGenerator) {
                this.trackGenerator.spline = this.gameSpline;
            }
            if (this.car) {
                this.car.totalLength = this.gameSpline.getApproximateLength();
                if (this.car.physics) {
                    this.car.physics.spline = this.gameSpline;
                    this.car.physics.trackGenerator = this.trackGenerator;
                    this.car.physics.reset();
                }
            }

            // 正式轨道改变，更新渲染与长度提示、成就等
            this.updateTrack();
            this.updateTrackLengthWarning();
            this.checkTrackDesignAchievements();

            // 自动保存游戏轨道
            if (this.saveGameTrack) {
                this.saveGameTrack();
            }

            this.notifySaveStatus(`编辑轨道已成功应用到游戏，花费 ${cost} 惊叫币。`);
            if (window.updateControlPointUI) window.updateControlPointUI();
            if (window.updateTangentUI) window.updateTangentUI();
            if (window.updateLiftStatus) window.updateLiftStatus();
            if (window.updateElectromagneticStatus) window.updateElectromagneticStatus();
            return true;
        } catch (e) {
            console.error('应用编辑轨道到游戏失败', e);
            alert('应用编辑轨道失败，请查看控制台错误信息');
            return false;
        }
    }

    getBoostAccelerationLimit() {
        return this.boostAccelerationLimit;
    }

    getBrakeAccelerationLimit() {
        return this.brakeAccelerationLimit;
    }

    buyTrackLengthUpgrade() {
        if (this.trackLengthLevel >= this.trackLengthLevels.length - 1) {
            alert('轨道长度已到达最大等级');
            return;
        }
        const cost = this.trackLengthCosts[this.trackLengthLevel] || 0;
        if (!this.spendScreamCoins(cost)) {
            return;
        }
        this.trackLengthLevel += 1;
        this.maxTrackLength = this.trackLengthLevels[this.trackLengthLevel];
        this.updateEconomyUI();
        this.updateTrackLengthWarning();
        this.updateTrack();

        // 检查经济大师成就
        this.checkPhysicsAchievements();
    }

    buyAcceleratorModule() {
        if (this.boostAccelerationLimit >= this.boostAccelerationCap) {
            alert('电磁加速模块已达上限');
            return;
        }
        const cost = 100;
        if (!this.spendScreamCoins(cost)) {
            return;
        }
        this.boostAccelerationLimit = Math.min(this.boostAccelerationLimit + this.boostAccelerationStep, this.boostAccelerationCap);
        this.updateEconomyUI();
        if (window.updateElectromagneticStatus) {
            window.updateElectromagneticStatus();
        }
        // 检查电磁专家成就
        this.checkPhysicsAchievements();
    }

    buyBrakeModule() {
        if (this.brakeAccelerationLimit >= this.brakeAccelerationCap) {
            alert('电磁减速模块已达上限');
            return;
        }
        const cost = 100;
        if (!this.spendScreamCoins(cost)) {
            return;
        }
        this.brakeAccelerationLimit = Math.min(this.brakeAccelerationLimit + this.brakeAccelerationStep, this.brakeAccelerationCap);
        this.updateEconomyUI();
        if (window.updateElectromagneticStatus) {
            window.updateElectromagneticStatus();
        }
        // 检查电磁专家成就
        this.checkPhysicsAchievements();
    }

    updateEconomyUI() {
        if (window.updateEconomyUI) {
            const nextCost = this.trackLengthLevel < this.trackLengthLevels.length - 1
                ? this.trackLengthCosts[this.trackLengthLevel]
                : null;
            window.updateEconomyUI({
                screamCoins: this.screamCoins,
                trackLengthCurrent: this.maxTrackLength,
                nextTrackLengthCost: nextCost,
                boostLevel: this.boostAccelerationLimit,
                brakeLevel: this.brakeAccelerationLimit
            });
        }
    }

    updateTrackLengthWarning(currentLength) {
        const length = typeof currentLength === 'number'
            ? currentLength
            : (this.gameSpline || this.spline).getApproximateLength();
        this.trackLengthExceeded = length > this.maxTrackLength + 0.5;
        if (window.updateTrackLengthWarning) {
            window.updateTrackLengthWarning({
                exceeded: this.trackLengthExceeded,
                current: length,
                limit: this.maxTrackLength
            });
        }
    }

    /**
     * 更新物理数据UI
     */
    updatePhysicsUI() {
        if (!this.car) return;

        const metrics = this.car.getPhysicsMetrics();
        const maxMetrics = this.car.getMaxMetrics();

        // 更新实时数据
        const currentSpeedEl = document.getElementById('currentSpeed');
        const currentAccelEl = document.getElementById('currentAcceleration');
        const currentGForceEl = document.getElementById('currentGForce');
        const currentVerticalGEl = document.getElementById('currentVerticalG');
        const currentLateralGEl = document.getElementById('currentLateralG');

        if (currentSpeedEl) currentSpeedEl.textContent = metrics.speed.toFixed(2);
        if (currentAccelEl) currentAccelEl.textContent = metrics.acceleration.toFixed(2);
        if (currentGForceEl) currentGForceEl.textContent = metrics.gForce.total.toFixed(2);
        if (currentVerticalGEl) currentVerticalGEl.textContent = metrics.gForce.vertical.toFixed(2);
        if (currentLateralGEl) currentLateralGEl.textContent = Math.abs(metrics.gForce.lateral).toFixed(2);

        // 更新特征指数
        const screamIndexEl = document.getElementById('screamIndex');
        const thrillIndexEl = document.getElementById('thrillIndex');
        const comfortIndexEl = document.getElementById('comfortIndex');
        const safetyIndexEl = document.getElementById('safetyIndex');

        if (screamIndexEl) screamIndexEl.textContent = Math.round(metrics.screamIndex);
        if (thrillIndexEl) thrillIndexEl.textContent = Math.round(metrics.thrillIndex);
        if (comfortIndexEl) comfortIndexEl.textContent = Math.round(metrics.comfortIndex);
        if (safetyIndexEl) safetyIndexEl.textContent = Math.round(metrics.safetyIndex);

        // 更新历史最大值
        const maxSpeedEl = document.getElementById('maxSpeed');
        const maxGForceEl = document.getElementById('maxGForce');
        const maxVerticalGEl = document.getElementById('maxVerticalG');
        const maxLateralGEl = document.getElementById('maxLateralG');
        const maxAccelEl = document.getElementById('maxAcceleration');

        if (maxSpeedEl) maxSpeedEl.textContent = maxMetrics.maxSpeed.toFixed(2);
        if (maxGForceEl) maxGForceEl.textContent = maxMetrics.maxGForce.toFixed(2);
        if (maxVerticalGEl) maxVerticalGEl.textContent = maxMetrics.maxVerticalG.toFixed(2);
        if (maxLateralGEl) maxLateralGEl.textContent = maxMetrics.maxLateralG.toFixed(2);
        if (maxAccelEl) maxAccelEl.textContent = maxMetrics.maxAcceleration.toFixed(2);

        // 显示UI区域
        const physicsMetricsEl = document.getElementById('physicsMetrics');
        const coasterMetricsEl = document.getElementById('coasterMetrics');
        const maxMetricsEl = document.getElementById('maxMetrics');

        if (physicsMetricsEl) physicsMetricsEl.style.display = 'block';
        if (coasterMetricsEl) coasterMetricsEl.style.display = 'block';
        if (maxMetricsEl) maxMetricsEl.style.display = 'block';
    }

    /**
     * 汇总当前工程状态，便于保存/导出
     * 注意：存档槽位只保存编辑轨道（editSpline），不保存游戏轨道（gameSpline）
     * 游戏轨道会自动保存到独立位置
     */
    getProjectState() {
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            // 存档槽位只保存编辑轨道（预编辑轨道）
            editSpline: this.spline.serialize(),
            // 兼容旧版本：如果有 gameSpline，也保存（但新版本不会读取）
            spline: this.spline.serialize(), // 为了兼容，也保存 editSpline
            economy: {
                screamCoins: this.screamCoins,
                trackLengthLevel: this.trackLengthLevel,
                maxTrackLength: this.maxTrackLength,
                boostAccelerationLimit: this.boostAccelerationLimit,
                brakeAccelerationLimit: this.brakeAccelerationLimit
            },
            coasterTypes: this.coasterTypeManager.serializeState(),
            achievements: this.achievementManager ? this.achievementManager.serialize() : null
        };
    }

    /**
     * 根据存档槽索引获取本地存储 key
     * @param {number} slotIndex 0-9，对用户显示为 槽1-槽10
     */
    _getStorageKeyForSlot(slotIndex = 0) {
        const idx = Number.isFinite(slotIndex) ? Math.max(0, Math.min(9, Math.floor(slotIndex))) : 0;
        if (idx === 0) {
            // 槽0 兼容旧版单一存档
            return LOCAL_STORAGE_KEY;
        }
        return `${LOCAL_STORAGE_KEY}:slot${idx}`;
    }

    /**
     * 获取所有本地存档槽的信息（0-9）
     * @returns {Array<{index:number, exists:boolean, savedAt:string|null}>}
     */
    getAllLocalSaves() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return Array.from({ length: 10 }, (_, index) => ({
                index,
                exists: false,
                savedAt: null
            }));
        }

        const result = [];
        for (let i = 0; i < 10; i++) {
            const key = this._getStorageKeyForSlot(i);
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                result.push({ index: i, exists: false, savedAt: null });
                continue;
            }
            let savedAt = null;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.savedAt === 'string') {
                    savedAt = parsed.savedAt;
                }
            } catch (e) {
                // 忽略解析错误，仅标记为有存档
            }
            result.push({ index: i, exists: true, savedAt });
        }
        return result;
    }

    /**
     * 使用保存的状态恢复编辑器
     * @param {Object} state
     * 注意：存档槽位只加载编辑轨道（editSpline），不加载游戏轨道（gameSpline）
     * 游戏轨道会自动从独立位置加载
     */
    applyProjectState(state) {
        if (!state) {
            throw new Error('存档格式无效');
        }

        // 存档槽位只加载编辑轨道（editSpline）
        const editSource = state.editSpline || state.spline; // 兼容旧版本
        if (!editSource) {
            throw new Error('存档格式无效，缺少编辑轨道数据');
        }

        const restoredEdit = this.spline.loadFromData(editSource);
        if (!restoredEdit) {
            throw new Error('编辑轨道数据损坏或点数不足');
        }

        // 标记编辑轨道缓存为脏，确保预览会重新计算
        if (this.spline && typeof this.spline.markCachedPointsDirty === 'function') {
            this.spline.markCachedPointsDirty();
        }

        // 注意：不在这里加载 gameSpline，gameSpline 会从自动保存位置加载

        if (state.economy) {
            if (typeof state.economy.screamCoins === 'number') {
                this.screamCoins = Math.max(0, Math.floor(state.economy.screamCoins));
            }
            if (typeof state.economy.trackLengthLevel === 'number') {
                const clampedLevel = Math.max(0, Math.min(this.trackLengthLevels.length - 1, Math.floor(state.economy.trackLengthLevel)));
                this.trackLengthLevel = clampedLevel;
                this.maxTrackLength = this.trackLengthLevels[clampedLevel];
            } else if (typeof state.economy.maxTrackLength === 'number') {
                this.maxTrackLength = state.economy.maxTrackLength;
            }
            if (typeof state.economy.boostAccelerationLimit === 'number') {
                this.boostAccelerationLimit = Math.min(this.boostAccelerationCap, Math.max(this.boostAccelerationStep, state.economy.boostAccelerationLimit));
            }
            if (typeof state.economy.brakeAccelerationLimit === 'number') {
                this.brakeAccelerationLimit = Math.min(this.brakeAccelerationCap, Math.max(this.brakeAccelerationStep, state.economy.brakeAccelerationLimit));
            }
        }

        if (state.coasterTypes) {
            this.coasterTypeManager.loadState(state.coasterTypes);
        }

        if (state.achievements && this.achievementManager) {
            this.achievementManager.load(state.achievements);
        }

        // 清除生成器缓存，确保使用新的类型
        if (this.trackGenerator.clearGeneratorCache) {
            this.trackGenerator.clearGeneratorCache();
        }

        // 注意：gameSpline 不会从槽位加载，会从自动保存位置加载
        // 这里只更新编辑轨道，游戏轨道保持不变或从自动保存位置加载

        // 更新曲线预览和控制点网格（如果处于编辑模式）
        if (this.isEditMode) {
            this.updateCurvePreview();
            // 更新控制点网格
            const controlPoints = [];
            for (let i = 0; i < this.spline.pointCount; i++) {
                const point = this.spline.getControlPoint(i);
                if (point) {
                    controlPoints.push(point);
                }
            }
            this.renderer.setControlPointsMesh(controlPoints, this.selectedPointIndex, this.selectedAxis);
        }

        // 更新轨道（非编辑模式下会更新游戏轨道网格）
        this.updateTrack();

        if (this.car) {
            if (typeof this.car.resetProgress === 'function') {
                this.car.resetProgress(0);
            } else {
                this.car.position = 0;
            }
            this.car.totalLength = this.gameSpline.getApproximateLength();
            if (this.car.physics) {
                this.car.physics.spline = this.gameSpline;
                this.car.physics.trackGenerator = this.trackGenerator;
                this.car.physics.reset();
            }
        }

        this.updateEconomyUI();
        this.updateTrackLengthWarning();

        if (window.updateCoasterTypeUI) {
            window.updateCoasterTypeUI();
        }
        if (window.updateControlPointUI) {
            window.updateControlPointUI();
        }
        if (window.updateTangentUI) {
            window.updateTangentUI();
        }

        if (window.refreshSaveControls) {
            const slots = this.getAllLocalSaves ? this.getAllLocalSaves() : null;
            const hasAny = slots ? slots.some(s => s.exists) : this.hasLocalSave();
            window.refreshSaveControls(hasAny, slots);
        }

        if (window.updateAchievementsUI && this.achievementManager) {
            window.updateAchievementsUI(this.achievementManager);
        }
    }

    notifySaveStatus(message, isError = false) {
        if (window.updateSaveStatus) {
            window.updateSaveStatus(message, isError);
        }
    }

    /**
     * 将当前工程保存到本地指定槽位（0-9）
     * @param {number} [slotIndex=0] 存档槽索引
     */
    saveProjectStateToLocal(slotIndex = 0) {
        if (typeof window === 'undefined' || !window.localStorage) {
            this.notifySaveStatus('当前环境不支持本地存档', true);
            return;
        }
        try {
            const payload = this.getProjectState();
            const key = this._getStorageKeyForSlot(slotIndex);
            window.localStorage.setItem(key, JSON.stringify(payload));

            const slotLabel = slotIndex + 1;
            this.notifySaveStatus(`已保存到本地槽 ${slotLabel}: ` + new Date(payload.savedAt).toLocaleString());
            if (window.refreshSaveControls) {
                const slots = this.getAllLocalSaves();
                const hasAny = slots.some(s => s.exists);
                window.refreshSaveControls(hasAny, slots);
            }
        } catch (error) {
            console.error('保存到本地失败', error);
            this.notifySaveStatus('保存失败: ' + error.message, true);
        }
    }

    /**
     * 从本地指定槽位加载工程（0-9）
     * @param {number} [slotIndex=0] 存档槽索引
     */
    loadProjectStateFromLocal(slotIndex = 0) {
        if (typeof window === 'undefined' || !window.localStorage) {
            this.notifySaveStatus('当前环境不支持本地存档', true);
            return;
        }
        try {
            const key = this._getStorageKeyForSlot(slotIndex);
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                const slotLabel = slotIndex + 1;
                this.notifySaveStatus(`槽 ${slotLabel} 中未找到任何本地存档`, true);
                return;
            }
            const payload = JSON.parse(raw);
            this.applyProjectState(payload);
            const slotLabel = slotIndex + 1;
            this.notifySaveStatus(`槽 ${slotLabel} 的本地存档加载成功`);
        } catch (error) {
            console.error('加载本地存档失败', error);
            this.notifySaveStatus('加载失败: ' + error.message, true);
        }
    }

    /**
     * 自动保存游戏轨道（gameSpline）到本地存储
     */
    saveGameTrack() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        if (!this.gameSpline || this.gameSpline.pointCount < 2) {
            return; // 没有有效的游戏轨道，不保存
        }
        try {
            const gameTrackData = {
                version: 1,
                savedAt: new Date().toISOString(),
                spline: this.gameSpline.serialize(),
                economy: {
                    screamCoins: this.screamCoins,
                    trackLengthLevel: this.trackLengthLevel,
                    maxTrackLength: this.maxTrackLength,
                    boostAccelerationLimit: this.boostAccelerationLimit,
                    brakeAccelerationLimit: this.brakeAccelerationLimit
                },
                coasterTypes: this.coasterTypeManager.serializeState(),
                achievements: this.achievementManager ? this.achievementManager.serialize() : null
            };
            window.localStorage.setItem(GAME_TRACK_STORAGE_KEY, JSON.stringify(gameTrackData));
            console.log('游戏轨道已自动保存');
        } catch (error) {
            console.error('自动保存游戏轨道失败', error);
        }
    }

    /**
     * 自动加载游戏轨道（gameSpline）从本地存储
     * @returns {boolean} 是否成功加载
     */
    loadGameTrack() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return false;
        }
        try {
            const raw = window.localStorage.getItem(GAME_TRACK_STORAGE_KEY);
            if (!raw) {
                return false; // 没有保存的游戏轨道
            }
            const payload = JSON.parse(raw);
            if (!payload || !payload.spline) {
                return false;
            }

            // 加载游戏轨道
            const restored = this.gameSpline.loadFromData(payload.spline);
            if (!restored || this.gameSpline.pointCount < 2) {
                return false;
            }

            // 加载经济数据
            if (payload.economy) {
                if (typeof payload.economy.screamCoins === 'number') {
                    this.screamCoins = Math.max(0, Math.floor(payload.economy.screamCoins));
                }
                if (typeof payload.economy.trackLengthLevel === 'number') {
                    const clampedLevel = Math.max(0, Math.min(this.trackLengthLevels.length - 1, Math.floor(payload.economy.trackLengthLevel)));
                    this.trackLengthLevel = clampedLevel;
                    this.maxTrackLength = this.trackLengthLevels[clampedLevel];
                } else if (typeof payload.economy.maxTrackLength === 'number') {
                    this.maxTrackLength = payload.economy.maxTrackLength;
                }
                if (typeof payload.economy.boostAccelerationLimit === 'number') {
                    this.boostAccelerationLimit = Math.min(this.boostAccelerationCap, Math.max(this.boostAccelerationStep, payload.economy.boostAccelerationLimit));
                }
                if (typeof payload.economy.brakeAccelerationLimit === 'number') {
                    this.brakeAccelerationLimit = Math.min(this.brakeAccelerationCap, Math.max(this.brakeAccelerationStep, payload.economy.brakeAccelerationLimit));
                }
            }

            // 加载过山车类型状态
            if (payload.coasterTypes) {
                this.coasterTypeManager.loadState(payload.coasterTypes);
            }

            // 加载成就
            if (payload.achievements && this.achievementManager) {
                this.achievementManager.load(payload.achievements);
            }

            // 更新 trackGenerator 引用
            if (this.trackGenerator) {
                this.trackGenerator.spline = this.gameSpline;
                if (this.trackGenerator.clearGeneratorCache) {
                    this.trackGenerator.clearGeneratorCache();
                }
            }

            console.log('游戏轨道已自动加载，点数:', this.gameSpline.pointCount);
            return true;
        } catch (error) {
            console.error('自动加载游戏轨道失败', error);
            return false;
        }
    }

    exportProjectState() {
        if (typeof document === 'undefined') {
            this.notifySaveStatus('当前环境不支持导出', true);
            return;
        }
        try {
            const payload = this.getProjectState();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${EXPORT_FILE_PREFIX}-${timestamp}.json`;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.notifySaveStatus('已导出轨道JSON文件');
        } catch (error) {
            console.error('导出失败', error);
            this.notifySaveStatus('导出失败: ' + error.message, true);
        }
    }

    importProjectState(rawData) {
        try {
            const payload = rawData && rawData.spline ? rawData : { spline: rawData };
            this.applyProjectState(payload);
            this.notifySaveStatus('导入存档成功');
        } catch (error) {
            console.error('导入存档失败', error);
            this.notifySaveStatus('导入失败: ' + error.message, true);
            throw error;
        }
    }

    /**
     * 检查是否存在本地存档
     * 不传参数：任意槽存在存档即返回 true
     * 传入 slotIndex：仅检查该槽
     */
    hasLocalSave(slotIndex = null) {
        if (typeof window === 'undefined' || !window.localStorage) {
            return false;
        }
        if (slotIndex !== null && Number.isFinite(slotIndex)) {
            const key = this._getStorageKeyForSlot(slotIndex);
            return !!window.localStorage.getItem(key);
        }
        // 检查任意槽
        for (let i = 0; i < 10; i++) {
            const key = this._getStorageKeyForSlot(i);
            if (window.localStorage.getItem(key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查轨道设计相关成就
     */
    checkTrackDesignAchievements() {
        if (!this.achievementManager) return;
        const splineForGame = this.gameSpline || this.spline;

        const trackLength = splineForGame.getApproximateLength();
        const controlPoints = splineForGame.pointCount;

        // 计算最大高度
        let maxHeight = 0;
        for (let i = 0; i < splineForGame.pointCount; i++) {
            const point = splineForGame.getControlPoint(i);
            if (point && point.position) {
                maxHeight = Math.max(maxHeight, point.position.y);
            }
        }

        // 更新统计数据
        this.achievementManager.stats.maxTrackLength = Math.max(
            this.achievementManager.stats.maxTrackLength,
            trackLength
        );
        this.achievementManager.stats.maxControlPoints = Math.max(
            this.achievementManager.stats.maxControlPoints,
            controlPoints
        );
        this.achievementManager.stats.maxHeightReached = Math.max(
            this.achievementManager.stats.maxHeightReached,
            maxHeight
        );

        // 检查第一个轨道成就
        if (this.achievementManager.stats.tracksCreated === 0 && controlPoints >= 3) {
            this.achievementManager.stats.tracksCreated = 1;
            this.achievementManager.checkAndUnlock('first_track', 1);
        }

        // 更新成就
        this.achievementManager.updateStats({});
    }

    /**
     * 检查物理指标相关成就
     */
    checkPhysicsAchievements() {
        if (!this.achievementManager || !this.car) return;

        const metrics = this.car.getPhysicsMetrics();
        const maxMetrics = this.car.getMaxMetrics();

        // 更新统计数据
        this.achievementManager.stats.maxSpeedReached = Math.max(
            this.achievementManager.stats.maxSpeedReached,
            maxMetrics.maxSpeed
        );
        this.achievementManager.stats.maxGForceReached = Math.max(
            this.achievementManager.stats.maxGForceReached,
            maxMetrics.maxGForce
        );
        this.achievementManager.stats.maxScreamIndex = Math.max(
            this.achievementManager.stats.maxScreamIndex,
            metrics.screamIndex || 0
        );
        this.achievementManager.stats.maxThrillIndex = Math.max(
            this.achievementManager.stats.maxThrillIndex,
            metrics.thrillIndex || 0
        );
        this.achievementManager.stats.maxSafetyIndex = Math.max(
            this.achievementManager.stats.maxSafetyIndex,
            metrics.safetyIndex || 0
        );
        this.achievementManager.stats.maxComfortIndex = Math.max(
            this.achievementManager.stats.maxComfortIndex,
            metrics.comfortIndex || 0
        );

        // 检查完美平衡成就（高刺激指数和高安全指数）
        if (metrics.thrillIndex >= 70 && metrics.safetyIndex >= 80) {
            this.achievementManager.checkAndUnlock('perfect_balance', 1);
        }

        // 检查经济大师成就
        if (this.trackLengthLevel >= this.trackLengthLevels.length - 1) {
            this.achievementManager.checkAndUnlock('economy_master', 1);
        }

        // 检查电磁专家成就
        if (this.boostAccelerationLimit >= this.boostAccelerationCap &&
            this.brakeAccelerationLimit >= this.brakeAccelerationCap) {
            this.achievementManager.checkAndUnlock('electromagnetic_master', 1);
        }

        // 更新成就
        this.achievementManager.updateStats({});
    }

    /**
     * 处理成就解锁
     */
    handleAchievementUnlock(achievement) {
        console.log(`成就解锁: ${achievement.name} - ${achievement.description}`);

        // 奖励惊叫币
        if (achievement.reward > 0) {
            this.addScreamCoins(achievement.reward);
        }

        // 更新成就UI
        if (window.updateAchievementsUI) {
            window.updateAchievementsUI(this.achievementManager);
        }

        // 显示解锁通知
        if (window.showAchievementNotification) {
            window.showAchievementNotification(achievement);
        }
    }

    /**
     * 开始游戏
     */
    startGame() {
        if (this.gameState.running && !this.gameState.paused) {
            return; // 已经在运行中
        }

        this.gameState.running = true;
        this.gameState.paused = false;

        // 确保小车在运行
        if (this.car) {
            if (typeof this.car.resetProgress === 'function') {
                this.car.resetProgress(0);
            } else {
                this.car.position = 0;
            }
            if (this.car.physics) {
                this.car.physics.currentSpeed = Math.max(1.0, this.car.physics.currentSpeed || 5.0);
            }
        }

        // 同步到全局状态
        if (typeof window !== 'undefined') {
            window.gameRunning = true;
            window.gamePaused = false;
        }

        console.log('游戏已开始');
    }

    /**
     * 暂停游戏
     */
    pauseGame() {
        if (!this.gameState.running || this.gameState.paused) {
            return; // 未运行或已暂停
        }

        this.gameState.paused = true;

        // 同步到全局状态
        if (typeof window !== 'undefined') {
            window.gamePaused = true;
        }

        console.log('游戏已暂停');
    }

    /**
     * 继续游戏
     */
    resumeGame() {
        if (!this.gameState.running || !this.gameState.paused) {
            return; // 未运行或未暂停
        }

        this.gameState.paused = false;

        // 同步到全局状态
        if (typeof window !== 'undefined') {
            window.gamePaused = false;
        }

        console.log('游戏已继续');
    }

    /**
     * 重置游戏
     */
    resetGame() {
        this.gameState.running = false;
        this.gameState.paused = false;

        // 重置小车位置和物理状态
        if (this.car) {
            if (typeof this.car.resetProgress === 'function') {
                this.car.resetProgress(0);
            } else {
                this.car.position = 0;
            }
            if (this.car.physics) {
                this.car.physics.reset();
            }
        }

        // 重置圈数
        this.gameState.totalLaps = 0;

        // 同步到全局状态
        if (typeof window !== 'undefined') {
            window.gameRunning = false;
            window.gamePaused = false;
        }

        console.log('游戏已重置');
    }

    /**
     * 切换游戏运行状态（开始/暂停/继续）
     */
    toggleGame() {
        if (!this.gameState.running) {
            this.startGame();
        } else if (!this.gameState.paused) {
            this.pauseGame();
        } else {
            this.resumeGame();
        }
    }

    /**
     * 增加圈数
     */
    incrementLap() {
        this.gameState.totalLaps++;
        console.log(`完成第 ${this.gameState.totalLaps} 圈`);
    }

    /**
     * 获取游戏状态
     */
    getGameState() {
        return {
            running: this.gameState.running,
            paused: this.gameState.paused,
            totalLaps: this.gameState.totalLaps
        };
    }

    /**
     * 检查电磁系统使用情况
     */
    checkElectromagneticUsage() {
        if (!this.achievementManager) return;

        let boostsUsed = 0;
        let brakesUsed = 0;

        for (let i = 0; i < this.spline.pointCount; i++) {
            const point = this.spline.getControlPoint(i);
            if (point) {
                if (point.isElectromagneticBoost) {
                    boostsUsed++;
                }
                if (point.isElectromagneticBrake) {
                    brakesUsed++;
                }
            }
        }

        this.achievementManager.stats.electromagneticBoostsUsed = Math.max(
            this.achievementManager.stats.electromagneticBoostsUsed,
            boostsUsed
        );
        this.achievementManager.stats.electromagneticBrakesUsed = Math.max(
            this.achievementManager.stats.electromagneticBrakesUsed,
            brakesUsed
        );

        this.achievementManager.updateStats({});
    }
}

