/**
 * 过山车排行榜服务器
 * 使用 Node.js + Express 实现
 * 
 * 安装依赖：
 * npm install express cors body-parser
 * 
 * 启动服务器：
 * node server.js
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'leaderboard-data.json');

// 中间件
app.use(cors()); // 允许跨域请求
app.use(bodyParser.json({ limit: '10mb' })); // 支持JSON数据，限制10MB
app.use(express.static(__dirname)); // 提供静态文件服务

// 初始化数据文件
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = {
            entries: [],
            lastUpdate: Date.now()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        console.log('创建排行榜数据文件:', DATA_FILE);
    }
}

// 读取数据
function readData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取数据文件失败:', error);
    }
    return { entries: [], lastUpdate: Date.now() };
}

// 保存数据
function saveData(data) {
    try {
        data.lastUpdate = Date.now();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存数据文件失败:', error);
        return false;
    }
}

// 生成唯一ID
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 初始化
initDataFile();

// API路由

/**
 * 获取排行榜
 * GET /api/leaderboard
 * 查询参数：
 *   - sortBy: 'value' | 'popularity' | 'rating' (默认: 'value')
 *   - limit: 数量限制 (默认: 50)
 */
app.get('/api/leaderboard', (req, res) => {
    try {
        const data = readData();
        let entries = [...data.entries];
        
        const sortBy = req.query.sortBy || 'value';
        const limit = parseInt(req.query.limit) || 50;
        
        // 服务器端排序
        switch (sortBy) {
            case 'popularity':
                entries.sort((a, b) => {
                    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
                    return b.coasterValue - a.coasterValue;
                });
                break;
            case 'rating':
                entries.sort((a, b) => {
                    if (b.rating !== a.rating) return b.rating - a.rating;
                    return b.coasterValue - a.coasterValue;
                });
                break;
            case 'value':
            default:
                entries.sort((a, b) => {
                    if (b.coasterValue !== a.coasterValue) return b.coasterValue - a.coasterValue;
                    return b.popularity - a.popularity;
                });
                break;
        }
        
        // 限制返回数量
        entries = entries.slice(0, limit);
        
        res.json({
            success: true,
            data: entries,
            total: data.entries.length,
            sortBy: sortBy
        });
    } catch (error) {
        console.error('获取排行榜失败:', error);
        res.status(500).json({
            success: false,
            message: '获取排行榜失败',
            error: error.message
        });
    }
});

/**
 * 提交过山车数据到排行榜
 * POST /api/leaderboard/submit
 * Body: {
 *   playerName: string,
 *   coasterValue: number,
 *   popularity: number,
 *   rating: number,
 *   laps: number,
 *   trackLength: number,
 *   coasterType: string,
 *   maxSpeed: number,
 *   maxGForce: number,
 *   screamIndex: number,
 *   thrillIndex: number,
 *   comfortIndex: number,
 *   safetyIndex: number,
 *   trackData: object (可选)
 * }
 */
