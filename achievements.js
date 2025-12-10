/**
 * 成就系统
 */

/**
 * 成就类
 */
export class Achievement {
    constructor(id, name, description, category, icon = '🏆', reward = 0) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.category = category; // 'design', 'physics', 'progress', 'skill'
        this.icon = icon;
        this.reward = reward; // 惊叫币奖励
        this.unlocked = false;
        this.unlockedAt = null;
        this.progress = 0;
        this.target = 1;
    }
}

/**
 * 成就管理器
 */
export class AchievementManager {
    constructor() {
        this.achievements = [];
        this.onUnlockCallback = null;
        
        // 统计数据
        this.stats = {
            totalLaps: 0,
            totalCoinsEarned: 0,
            maxSpeedReached: 0,
            maxGForceReached: 0,
            maxHeightReached: 0,
            maxTrackLength: 0,
            maxControlPoints: 0,
            maxScreamIndex: 0,
            maxThrillIndex: 0,
            maxSafetyIndex: 0,
            maxComfortIndex: 0,
            consecutiveLaps: 0,
            bestConsecutiveLaps: 0,
            coasterTypesUnlocked: 1,
            electromagneticBoostsUsed: 0,
            electromagneticBrakesUsed: 0,
            tracksCreated: 0
        };
        
        this.initializeAchievements();
    }
    
