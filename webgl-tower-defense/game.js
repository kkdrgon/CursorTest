// WebGL2 塔防游戏主程序
// 使用片元着色器进行游戏逻辑计算

class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    static ZERO = new Vector2();
    static v05 = new Vector2(0.5, 0.5);
    static unitVector(a = 0) {
        return new Vector2(Math.cos(a), Math.sin(a));
    }
    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }
    subtract(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }
    multiplyScalar(s) {
        return new Vector2(this.x * s, this.y * s);
    }
    normalize() {
        const len = this.length();
        return len > 0 ? this.multiplyScalar(1 / len) : new Vector2();
    }
    length() {
        return Math.sqrt(this.lenPow());
    }
    lenPow() {
        return this.x ** 2 + this.y ** 2;
    }
    equals(v, epsilon = 1e-6) {
        return Math.abs(this.x - v.x) < epsilon &&
              Math.abs(this.y - v.y) < epsilon;
    }
    copy() {
        return new Vector2(this.x, this.y);
    }
}

class TowerDefenseGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) {
            throw new Error('WebGL2 not supported');
        }
        
        this.gl.enable(this.gl.DEPTH_TEST);
        
        // 游戏状态
        this.gameState = {
            ticks: 0,
            w: 50,
            h: 30,
            r: 0,
            npt: 0,
            towerCtrl: 0,
            tId: -1,
            tx: 0,
            ty: 0,
            lv: 0
        };
        
        this.health = 20;
        this.gold = 20;
        this.eNow = false;
        // 游戏开始时，自动开始第一波（延迟一帧，确保初始化完成）
        this.autoStartFirstWave = true;
        this.clickTowerId = -1;
        this.clickLoc = new Vector2(-50, -50);
        this.clickRange = 1;
        
        // 路径和网格
        this.dir = [-this.gameState.w, this.gameState.w, -1, 1,
                    -this.gameState.w - 1, -this.gameState.w + 1,
                    this.gameState.w - 1, this.gameState.w + 1];
        this.grid = new Uint32Array(1500).fill(60000);
        this.path = new Uint32Array(3000).fill(65535);
        
        this.initGrid();
        this.rePath();
        
        // 着色器程序
        this.computeProgram = null;
        this.renderProgram = null;
        
        // 纹理和帧缓冲区（乒乓缓冲）
        this.unitTextures = [null, null];
        this.framebuffers = [null, null];
        this.currentReadTexture = 0;
        
        // UBO
        this.gameBaseUBO = null;
        this.pathDataUBO = null;
        
        // 渲染相关
        this.renderTexture = null;
        this.fullscreenQuad = null;
        this.geometryBuffer = null;
        this.totalVertices = 0;
        
        // 塔信息
        this.towerInfo = this.towerData();
        
        // 操作跟踪
        this.lastTowerBuildTick = 0;
        this.lastTowerDeleteTick = 0;
        this.lastTowerUpgradeTick = 0;
    }
    
    async init() {
        // 加载着色器
        const [computeShader, renderVertex, renderFragment] = await Promise.all([
            fetch('shaders/compute.frag').then(r => r.text()),
            fetch('shaders/render.vert').then(r => r.text()),
            fetch('shaders/render.frag').then(r => r.text())
        ]);
        
        // 创建计算程序
        this.computeProgram = this.createProgram(
            this.getFullscreenVertexShader(),
            computeShader
        );
        
        // 创建渲染程序
        this.renderProgram = this.createProgram(renderVertex, renderFragment);
        
        // 设置纹理和帧缓冲区
        this.setupTextures();
        
        // 设置UBO
        this.setupUBOs();
        
        // 设置渲染几何
        this.setupRenderGeometry();
        
        // 初始化纹理数据
        this.initializeTextureData();
        
        // 初始化UBO数据
        this.updateUBO();
        
        // 检查WebGL状态
        const glError = this.gl.getError();
        if (glError !== this.gl.NO_ERROR) {
            console.error('WebGL error after init:', glError);
        }
        
        console.log('Game initialized successfully');
        console.log('Total vertices:', this.totalVertices);
        console.log('Render texture:', this.renderTexture ? 'loaded' : 'not loaded');
        console.log('Compute program:', this.computeProgram ? 'created' : 'failed');
        console.log('Render program:', this.renderProgram ? 'created' : 'failed');
    }
    
    getFullscreenVertexShader() {
        return `#version 300 es
        in vec2 a_position;
        in vec2 a_texCoord;
        out vec2 vTexCoord;
        
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            vTexCoord = a_texCoord;
        }`;
    }
    
    createProgram(vsSource, fsSource) {
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            throw new Error(`Program link failed: ${info}`);
        }
        
        return program;
    }
    
    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${info}`);
        }
        
        return shader;
    }
    
    setupTextures() {
        const width = 300;
        const height = 26;
        
        for (let i = 0; i < 2; i++) {
            // 创建纹理
            const texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texStorage2D(this.gl.TEXTURE_2D, 1, this.gl.RGBA32UI, width, height);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            
            this.unitTextures[i] = texture;
            
            // 创建帧缓冲区
            const framebuffer = this.gl.createFramebuffer();
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
            this.gl.framebufferTexture2D(
                this.gl.FRAMEBUFFER,
                this.gl.COLOR_ATTACHMENT0,
                this.gl.TEXTURE_2D,
                texture,
                0
            );
            
            this.framebuffers[i] = framebuffer;
        }
        
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }
    
    setupUBOs() {
        // GameBase UBO
        this.gameBaseUBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.gameBaseUBO);
        
        const blockIndex = this.gl.getUniformBlockIndex(this.computeProgram, 'GameBase');
        if (blockIndex !== this.gl.INVALID_INDEX) {
            const bindingPoint = 0;
            this.gl.uniformBlockBinding(this.computeProgram, blockIndex, bindingPoint);
        }
        
        // PathData UBO
        this.pathDataUBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.pathDataUBO);
        
        const pathBlockIndex = this.gl.getUniformBlockIndex(this.computeProgram, 'PathData');
        if (pathBlockIndex !== this.gl.INVALID_INDEX) {
            const bindingPoint = 1;
            this.gl.uniformBlockBinding(this.computeProgram, pathBlockIndex, bindingPoint);
        }
        
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, null);
    }
    
    updateUBO() {
        // 更新 GameBase UBO (std140布局)
        // std140布局：每个int占4字节，但需要对齐到vec4边界（16字节）
        // 所以11个int需要44字节，但std140会将其对齐到48字节（3个vec4）
        const gameBaseData = new Int32Array(12); // 3个vec4 = 12个int
        gameBaseData[0] = this.gameState.ticks;
        gameBaseData[1] = this.gameState.w;
        gameBaseData[2] = this.gameState.h;
        gameBaseData[3] = this.gameState.r;
        gameBaseData[4] = this.gameState.npt;
        gameBaseData[5] = this.gameState.towerCtrl;
        gameBaseData[6] = this.gameState.tId;
        gameBaseData[7] = this.gameState.tx;
        gameBaseData[8] = this.gameState.ty;
        gameBaseData[9] = this.gameState.lv;
        gameBaseData[10] = this.eNow ? 1 : 0;  // eNow作为int传递
        // gameBaseData[11] 是填充
        
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.gameBaseUBO);
        this.gl.bufferData(this.gl.UNIFORM_BUFFER, gameBaseData, this.gl.DYNAMIC_DRAW);
        this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, 0, this.gameBaseUBO);
        
        // 更新 PathData UBO
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.pathDataUBO);
        this.gl.bufferData(this.gl.UNIFORM_BUFFER, this.path, this.gl.DYNAMIC_DRAW);
        this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, 1, this.pathDataUBO);
        
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, null);
    }
    
    setupRenderGeometry() {
        // 全屏四边形用于计算
        const fullscreenVertices = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
             1,  1, 1, 1
        ]);
        
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, fullscreenVertices, this.gl.STATIC_DRAW);
        
        this.fullscreenQuad = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.fullscreenQuad);
        
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);
        
        this.gl.bindVertexArray(null);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        
        // 渲染几何（用于绘制单位）
        this.setupUnitGeometry();
    }
    
    setupUnitGeometry() {
        // 创建几何：背景网格(1500) + 攻击范围圆(180) + 单位(5000) = 6680个四边形 = 6680*6个顶点
        const totalQuads = 1500 + 180 + 5000; // 背景 + 范围圆 + 单位
        const vertexCount = totalQuads * 6 * 4;
        const vertices = new Float32Array(vertexCount);
        
        let vertexIndex = 0;
        
        // 背景网格 (id: 7500-8999, 1500个)
        for (let i = 0; i < 1500; i++) {
            const quadId = 7500 + i;
            const vBase = vertexIndex;
            vertices[vBase] = 0; vertices[vBase + 1] = 2; vertices[vBase + 2] = quadId; vertices[vBase + 3] = 0;
            vertices[vBase + 4] = 2; vertices[vBase + 5] = 0; vertices[vBase + 6] = quadId; vertices[vBase + 7] = 2;
            vertices[vBase + 8] = -2; vertices[vBase + 9] = 0; vertices[vBase + 10] = quadId; vertices[vBase + 11] = 1;
            vertices[vBase + 12] = -2; vertices[vBase + 13] = 0; vertices[vBase + 14] = quadId; vertices[vBase + 15] = 1;
            vertices[vBase + 16] = 2; vertices[vBase + 17] = 0; vertices[vBase + 18] = quadId; vertices[vBase + 19] = 2;
            vertices[vBase + 20] = 0; vertices[vBase + 21] = -2; vertices[vBase + 22] = quadId; vertices[vBase + 23] = 3;
            vertexIndex += 24;
        }
        
        // 攻击范围圆 (id: 2700-2879, 180个)
        // 在render.vert中，coord.y==9且coord.x<180时是范围圆
        // id = 9*300 + x，所以id范围是2700-2879
        for (let i = 0; i < 180; i++) {
            const quadId = 2700 + i; // 9*300 + i
            const vBase = vertexIndex;
            vertices[vBase] = 0; vertices[vBase + 1] = 2; vertices[vBase + 2] = quadId; vertices[vBase + 3] = 0;
            vertices[vBase + 4] = 2; vertices[vBase + 5] = 0; vertices[vBase + 6] = quadId; vertices[vBase + 7] = 2;
            vertices[vBase + 8] = -2; vertices[vBase + 9] = 0; vertices[vBase + 10] = quadId; vertices[vBase + 11] = 1;
            vertices[vBase + 12] = -2; vertices[vBase + 13] = 0; vertices[vBase + 14] = quadId; vertices[vBase + 15] = 1;
            vertices[vBase + 16] = 2; vertices[vBase + 17] = 0; vertices[vBase + 18] = quadId; vertices[vBase + 19] = 2;
            vertices[vBase + 20] = 0; vertices[vBase + 21] = -2; vertices[vBase + 22] = quadId; vertices[vBase + 23] = 3;
            vertexIndex += 24;
        }
        
        // 单位 (id: 0-4999, 5000个) - 这些ID会在着色器中映射到纹理坐标
        for (let i = 0; i < 5000; i++) {
            const quadId = i;
            const vBase = vertexIndex;
            vertices[vBase] = 0; vertices[vBase + 1] = 2; vertices[vBase + 2] = quadId; vertices[vBase + 3] = 0;
            vertices[vBase + 4] = 2; vertices[vBase + 5] = 0; vertices[vBase + 6] = quadId; vertices[vBase + 7] = 2;
            vertices[vBase + 8] = -2; vertices[vBase + 9] = 0; vertices[vBase + 10] = quadId; vertices[vBase + 11] = 1;
            vertices[vBase + 12] = -2; vertices[vBase + 13] = 0; vertices[vBase + 14] = quadId; vertices[vBase + 15] = 1;
            vertices[vBase + 16] = 2; vertices[vBase + 17] = 0; vertices[vBase + 18] = quadId; vertices[vBase + 19] = 2;
            vertices[vBase + 20] = 0; vertices[vBase + 21] = -2; vertices[vBase + 22] = quadId; vertices[vBase + 23] = 3;
            vertexIndex += 24;
        }
        
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.geometryBuffer = buffer;
        this.totalVertices = totalQuads * 6;
    }
    
    initializeTextureData() {
        const width = 300;
        const height = 26;
        const initialData = new Uint32Array(width * height * 4);
        
        // 初始化所有数据为0（未使用状态）
        for (let i = 0; i < width * height * 4; i++) {
            initialData[i] = 0;
        }
        
        // 初始化计数器位置（第25行，用于敌人生成和塔生成计数）
        // 位置(0, 25)：敌人生成计数器 - 需要初始化isUsed标志
        // 位置(1, 25)：塔生成计数器
        // 位置(2, 25)：游戏状态计数器
        
        // 初始化敌人生成计数器：设置isUsed标志（最低位）
        // 编码：w的最低位是isUsed，所以设置w=1表示isUsed=true
        const eCountIndex = (25 * width + 0) * 4 + 3; // (y * width + x) * 4 + w
        initialData[eCountIndex] = 1; // 设置isUsed标志
        
        for (let i = 0; i < 2; i++) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.unitTextures[i]);
            this.gl.texSubImage2D(
                this.gl.TEXTURE_2D,
                0,
                0, 0,
                width, height,
                this.gl.RGBA_INTEGER,
                this.gl.UNSIGNED_INT,
                initialData
            );
        }
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        console.log('Texture data initialized');
    }
    
    computeStep() {
        const readTexIndex = this.currentReadTexture;
        const writeTexIndex = 1 - this.currentReadTexture;
        
        const readTexture = this.unitTextures[readTexIndex];
        const writeFramebuffer = this.framebuffers[writeTexIndex];
        
        // 绑定帧缓冲区
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, writeFramebuffer);
        this.gl.viewport(0, 0, 300, 26);
        
        // 使用计算程序
        this.gl.useProgram(this.computeProgram);
        
        // 绑定输入纹理
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, readTexture);
        const unitTextureLoc = this.gl.getUniformLocation(this.computeProgram, 'unitTexture');
        this.gl.uniform1i(unitTextureLoc, 0);
        
        // 绑定顶点数组
        this.gl.bindVertexArray(this.fullscreenQuad);
        
        // 绘制全屏四边形
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        
        // 清理
        this.gl.bindVertexArray(null);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        
        // 交换纹理
        this.currentReadTexture = writeTexIndex;
    }
    
    render() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.2, 0.2, 0.3, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        if (!this.renderProgram) {
            console.error('Render program not initialized');
            return;
        }
        
        // 使用渲染程序
        this.gl.useProgram(this.renderProgram);
        
        // 绑定UBO到渲染程序
        const gameBaseBlockIndex = this.gl.getUniformBlockIndex(this.renderProgram, 'GameBase');
        if (gameBaseBlockIndex !== this.gl.INVALID_INDEX) {
            this.gl.uniformBlockBinding(this.renderProgram, gameBaseBlockIndex, 0);
            // 确保UBO已绑定
            this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, 0, this.gameBaseUBO);
        } else {
            console.warn('GameBase UBO block not found in render program');
        }
        
        // 设置uniform
        const dzLoc = this.gl.getUniformLocation(this.renderProgram, 'dz');
        const sLoc = this.gl.getUniformLocation(this.renderProgram, 's');
        const attrLoc = this.gl.getUniformLocation(this.renderProgram, 'attr');
        
        if (!dzLoc || !sLoc || !attrLoc) {
            console.error('Uniform locations not found:', {dzLoc, sLoc, attrLoc});
            return;
        }
        
        this.gl.uniform4f(dzLoc, 29.0, 16.0, 1.05, 0);
        this.gl.uniform4f(sLoc, this.canvas.width, this.canvas.height, 0.5, 0);
        
        // 计算单位数量编码
        // 在render.vert中：uc = attr.w / 1024, ts = attr.w % 1024
        // uc是单位数量（塔+敌人+子弹），ts是塔的数量
        // 这里我们设置一个合理的值，让着色器能正确渲染所有单位
        const totalUnits = 7500; // 最大单位数（塔+敌人+子弹）
        const towerSize = 0; // 塔的数量（动态，从纹理读取，这里先设为0）
        const unitCount = totalUnits * 1024 + towerSize;
        this.gl.uniform4f(attrLoc, this.clickLoc.x, this.clickLoc.y, this.clickRange, unitCount);
        
        // 绑定单位纹理
        const unitTextureLoc = this.gl.getUniformLocation(this.renderProgram, 'unitTexture');
        if (unitTextureLoc) {
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.unitTextures[this.currentReadTexture]);
            this.gl.uniform1i(unitTextureLoc, 0);
        } else {
            console.warn('unitTexture uniform not found');
        }
        
        // 绑定纹理图集
        const textureLoc = this.gl.getUniformLocation(this.renderProgram, 'u_texture');
        const tintLoc = this.gl.getUniformLocation(this.renderProgram, 'u_tint');
        const brightnessLoc = this.gl.getUniformLocation(this.renderProgram, 'u_brightness');
        
        if (textureLoc) {
            if (this.renderTexture) {
                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.renderTexture);
                this.gl.uniform1i(textureLoc, 1);
            } else {
                // 如果没有纹理，使用单位纹理作为占位符
                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.unitTextures[this.currentReadTexture]);
                this.gl.uniform1i(textureLoc, 1);
            }
        } else {
            console.warn('u_texture uniform not found');
        }
        
        // 设置默认的tint和brightness
        if (tintLoc) {
            this.gl.uniform4f(tintLoc, 1.0, 1.0, 1.0, 1.0);
        }
        if (brightnessLoc) {
            this.gl.uniform1f(brightnessLoc, 1.0);
        }
        
        // 绑定几何
        if (!this.geometryBuffer) {
            console.error('Geometry buffer not initialized');
            return;
        }
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.geometryBuffer);
        const posLoc = this.gl.getAttribLocation(this.renderProgram, 'aPosition');
        if (posLoc === -1) {
            console.error('aPosition attribute not found');
            return;
        }
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 4, this.gl.FLOAT, false, 0, 0);
        
        // 绘制所有几何（背景 + 范围圆 + 单位）
        const vertexCount = this.totalVertices > 0 ? this.totalVertices : 6680 * 6;
        this.gl.drawArrays(this.gl.TRIANGLES, 0, vertexCount);
        
        // 检查错误
        const error = this.gl.getError();
        if (error !== this.gl.NO_ERROR) {
            console.error('WebGL error in render:', error);
        }
    }
    
    update() {
        this.gameState.ticks++;
        this.gameState.r = Math.floor(Math.random() * 6);
        
        // 自动开始第一波（延迟一帧，确保初始化完成）
        if (this.autoStartFirstWave && this.gameState.ticks > 1) {
            this.autoStartFirstWave = false;
            this.eNow = true;
            this.gameState.npt = this.gameState.ticks;
            this.gameState.lv = 1;
            console.log('First wave started:', {
                ticks: this.gameState.ticks,
                npt: this.gameState.npt,
                lv: this.gameState.lv,
                eNow: this.eNow
            });
        }
        
        // 调试：每30个ticks输出一次状态
        if (this.gameState.ticks % 30 === 0 && this.gameState.ticks > 0) {
            const t = this.gameState.ticks - this.gameState.npt;
            console.log('Game state:', {
                ticks: this.gameState.ticks,
                npt: this.gameState.npt,
                t: t,
                tMod10: t % 10,
                eNow: this.eNow,
                lv: this.gameState.lv,
                shouldSpawn: t <= 600 && t >= 0 && t % 10 === 0 && (this.eNow || this.gameState.npt > 0)
            });
        }
        
        // 更新波次（600 ticks = 20秒，900 ticks = 30秒）
        if (this.gameState.lv < 199 && 
            ((this.gameState.ticks >= (this.gameState.npt + 600) && this.eNow) ||
             (this.gameState.ticks >= (this.gameState.npt + 900)))) {
            this.eNow = false;
            this.gameState.npt = this.gameState.ticks;
            this.gameState.lv++;
            this.gold = Math.floor(this.gold * 1.05);
        }
        
        // 重置操作标记（延迟一帧，让着色器处理完）
        if (this.gameState.towerCtrl > 0 && this.gameState.ticks > 1) {
            // 只在操作完成后重置
            const shouldReset = (this.gameState.towerCtrl === 1 && this.gameState.ticks > this.lastTowerBuildTick + 1) ||
                               (this.gameState.towerCtrl === 2 && this.gameState.ticks > this.lastTowerDeleteTick + 1) ||
                               (this.gameState.towerCtrl === 3 && this.gameState.ticks > this.lastTowerUpgradeTick + 1);
            if (shouldReset) {
                this.gameState.towerCtrl = 0;
                this.gameState.tId = -1;
            }
        }
        
        // 更新UBO
        this.updateUBO();
        
        // 执行计算步骤（在GPU上计算游戏逻辑）
        this.computeStep();
    }
    
    // 初始化网格
    initGrid() {
        const s = this.gameState.w * this.gameState.h;
        for (let i = 0; i < this.gameState.w; i++) {
            this.grid[i] = 65535;
            this.grid[i + this.gameState.w] = 65535;
            this.grid[s - i - 1] = 65535;
            this.grid[s - i - 1 - this.gameState.w] = 65535;
        }
        for (let i = 0; i < this.gameState.h; i++) {
            this.grid[i * this.gameState.w] = 65535;
            this.grid[i * this.gameState.w + 1] = 65535;
            this.grid[i * this.gameState.w + this.gameState.w - 1] = 65535;
            this.grid[i * this.gameState.w + this.gameState.w - 2] = 65535;
        }
        for (let i = 0; i < 6; i++) {
            this.grid[this.gameState.w / 2 + this.gameState.w * (this.gameState.h - 2) - 3 + i] = 60000;
            this.grid[(this.gameState.h / 2 - 3 + i) * this.gameState.w + 1] = 60000;
            this.grid[this.gameState.w / 2 + this.gameState.w - 3 + i] = 60000;
            this.grid[(this.gameState.h / 2 - 3 + i) * this.gameState.w + this.gameState.w - 2] = 60000;
        }
    }
    
    // 重新计算路径
    rePath() {
        for (let p = 0; p < 2; p++) {
            const gridCopy = this.grid.map(value => value);
            const q = [];
            let c, d;
            
            if (p == 0) {
                c = this.gameState.w / 2 + this.gameState.w * (this.gameState.h - 2) - 3;
                d = 1;
            } else {
                c = (this.gameState.h / 2 - 3) * this.gameState.w + 1;
                d = this.gameState.w;
            }
            
            for (let i = 0; i < 6; i++) {
                q.push([c + d * i, 0]);
            }
            
            while (q.length > 0) {
                const t = q.shift();
                if (gridCopy[t[0]] == 60000) {
                    gridCopy[t[0]] = t[1];
                    for (let d = 0; d < 8; d++) {
                        const e = t[0] + this.dir[d];
                        if (gridCopy[e] == 60000) {
                            q.push([e, t[1] + 1]);
                        }
                    }
                }
            }
            
            for (c = this.gameState.w + 1; c < this.gameState.w * this.gameState.h - this.gameState.w - 1; c++) {
                d = gridCopy[c];
                const imax = d > 60000 ? 4 : 8;
                let min_val = 60000;
                let min_index = 1000000;
                for (let i = 0; i < imax; i++) {
                    const e = c + this.dir[i];
                    if (gridCopy[e] < min_val) {
                        min_val = gridCopy[e];
                        min_index = e;
                    }
                }
                this.path[p * 1500 + c] = min_index == 1000000 ? 65535 : min_index;
            }
        }
    }
    
    // 检查路径
    checkPath(b) {
        for (let p = 0; p < 2; p++) {
            const gridCopy = this.grid.map(value => value);
            gridCopy[b - 1] = 62000;
            gridCopy[b + this.gameState.w - 1] = 62000;
            gridCopy[b + this.gameState.w] = 62000;
            gridCopy[b] = 62000;
            
            const q = [];
            let c, d;
            if (p == 0) {
                c = this.gameState.w / 2 + this.gameState.w * (this.gameState.h - 2) - 3;
                d = 1;
            } else {
                c = (this.gameState.h / 2 - 3) * this.gameState.w + 1;
                d = this.gameState.w;
            }
            
            for (let i = 0; i < 6; i++) {
                q.push([c + d * i, 0]);
            }
            
            while (q.length > 0) {
                const t = q.shift();
                if (gridCopy[t[0]] == 60000) {
                    gridCopy[t[0]] = t[1];
                    for (let d = 0; d < 8; d++) {
                        const e = t[0] + this.dir[d];
                        if (gridCopy[e] == 60000) {
                            q.push([e, t[1] + 1]);
                        }
                    }
                }
            }
            
            if (p == 0) {
                c = this.gameState.w / 2 + this.gameState.w - 3;
                d = 1;
            } else {
                c = (this.gameState.h / 2 - 3) * this.gameState.w + this.gameState.w - 2;
                d = this.gameState.w;
            }
            for (let i = 0; i < 6; i++) {
                if (gridCopy[c + d * i] > 50000) {
                    return false;
                }
            }
        }
        return true;
    }
    
    // 塔数据
    towerData() {
        return [
            {id: 0, range: 6, cooldown: 10, canF: true, canG: true, gold: 5, bulletId: 0, updateId: 3},
            {id: 1, range: 8, cooldown: 40, canF: false, canG: true, gold: 20, bulletId: 1, updateId: 4},
            {id: 2, range: 10, cooldown: 4, canF: true, canG: false, gold: 100, bulletId: 2, updateId: 5},
            {id: 3, range: 10, cooldown: 8, canF: true, canG: true, gold: 20, bulletId: 3, updateId: 6},
            {id: 4, range: 10, cooldown: 35, canF: false, canG: true, gold: 100, bulletId: 4, updateId: 7},
            {id: 5, range: 12, cooldown: 3, canF: true, canG: false, gold: 500, bulletId: 5, updateId: 8},
            {id: 6, range: 15, cooldown: 6, canF: true, canG: true, gold: 100, bulletId: 6, updateId: -1},
            {id: 7, range: 12, cooldown: 30, canF: false, canG: true, gold: 500, bulletId: 7, updateId: -1},
            {id: 8, range: 14, cooldown: 2, canF: true, canG: false, gold: 5000, bulletId: 8, updateId: -1},
            {id: 9, range: 2, cooldown: 2, canF: false, canG: false, gold: 5, bulletId: -1, updateId: -1}
        ];
    }
    
    // 检查塔位置
    checkTower(x, y) {
        if (x >= 3 && y >= 3 && x <= 47 && y <= 27) {
            const b = x + y * this.gameState.w - this.gameState.w;
            const ch = this.checkPath(b);
            this.gameState.check = (this.grid[b - 1] <= 60000 && ch ? 0 : 1) +
                                  (this.grid[b + this.gameState.w - 1] <= 60000 && ch ? 0 : 2) +
                                  (this.grid[b + this.gameState.w] <= 60000 && ch ? 0 : 4) +
                                  (this.grid[b] <= 60000 && ch ? 0 : 8);
            this.gameState.tId = -2;
            this.gameState.tx = x;
            this.gameState.ty = y;
            this.gameState.tr = 0;
        }
    }
    
    // 点击塔
    clickTower(x, y) {
        const cp = new Vector2(x, y);
        this.clickTowerId = -1;
        this.clickLoc.x = -50;
        this.clickLoc.y = -50;
        this.clickRange = 1;
        
        // 这里需要从纹理读取塔数据，暂时简化处理
        // 实际应该从GPU读取纹理数据
    }
    
    // 建造塔
    buildTower(towerId, x, y) {
        if (x >= 3 && y >= 3 && x <= 47 && y <= 27) {
            const b = x + y * this.gameState.w - this.gameState.w;
            const ti = this.towerInfo[towerId];
            
            if (ti.gold <= this.gold) {
                if (this.grid[b - 1] <= 60000 &&
                    this.grid[b + this.gameState.w - 1] <= 60000 &&
                    this.grid[b + this.gameState.w] <= 60000 &&
                    this.grid[b] <= 60000 &&
                    this.checkPath(b)) {
                    
                    this.gameState.towerCtrl = 1;
                    this.gameState.tId = towerId;
                    this.gameState.tx = x;
                    this.gameState.ty = y;
                    this.lastTowerBuildTick = this.gameState.ticks;
                    
                    this.gold -= ti.gold;
                    this.grid[b - 1] = 62000;
                    this.grid[b + this.gameState.w - 1] = 62000;
                    this.grid[b + this.gameState.w] = 62000;
                    this.grid[b] = 62000;
                    this.rePath();
                    this.updateUBO(); // 立即更新路径数据
                }
            }
        }
    }
    
    // 删除塔
    removeTower(towerIndex) {
        this.gameState.towerCtrl = 2;
        this.gameState.tId = towerIndex;
        this.lastTowerDeleteTick = this.gameState.ticks;
    }
    
    // 升级塔
    upgradeTower(towerIndex) {
        this.gameState.towerCtrl = 3;
        this.gameState.tId = towerIndex;
        this.lastTowerUpgradeTick = this.gameState.ticks;
    }
    
    // 加载纹理图集
    async loadTexture(url) {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // 允许跨域
        img.src = url;
        await img.decode();
        
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            img
        );
        // 使用NEAREST过滤，因为这是像素艺术风格的图集
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.renderTexture = texture;
        console.log('Texture loaded:', img.width, 'x', img.height);
    }
}

export { TowerDefenseGame, Vector2 };

