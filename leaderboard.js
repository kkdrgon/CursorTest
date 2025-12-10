/**
 * 排行榜管理器
 * 管理所有玩家的过山车轨道排行榜数据
 * 支持服务器API和本地存储两种模式
 */

const LEADERBOARD_STORAGE_KEY = 'webgl-rollercoaster:leaderboard:v1';
const PLAYER_NAME_KEY = 'webgl-rollercoaster:playerName:v1';

// 服务器API配置
const API_BASE_URL = 'http://localhost:3000/api'; // 修改为你的服务器地址
const USE_SERVER = true; // 是否使用服务器API（false则使用本地存储）

export class LeaderboardManager {
    constructor() {
        this.entries = [];
        this.playerName = this.loadPlayerName();
        this.useServer = USE_SERVER;
        this.apiBaseUrl = API_BASE_URL;
        this.serverAvailable = false;
        
        // 如果使用服务器，尝试加载数据
        if (this.useServer) {
            this.loadLeaderboardFromServer().catch(() => {
                console.warn('服务器不可用，使用本地存储模式');
                this.useServer = false;
                this.entries = this.loadLeaderboard();
            });
        } else {
            this.entries = this.loadLeaderboard();
        }
    }

    /**
     * 获取或生成玩家名称
     */
    getPlayerName() {
        if (!this.playerName) {
            // 生成随机玩家名称
            const adjectives = ['极速', '疯狂', '刺激', '惊险', '炫酷', '超级', '终极', '传奇'];
            const nouns = ['过山车', '飞车', '轨道', '狂飙', '闪电', '风暴', '雷霆'];
            const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
            const randomNum = Math.floor(Math.random() * 1000);
            this.playerName = `${randomAdj}${randomNoun}${randomNum}`;
            this.savePlayerName();
        }
        return this.playerName;
    }

    /**
     * 设置玩家名称
     */
    setPlayerName(name) {
        if (name && name.trim()) {
            this.playerName = name.trim();
            this.savePlayerName();
            return true;
        }
        return false;
    }

    /**
     * 保存玩家名称
     */
    savePlayerName() {
        try {
            localStorage.setItem(PLAYER_NAME_KEY, this.playerName);
        } catch (e) {
            console.warn('保存玩家名称失败:', e);
        }
    }

    /**
     * 加载玩家名称
     */
    loadPlayerName() {
        try {
            return localStorage.getItem(PLAYER_NAME_KEY) || null;
        } catch (e) {
            console.warn('加载玩家名称失败:', e);
            return null;
        }
    }