    /**
     * 初始化所有成就
     */
    initializeAchievements() {
        // === 轨道设计类成就 ===
        this.achievements.push(new Achievement(
            'first_track',
            '第一座过山车',
            '创建你的第一座过山车',
            'design',
            '🎢',
            50
        ));
        
        this.achievements.push(new Achievement(
            'track_length_100',
            '轨道大师',
            '建造长度超过100米的轨道',
            'design',
            '📏',
            100
        ));
        
        this.achievements.push(new Achievement(
            'track_length_200',
            '轨道专家',
            '建造长度超过200米的轨道',
            'design',
            '📐',
            200
        ));
        
        this.achievements.push(new Achievement(
            'track_length_300',
            '轨道传奇',
            '建造长度超过300米的轨道',
            'design',
            '📊',
            300
        ));
        
        this.achievements.push(new Achievement(
            'control_points_10',
            '精细调整',
            '轨道控制点数量达到10个',
            'design',
            '🎯',
            80
        ));
        
        this.achievements.push(new Achievement(
            'control_points_20',
            '极致设计',
            '轨道控制点数量达到20个',
            'design',
            '✨',
            150
        ));
        
        this.achievements.push(new Achievement(
            'height_50',
            '攀登高峰',
            '轨道最高点达到50米',
            'design',
            '⛰️',
            120
        ));
        
        this.achievements.push(new Achievement(
            'height_100',
            '天空之城',
            '轨道最高点达到100米',
            'design',
            '☁️',
            250
        ));
        
        this.achievements.push(new Achievement(
            'height_150',
            '云端漫步',
            '轨道最高点达到150米',
            'design',
            '🚀',
            500
        ));
        
        // === 物理指标类成就 ===
        this.achievements.push(new Achievement(
            'speed_30',
            '速度与激情',
            '过山车速度达到30 m/s',
            'physics',
            '💨',
            100
        ));
        
        this.achievements.push(new Achievement(
            'speed_50',
            '极速狂飙',
            '过山车速度达到50 m/s',
            'physics',
            '⚡',
            200
        ));
        
        this.achievements.push(new Achievement(
            'speed_70',
            '突破音障',
            '过山车速度达到70 m/s',
            'physics',
            '🌪️',
            400
        ));
        
        this.achievements.push(new Achievement(
            'gforce_3',
            'G力挑战',
            '承受3G以上的加速度',
            'physics',
            '💪',
            100
        ));
        
        this.achievements.push(new Achievement(
            'gforce_5',
            'G力大师',
            '承受5G以上的加速度',
            'physics',
            '🔥',
            250
        ));
        
        this.achievements.push(new Achievement(
            'gforce_6',
            'G力极限',
            '承受6G以上的加速度',
            'physics',
            '💀',
            500
        ));
        
        this.achievements.push(new Achievement(
            'safety_90',
            '安全第一',
            '安全指数达到90以上',
            'physics',
            '🛡️',
            150
        ));
        
        this.achievements.push(new Achievement(
            'scream_80',
            '尖叫连连',
            '尖叫指数达到80以上',
            'physics',
            '😱',
            150
        ));
        
        this.achievements.push(new Achievement(
            'thrill_85',
            '刺激无限',
            '刺激指数达到85以上',
            'physics',
            '🎢',
            200
        ));
        
        this.achievements.push(new Achievement(
            'comfort_95',
            '舒适体验',
            '舒适度指数达到95以上',
            'physics',
            '😌',
            180
        ));
        
        // === 游戏进度类成就 ===
        this.achievements.push(new Achievement(
            'lap_1',
            '初次体验',
            '完成第一圈过山车',
            'progress',
            '🎠',
            50
        ));
        
        this.achievements.push(new Achievement(
            'lap_10',
            '常客',
            '累计完成10圈',
            'progress',
            '🎡',
            150
        ));
        
        this.achievements.push(new Achievement(
            'lap_50',
            '过山车爱好者',
            '累计完成50圈',
            'progress',
            '🎢',
            300
        ));
        
        this.achievements.push(new Achievement(
            'lap_100',
            '过山车大师',
            '累计完成100圈',
            'progress',
            '🏆',
            600
        ));
        
        this.achievements.push(new Achievement(
            'coins_1000',
            '小有积蓄',
            '累计获得1000惊叫币',
            'progress',
            '💰',
            100
        ));
        
        this.achievements.push(new Achievement(
            'coins_5000',
            '富甲一方',
            '累计获得5000惊叫币',
            'progress',
            '💎',
            300
        ));
        
        this.achievements.push(new Achievement(
            'coins_10000',
            '惊叫币大亨',
            '累计获得10000惊叫币',
            'progress',
            '👑',
            600
        ));
        
        this.achievements.push(new Achievement(
            'unlock_steel',
            '升级换代',
            '解锁钢架过山车',
            'progress',
            '🔩',
            200
        ));
        
        this.achievements.push(new Achievement(
            'unlock_modern',
            '现代科技',
            '解锁现代过山车',
            'progress',
            '⚙️',
            400
        ));
        
        this.achievements.push(new Achievement(
            'unlock_all',
            '全系解锁',
            '解锁所有过山车类型',
            'progress',
            '🌟',
            500
        ));
        
        // === 技巧类成就 ===
        this.achievements.push(new Achievement(
            'consecutive_5',
            '连续挑战',
            '连续完成5圈',
            'skill',
            '🔥',
            150
        ));
        
        this.achievements.push(new Achievement(
            'consecutive_10',
            '耐力之王',
            '连续完成10圈',
            'skill',
            '💯',
            300
        ));
        
        this.achievements.push(new Achievement(
            'use_electromagnetic',
            '电磁先驱',
            '使用电磁加速或减速系统',
            'skill',
            '⚡',
            100
        ));
        
        this.achievements.push(new Achievement(
            'perfect_balance',
            '完美平衡',
            '同时达到高刺激指数和高安全指数',
            'skill',
            '⚖️',
            250
        ));
        
        this.achievements.push(new Achievement(
            'economy_master',
            '经济大师',
            '轨道长度等级达到最高',
            'skill',
            '📈',
            200
        ));
        
        this.achievements.push(new Achievement(
            'electromagnetic_master',
            '电磁专家',
            '电磁加速和减速模块都达到上限',
            'skill',
            '🔋',
            300
        ));
        
        // 设置成就目标值
        this.setAchievementTargets();
    }
    
    /**
     * 设置成就目标值
     */
    setAchievementTargets() {
        const targets = {
            'track_length_100': 100,
            'track_length_200': 200,
            'track_length_300': 300,
            'control_points_10': 10,
            'control_points_20': 20,
            'height_50': 50,
            'height_100': 100,
            'height_150': 150,
            'speed_30': 30,
            'speed_50': 50,
            'speed_70': 70,
            'gforce_3': 3,
            'gforce_5': 5,
            'gforce_6': 6,
            'safety_90': 90,
            'scream_80': 80,
            'thrill_85': 85,
            'comfort_95': 95,
            'lap_1': 1,
            'lap_10': 10,
            'lap_50': 50,
            'lap_100': 100,
            'coins_1000': 1000,
            'coins_5000': 5000,
            'coins_10000': 10000,
            'consecutive_5': 5,
            'consecutive_10': 10
        };
        
        for (const ach of this.achievements) {
            if (targets[ach.id] !== undefined) {
                ach.target = targets[ach.id];
            }
        }
    }
    
