import { BaseCoasterGenerator } from './base-coaster-generator.js';

/**
 * 木架过山车轨道生成器
 * 生成由枕木和铁轨组成的详细轨道模型
 */
export class WoodenCoasterGenerator extends BaseCoasterGenerator {
    constructor(spline, config = {}) {
        super(spline, config);
        
        // 木架过山车专用参数
        this.tieInterval = config.tieInterval || 0.5; // 枕木间隔（米）
        this.tieWidth = config.tieWidth || 0.25; // 枕木宽度（米），增加50%（原0.15 * 1.5 = 0.225）
        this.tieHeight = config.tieHeight || 0.15; // 枕木高度（米）
        this.tieLength = config.tieLength || 1.0; // 枕木长度（米，超出轨道宽度）
        this.railWidth = config.railWidth || 0.06; // 铁轨宽度（米）
        this.railHeightDetail = config.railHeightDetail || 0.08; // 铁轨高度（米）
        this.railOffset = config.railOffset || 0.25; // 铁轨距离轨道中心的偏移（米）
    }
    
    /**
     * 重写生成采样点方法，木架过山车不使用侧倾模拟，保持水平轨道
     * @returns {Array} 采样点数组
     */
    generateSamplePoints() {
        // 木架过山车不使用预模拟，直接生成水平轨道
        const cachedPoints = this.spline.getCachedPoints();
        if (!cachedPoints || cachedPoints.length === 0) {
            return [];
        }
        
        const totalLength = cachedPoints[cachedPoints.length - 1].distance;
        const samplePoints = [];
        const numSamples = Math.ceil(totalLength / this.sampleInterval);
        
        for (let i = 0; i <= numSamples; i++) {
            const distance = Math.min(i * this.sampleInterval, totalLength);
            
            // 从缓存点中查找并插值
            const pointInfo = this.spline.getPointInfoByDistance(distance);
            if (!pointInfo) {
                continue;
            }
            
            const position = pointInfo.position;
            const tangent = pointInfo.tangent;
            
            // 计算曲率
            const curvature = pointInfo.curvature || 0;
            
            // 获取基础法线（垂直于切线，向上）- 木架过山车保持水平，无侧倾
            const baseNormal = this.getNormal(tangent);
            
            // 重新计算副法线
            const binormal = tangent.cross(baseNormal).normalize();
            
            samplePoints.push({
                position,
                tangent,
                normal: baseNormal,
                binormal: binormal,
                distance,
                bankingAngle: 0, // 木架过山车无侧倾
                curvature,
                isInverted: false
            });
        }
        
        return samplePoints;
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
        
        // 枕木网格
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
                materialType: 'wood'
            },
            rails: {
                vertices: new Float32Array(railVertices),
                indices: new Uint32Array(railIndices),
                normals: new Float32Array(railNormals),
                uvs: new Float32Array(railUvs),
                materialType: 'steel'
            }
        };
        
        console.log('木架过山车生成器：生成多网格结构（无基础面与护栏），子网格:', Object.keys(meshes));
        
        return {
            isMultiMesh: true,
            meshes: meshes
        };
    }
    
    /**
     * 生成枕木（横向木条）
     * 根据曲线点列表均匀分布枕木
     */
    generateTies(crossSections, totalLength, vertices, indices, normals, uvs) {
        // 计算需要放置的枕木数量（包括起点和终点）
        const startIndex = vertices.length / 3;
        let tieIndex = 0;

        // 按距离均匀采样放置枕木
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

            // 枕木中心位置（在轨道表面下方）
            const tieCenter = position.add(normal.multiplyScalar(-this.trackHeight * 0.5));
            const halfWidth = this.tieWidth * 0.5;
            const halfLength = this.tieLength * 0.5;
            const halfHeight = this.tieHeight * 0.5;

            // 当前枕木在顶点数组中的起始索引
            const baseIdx = startIndex + tieIndex * 8;

            const tieVertices = [
                // 底部4个顶点
                tieCenter.add(binormal.multiplyScalar(-halfLength)).add(normal.multiplyScalar(-halfHeight)),
                tieCenter.add(binormal.multiplyScalar(halfLength)).add(normal.multiplyScalar(-halfHeight)),
                tieCenter.add(binormal.multiplyScalar(halfLength)).add(tangent.multiplyScalar(halfWidth)).add(normal.multiplyScalar(-halfHeight)),
                tieCenter.add(binormal.multiplyScalar(-halfLength)).add(tangent.multiplyScalar(halfWidth)).add(normal.multiplyScalar(-halfHeight)),
                // 顶部4个顶点
                tieCenter.add(binormal.multiplyScalar(-halfLength)).add(normal.multiplyScalar(halfHeight)),
                tieCenter.add(binormal.multiplyScalar(halfLength)).add(normal.multiplyScalar(halfHeight)),
                tieCenter.add(binormal.multiplyScalar(halfLength)).add(tangent.multiplyScalar(halfWidth)).add(normal.multiplyScalar(halfHeight)),
                tieCenter.add(binormal.multiplyScalar(-halfLength)).add(tangent.multiplyScalar(halfWidth)).add(normal.multiplyScalar(halfHeight))
            ];

            // 添加顶点与法线
            for (const vertex of tieVertices) {
                vertices.push(vertex.x, vertex.y, vertex.z);
                normals.push(normal.x, normal.y, normal.z);
                uvs.push(0, 0);
            }

            // 生成6个面的三角形索引
            // 顶面
            indices.push(baseIdx + 4, baseIdx + 5, baseIdx + 6);
            indices.push(baseIdx + 4, baseIdx + 6, baseIdx + 7);
            // 底面
            indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
            indices.push(baseIdx, baseIdx + 3, baseIdx + 2);
            // 前面
            indices.push(baseIdx, baseIdx + 1, baseIdx + 5);
            indices.push(baseIdx, baseIdx + 5, baseIdx + 4);
            // 后面
            indices.push(baseIdx + 3, baseIdx + 7, baseIdx + 6);
            indices.push(baseIdx + 3, baseIdx + 6, baseIdx + 2);
            // 左面
            indices.push(baseIdx, baseIdx + 4, baseIdx + 7);
            indices.push(baseIdx, baseIdx + 7, baseIdx + 3);
            // 右面
            indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 6);
            indices.push(baseIdx + 1, baseIdx + 6, baseIdx + 5);

            tieIndex++;
        }
    }

    /**
     * 生成铁轨（两条纵向金属条）
     */
    generateSteelRails(crossSections, vertices, indices, normals, uvs) {
        const railHalfWidth = this.railWidth * 0.5;
        const railHalfHeight = this.railHeightDetail * 0.5;
        
        // 为每条铁轨生成
        for (let railSide = 0; railSide < 2; railSide++) {
            const railOffset = railSide === 0 ? -this.railOffset : this.railOffset;
            const startIndex = vertices.length / 3;
            
            // 生成铁轨顶点
            for (let i = 0; i < crossSections.length; i++) {
                const cs = crossSections[i];
                const railCenter = cs.position
                    .add(cs.binormal.multiplyScalar(railOffset))
                    .add(cs.normal.multiplyScalar(this.trackHeight * 0.5));
                
                // 铁轨的4个顶点（横截面为矩形）
                const railTopLeft = railCenter
                    .add(cs.binormal.multiplyScalar(-railHalfWidth))
                    .add(cs.normal.multiplyScalar(railHalfHeight));
                const railTopRight = railCenter
                    .add(cs.binormal.multiplyScalar(railHalfWidth))
                    .add(cs.normal.multiplyScalar(railHalfHeight));
                const railBottomLeft = railCenter
                    .add(cs.binormal.multiplyScalar(-railHalfWidth))
                    .add(cs.normal.multiplyScalar(-railHalfHeight));
                const railBottomRight = railCenter
                    .add(cs.binormal.multiplyScalar(railHalfWidth))
                    .add(cs.normal.multiplyScalar(-railHalfHeight));
                
                // 添加顶点（每个采样点4个顶点，形成沿轨道的条带）
                vertices.push(railTopLeft.x, railTopLeft.y, railTopLeft.z);
                normals.push(cs.normal.x, cs.normal.y, cs.normal.z);
                uvs.push(0, i / crossSections.length);
                
                vertices.push(railTopRight.x, railTopRight.y, railTopRight.z);
                normals.push(cs.normal.x, cs.normal.y, cs.normal.z);
                uvs.push(1, i / crossSections.length);
                
                vertices.push(railBottomLeft.x, railBottomLeft.y, railBottomLeft.z);
                normals.push(cs.normal.x, cs.normal.y, cs.normal.z);
                uvs.push(0, i / crossSections.length);
                
                vertices.push(railBottomRight.x, railBottomRight.y, railBottomRight.z);
                normals.push(cs.normal.x, cs.normal.y, cs.normal.z);
                uvs.push(1, i / crossSections.length);
            }
            
            // 生成三角形（连接相邻采样点）
            for (let i = 0; i < crossSections.length - 1; i++) {
                const baseIdx = startIndex + i * 4;
                const nextBaseIdx = startIndex + (i + 1) * 4;
                
                // 顶面
                indices.push(baseIdx, baseIdx + 1, nextBaseIdx);
                indices.push(baseIdx + 1, nextBaseIdx + 1, nextBaseIdx);
                
                // 底面
                indices.push(baseIdx + 2, nextBaseIdx + 2, baseIdx + 3);
                indices.push(baseIdx + 3, nextBaseIdx + 2, nextBaseIdx + 3);
                
                // 左面
                indices.push(baseIdx, nextBaseIdx, nextBaseIdx + 2);
                indices.push(baseIdx, nextBaseIdx + 2, baseIdx + 2);
                
                // 右面
                indices.push(baseIdx + 1, baseIdx + 3, nextBaseIdx + 3);
                indices.push(baseIdx + 1, nextBaseIdx + 3, nextBaseIdx + 1);
            }
        }
    }
}

