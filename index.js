/**
 * 过山车轨道生成器索引文件
 * 导出所有可用的过山车生成器
 */

// 导入所有生成器类 - 使用完整的 import 语句，确保类在当前作用域中可用
import { BaseCoasterGenerator } from './base-coaster-generator.js';
import { WoodenCoasterGenerator } from './wooden-coaster-generator.js';
import { SteelCoasterGenerator } from './steel-coaster-generator.js';
import { ModernCoasterGenerator } from './modern-coaster-generator.js';

// 重新导出，供外部使用
export { BaseCoasterGenerator };
export { WoodenCoasterGenerator };
export { SteelCoasterGenerator };
export { ModernCoasterGenerator };

// 调试：验证导入是否成功
if (typeof WoodenCoasterGenerator === 'undefined') {
    throw new Error('WoodenCoasterGenerator 导入失败！请检查 wooden-coaster-generator.js 文件。');
}
if (typeof SteelCoasterGenerator === 'undefined') {
    throw new Error('SteelCoasterGenerator 导入失败！请检查 steel-coaster-generator.js 文件。');
}
if (typeof ModernCoasterGenerator === 'undefined') {
    throw new Error('ModernCoasterGenerator 导入失败！请检查 modern-coaster-generator.js 文件。');
}

/**
 * 生成器注册表
 * 用于 TrackGenerator 工厂类根据类型名称查找对应的生成器类
 * 注意：必须在所有 import 语句之后定义，确保所有类都已加载
 */
export const GENERATOR_REGISTRY = {
    'wooden': WoodenCoasterGenerator,
    'steel': SteelCoasterGenerator,
    'modern': ModernCoasterGenerator
};

// 最终验证
console.log('[coaster-generators/index.js] 生成器注册表已创建:', Object.keys(GENERATOR_REGISTRY));