    /**
     * 设置解锁回调
     */
    setOnUnlockCallback(callback) {
        this.onUnlockCallback = callback;
    }
    
    /**
     * 检查并解锁成就
     */
    checkAndUnlock(achievementId, progress = null) {
        const achievement = this.achievements.find(a => a.id === achievementId);
        if (!achievement || achievement.unlocked) {
            return false;
        }
        
        // 更新进度
        if (progress !== null) {
            achievement.progress = progress;
        }
        
        // 检查是否达到目标
        if (achievement.progress >= achievement.target) {
            achievement.unlocked = true;
            achievement.unlockedAt = new Date().toISOString();
            
            // 触发回调
            if (this.onUnlockCallback) {
                this.onUnlockCallback(achievement);
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * 更新统计数据并检查相关成就
     */
    updateStats(stats) {
        let unlockedAny = false;
        
        // 更新统计数据
        Object.assign(this.stats, stats);
        
        // 检查设计类成就
        if (this.stats.maxTrackLength >= 100) {
            if (this.checkAndUnlock('track_length_100', this.stats.maxTrackLength)) unlockedAny = true;
        }
        if (this.stats.maxTrackLength >= 200) {
            if (this.checkAndUnlock('track_length_200', this.stats.maxTrackLength)) unlockedAny = true;
        }
        if (this.stats.maxTrackLength >= 300) {
            if (this.checkAndUnlock('track_length_300', this.stats.maxTrackLength)) unlockedAny = true;
        }
        
        if (this.stats.maxControlPoints >= 10) {
            if (this.checkAndUnlock('control_points_10', this.stats.maxControlPoints)) unlockedAny = true;
        }
        if (this.stats.maxControlPoints >= 20) {
            if (this.checkAndUnlock('control_points_20', this.stats.maxControlPoints)) unlockedAny = true;
        }
        
        if (this.stats.maxHeightReached >= 50) {
            if (this.checkAndUnlock('height_50', this.stats.maxHeightReached)) unlockedAny = true;
        }
        if (this.stats.maxHeightReached >= 100) {
            if (this.checkAndUnlock('height_100', this.stats.maxHeightReached)) unlockedAny = true;
        }
        if (this.stats.maxHeightReached >= 150) {
            if (this.checkAndUnlock('height_150', this.stats.maxHeightReached)) unlockedAny = true;
        }
        
        // 检查物理类成就
        if (this.stats.maxSpeedReached >= 30) {
            if (this.checkAndUnlock('speed_30', this.stats.maxSpeedReached)) unlockedAny = true;
        }
        if (this.stats.maxSpeedReached >= 50) {
            if (this.checkAndUnlock('speed_50', this.stats.maxSpeedReached)) unlockedAny = true;
        }
        if (this.stats.maxSpeedReached >= 70) {
            if (this.checkAndUnlock('speed_70', this.stats.maxSpeedReached)) unlockedAny = true;
        }
        
        if (this.stats.maxGForceReached >= 3) {
            if (this.checkAndUnlock('gforce_3', this.stats.maxGForceReached)) unlockedAny = true;
        }
        if (this.stats.maxGForceReached >= 5) {
            if (this.checkAndUnlock('gforce_5', this.stats.maxGForceReached)) unlockedAny = true;
        }
        if (this.stats.maxGForceReached >= 6) {
            if (this.checkAndUnlock('gforce_6', this.stats.maxGForceReached)) unlockedAny = true;
        }
        
        if (this.stats.maxSafetyIndex >= 90) {
            if (this.checkAndUnlock('safety_90', this.stats.maxSafetyIndex)) unlockedAny = true;
        }
        if (this.stats.maxScreamIndex >= 80) {
            if (this.checkAndUnlock('scream_80', this.stats.maxScreamIndex)) unlockedAny = true;
        }
        if (this.stats.maxThrillIndex >= 85) {
            if (this.checkAndUnlock('thrill_85', this.stats.maxThrillIndex)) unlockedAny = true;
        }
        if (this.stats.maxComfortIndex >= 95) {
            if (this.checkAndUnlock('comfort_95', this.stats.maxComfortIndex)) unlockedAny = true;
        }
        
        // 检查进度类成就
        if (this.stats.totalLaps >= 1) {
            if (this.checkAndUnlock('lap_1', this.stats.totalLaps)) unlockedAny = true;
        }
        if (this.stats.totalLaps >= 10) {
            if (this.checkAndUnlock('lap_10', this.stats.totalLaps)) unlockedAny = true;
        }
        if (this.stats.totalLaps >= 50) {
            if (this.checkAndUnlock('lap_50', this.stats.totalLaps)) unlockedAny = true;
        }
        if (this.stats.totalLaps >= 100) {
            if (this.checkAndUnlock('lap_100', this.stats.totalLaps)) unlockedAny = true;
        }
        
        if (this.stats.totalCoinsEarned >= 1000) {
            if (this.checkAndUnlock('coins_1000', this.stats.totalCoinsEarned)) unlockedAny = true;
        }
        if (this.stats.totalCoinsEarned >= 5000) {
            if (this.checkAndUnlock('coins_5000', this.stats.totalCoinsEarned)) unlockedAny = true;
        }
        if (this.stats.totalCoinsEarned >= 10000) {
            if (this.checkAndUnlock('coins_10000', this.stats.totalCoinsEarned)) unlockedAny = true;
        }
        
        if (this.stats.coasterTypesUnlocked >= 2) {
            if (this.checkAndUnlock('unlock_steel', 1)) unlockedAny = true;
        }
        if (this.stats.coasterTypesUnlocked >= 3) {
            if (this.checkAndUnlock('unlock_modern', 1)) unlockedAny = true;
        }
        if (this.stats.coasterTypesUnlocked >= 3) {
            if (this.checkAndUnlock('unlock_all', 1)) unlockedAny = true;
        }
        
        // 检查技巧类成就
        if (this.stats.bestConsecutiveLaps >= 5) {
            if (this.checkAndUnlock('consecutive_5', this.stats.bestConsecutiveLaps)) unlockedAny = true;
        }
        if (this.stats.bestConsecutiveLaps >= 10) {
            if (this.checkAndUnlock('consecutive_10', this.stats.bestConsecutiveLaps)) unlockedAny = true;
        }
        
        if (this.stats.electromagneticBoostsUsed > 0 || this.stats.electromagneticBrakesUsed > 0) {
            if (this.checkAndUnlock('use_electromagnetic', 1)) unlockedAny = true;
        }
        
        return unlockedAny;
    }
    
    /**
     * 获取所有成就
     */
    getAllAchievements() {
        return this.achievements;
    }
    
    /**
     * 按分类获取成就
     */
    getAchievementsByCategory(category) {
        return this.achievements.filter(a => a.category === category);
    }
    
    /**
     * 获取已解锁成就数量
     */
    getUnlockedCount() {
        return this.achievements.filter(a => a.unlocked).length;
    }
    
    /**
     * 获取总成就数量
     */
    getTotalCount() {
        return this.achievements.length;
    }
    
    /**
     * 获取成就完成度
     */
    getCompletionRate() {
        return (this.getUnlockedCount() / this.getTotalCount()) * 100;
    }
    
    /**
     * 序列化成就状态
     */
    serialize() {
        return {
            achievements: this.achievements.map(a => ({
                id: a.id,
                unlocked: a.unlocked,
                unlockedAt: a.unlockedAt,
                progress: a.progress
            })),
            stats: { ...this.stats }
        };
    }
    
    /**
     * 加载成就状态
     */
    load(data) {
        if (!data) return;
        
        // 恢复统计数据
        if (data.stats) {
            Object.assign(this.stats, data.stats);
        }
        
        // 恢复成就状态
        if (data.achievements && Array.isArray(data.achievements)) {
            const achievementMap = new Map(data.achievements.map(a => [a.id, a]));
            
            for (const achievement of this.achievements) {
                const saved = achievementMap.get(achievement.id);
                if (saved) {
                    achievement.unlocked = !!saved.unlocked;
                    achievement.unlockedAt = saved.unlockedAt || null;
                    if (typeof saved.progress === 'number') {
                        achievement.progress = saved.progress;
                    }
                }
            }
        }
    }
}

