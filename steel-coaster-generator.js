import { BaseCoasterGenerator } from './base-coaster-generator.js';

/**
 * 钢架过山车轨道生成器
 * 生成光滑的钢制轨道
 */
export class SteelCoasterGenerator extends BaseCoasterGenerator {
    constructor(spline, config = {}) {
        super(spline, config);
        
        // 钢架过山车专用参数
        this.tieInterval = config.tieInterval || 0.5; // 钢条间隔（米）
        this.steelBarWidth = config.steelBarWidth || 0.03; // 钢条宽度（米）
        this.steelBarHeight = config.steelBarHeight || 0.03; // 钢条高度（米）
        this.railWidth = config.railWidth || 0.05; // 铁轨宽度（米）
        this.railHeightDetail = config.railHeightDetail || 0.08; // 铁轨高度（米）
        this.railOffset = config.railOffset || 0.25; // 铁轨距离轨道中心的偏移（米）
    }
    
    /**
     * 生成木架过山车轨道
     * @returns {Object} 包含多个网格的对象
     */
    generateTrack() {
        if (!this.spline || this.spline.pointCount < 2) {
            console.warn('贝塞尔曲线点数不足，无法生成轨道');
            return null;
        }
        
        const crossSections = this.generateSamplePoints();
        const totalLength = this.spline.getApproximateLength();
        
        // 钢轨网格
        const tieVertices = [];
        const tieIndices = [];
        const tieNormals = [];
        const tieUvs = [];
        this.generateTies(crossSections, totalLength, tieVertices, tieIndices, tieNormals, tieUvs);
        
        // 铁轨网格
        const railVertices = [];
        const railIndices = [];
        const railNormals = [];
        const railUvs = [];
        this.generateSteelRails(crossSections, railVertices, railIndices, railNormals, railUvs);
        
        // 返回多个网格（仅枕木 + 铁轨，不生成基础面和护栏）
        const meshes = {
            ties: {
                vertices: new Float32Array(tieVertices),
                indices: new Uint32Array(tieIndices),
                normals: new Float32Array(tieNormals),
                uvs: new Float32Array(tieUvs),
                materialType: 'steel' // 改为钢材质
            },
            rails: {
                vertices: new Float32Array(railVertices),
                indices: new Uint32Array(railIndices),
                normals: new Float32Array(railNormals),
                uvs: new Float32Array(railUvs),
                materialType: 'steel'
            }
        };
        
        console.log('钢架过山车生成器：生成多网格结构，子网格:', Object.keys(meshes));
        
        return {
            isMultiMesh: true,
            meshes: meshes
        };
    }
    
    /**
     * 生成连接三条铁轨的钢条
     * 根据曲线点列表均匀分布，形成三角形支撑结构
     */
    generateTies(crossSections, totalLength, vertices, indices, normals, uvs) {
        const startIndex = vertices.length / 3;
        let tieIndex = 0;
        const barHalfWidth = this.steelBarWidth * 0.5;
        const barHalfHeight = this.steelBarHeight * 0.5;

        // 按距离均匀采样放置钢条
        for (let dist = 0.0; dist <= totalLength; dist += this.tieInterval) {
            const pointInfo = this.spline.getPointInfoByDistance(dist);
            if (!pointInfo) {
                continue;
            }

            const position = pointInfo.position;
            const tangent = pointInfo.tangent;
            if (!tangent) {
                continue;
            }

            // 计算法线和副法线
            const normal = this.getNormal(tangent);
            const binormal = tangent.cross(normal).normalize();

            // 计算三条铁轨的中心位置
            const leftRailPos = position
                .add(binormal.multiplyScalar(-this.railOffset))
                .add(normal.multiplyScalar(this.trackHeight * 0.5));
            const rightRailPos = position
                .add(binormal.multiplyScalar(this.railOffset))
                .add(normal.multiplyScalar(this.trackHeight * 0.5));
            const centerRailPos = position
                .add(normal.multiplyScalar(-this.railOffset * 1.7));

            // 生成三条钢条，连接三个铁轨位置
            // 钢条1：左侧铁轨 -> 右侧铁轨
            this.generateSteelBar(leftRailPos, rightRailPos, tangent, normal, binormal, 
                barHalfWidth, barHalfHeight, startIndex + tieIndex * 24, vertices, indices, normals, uvs);
            
            // 钢条2：左侧铁轨 -> 中心下方铁轨
            this.generateSteelBar(leftRailPos, centerRailPos, tangent, normal, binormal, 
                barHalfWidth, barHalfHeight, startIndex + tieIndex * 24 + 8, vertices, indices, normals, uvs);
            
            // 钢条3：右侧铁轨 -> 中心下方铁轨
            this.generateSteelBar(rightRailPos, centerRailPos, tangent, normal, binormal, 
                barHalfWidth, barHalfHeight, startIndex + tieIndex * 24 + 16, vertices, indices, normals, uvs);

            tieIndex++;
        }
    }

