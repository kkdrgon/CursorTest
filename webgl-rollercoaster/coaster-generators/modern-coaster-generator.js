import { BaseCoasterGenerator } from './base-coaster-generator.js';

/**
 * 现代过山车轨道生成器
 * 生成现代化的轨道，可能包含更多细节
 */
export class ModernCoasterGenerator extends BaseCoasterGenerator {
    constructor(spline, config = {}) {
        super(spline, config);
        
        // 现代过山车可能有更细的轨道
        this.trackWidth = config.trackWidth || 0.4;
        this.trackHeight = config.trackHeight || 0.08;
    }
    
    /**
     * 生成现代过山车轨道
     * @returns {Object} 单个网格对象
     */
    generateTrack() {
        if (!this.spline || this.spline.pointCount < 2) {
            console.warn('贝塞尔曲线点数不足，无法生成轨道');
            return null;
        }
        
        const vertices = [];
        const indices = [];
        const normals = [];
        const uvs = [];
        
        // 生成轨道主体
        this.generateTrackMesh(vertices, indices, normals, uvs);
        
        // 生成护栏
        if (this.shouldGenerateRails) {
            this.generateRails(vertices, indices, normals, uvs);
        }
        
        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            uvs: new Float32Array(uvs),
            materialType: 'modern'
        };
    }
    
    /**
     * 生成轨道主体网格
     */
    generateTrackMesh(vertices, indices, normals, uvs) {
        // 根据曲线长度生成采样点
        const crossSections = this.generateSamplePoints();
        
        // 生成轨道顶面
        this.generateTrackSurface(crossSections, vertices, indices, normals, uvs, true);
        
        // 生成轨道底面
        this.generateTrackSurface(crossSections, vertices, indices, normals, uvs, false);
        
        // 生成轨道侧面
        this.generateTrackSides(crossSections, vertices, indices, normals, uvs);
    }
}

