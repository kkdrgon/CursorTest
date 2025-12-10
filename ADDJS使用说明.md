# ADDJS 使用说明

## 简介

ADDJS 是一个用于解析游戏消息并管理怪物死亡信息的 JavaScript 类。它可以：
- 解析游戏消息字符串，提取地图名称和掉落物品
- 记录怪物死亡信息（包括死亡时间和复活时间）
- 计算怪物最多的地图，帮助玩家选择下一个目标地图

## 基本用法

### 1. 创建实例

```javascript
const addjs = new ADDJS();
```

### 2. 处理消息

```javascript
// 示例消息
const message1 = '{筑基中期|70:0:1}{地图的|251:0:1}{「筑基级」洪荒圣兽C【异兽】|70:0:1}{在坐标|251:0:1}{(62,41)|103:0:1}{死亡，掉落：|251:0:1}{毁灭人生带|249:0:1}';

// 处理消息，自动记录怪物死亡信息
addjs.onMessage(message1);
```

### 3. 获取下一个推荐地图

```javascript
// 获取怪物最多的地图（排除当前地图）
const nextMap = addjs.getNextMap('筑基中期');
console.log('推荐地图:', nextMap);

// 或者不排除任何地图
const bestMap = addjs.getNextMap();
console.log('怪物最多的地图:', bestMap);
```

## API 文档

### 构造函数

```javascript
new ADDJS()
```

创建一个新的 ADDJS 实例。

**参数：**
- 无

**属性：**
- `reviveTime`: 怪物复活时间（毫秒），默认 5 分钟（300000 毫秒）

### 方法

#### `onMessage(message)`

处理消息字符串，解析并记录怪物死亡信息。

**参数：**
- `message` (string): 消息字符串，格式如 `{文本|颜色:未知:未知}`

**示例：**
```javascript
addjs.onMessage('{筑基中期|70:0:1}{地图的|251:0:1}...');
```

#### `getNextMap(currentMap)`

计算并返回怪物最多的地图。

**参数：**
- `currentMap` (string, 可选): 当前所在的地图名称，如果提供则排除该地图

**返回：**
- `string|null`: 怪物最多的地图名称，如果没有记录则返回 `null`

**示例：**
```javascript
const nextMap = addjs.getNextMap('筑基中期');
```

#### `parseMessage(message)`

解析消息字符串，提取地图名称和掉落物品（不记录）。

**参数：**
- `message` (string): 消息字符串

**返回：**
- `Object|null`: `{ mapName: string, item: string }` 或 `null`

**示例：**
```javascript
const result = addjs.parseMessage('{筑基中期|70:0:1}...');
console.log(result.mapName); // "筑基中期"
console.log(result.item);    // "毁灭人生带"
```

#### `getAliveMonsterCount(mapName)`

获取指定地图当前存活的怪物数量。

**参数：**
- `mapName` (string): 地图名称

**返回：**
- `number`: 存活的怪物数量

#### `getDeadMonsterCount(mapName)`

获取指定地图当前死亡的怪物数量（未复活）。

**参数：**
- `mapName` (string): 地图名称

**返回：**
- `number`: 死亡的怪物数量

#### `getTotalMonsterCount(mapName)`

获取指定地图的总怪物数量。

**参数：**
- `mapName` (string): 地图名称

**返回：**
- `number`: 总怪物数量

#### `getMapStatistics()`

获取所有地图的统计信息。

**返回：**
- `Object`: 地图统计信息对象

**示例：**
```javascript
const stats = addjs.getMapStatistics();
console.log(stats);
// {
//   "筑基中期": {
//     total: 2,
//     alive: 1,
//     dead: 1,
//     records: [...]
//   },
//   ...
// }
```

#### `setReviveTime(minutes)`

设置怪物复活时间。

**参数：**
- `minutes` (number): 复活时间（分钟）

**示例：**
```javascript
addjs.setReviveTime(10); // 设置为10分钟
```

#### `clear()`

清除所有记录。

**示例：**
```javascript
addjs.clear();
```

#### `getMapRecords(mapName)`

获取指定地图的死亡记录。

**参数：**
- `mapName` (string): 地图名称

**返回：**
- `Array`: 死亡记录数组

## 完整示例

```javascript
// 创建实例
const addjs = new ADDJS();

// 处理多条消息
addjs.onMessage('{筑基中期|70:0:1}{地图的|251:0:1}{「筑基级」洪荒圣兽C【异兽】|70:0:1}{在坐标|251:0:1}{(62,41)|103:0:1}{死亡，掉落：|251:0:1}{毁灭人生带|249:0:1}');
addjs.onMessage('{化羽门秘境|70:0:1}{地图的|251:0:1}{「元婴级」毒蛇之王A【妖兽】|70:0:1}{在坐标|251:0:1}{(57,51)|103:0:1}{死亡，掉落：|251:0:1}{赤目焚情こ链|249:0:1}');
addjs.onMessage('{筑基中期|70:0:1}{地图的|251:0:1}{「筑基级」洪荒圣兽B【异兽】|70:0:1}{在坐标|251:0:1}{(60,40)|103:0:1}{死亡，掉落：|251:0:1}{神秘装备|249:0:1}');

// 获取推荐地图
const nextMap = addjs.getNextMap('筑基中期');
console.log('推荐前往:', nextMap);

// 查看统计信息
const stats = addjs.getMapStatistics();
console.log('地图统计:', stats);

// 查看特定地图的怪物数量
console.log('筑基中期存活怪物:', addjs.getAliveMonsterCount('筑基中期'));
console.log('筑基中期死亡怪物:', addjs.getDeadMonsterCount('筑基中期'));
console.log('筑基中期总怪物:', addjs.getTotalMonsterCount('筑基中期'));
```

## 消息格式说明

消息字符串的格式为：
```
{文本内容|颜色代码:未知:未知}
```

例如：
- `{筑基中期|70:0:1}` - 地图名称
- `{毁灭人生带|249:0:1}` - 掉落物品
- `{地图的|251:0:1}` - 关键词（会被跳过）
- `{在坐标|251:0:1}` - 关键词（会被跳过）
- `{死亡，掉落：|251:0:1}` - 关键词（标识掉落物品位置）

## 注意事项

1. 怪物默认在死亡后 5 分钟复活
2. 可以通过 `setReviveTime()` 方法修改复活时间
3. `getNextMap()` 返回的是当前存活怪物数最多的地图
4. 死亡记录会一直保存，直到手动清除或程序重启

## 测试

打开 `test-ADDJS.html` 文件在浏览器中测试所有功能。
