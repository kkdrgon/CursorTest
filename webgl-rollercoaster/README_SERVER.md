# 过山车排行榜服务器

## 安装和启动

### 1. 安装依赖

```bash
cd webgl-rollercoaster
npm install
```

### 2. 启动服务器

```bash
npm start
```

或者：

```bash
node server.js
```

服务器将在 `http://localhost:3000` 启动。

## API 接口

### 获取排行榜
```
GET /api/leaderboard?sortBy=value&limit=50
```

参数：
- `sortBy`: 排序方式，可选值：`value`（价值）、`popularity`（人气）、`rating`（评分），默认：`value`
- `limit`: 返回数量限制，默认：50

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "1234567890-abc123",
      "playerName": "玩家名称",
      "timestamp": 1234567890000,
      "coasterValue": 1000,
      "popularity": 500,
      "rating": 85.5,
      "laps": 10,
      "trackLength": 500,
      "coasterType": "现代过山车",
      "maxSpeed": 50,
      "maxGForce": 5.0,
      "screamIndex": 80,
      "thrillIndex": 90,
      "comfortIndex": 85,
      "safetyIndex": 87
    }
  ],
  "total": 100,
  "sortBy": "value"
}
```

### 提交到排行榜
```
POST /api/leaderboard/submit
Content-Type: application/json
```

请求体：
```json
{
  "playerName": "玩家名称",
  "coasterValue": 1000,
  "popularity": 500,
  "rating": 85.5,
  "laps": 10,
  "trackLength": 500,
  "coasterType": "现代过山车",
  "maxSpeed": 50,
  "maxGForce": 5.0,
  "screamIndex": 80,
  "thrillIndex": 90,
  "comfortIndex": 85,
  "safetyIndex": 87,
  "trackData": { ... }
}
```

响应：
```json
{
  "success": true,
  "message": "已提交到排行榜",
  "rank": 1,
  "entry": { ... }
}
```

### 获取玩家排名
```
GET /api/leaderboard/rank/:playerName
```

响应：
```json
{
  "success": true,
  "rank": 1,
  "entry": { ... }
}
```

### 获取统计信息
```
GET /api/leaderboard/stats
```

响应：
```json
{
  "success": true,
  "stats": {
    "totalEntries": 100,
    "uniquePlayers": 50,
    "averageValue": 500,
    "averagePopularity": 250,
    "topValue": 1000,
    "topPopularity": 500
  }
}
```

## 配置

### 修改服务器地址

在 `leaderboard.js` 中修改：

```javascript
const API_BASE_URL = 'http://localhost:3000/api'; // 修改为你的服务器地址
const USE_SERVER = true; // 是否使用服务器API
```

### 修改端口

在 `server.js` 中修改：

```javascript
const PORT = process.env.PORT || 3000; // 修改端口号
```

或使用环境变量：

```bash
PORT=8080 node server.js
```

## 数据存储

排行榜数据存储在 `leaderboard-data.json` 文件中，位于服务器目录下。

## 部署

### 使用 PM2 部署

```bash
npm install -g pm2
pm2 start server.js --name rollercoaster-leaderboard
pm2 save
pm2 startup
```

### 使用 Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

构建和运行：

```bash
docker build -t rollercoaster-leaderboard .
docker run -d -p 3000:3000 rollercoaster-leaderboard
```

## 注意事项

1. 服务器默认最多保存200条记录
2. 每个玩家只保留最佳记录
3. 数据文件会自动创建
4. 支持跨域请求（CORS）
5. 建议在生产环境中添加身份验证和速率限制