    /**
     * 提交轨道到排行榜
     * @param {Object} coasterData - 过山车数据
     * @returns {Promise<Object>} - 提交结果
     */
    async submitCoaster(coasterData) {
        if (!coasterData) {
            return { success: false, message: '数据无效' };
        }

        // 如果使用服务器，提交到服务器
        if (this.useServer) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/leaderboard/submit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playerName: this.getPlayerName(),
                        coasterValue: coasterData.coasterValue || 0,
                        popularity: coasterData.popularity || 0,
                        rating: coasterData.rating || 0,
                        laps: coasterData.laps || 0,
                        trackLength: coasterData.trackLength || 0,
                        coasterType: coasterData.coasterType || '未知',
                        maxSpeed: coasterData.maxSpeed || 0,
                        maxGForce: coasterData.maxGForce || 0,
                        screamIndex: coasterData.screamIndex || 0,
                        thrillIndex: coasterData.thrillIndex || 0,
                        comfortIndex: coasterData.comfortIndex || 0,
                        safetyIndex: coasterData.safetyIndex || 0,
                        trackData: coasterData.trackData || null
                    })
                });

                const result = await response.json();
                if (result.success) {
                    // 刷新本地缓存
                    await this.loadLeaderboardFromServer();
                }
                return result;
            } catch (error) {
                console.warn('服务器提交失败，使用本地存储:', error);
                // 降级到本地存储
                this.useServer = false;
            }
        }

        // 本地存储模式
        const entry = {
            id: this.generateId(),
            playerName: this.getPlayerName(),
            timestamp: Date.now(),
            coasterValue: coasterData.coasterValue || 0,
            popularity: coasterData.popularity || 0,
            rating: coasterData.rating || 0,
            laps: coasterData.laps || 0,
            trackLength: coasterData.trackLength || 0,
            coasterType: coasterData.coasterType || '未知',
            maxSpeed: coasterData.maxSpeed || 0,
            maxGForce: coasterData.maxGForce || 0,
            screamIndex: coasterData.screamIndex || 0,
            thrillIndex: coasterData.thrillIndex || 0,
            comfortIndex: coasterData.comfortIndex || 0,
            safetyIndex: coasterData.safetyIndex || 0,
            trackData: coasterData.trackData || null
        };

        // 检查是否已存在该玩家的记录
        const existingIndex = this.entries.findIndex(e => e.playerName === entry.playerName);
        
        if (existingIndex >= 0) {
            const existing = this.entries[existingIndex];
            if (entry.coasterValue > existing.coasterValue || 
                (entry.coasterValue === existing.coasterValue && entry.popularity > existing.popularity)) {
                this.entries[existingIndex] = entry;
            } else {
                return { success: false, message: '已有更好的记录' };
            }
        } else {
            this.entries.push(entry);
        }

        // 限制排行榜大小
        if (this.entries.length > 100) {
            this.entries.sort((a, b) => {
                if (b.coasterValue !== a.coasterValue) {
                    return b.coasterValue - a.coasterValue;
                }
                return b.popularity - a.popularity;
            });
            this.entries = this.entries.slice(0, 100);
        }

        this.saveLeaderboard();

        return { 
            success: true, 
            message: '已提交到排行榜',
            rank: this.getRank(entry.id)
        };
    }

    /**
     * 生成唯一ID
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 从服务器加载排行榜
     */
    async loadLeaderboardFromServer() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/leaderboard?sortBy=value&limit=200`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            if (result.success) {
                this.entries = result.data || [];
                this.serverAvailable = true;
                return this.entries;
            }
            throw new Error(result.message || '获取排行榜失败');
        } catch (error) {
            console.warn('从服务器加载排行榜失败:', error);
            this.serverAvailable = false;
            throw error;
        }
    }

    /**
     * 获取排行榜（按价值排序）
     * @param {string} sortBy - 排序方式: 'value', 'popularity', 'rating'
     * @param {number} limit - 限制返回数量
     * @returns {Promise<Array>} - 排行榜数据
     */
    async getLeaderboard(sortBy = 'value', limit = 50) {
        // 如果使用服务器，从服务器获取（服务器端已排序）
        if (this.useServer) {
            try {
                const response = await fetch(`${this.apiBaseUrl}/leaderboard?sortBy=${sortBy}&limit=${limit}`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        this.entries = result.data || [];
                        this.serverAvailable = true;
                        return this.entries;
                    }
                }
            } catch (error) {
                console.warn('从服务器获取排行榜失败，使用本地数据:', error);
                this.serverAvailable = false;
            }
        }

        // 本地存储模式或服务器失败时的降级方案
        let sorted = [...this.entries];
        
        switch (sortBy) {
            case 'popularity':
                sorted.sort((a, b) => {
                    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
                    return b.coasterValue - a.coasterValue;
                });
                break;
            case 'rating':
                sorted.sort((a, b) => {
                    if (b.rating !== a.rating) return b.rating - a.rating;
                    return b.coasterValue - a.coasterValue;
                });
                break;
            case 'value':
            default:
                sorted.sort((a, b) => {
                    if (b.coasterValue !== a.coasterValue) return b.coasterValue - a.coasterValue;
                    return b.popularity - a.popularity;
                });
                break;
        }

        return sorted.slice(0, limit);
    }

    /**
     * 获取指定记录的排名
     */
    getRank(entryId) {
        const sorted = this.getLeaderboard('value', 1000);
        const index = sorted.findIndex(e => e.id === entryId);
        return index >= 0 ? index + 1 : null;
    }

    /**
     * 获取当前玩家的最佳记录
     */
    getPlayerBest() {
        const playerEntries = this.entries.filter(e => e.playerName === this.getPlayerName());
        if (playerEntries.length === 0) return null;
        
        return playerEntries.reduce((best, current) => {
            if (current.coasterValue > best.coasterValue ||
                (current.coasterValue === best.coasterValue && current.popularity > best.popularity)) {
                return current;
            }
            return best;
        }, playerEntries[0]);
    }

    /**
     * 保存排行榜到本地存储
     */
    saveLeaderboard() {
        try {
            localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(this.entries));
        } catch (e) {
            console.warn('保存排行榜失败:', e);
        }
    }

    /**
     * 从本地存储加载排行榜
     */
    loadLeaderboard() {
        try {
            const data = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('加载排行榜失败:', e);
        }
        return [];
    }

    /**
     * 清空排行榜（用于测试或重置）
     */
    clearLeaderboard() {
        this.entries = [];
        this.saveLeaderboard();
    }

    /**
     * 获取排行榜统计信息
     */
    getStats() {
        return {
            totalEntries: this.entries.length,
            uniquePlayers: new Set(this.entries.map(e => e.playerName)).size,
            averageValue: this.entries.length > 0 
                ? this.entries.reduce((sum, e) => sum + e.coasterValue, 0) / this.entries.length 
                : 0,
            averagePopularity: this.entries.length > 0
                ? this.entries.reduce((sum, e) => sum + e.popularity, 0) / this.entries.length
                : 0
        };
    }
}