    /**
     * 生成一条钢条（矩形截面的圆柱体）
     * @param {Vec3} startPos - 起始位置
     * @param {Vec3} endPos - 结束位置
     * @param {Vec3} tangent - 切线方向
     * @param {Vec3} normal - 法线方向
     * @param {Vec3} binormal - 副法线方向
     * @param {number} halfWidth - 钢条宽度的一半
     * @param {number} halfHeight - 钢条高度的一半
     * @param {number} baseIdx - 起始顶点索引
     */
    generateSteelBar(startPos, endPos, tangent, normal, binormal, halfWidth, halfHeight, baseIdx, vertices, indices, normals, uvs) {
        // 计算钢条方向
        const barDirection = endPos.subtract(startPos);
        const barLength = barDirection.length();
        if (barLength < 0.001) return; // 避免零长度
        
        const barDir = barDirection.normalize();
        
        // 计算垂直于钢条方向的局部坐标系
        // 使用binormal和normal构建垂直于钢条的平面
        const perp1 = binormal;
        const perp2 = barDir.cross(perp1).normalize();
        
        // 如果perp2为零向量，使用normal
        if (perp2.length() < 0.1) {
            perp2 = normal;
        }
        
        // 生成矩形截面的4个顶点（在起始位置）
        const startVerts = [
            startPos.add(perp1.multiplyScalar(-halfWidth)).add(perp2.multiplyScalar(-halfHeight)),
            startPos.add(perp1.multiplyScalar(halfWidth)).add(perp2.multiplyScalar(-halfHeight)),
            startPos.add(perp1.multiplyScalar(halfWidth)).add(perp2.multiplyScalar(halfHeight)),
            startPos.add(perp1.multiplyScalar(-halfWidth)).add(perp2.multiplyScalar(halfHeight))
        ];
        
        // 生成矩形截面的4个顶点（在结束位置）
        const endVerts = [
            endPos.add(perp1.multiplyScalar(-halfWidth)).add(perp2.multiplyScalar(-halfHeight)),
            endPos.add(perp1.multiplyScalar(halfWidth)).add(perp2.multiplyScalar(-halfHeight)),
            endPos.add(perp1.multiplyScalar(halfWidth)).add(perp2.multiplyScalar(halfHeight)),
            endPos.add(perp1.multiplyScalar(-halfWidth)).add(perp2.multiplyScalar(halfHeight))
        ];
        
        // 计算截面法线（垂直于钢条方向）
        const crossNormal = perp1.cross(perp2).normalize();
        
        // 计算侧面法线（垂直于侧面，即垂直于钢条方向和截面边方向）
        // 对于矩形柱体，侧面法线就是perp1或perp2方向，取决于哪个侧面
        // 为了简化，我们为每个顶点计算其所在面的法线
        // 侧面1和3的法线方向：perp2
        // 侧面2和4的法线方向：perp1
        
        // 添加8个顶点（起始4个 + 结束4个）
        // 起始面的4个顶点使用反向截面法线
        for (let i = 0; i < 4; i++) {
            const vertex = startVerts[i];
            vertices.push(vertex.x, vertex.y, vertex.z);
            // 使用反向截面法线（起始面）
            normals.push(-crossNormal.x, -crossNormal.y, -crossNormal.z);
            uvs.push(0, 0);
        }
        // 结束面的4个顶点使用正向截面法线
        for (let i = 0; i < 4; i++) {
            const vertex = endVerts[i];
            vertices.push(vertex.x, vertex.y, vertex.z);
            // 使用正向截面法线（结束面）
            normals.push(crossNormal.x, crossNormal.y, crossNormal.z);
            uvs.push(1, 0);
        }
        
        // 生成6个面的三角形索引（矩形柱体）
        // 起始面（baseIdx, baseIdx+1, baseIdx+2, baseIdx+3）- 法线指向起始方向
        indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
        indices.push(baseIdx, baseIdx + 3, baseIdx + 2);
        
        // 结束面（baseIdx+4, baseIdx+5, baseIdx+6, baseIdx+7）- 法线指向结束方向
        indices.push(baseIdx + 4, baseIdx + 5, baseIdx + 6);
        indices.push(baseIdx + 4, baseIdx + 6, baseIdx + 7);
        
        // 四个侧面（法线垂直于钢条方向）
        // 侧面1：baseIdx -> baseIdx+1 -> baseIdx+5 -> baseIdx+4
        indices.push(baseIdx, baseIdx + 1, baseIdx + 5);
        indices.push(baseIdx, baseIdx + 5, baseIdx + 4);
        
        // 侧面2：baseIdx+1 -> baseIdx+2 -> baseIdx+6 -> baseIdx+5
        indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 6);
        indices.push(baseIdx + 1, baseIdx + 6, baseIdx + 5);
        
