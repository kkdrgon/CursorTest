/**
 * 过山车公园管理器（简化版）
 * 仅保留基本的坐标转换功能，移除购买和边界限制
 */

export class ParkManager {
    constructor() {
        // 网格大小（用于坐标转换，单位：米）
        this.gridSize = 1;
        
        // 公园中心位置（世界坐标）
        this.centerX = 0;
        this.centerZ = 0;
    }
    
    /**
     * 获取世界坐标对应的网格坐标
     * @param {number} worldX - 世界X坐标
     * @param {number} worldZ - 世界Z坐标
     * @returns {{x: number, z: number}} 网格坐标
     */
    worldToGrid(worldX, worldZ) {
        const gridX = Math.floor((worldX - this.centerX) / this.gridSize);
        const gridZ = Math.floor((worldZ - this.centerZ) / this.gridSize);
        return { x: gridX, z: gridZ };
    }
    
    /**
     * 获取网格坐标对应的世界坐标（网格中心）
     * @param {number} gridX - 网格X坐标
     * @param {number} gridZ - 网格Z坐标
     * @returns {{x: number, z: number}} 世界坐标
     */
    gridToWorld(gridX, gridZ) {
        const worldX = gridX * this.gridSize + this.gridSize / 2 + this.centerX;
        const worldZ = gridZ * this.gridSize + this.gridSize / 2 + this.centerZ;
        return { x: worldX, z: worldZ };
    }
    
    /**
     * 序列化公园数据（用于保存，简化版）
     * @returns {Object}
     */
    serialize() {
        return {
            centerX: this.centerX,
            centerZ: this.centerZ
        };
    }
    
    /**
     * 反序列化公园数据（用于加载，简化版）
     * @param {Object} data
     */
    deserialize(data) {
        if (data.centerX !== undefined) {
            this.centerX = data.centerX;
        }
        if (data.centerZ !== undefined) {
            this.centerZ = data.centerZ;
        }
    }
}

