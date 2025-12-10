/**
 * 木栅栏生成器
 * 根据公园边界生成木栅栏网格
 */

export class FenceGenerator {
    constructor() {
        // 栅栏参数
        this.postHeight = 1.5; // 栅栏柱高度（米）
        this.postWidth = 0.1; // 栅栏柱宽度（米）
        this.postSpacing = 2.0; // 栅栏柱间距（米）
        this.railHeight = 0.8; // 横杆高度（米）
        this.railThickness = 0.05; // 横杆厚度（米）
        this.railWidth = 0.1; // 横杆宽度（米）
    }
    
    /**
     * 生成栅栏网格
     * @param {Array} boundary - 边界线段数组，每个元素包含 {x1, z1, x2, z2}
     * @returns {Object} 网格数据 {vertices, normals, uvs, indices}
     */
    generateFence(boundary) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let vertexOffset = 0;
        
        for (const segment of boundary) {
            const dx = segment.x2 - segment.x1;
            const dz = segment.z2 - segment.z1;
            const length = Math.sqrt(dx * dx + dz * dz);
            
            if (length < 0.001) continue; // 跳过太短的线段
            
            const dirX = dx / length;
            const dirZ = dz / length;
            
            // 计算垂直于线段的方向（用于栅栏柱的宽度）
            const perpX = -dirZ;
            const perpZ = dirX;
            
            // 计算需要多少个栅栏柱
            const numPosts = Math.ceil(length / this.postSpacing) + 1;
            
            // 生成栅栏柱（简化为简单的立方体柱）
            for (let i = 0; i < numPosts; i++) {
                const t = i / (numPosts - 1);
                const x = segment.x1 + dx * t;
                const z = segment.z1 + dz * t;
                
                const halfWidth = this.postWidth / 2;
                const p1x = x + perpX * halfWidth;
                const p1z = z + perpZ * halfWidth;
                const p2x = x - perpX * halfWidth;
                const p2z = z - perpZ * halfWidth;
                
                // 生成栅栏柱的前后两个面（垂直于线段方向）
                const postFaces = [
                    // 前面（向外）
                    [p1x, 0, p1z, p2x, 0, p2z, p2x, this.postHeight, p2z, p1x, this.postHeight, p1z],
                    // 后面（向内）
                    [p2x, 0, p2z, p1x, 0, p1z, p1x, this.postHeight, p1z, p2x, this.postHeight, p2z]
                ];
                
                for (const face of postFaces) {
                    // 添加4个顶点
                    for (let j = 0; j < 4; j++) {
                        vertices.push(face[j * 3], face[j * 3 + 1], face[j * 3 + 2]);
                        normals.push(perpX, 0, perpZ);
                        uvs.push(j % 2, Math.floor(j / 2));
                    }
                    
                    // 添加索引（两个三角形）
                    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
                    indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
                    vertexOffset += 4;
                }
            }
            
            // 生成横杆（在栅栏柱之间）
            for (let i = 0; i < numPosts - 1; i++) {
                const t1 = i / (numPosts - 1);
                const t2 = (i + 1) / (numPosts - 1);
                const x1 = segment.x1 + dx * t1;
                const z1 = segment.z1 + dz * t1;
                const x2 = segment.x1 + dx * t2;
                const z2 = segment.z1 + dz * t2;
                
                // 横杆的四个角
                const halfWidth = this.railWidth / 2;
                const railCorners = [
                    { x: x1 + perpX * halfWidth, z: z1 + perpZ * halfWidth },
                    { x: x1 - perpX * halfWidth, z: z1 - perpZ * halfWidth },
                    { x: x2 - perpX * halfWidth, z: z2 - perpZ * halfWidth },
                    { x: x2 + perpX * halfWidth, z: z2 + perpZ * halfWidth }
                ];
                
                // 生成横杆的立方体（只生成上下两个面）
                const railY = this.railHeight;
                const railVertices = [
                    railCorners[0].x, railY, railCorners[0].z,
                    railCorners[1].x, railY, railCorners[1].z,
                    railCorners[2].x, railY, railCorners[2].z,
                    railCorners[3].x, railY, railCorners[3].z,
                    railCorners[0].x, railY + this.railThickness, railCorners[0].z,
                    railCorners[1].x, railY + this.railThickness, railCorners[1].z,
                    railCorners[2].x, railY + this.railThickness, railCorners[2].z,
                    railCorners[3].x, railY + this.railThickness, railCorners[3].z
                ];
                
                // 添加横杆顶点
                for (let j = 0; j < 8; j++) {
                    vertices.push(railVertices[j * 3], railVertices[j * 3 + 1], railVertices[j * 3 + 2]);
                    normals.push(0, 1, 0);
                    uvs.push((j % 4) % 2, Math.floor((j % 4) / 2));
                }
                
                // 添加横杆索引（顶面和底面）
                const railIndices = [
                    // 顶面
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset, vertexOffset + 2, vertexOffset + 3,
                    // 底面
                    vertexOffset + 4, vertexOffset + 6, vertexOffset + 5,
                    vertexOffset + 4, vertexOffset + 7, vertexOffset + 6
                ];
                for (let idx of railIndices) {
                    indices.push(idx);
                }
                vertexOffset += 8;
            }
        }
        
        if (vertices.length === 0) {
            return null;
        }
        
        return {
            vertices: new Float32Array(vertices),
            normals: new Float32Array(normals),
            uvs: new Float32Array(uvs),
            indices: new Uint32Array(indices),
            materialType: 'wood'
        };
    }
}
