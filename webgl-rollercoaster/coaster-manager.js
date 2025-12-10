/**
 * 过山车管理器
 * 管理多个过山车实例
 */

import { BezierSpline } from './bezier-spline.js';
import { TrackGenerator } from './track-generator.js';
import { Car } from './car.js';
import { CoasterTypeManager } from './coaster-types.js';

export class CoasterManager {
    constructor(parkManager) {
        this.parkManager = parkManager;
        this.coasters = []; // 过山车列表
        this.currentCoasterId = null; // 当前选中的过山车ID
        this.nextId = 1; // 下一个可用的ID
    }
    
    /**
     * 创建新的过山车
     * @param {string} coasterType - 过山车类型 ('wooden', 'steel', 'modern')
     * @param {Object} position - 初始位置 {x, y, z}
     * @param {Object} savedTrackData - 可选的保存的轨道数据 {editSpline, spline, coasterTypes}
     * @returns {string} 过山车ID
     */
    createCoaster(coasterType = 'wooden', position = { x: 0, y: 5, z: 0 }, savedTrackData = null) {
        const id = `coaster-${this.nextId++}`;
        
        // 创建过山车数据
        const coaster = {
            id: id,
            name: `过山车 ${this.coasters.length + 1}`,
            type: coasterType,
            position: { ...position }, // 轨道的位置偏移
            rotation: 0, // 轨道的旋转角度（绕Y轴，弧度）
            
            // 轨道数据
            gameSpline: new BezierSpline(),
            spline: new BezierSpline(), // 编辑用的预编辑轨道
            
            // 过山车类型管理器
            coasterTypeManager: new CoasterTypeManager(),
            
            // 轨道生成器
            trackGenerator: null,
            
            // 小车
            car: null,
            
            // 游戏状态
            gameState: {
                running: false,
                paused: false,
                totalLaps: 0
            },
            
            // 创建时间
            createdAt: Date.now()
        };
        
        // 设置过山车类型
        coaster.coasterTypeManager.setCurrentType(coasterType);
        
        // 如果有保存的轨道数据，加载它
        if (savedTrackData) {
            const splineData = savedTrackData.editSpline || savedTrackData.spline;
            if (splineData) {
                // 加载到编辑轨道和游戏轨道
                coaster.spline.loadFromData(splineData);
                coaster.gameSpline.loadFromData(splineData);
            }
            
            // 如果有保存的过山车类型，使用它
            if (savedTrackData.coasterTypes && savedTrackData.coasterTypes.currentType) {
                coaster.coasterTypeManager.setCurrentType(savedTrackData.coasterTypes.currentType);
                coaster.type = savedTrackData.coasterTypes.currentType;
            }
        }
        
        // 创建轨道生成器
        coaster.trackGenerator = new TrackGenerator(coaster.gameSpline, coaster.coasterTypeManager);
        coaster.trackGenerator.clearGeneratorCache();
        
        // 创建小车
        coaster.car = new Car(coaster.gameSpline, coaster.trackGenerator, coaster.coasterTypeManager);
        
        // 添加到列表
        this.coasters.push(coaster);
        
        // 如果这是第一个过山车，设置为当前选中
        if (this.currentCoasterId === null) {
            this.currentCoasterId = id;
        }
        
        return id;
    }
    
    /**
     * 删除过山车
     * @param {string} id - 过山车ID
     * @returns {boolean} 是否删除成功
     */
    deleteCoaster(id) {
        const index = this.coasters.findIndex(c => c.id === id);
        if (index === -1) {
            return false;
        }
        
        // 如果删除的是当前选中的过山车，切换到其他过山车
        if (this.currentCoasterId === id) {
            this.coasters.splice(index, 1);
            if (this.coasters.length > 0) {
                this.currentCoasterId = this.coasters[0].id;
            } else {
                this.currentCoasterId = null;
            }
        } else {
            this.coasters.splice(index, 1);
        }
        
        return true;
    }
    
    /**
     * 获取过山车
     * @param {string} id - 过山车ID
     * @returns {Object|null}
     */
    getCoaster(id) {
        return this.coasters.find(c => c.id === id) || null;
    }
    
    /**
     * 获取当前选中的过山车
     * @returns {Object|null}
     */
    getCurrentCoaster() {
        if (this.currentCoasterId === null) {
            return null;
        }
        return this.getCoaster(this.currentCoasterId);
    }
    
    /**
     * 设置当前选中的过山车
     * @param {string} id - 过山车ID
     * @returns {boolean} 是否设置成功
     */
    setCurrentCoaster(id) {
        const coaster = this.getCoaster(id);
        if (!coaster) {
            return false;
        }
        this.currentCoasterId = id;
        return true;
    }
    
