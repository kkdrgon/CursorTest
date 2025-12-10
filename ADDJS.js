/**
 * ADDJS类 - 用于解析游戏消息并管理怪物死亡信息
 */
class ADDJS {
    constructor() {
        this.mapNameList = new Map();
        this.deathRecords = new Map();
        this.lastTime = Date.now();
        this.mapNameList.set('筑基初期', 600000);
        for (const [mapName, reviveTime] of this.mapNameList) 
            this.deathRecords.set(mapName, []);
    }
    onMessage(t) {
        // 如果消息不包含'死亡，掉落：'，检查是否包含'回城'
        if (!t.Msg.includes('死亡，掉落：')) {
            if (t.Msg.includes('回城')) return;
        }
        
        const tmsg = [...t.Msg.matchAll(/{([^|]+)\\|[^}]+}/g)].map(match => match[1]);
        if (tmsg[6] !== '白虎之魂') return;
        const mapName = tmsg[0];
        if (this.deathRecords.has(mapName)) {
            const reviveTime = this.mapNameList.get(mapName);
            const reviveTimestamp = Date.now() + reviveTime;
            this.deathRecords.get(mapName).push(reviveTimestamp);
        }
        
        // 每20秒清理一次已复活的记录
        if (this.lastTime + 20000 < Date.now()) {
            const mi = this.cleanupRevived();
            this.lastTime = Date.now();
            // mi 是 Map，包含每个地图的活跃记录数
            // 可以在这里处理清理后的信息
        }
    }

    cleanupRevived() {
        const now = Date.now();
        const mapsToClean = Array.from(this.deathRecords.keys());
        const mapsInfo = new Map();

        mapsToClean.forEach(map => {
            const records = this.deathRecords.get(map);
            const activeRecords = records.filter(reviveTime => reviveTime > now);
            if (activeRecords.length === 0) {
                this.deathRecords.delete(map);
            } else {
                this.deathRecords.set(map, activeRecords);
            }
            mapsInfo.set(map, activeRecords.length);
        });
        return mapsInfo;
    }

    getNextMap() {
        const mi = this.cleanupRevived();
        let minDeadCount = Infinity;
        let bestMap = null;
        
        // 遍历所有在mapNameList中的地图
        for (const [mapName, reviveTime] of this.mapNameList) {
            // 获取该地图的死亡数量（如果不在mi中，说明没有死亡记录，死亡数量为0）
            const deadCount = mi.has(mapName) ? mi.get(mapName) : 0;
            
            // 找死亡数量最少的地图（死亡数量越少，怪物越多）
            if (deadCount < minDeadCount) {
                minDeadCount = deadCount;
                bestMap = mapName;
            }
        }
        
        return bestMap;
    }

    /**
     * 获取指定地图的存活怪物数
     * @param {string} mapName - 地图名称
     * @returns {number} 存活怪物数
     */
    getAliveCount(mapName) {
        if (!this.deathRecords.has(mapName)) {
            return 0;
        }
        
        const now = Date.now();
        const records = this.deathRecords.get(mapName);
        const deadCount = records.filter(reviveTime => reviveTime > now).length;
        return records.length - deadCount;
    }

    /**
     * 获取指定地图的死亡怪物数（未复活）
     * @param {string} mapName - 地图名称
     * @returns {number} 死亡怪物数
     */
    getDeadCount(mapName) {
        if (!this.deathRecords.has(mapName)) {
            return 0;
        }
        
        const now = Date.now();
        const records = this.deathRecords.get(mapName);
        return records.filter(reviveTime => reviveTime > now).length;
    }

    /**
     * 获取所有地图的统计信息
     * @returns {Object} 地图统计信息
     */
    getMapStatistics() {
        const stats = {};
        const now = Date.now();
        
        for (const [mapName, records] of this.deathRecords.entries()) {
            const deadCount = records.filter(reviveTime => reviveTime > now).length;
            const aliveCount = records.length - deadCount;
            
            stats[mapName] = {
                total: records.length,
                alive: aliveCount,
                dead: deadCount,
                reviveTime: this.mapNameList.get(mapName) || 0
            };
        }
        
        return stats;
    }

    /**
     * 添加新地图
     * @param {string} mapName - 地图名称
     * @param {number} reviveTime - 复活时间（毫秒）
     */
    addMap(mapName, reviveTime) {
        this.mapNameList.set(mapName, reviveTime);
        if (!this.deathRecords.has(mapName)) {
            this.deathRecords.set(mapName, []);
        }
    }

    /**
     * 清除所有记录
     */
    clear() {
        for (const [mapName] of this.mapNameList) {
            this.deathRecords.set(mapName, []);
        }
        this.lastTime = Date.now();
    }
}

// 如果在Node.js环境中，导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ADDJS;
}
