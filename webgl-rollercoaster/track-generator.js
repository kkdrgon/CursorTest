import { GENERATOR_REGISTRY } from './coaster-generators/index.js';

/**
 * 轨道生成器工厂
 * 根据过山车类型选择合适的生成器
 */
export class TrackGenerator {
    constructor(spline, coasterTypeManager = null) {
        this.spline = spline;
        this.coasterTypeManager = coasterTypeManager;
        
        // 通用配置
        this.config = {
            trackWidth: 0.5,
            trackHeight: 0.1,
            railHeight: 0.1,
            railThickness: 0.1,
            crossSections: 8,
            sampleInterval: 0.1,
            railInterval: 2.0,
            shouldGenerateRails: true,
            speed: 0.0,
            gravity: 9.81
        };
        
        // 创建生成器实例（延迟创建，在需要时根据类型创建）
        this.generators = {};
    }
    
    /**
     * 获取当前过山车类型的生成器
     * @returns {BaseCoasterGenerator} 生成器实例
     */
    getGenerator() {
        const currentType = this.coasterTypeManager ? this.coasterTypeManager.getCurrentType() : null;
        const coasterType = currentType ? currentType.name : 'wooden';
        
        // 如果生成器已存在且类型匹配，直接返回
        // 但如果类型改变了，需要清除旧的生成器
        if (this.generators[coasterType]) {
            return this.generators[coasterType];
        }
        
        // 根据类型创建对应的生成器
        const GeneratorClass = GENERATOR_REGISTRY[coasterType];
        let generator;
        
        if (GeneratorClass) {
            generator = new GeneratorClass(this.spline, this.config);
        } else {
            console.warn(`未知的过山车类型: ${coasterType}，使用默认的木架过山车生成器`);
            // 使用默认的木架过山车生成器
            const DefaultGenerator = GENERATOR_REGISTRY['wooden'];
            if (!DefaultGenerator) {
                console.error('无法创建生成器：GENERATOR_REGISTRY 中没有 wooden 生成器！');
                throw new Error('无法创建生成器：GENERATOR_REGISTRY 中没有 wooden 生成器');
            }
            generator = new DefaultGenerator(this.spline, this.config);
        }
        
        // 验证生成器是否有效
        if (!generator) {
            console.error('生成器创建失败！', { coasterType, GeneratorClass });
            throw new Error(`生成器创建失败: ${coasterType}`);
        }
        
        
        // 缓存生成器
        this.generators[coasterType] = generator;
        return generator;
    }
    
    /**
     * 清除生成器缓存（当类型改变时调用）
     */
    clearGeneratorCache() {
        this.generators = {};
        console.log('生成器缓存已清除');
    }
    
    /**
     * 生成轨道网格数据
     * @returns {Object} 轨道网格数据
     */
    generateTrack() {
        if (!this.spline || this.spline.pointCount < 2) {
            console.warn('贝塞尔曲线点数不足，无法生成轨道');
            return null;
        }
        
        const generator = this.getGenerator();
        const result = generator.generateTrack();
        
        // 调试信息
        if (result) {
            const currentType = this.coasterTypeManager ? this.coasterTypeManager.getCurrentType() : null;
            const typeName = currentType ? currentType.name : 'unknown';
            if (result.isMultiMesh) {
                console.log(`✓ 生成多网格轨道（${typeName}），子网格:`, Object.keys(result.meshes || {}));
        } else {
                console.log(`✓ 生成单网格轨道（${typeName}）`);
            }
        }
        
        return result;
    }
    
    /**
     * 设置速度（用于计算倾斜角度）
     * @param {number} speed - 速度（米/秒）
     */
    setSpeed(speed) {
        // 固定为0，禁用离心力影响
        this.config.speed = 0.0;
        // 更新所有生成器的速度
        for (const generator of Object.values(this.generators)) {
            if (generator) {
                generator.speed = 0.0;
            }
        }
    }
    
    // 为了向后兼容，保留 speed 属性的 getter/setter
    get speed() {
        return this.config.speed;
    }
    
    set speed(value) {
        this.setSpeed(value);
    }
    
    // 为了向后兼容，保留其他属性的访问器
    get trackWidth() { return this.config.trackWidth; }
    get trackHeight() { return this.config.trackHeight; }
    get railHeight() { return this.config.railHeight; }
    get railThickness() { return this.config.railThickness; }
    get crossSections() { return this.config.crossSections; }
    get sampleInterval() { return this.config.sampleInterval; }
    get railInterval() { return this.config.railInterval; }
    get shouldGenerateRails() { return this.config.shouldGenerateRails; }
    get gravity() { return this.config.gravity; }
    
    /**
     * 代理方法：将调用转发到当前生成器实例
     * 这些方法在 BaseCoasterGenerator 中实现，但需要通过 TrackGenerator 访问
     */
    
    /**
     * 计算法线向量
     * @param {Vec3} tangent - 切线向量
     * @returns {Vec3} 法线向量
     */
    getNormal(tangent) {
        const generator = this.getGenerator();
        if (!generator) {
            console.error('TrackGenerator.getNormal: 生成器未初始化');
            throw new Error('生成器未初始化');
        }
        if (typeof generator.getNormal !== 'function') {
            console.error('TrackGenerator.getNormal: 生成器没有 getNormal 方法', generator);
            throw new Error('生成器没有 getNormal 方法');
        }
        return generator.getNormal(tangent);
    }
    
    /**
     * 计算倾斜角度（考虑段信息）
     * @param {Vec3} position - 位置
     * @param {Vec3} tangent - 切线
     * @param {number} curvature - 曲率
     * @param {number} segmentIndex - 段索引
     * @param {number} localT - 局部 t 值
     * @returns {Object} 倾斜信息
     */
    calculateBankingAngleWithSegment(position, tangent, curvature, segmentIndex, localT, pointInfo = null) {
        const generator = this.getGenerator();
        if (!generator) {
            console.error('TrackGenerator.calculateBankingAngleWithSegment: 生成器未初始化');
            throw new Error('生成器未初始化');
        }
        if (typeof generator.calculateBankingAngleWithSegment !== 'function') {
            console.error('TrackGenerator.calculateBankingAngleWithSegment: 生成器没有 calculateBankingAngleWithSegment 方法', generator);
            throw new Error('生成器没有 calculateBankingAngleWithSegment 方法');
        }
        return generator.calculateBankingAngleWithSegment(position, tangent, curvature, segmentIndex, localT, pointInfo);
    }
}