    /**
     * 获取所有过山车
     * @returns {Array}
     */
    getAllCoasters() {
        return [...this.coasters];
    }
    
    /**
     * 移动过山车位置
     * @param {string} id - 过山车ID
     * @param {Object} delta - 位置增量 {x, y, z}
     * @returns {boolean} 是否移动成功
     */
    moveCoaster(id, delta) {
        const coaster = this.getCoaster(id);
        if (!coaster) {
            return false;
        }
        
        // 更新位置
        coaster.position.x += delta.x || 0;
        coaster.position.y += delta.y || 0;
        coaster.position.z += delta.z || 0;
        
        return true;
    }
    
    /**
     * 旋转过山车
     * @param {string} id - 过山车ID
     * @param {number} angle - 旋转角度（弧度）
     * @param {Object} center - 旋转中心 {x, y, z}
     * @returns {boolean} 是否旋转成功
     */
    rotateCoaster(id, angle, center = null) {
        const coaster = this.getCoaster(id);
        if (!coaster) {
            return false;
        }
        
        // 如果没有指定旋转中心，使用过山车位置
        if (!center) {
            center = { ...coaster.position };
        }
        
        // 更新旋转角度
        coaster.rotation += angle;
        
        return true;
    }
    
    /**
     * 设置过山车位置
     * @param {string} id - 过山车ID
     * @param {Object} position - 新位置 {x, y, z}
     * @returns {boolean} 是否设置成功
     */
    setCoasterPosition(id, position) {
        const coaster = this.getCoaster(id);
        if (!coaster) {
            return false;
        }
        
        coaster.position = { ...position };
        
        return true;
    }
    
    /**
     * 设置过山车旋转
     * @param {string} id - 过山车ID
     * @param {number} rotation - 旋转角度（弧度）
     * @returns {boolean} 是否设置成功
     */
    setCoasterRotation(id, rotation) {
        const coaster = this.getCoaster(id);
        if (!coaster) {
            return false;
        }
        
        coaster.rotation = rotation;
        
        return true;
    }
    
    /**
     * 更新所有运行中的过山车
     * @param {number} deltaTime - 时间增量（秒）
     */
    updateAll(deltaTime) {
        for (const coaster of this.coasters) {
            if (coaster.gameState.running && !coaster.gameState.paused) {
                coaster.car.update(deltaTime);
            }
        }
    }
    
    /**
     * 序列化所有过山车数据（用于保存）
     * @returns {Array}
     */
    serialize() {
        return this.coasters.map(coaster => ({
            id: coaster.id,
            name: coaster.name,
            type: coaster.type,
            position: coaster.position,
            rotation: coaster.rotation,
            gameSpline: coaster.gameSpline.serialize(),
            spline: coaster.spline.serialize(),
            gameState: coaster.gameState,
            createdAt: coaster.createdAt
        }));
    }
    
    /**
     * 反序列化过山车数据（用于加载）
     * @param {Array} data
     */
    deserialize(data) {
        this.coasters = [];
        this.nextId = 1;
        
        for (const item of data) {
            const coaster = {
                id: item.id,
                name: item.name || `过山车 ${this.coasters.length + 1}`,
                type: item.type || 'wooden',
                position: item.position || { x: 0, y: 5, z: 0 },
                rotation: item.rotation || 0,
                gameSpline: new BezierSpline(),
                spline: new BezierSpline(),
                coasterTypeManager: new CoasterTypeManager(),
                trackGenerator: null,
                car: null,
                gameState: item.gameState || {
                    running: false,
                    paused: false,
                    totalLaps: 0
                },
                createdAt: item.createdAt || Date.now()
            };
            
            // 恢复轨道数据
            if (item.gameSpline) {
                coaster.gameSpline.loadFromData(item.gameSpline);
            }
            if (item.spline) {
                coaster.spline.loadFromData(item.spline);
            }
            
            // 设置过山车类型
            coaster.coasterTypeManager.setCurrentType(coaster.type);
            
            // 创建轨道生成器和小车
            coaster.trackGenerator = new TrackGenerator(coaster.gameSpline, coaster.coasterTypeManager);
            coaster.trackGenerator.clearGeneratorCache();
            coaster.car = new Car(coaster.gameSpline, coaster.trackGenerator, coaster.coasterTypeManager);
            
            this.coasters.push(coaster);
            
            // 更新下一个ID
            const idNum = parseInt(item.id.split('-')[1]) || 0;
            if (idNum >= this.nextId) {
                this.nextId = idNum + 1;
            }
        }
        
        // 设置当前选中的过山车
        if (this.coasters.length > 0 && this.currentCoasterId === null) {
            this.currentCoasterId = this.coasters[0].id;
        }
    }
}