app.post('/api/leaderboard/submit', (req, res) => {
    try {
        const data = readData();
        const submission = req.body;
        
        // 验证必需字段
        if (!submission.playerName || typeof submission.coasterValue !== 'number') {
            return res.status(400).json({
                success: false,
                message: '缺少必需字段'
            });
        }
        
        // 创建新记录
        const entry = {
            id: generateId(),
            playerName: submission.playerName.trim(),
            timestamp: Date.now(),
            coasterValue: submission.coasterValue || 0,
            popularity: submission.popularity || 0,
            rating: submission.rating || 0,
            laps: submission.laps || 0,
            trackLength: submission.trackLength || 0,
            coasterType: submission.coasterType || '未知',
            maxSpeed: submission.maxSpeed || 0,
            maxGForce: submission.maxGForce || 0,
            screamIndex: submission.screamIndex || 0,
            thrillIndex: submission.thrillIndex || 0,
            comfortIndex: submission.comfortIndex || 0,
            safetyIndex: submission.safetyIndex || 0,
            trackData: submission.trackData || null
        };
        
        // 检查是否已存在该玩家的记录
        const existingIndex = data.entries.findIndex(e => e.playerName === entry.playerName);
        
        if (existingIndex >= 0) {
            // 如果新记录更好，则更新
            const existing = data.entries[existingIndex];
            if (entry.coasterValue > existing.coasterValue || 
                (entry.coasterValue === existing.coasterValue && entry.popularity > existing.popularity)) {
                data.entries[existingIndex] = entry;
            } else {
                return res.json({
                    success: false,
                    message: '已有更好的记录',
                    rank: getRank(data.entries, existing.id, 'value')
                });
            }
        } else {
            // 添加新记录
            data.entries.push(entry);
        }
        
        // 限制排行榜大小（最多保留200条记录）
        if (data.entries.length > 200) {
            data.entries.sort((a, b) => {
                if (b.coasterValue !== a.coasterValue) return b.coasterValue - a.coasterValue;
                return b.popularity - a.popularity;
            });
            data.entries = data.entries.slice(0, 200);
        }
        
        // 保存数据
        if (saveData(data)) {
            const rank = getRank(data.entries, entry.id, 'value');
            res.json({
                success: true,
                message: '已提交到排行榜',
                rank: rank,
                entry: entry
            });
        } else {
            res.status(500).json({
                success: false,
                message: '保存数据失败'
            });
        }
    } catch (error) {
        console.error('提交排行榜失败:', error);
        res.status(500).json({
            success: false,
            message: '提交失败',
            error: error.message
        });
    }
});

/**
 * 获取指定玩家的排名
 * GET /api/leaderboard/rank/:playerName
 */
app.get('/api/leaderboard/rank/:playerName', (req, res) => {
    try {
        const data = readData();
        const playerName = decodeURIComponent(req.params.playerName);
        
        const entry = data.entries.find(e => e.playerName === playerName);
        if (!entry) {
            return res.json({
                success: false,
                message: '未找到该玩家的记录'
            });
        }
        
        const rank = getRank(data.entries, entry.id, 'value');
        res.json({
            success: true,
            rank: rank,
            entry: entry
        });
    } catch (error) {
        console.error('获取排名失败:', error);
        res.status(500).json({
            success: false,
            message: '获取排名失败',
            error: error.message
        });
    }
});

/**
 * 获取排行榜统计信息
 * GET /api/leaderboard/stats
 */
app.get('/api/leaderboard/stats', (req, res) => {
    try {
        const data = readData();
        const entries = data.entries;
        
        const stats = {
            totalEntries: entries.length,
            uniquePlayers: new Set(entries.map(e => e.playerName)).size,
            averageValue: entries.length > 0 
                ? entries.reduce((sum, e) => sum + e.coasterValue, 0) / entries.length 
                : 0,
            averagePopularity: entries.length > 0
                ? entries.reduce((sum, e) => sum + e.popularity, 0) / entries.length
                : 0,
            topValue: entries.length > 0 
                ? Math.max(...entries.map(e => e.coasterValue))
                : 0,
            topPopularity: entries.length > 0
                ? Math.max(...entries.map(e => e.popularity))
                : 0
        };
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        res.status(500).json({
            success: false,
            message: '获取统计信息失败',
            error: error.message
        });
    }
});

/**
 * 辅助函数：计算排名
 */
function getRank(entries, entryId, sortBy = 'value') {
    let sorted = [...entries];
    
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
    
    const index = sorted.findIndex(e => e.id === entryId);
    return index >= 0 ? index + 1 : null;
}

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🚀 过山车排行榜服务器已启动！`);
    console.log(`📡 服务器地址: http://localhost:${PORT}`);
    console.log(`📊 API文档:`);
    console.log(`   GET  /api/leaderboard - 获取排行榜`);
    console.log(`   POST /api/leaderboard/submit - 提交数据`);
    console.log(`   GET  /api/leaderboard/rank/:playerName - 获取玩家排名`);
    console.log(`   GET  /api/leaderboard/stats - 获取统计信息`);
    console.log(`\n💾 数据文件: ${DATA_FILE}\n`);
});

