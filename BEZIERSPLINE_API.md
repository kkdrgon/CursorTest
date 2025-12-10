# BezierSpline 外部调用接口文档

本文档整理了 `BezierSpline` 类在代码库中的所有外部调用情况。

## 一、实例化

### 1. Editor 类 (`editor.js`)
```javascript
this.spline = new BezierSpline();
```

## 二、属性访问

### 1. `pointCount` - 控制点数量
**调用位置：**
- `editor.js`: 多处检查控制点数量
- `track-generator.js`: 检查点数是否足够生成轨道

### 2. `segmentCount` - 段数量
**调用位置：**
- `editor.js`: 计算站台区域对应的t值范围

### 3. `points` - 控制点数组（直接访问）
**调用位置：**
- `editor.js`: 
  - 清空控制点：`this.spline.points = []`
  - 添加控制点：`this.spline.points.push(...)`
  - 访问控制点：`this.spline.points[index]`
  - 遍历控制点：`for (let i = 0; i < this.spline.points.length; i++)`

### 4. `closed` - 是否闭合
**调用位置：**
- `editor.js`: 检查闭合状态以计算相邻点索引

### 5. `carStartDistance` - 小车起始距离
**调用位置：**
- `car.js`: 获取站台起点距离

## 三、控制点操作方法

### 1. `getControlPoint(index)` - 获取控制点
**调用位置：**
- `editor.js`: 大量使用，获取选中或指定索引的控制点
- `car.js`: 根据段索引获取控制点

**使用示例：**
```javascript
const point = this.spline.getControlPoint(this.selectedPointIndex);
```

### 2. `addPoint(position)` - 添加控制点
**调用位置：**
- `editor.js`: 添加新控制点（按 'A' 键时）

### 3. `removePoint(index)` - 移除控制点
**调用位置：**
- `editor.js`: 删除选中的控制点（按 Delete/Backspace 键时）

### 4. `setPointPosition(index, position, maintainContinuity)` - 设置控制点位置
**调用位置：**
- `editor.js`: 
  - 从UI更新控制点位置
  - 拖动控制点时更新位置

**使用示例：**
```javascript
this.spline.setPointPosition(this.selectedPointIndex, newPos, true);
```

### 5. `insertPointAtSegment(segmentIndex, t)` - 在段中插入点
**调用位置：**
- 未发现直接调用（可能通过其他方式间接使用）

## 四、切线操作方法

### 1. `setLeftTangentLength(pointIndex, length)` - 设置左侧切线长度
**调用位置：**
- `editor.js`: 键盘快捷键调整切线长度（`[` 和 `]` 键）

### 2. `setRightTangentLength(pointIndex, length)` - 设置右侧切线长度
**调用位置：**
- `editor.js`: 键盘快捷键调整切线长度（`-` 和 `=` 键）

### 3. `ensureC2Continuity(pointIndex, skipCurrentPoint)` - 确保C2连续性
**调用位置：**
- `editor.js`: 
  - 生成默认轨道后确保连续性
  - 插入新点后确保连续性

**使用示例：**
```javascript
this.spline.ensureC2Continuity(i);
```

### 4. `ensurePlatformTangent(pointIndex)` - 确保站台切线水平
**调用位置：**
- `editor.js`: 
  - 更新站台控制点时
  - 拖动控制点后检查是否为站台点

**使用示例：**
```javascript
this.spline.ensurePlatformTangent(this.selectedPointIndex);
```

## 五、点查询方法

### 1. `getCachedPoints()` - 获取缓存的点数组
**调用位置：**
- `editor.js`: 更新曲线预览时获取点数组
- `car.js`: 获取缓存的点数组以计算总长度
- `base-coaster-generator.js`: 获取缓存的点数组

**使用示例：**
```javascript
const points = this.spline.getCachedPoints();
```

### 2. `getPoints(tolerance)` - 获取所有采样点（带缓存）
**调用位置：**
- `car.js`: 获取点数组并标记缓存为脏
- `wooden-coaster-generator.js`: 生成轨道时获取曲线点列表

**使用示例：**
```javascript
const { points: curvePointList } = this.spline.getPoints(0.1);
```

