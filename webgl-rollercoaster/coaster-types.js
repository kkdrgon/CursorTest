/**
 * 过山车类型系统
 */
export class CoasterType {
    constructor(name, displayName, description, maxHeight, maxSpeed, maxGForce, features) {
        this.name = name; // 内部名称
        this.displayName = displayName; // 显示名称
        this.description = description; // 描述
        this.maxHeight = maxHeight; // 最大高度（米）
        this.maxSpeed = maxSpeed; // 最大速度（m/s）
        this.maxGForce = maxGForce; // 最大G力
        this.features = features; // 特性列表
        this.unlocked = false; // 是否已解锁
    }
}

/**
 * 过山车类型管理器
 */
export class CoasterTypeManager {
    constructor() {
        this.types = [
            new CoasterType(
                'wooden',
                '木架过山车',
                '经典的木制过山车，只能通过牵引到顶部，然后自由滑下。简单但刺激！',
                10, // 最大高度10米
                10, // 最大速度10 m/s
                2, // 最大G力2G
                ['牵引到顶', '自由滑下']
            ),
            new CoasterType(
                'steel',
                '钢架过山车',
                '坚固的钢制过山车，可以建造更高的轨道和更快的速度，带来更刺激的体验！',
                50, // 最大高度50米
                50, // 最大速度50 m/s
                5.0, // 最大G力5.0G
                ['牵引到顶', '自由滑下', '更高速度', '更高高度']
            ),
            new CoasterType(
                'modern',
                '现代过山车',
                '先进的现代过山车，配备电磁牵引系统，可以在轨道任意位置加速或减速，实现更复杂的轨道设计！',
                200, // 最大高度200米
                100, // 最大速度100 m/s
                9.0, // 最大G力9.0G
                ['牵引到顶', '自由滑下', '电磁加速', '电磁减速', '更高速度', '更高高度']
            )
        ];
        
        // 默认解锁第一个类型
        this.types[0].unlocked = true;
        this.currentType = this.types[0];
    }
    
    /**
     * 获取当前过山车类型
     */
    getCurrentType() {
        return this.currentType;
    }
    
    /**
     * 设置当前过山车类型
     */
    setCurrentType(typeName) {
        const type = this.types.find(t => t.name === typeName);
        if (type && type.unlocked) {
            this.currentType = type;
            return true;
        }
        return false;
    }
    
    /**
     * 解锁下一个类型
     */
    unlockNextType() {
        const currentIndex = this.types.findIndex(t => t === this.currentType);
        if (currentIndex >= 0 && currentIndex < this.types.length - 1) {
            const nextType = this.types[currentIndex + 1];
            nextType.unlocked = true;
            return nextType;
        }
        return null;
    }
    
    /**
     * 检查是否可以升级
     */
    canUpgrade() {
        const currentIndex = this.types.findIndex(t => t === this.currentType);
        return currentIndex >= 0 && currentIndex < this.types.length - 1;
    }
    
    /**
     * 获取所有类型
     */
    getAllTypes() {
        return this.types;
    }
    
    /**
     * 检查类型是否支持某个特性
     */
    supportsFeature(feature) {
        return this.currentType.features.includes(feature);
    }

    /**
     * 导出当前类型系统状态
     */
    serializeState() {
        return {
            currentType: this.currentType ? this.currentType.name : null,
            unlockedTypes: this.types.filter(type => type.unlocked).map(type => type.name)
        };
    }

    /**
     * 使用保存的数据恢复类型解锁状态
     * @param {Object} state
     */
    loadState(state) {
        if (!state) {
            // 如果没有状态，确保使用默认的木架过山车
            this.currentType = this.types[0]; // 木架过山车
            return;
        }

        const unlockedSet = new Set(
            Array.isArray(state.unlockedTypes) && state.unlockedTypes.length > 0
                ? state.unlockedTypes
                : [this.types[0].name]
        );

        this.types.forEach((type, index) => {
            type.unlocked = unlockedSet.has(type.name) || index === 0;
        });

        // 尝试设置保存的类型，如果失败则使用木架过山车作为默认值
        if (!this.setCurrentType(state.currentType)) {
            const fallback = this.types.find(type => type.unlocked) || this.types[0];
            this.currentType = fallback;
            console.log('加载存档类型失败，使用默认类型:', fallback.name);
        } else {
            console.log('从存档加载类型成功:', this.currentType.name);
        }
    }
}