        // 侧面3：baseIdx+2 -> baseIdx+3 -> baseIdx+7 -> baseIdx+6
        indices.push(baseIdx + 2, baseIdx + 3, baseIdx + 7);
        indices.push(baseIdx + 2, baseIdx + 7, baseIdx + 6);
        
        // 侧面4：baseIdx+3 -> baseIdx -> baseIdx+4 -> baseIdx+7
        indices.push(baseIdx + 3, baseIdx, baseIdx + 4);
        indices.push(baseIdx + 3, baseIdx + 4, baseIdx + 7);
    }

    /**
     * 生成铁轨（三条纵向金属条，六边形截面）
     * 两条在两侧（与木架轨道位置一致），一条在中心下方
     */
    generateSteelRails(crossSections, vertices, indices, normals, uvs) {
        const railRadius = this.railWidth * 0.5; // 六边形外接圆半径
        
        // 生成3条铁轨
        const railConfigs = [
            { offset: -this.railOffset, height: this.trackHeight * 0.5 }, // 左侧铁轨
            { offset: this.railOffset, height: this.trackHeight * 0.5 },  // 右侧铁轨
            { offset: 0, height: -this.railOffset * 1.7 }                 // 中心下方铁轨
        ];
        
        for (let railIdx = 0; railIdx < railConfigs.length; railIdx++) {
            const config = railConfigs[railIdx];
            const startIndex = vertices.length / 3;
            
            // 生成铁轨顶点（六边形截面）
            for (let i = 0; i < crossSections.length; i++) {
                const cs = crossSections[i];
                
                // 计算铁轨中心位置
                const railCenter = cs.position
                    .add(cs.binormal.multiplyScalar(config.offset))
                    .add(cs.normal.multiplyScalar(config.height));
                
                // 生成六边形的6个顶点
                // 六边形顶点围绕中心，每60度一个
                const hexVertices = [];
                for (let v = 0; v < 6; v++) {
                    const angle = (v * Math.PI) / 3; // 0, 60, 120, 180, 240, 300度
                    // 在垂直于切线的平面内计算顶点位置
                    // 使用binormal和normal构建局部坐标系
                    const localX = Math.cos(angle);
                    const localY = Math.sin(angle);
                    
                    // 将局部坐标转换为世界坐标
                    // 六边形在垂直于切线的平面内，所以使用binormal和normal
                    const vertex = railCenter
                        .add(cs.binormal.multiplyScalar(localX * railRadius))
                        .add(cs.normal.multiplyScalar(localY * railRadius));
                    
                    hexVertices.push(vertex);
                }
                
                // 添加6个顶点
                for (const vertex of hexVertices) {
                    vertices.push(vertex.x, vertex.y, vertex.z);
                    // 计算法线（从中心指向顶点）
                    const toVertex = vertex.subtract(railCenter).normalize();
                    normals.push(toVertex.x, toVertex.y, toVertex.z);
                    uvs.push(0, i / crossSections.length);
                }
            }
            
            // 生成三角形（连接相邻采样点，形成六边形柱体）
            for (let i = 0; i < crossSections.length - 1; i++) {
                const baseIdx = startIndex + i * 6;
                const nextBaseIdx = startIndex + (i + 1) * 6;
                
                // 为六边形的每个面生成两个三角形
                for (let face = 0; face < 6; face++) {
                    const nextFace = (face + 1) % 6;
                    
                    // 当前截面的两个相邻顶点
                    const v0 = baseIdx + face;
                    const v1 = baseIdx + nextFace;
                    // 下一截面的对应顶点
                    const v2 = nextBaseIdx + face;
                    const v3 = nextBaseIdx + nextFace;
                    
                    // 生成两个三角形组成四边形面
                    indices.push(v0, v1, v2);
                    indices.push(v1, v3, v2);
                }
            }
        }
    }
}