### 3. `getPointInfoByDistance(distance)` - 根据距离获取点信息
**调用位置：**
- `car.js`: 多处使用，根据距离获取位置、切线等信息
- `wooden-coaster-generator.js`: 生成轨道时根据距离获取点信息
- `base-coaster-generator.js`: 生成轨道时根据距离获取点信息

**使用示例：**
```javascript
const pointInfo = this.spline.getPointInfoByDistance(distance);
```

### 4. `getPointOnSegment(segmentIndex, t)` - 获取段上的点
**调用位置：**
- 未发现直接调用

### 5. `getPointsOnSegment(segmentIndex, tolerance, beginDist)` - 获取段上的采样点
**调用位置：**
- 内部使用（`getPoints` 方法内部调用）

### 6. `getApproximateLength()` - 获取曲线总长度
**调用位置：**
- `editor.js`: 更新轨道长度警告
- `car.js`: 设置小车总长度
- `wooden-coaster-generator.js`: 计算轨道总长度
- `base-coaster-generator.js`: 计算轨道总长度
- `physics.js`: 物理模拟中获取总长度

**使用示例：**
```javascript
const totalLength = this.spline.getApproximateLength();
```

### 7. `getCurvatureByDistance(distance)` - 根据距离获取曲率
**调用位置：**
- `editor.js`: 更新曲线预览时判断是否为危险区域

**使用示例：**
```javascript
const curvature = this.spline.getCurvatureByDistance(midDistance);
```

### 8. `getCurvatureCenterDirection(segmentIndex, t)` - 获取曲率中心方向
**调用位置：**
- 未发现直接调用

## 六、缓存管理方法

### 1. `markCachedPointsDirty()` - 标记缓存为脏
**调用位置：**
- `car.js`: 当轨道改变时标记缓存为脏

**使用示例：**
```javascript
this.spline.markCachedPointsDirty();
```

## 七、序列化方法

### 1. `serialize()` - 序列化为JSON
**调用位置：**
- `editor.js`: 保存项目状态时序列化样条数据

**使用示例：**
```javascript
spline: this.spline.serialize()
```

### 2. `loadFromData(data)` - 从数据恢复
**调用位置：**
- `editor.js`: 加载项目状态时恢复样条数据

**使用示例：**
```javascript
const restored = this.spline.loadFromData(state.spline);
```

## 八、调用统计

### 按文件分类：

1. **editor.js** (最多调用)
   - 控制点管理：`getControlPoint`, `addPoint`, `removePoint`, `setPointPosition`
   - 切线操作：`setLeftTangentLength`, `setRightTangentLength`, `ensureC2Continuity`, `ensurePlatformTangent`
   - 点查询：`getCachedPoints`, `getCurvatureByDistance`, `getApproximateLength`
   - 属性访问：`pointCount`, `segmentCount`, `points`, `closed`
   - 序列化：`serialize`, `loadFromData`

2. **car.js**
   - 点查询：`getPointInfoByDistance`, `getCachedPoints`, `getPoints`
   - 属性访问：`carStartDistance`
   - 缓存管理：`markCachedPointsDirty`

3. **track-generator.js**
   - 属性访问：`pointCount`

4. **coaster-generators/** (各种生成器)
   - 点查询：`getPoints`, `getPointInfoByDistance`, `getApproximateLength`, `getCachedPoints`

5. **physics.js**
   - 点查询：`getApproximateLength`

## 九、主要使用场景

1. **编辑器交互** (`editor.js`)
   - 创建、编辑、删除控制点
   - 调整控制点位置和切线
   - 预览曲线和轨道
   - 保存和加载项目

2. **轨道生成** (`track-generator.js`, `coaster-generators/`)
   - 根据样条曲线生成3D轨道网格
   - 计算轨道几何信息

3. **小车运动** (`car.js`, `physics.js`)
   - 根据距离获取小车位置和方向
   - 物理模拟计算
   - 站台等待逻辑

## 十、注意事项

1. **直接访问 `points` 数组**：虽然可以直接访问 `spline.points`，但建议使用 `getControlPoint()` 方法
2. **缓存机制**：`getCachedPoints()` 和 `getPoints()` 使用缓存，修改控制点后需要调用 `markCachedPointsDirty()`
3. **闭合曲线**：`closed` 属性影响段索引的计算，需要注意循环边界情况
4. **站台区域**：站台控制点有特殊处理，使用 `ensurePlatformTangent()` 保持水平

