import { Vec3, Mat4 } from './math3d.js';

/**
 * WebGL2渲染器
 */
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;

        if (!canvas) {
            throw new Error('Canvas元素不存在');
        }

        console.log('尝试创建WebGL2上下文...');

        // 尝试创建WebGL2上下文
        let gl = canvas.getContext('webgl2', {
            antialias: true,
            depth: true,
            alpha: false,
            preserveDrawingBuffer: false
        });

        // 如果WebGL2不支持，尝试WebGL1
        if (!gl) {
            console.warn('WebGL2不支持，尝试WebGL1...');
            gl = canvas.getContext('webgl', {
                antialias: true,
                depth: true,
                alpha: false,
                preserveDrawingBuffer: false
            }) || canvas.getContext('experimental-webgl', {
                antialias: true,
                depth: true,
                alpha: false,
                preserveDrawingBuffer: false
            });

            if (!gl) {
                const errorMsg = 'WebGL不支持，请使用支持WebGL的现代浏览器（Chrome、Firefox、Edge等）';
                console.error(errorMsg);
                alert(errorMsg);
                throw new Error(errorMsg);
            }

            console.warn('使用WebGL1（某些功能可能受限）');
            this.isWebGL2 = false;
        } else {
            console.log('WebGL2上下文创建成功');
            this.isWebGL2 = true;
        }

        this.gl = gl;

        // 检查并启用 OES_element_index_uint 扩展（WebGL2 原生支持，但为了兼容性检查）
        if (this.isWebGL2) {
            // WebGL2 原生支持 Uint32Array，不需要扩展
            this.supportsUint32Indices = true;
            console.log('WebGL2: 原生支持 Uint32Array 索引');
        } else {
            // WebGL1 需要扩展
            const uintIndexExt = this.gl.getExtension('OES_element_index_uint');
            this.supportsUint32Indices = !!uintIndexExt;
            if (this.supportsUint32Indices) {
                console.log('WebGL1: 已启用 OES_element_index_uint 扩展');
            } else {
                console.warn('WebGL1: 不支持 OES_element_index_uint 扩展，将使用 Uint16Array');
            }
        }

        // 检查WebGL上下文是否有效
        try {
            const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                console.log('GPU渲染器:', this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                console.log('GPU供应商:', this.gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
            }

            console.log('WebGL版本:', this.gl.getParameter(this.gl.VERSION));
            console.log('着色器语言版本:', this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION));
            console.log('最大纹理大小:', this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
            console.log('最大视口尺寸:', this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS));

            // 测试基本功能
            const testError = this.gl.getError();
            if (testError !== this.gl.NO_ERROR) {
                console.warn('WebGL初始化后检测到错误:', testError);
            } else {
                console.log('WebGL上下文验证通过');
            }
        } catch (error) {
            console.error('WebGL上下文验证失败:', error);
            throw error;
        }

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);

        // 着色器将在异步初始化中加载
        this.shadersReady = false;
        this.initShaders().catch(err => {
            console.error('着色器加载失败:', err);
            alert('着色器加载失败: ' + err.message);
        });
        this.initBuffers();

        // 测试清除画布
        this.gl.clearColor(0.2, 0.3, 0.4, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        console.log('初始清除完成');

        // 相机参数（调整以更好地查看循环轨道）
        this.camera = {
            position: new Vec3(0, 15, 30),  // 调整相机位置，确保能看到整个轨道
            target: new Vec3(5, 5, 5),      // 看向轨道中心
            up: new Vec3(0, 1, 0),
            fov: Math.PI / 4,
            near: 0.1,
            far: 1000
        };

        console.log('相机位置:', this.camera.position);
        console.log('相机目标:', this.camera.target);

        // 光照参数
        this.light = {
            direction: new Vec3(0.5, -1, 0.3).normalize(),
            color: new Vec3(1, 1, 1),
            ambient: new Vec3(0.3, 0.3, 0.3)
        };

        this.trackMeshesMap = new Map(); // Store meshes by ID: Map<string, MeshData>
        this.curveLineMesh = null;
        this.curveDangerLineMesh = null;
        this.controlPointsMesh = null;
        this.groundMesh = null;
        this._groundMeshWarningShown = false;
        this._groundUniformWarningShown = false;

        // 天空盒
        this.skyboxProgram = null;
        this.skyboxVao = null;
        this.skyboxVertexBuffer = null;

        this.initGroundMesh();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    async initShaders() {
        try {
            // 加载轨道着色器
            const trackVertSource = await this.loadShaderSource('shaders/track.vert');
            const trackFragSource = await this.loadShaderSource('shaders/track.frag');
            this.trackProgram = this.createProgram(trackVertSource, trackFragSource);
            console.log('轨道着色器加载成功，程序ID:', this.trackProgram);

            // 加载线条着色器
            const lineVertSource = await this.loadShaderSource('shaders/line.vert');
            const lineFragSource = await this.loadShaderSource('shaders/line.frag');
            this.lineProgram = this.createProgram(lineVertSource, lineFragSource);
            console.log('线条着色器加载成功，程序ID:', this.lineProgram);

            // 加载天空盒着色器
            const skyboxVertSource = await this.loadShaderSource('shaders/skybox.vert');
            const skyboxFragSource = await this.loadShaderSource('shaders/skybox.frag');
            this.skyboxProgram = this.createProgram(skyboxVertSource, skyboxFragSource);
            this.initSkyboxMesh();
            console.log('天空盒着色器加载成功，程序ID:', this.skyboxProgram);

            this.shadersReady = true;
            console.log('所有着色器加载完成，可以开始渲染');
        } catch (error) {
            console.error('着色器初始化失败:', error);
            this.shadersReady = false;
            throw error;
        }
    }

    async loadShaderSource(path) {
        console.log('加载着色器:', path);
        const response = await fetch(path);
        if (!response.ok) {
            console.error(`着色器加载失败: ${path}, 状态码: ${response.status}`);
            throw new Error(`无法加载着色器: ${path} (状态码: ${response.status})`);
        }
        const source = await response.text();
        console.log(`着色器 ${path} 加载成功, 长度: ${source.length}`);
        return source;
    }

    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;

        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error('着色器程序链接失败: ' + error);
        }

        return program;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('着色器编译失败: ' + error);
        }

        return shader;
    }

    initBuffers() {
        // 缓冲区将在设置网格时创建
    }

    /**
     * 初始化地面网格（棋盘格）
     * @param {Array<{position: {x, y, z}}>} trackPoints - 轨道点数组，用于创建凹陷
     */
    initGroundMesh(trackPoints = null) {
        const gl = this.gl;
        const size = 200;
        const divisions = size;
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const step = size / divisions;
        const halfSize = size / 2;

        // 轨道凹陷参数
        const trackInfluenceRadius = 5.0; // 轨道影响半径（米）
        const minTrackClearance = 3.0; // 地面低于轨道的最小距离（米）
        const trackWidth = 1.5; // 轨道宽度（米）

        // 提取轨道点位置（如果提供）
        const trackPositions = [];
        if (trackPoints && trackPoints.length > 0) {
            for (const point of trackPoints) {
                if (point && point.position) {
                    const pos = point.position;
                    // 记录所有轨道点位置（不管是否低于地面）
                    trackPositions.push({ x: pos.x, y: pos.y, z: pos.z });
                }
            }
        }

        // 生成地面顶点
        for (let i = 0; i <= divisions; i++) {
            for (let j = 0; j <= divisions; j++) {
                const x = -halfSize + i * step;
                const z = -halfSize + j * step;
                let y = 0; // 默认地面高度

                // 如果轨道点存在，计算凹陷
                if (trackPositions.length > 0) {
                    let minDistance = Infinity;
                    let nearestTrackY = 0;

                    // 找到最近的轨道点
                    for (const trackPos of trackPositions) {
                        const dx = x - trackPos.x;
                        const dz = z - trackPos.z;
                        const distance = Math.sqrt(dx * dx + dz * dz);

                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestTrackY = trackPos.y;
                        }
                    }

                    // 如果轨道点足够近，确保地面低于轨道至少3米
                    if (minDistance < trackInfluenceRadius) {
                        // 使用平滑的衰减函数
                        const influence = 1.0 - (minDistance / trackInfluenceRadius);
                        const smoothInfluence = influence * influence * (3 - 2 * influence); // smoothstep

                        // 计算目标地面高度：轨道高度 - 最小间距
                        const targetGroundY = nearestTrackY - minTrackClearance;

                        // 如果轨道在轨道宽度内，直接使用目标高度
                        if (minDistance < trackWidth) {
                            y = targetGroundY;
                        } else {
                            // 在影响半径内，使用平滑过渡
                            // 从目标高度平滑过渡到默认高度（0）
                            y = targetGroundY * smoothInfluence;
                        }

                        // 确保地面不会高于默认高度（0）
                        y = Math.min(y, 0);
                    }
                }

                vertices.push(x, y, z);

                // 计算法线（简化：如果y改变，法线也会改变，但这里先保持向上）
                normals.push(0, 1, 0);
                uvs.push(i / divisions, j / divisions);
            }
        }

        // 重新计算法线（基于相邻顶点，使用简化的方法）
        for (let i = 0; i <= divisions; i++) {
            for (let j = 0; j <= divisions; j++) {
                const idx = i * (divisions + 1) + j;
                const vIdx = idx * 3;

                // 获取当前顶点位置
                const x = vertices[vIdx];
                const y = vertices[vIdx + 1];
                const z = vertices[vIdx + 2];

                // 计算法线：使用相邻两个三角形的法线平均值
                let nx = 0, ny = 0, nz = 0;
                let count = 0;

                // 检查四个方向的相邻顶点
                const neighbors = [
                    { di: 1, dj: 0 },  // 右
                    { di: 0, dj: 1 },  // 前
                    { di: -1, dj: 0 }, // 左
                    { di: 0, dj: -1 }  // 后
                ];

                for (const n of neighbors) {
                    const ni = i + n.di;
                    const nj = j + n.dj;
                    if (ni >= 0 && ni <= divisions && nj >= 0 && nj <= divisions) {
                        const nIdx = ni * (divisions + 1) + nj;
                        const nvIdx = nIdx * 3;
                        const nx2 = vertices[nvIdx];
                        const ny2 = vertices[nvIdx + 1];
                        const nz2 = vertices[nvIdx + 2];

                        // 计算从当前顶点到相邻顶点的向量
                        const dx = nx2 - x;
                        const dy = ny2 - y;
                        const dz = nz2 - z;

                        // 计算法线（使用梯度）
                        // 对于地面，法线主要取决于y的变化
                        const len = Math.sqrt(dx * dx + dz * dz);
                        if (len > 0.0001) {
                            // 法线垂直于梯度方向
                            nx += -dx / len * dy;
                            ny += len;
                            nz += -dz / len * dy;
                            count++;
                        }
                    }
                }

                // 归一化法线
                if (count > 0) {
                    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                    if (len > 0.0001) {
                        normals[idx * 3] = nx / len;
                        normals[idx * 3 + 1] = ny / len;
                        normals[idx * 3 + 2] = nz / len;
                    } else {
                        // 如果法线长度为0，使用默认向上法线
                        normals[idx * 3] = 0;
                        normals[idx * 3 + 1] = 1;
                        normals[idx * 3 + 2] = 0;
                    }
                } else {
                    // 没有相邻顶点，使用默认向上法线
                    normals[idx * 3] = 0;
                    normals[idx * 3 + 1] = 1;
                    normals[idx * 3 + 2] = 0;
                }
            }
        }

        // 生成索引
        for (let i = 0; i < divisions; i++) {
            for (let j = 0; j < divisions; j++) {
                const a = i * (divisions + 1) + j;
                const b = a + 1;
                const c = a + (divisions + 1);
                const d = c + 1;
                // ensure counter-clockwise winding (front face up)
                indices.push(a, b, c);
                indices.push(b, d, c);
            }
        }

        // 如果已有地面网格，删除旧缓冲区
        if (this.groundMesh) {
            if (this.groundMesh.vertexBuffer) gl.deleteBuffer(this.groundMesh.vertexBuffer);
            if (this.groundMesh.normalBuffer) gl.deleteBuffer(this.groundMesh.normalBuffer);
            if (this.groundMesh.uvBuffer) gl.deleteBuffer(this.groundMesh.uvBuffer);
            if (this.groundMesh.indexBuffer) gl.deleteBuffer(this.groundMesh.indexBuffer);
        }

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

        this.groundMesh = {
            vertexBuffer,
            normalBuffer,
            uvBuffer,
            indexBuffer,
            indexCount: indices.length
        };
    }

    /**
     * 渲染地面
     */
    renderGround(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        if (!this.trackProgram || !this.groundMesh) {
            if (!this._groundMeshWarningShown) {
                console.warn('地面网格或着色器未准备好', {
                    trackProgram: !!this.trackProgram,
                    groundMesh: !!this.groundMesh
                });
                this._groundMeshWarningShown = true;
            }
            return;
        }

        gl.useProgram(this.trackProgram);

        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
        const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
        const texCoordLoc = gl.getAttribLocation(this.trackProgram, 'aTexCoord');

        if (positionLoc < 0 || normalLoc < 0 || texCoordLoc < 0) {
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.groundMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.groundMesh.normalBuffer);
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.groundMesh.uvBuffer);
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.groundMesh.indexBuffer);

        const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
        const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
        const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
        const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
        const colorLoc = gl.getUniformLocation(this.trackProgram, 'uColor');
        const uvScaleLoc = gl.getUniformLocation(this.trackProgram, 'uUvScale');
        const isGroundLoc = gl.getUniformLocation(this.trackProgram, 'uIsGround');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
        if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
        if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
        if (colorLoc) gl.uniform3f(colorLoc, 0.45, 0.65, 0.4);
        if (uvScaleLoc) gl.uniform1f(uvScaleLoc, 200.0);
        if (isGroundLoc) gl.uniform1i(isGroundLoc, 1);

        gl.drawElements(gl.TRIANGLES, this.groundMesh.indexCount, gl.UNSIGNED_INT, 0);

        if (isGroundLoc) gl.uniform1i(isGroundLoc, 0);
    }

    /**
     * 渲染栅栏
     */
    renderFence(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        if (!this.trackProgram || !this.fenceMesh) {
            return;
        }

        gl.useProgram(this.trackProgram);

        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
        const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
        const texCoordLoc = gl.getAttribLocation(this.trackProgram, 'aTexCoord');

        if (positionLoc < 0 || normalLoc < 0 || texCoordLoc < 0) {
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.fenceMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.fenceMesh.normalBuffer);
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.fenceMesh.uvBuffer);
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fenceMesh.indexBuffer);

        const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
        const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
        const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
        const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
        const colorLoc = gl.getUniformLocation(this.trackProgram, 'uColor');
        const uvScaleLoc = gl.getUniformLocation(this.trackProgram, 'uUvScale');
        const isGroundLoc = gl.getUniformLocation(this.trackProgram, 'uIsGround');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
        if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
        if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
        // 栅栏颜色（棕色）
        if (colorLoc) gl.uniform3f(colorLoc, 0.6, 0.4, 0.2);
        if (uvScaleLoc) gl.uniform1f(uvScaleLoc, 1.0);
        if (isGroundLoc) gl.uniform1i(isGroundLoc, 0);

        gl.drawElements(gl.TRIANGLES, this.fenceMesh.indexCount, gl.UNSIGNED_INT, 0);
    }

    /**
     * 渲染可购买格子（半透明绿色）
     */
    renderPurchasableGrids(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        if (!this.trackProgram || !this.purchasableGridsMesh) {
            return;
        }

        gl.useProgram(this.trackProgram);

        // 启用混合以显示半透明
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true); // 改为true，确保深度测试正确
        gl.disable(gl.DEPTH_TEST); // 临时禁用深度测试，确保格子显示在地面上方

        // 禁用背面剔除，确保从上方和下方都能看到
        gl.disable(gl.CULL_FACE);

        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
        const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
        const texCoordLoc = gl.getAttribLocation(this.trackProgram, 'aTexCoord');

        if (positionLoc < 0 || normalLoc < 0 || texCoordLoc < 0) {
            gl.disable(gl.BLEND);
            gl.depthMask(true);
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.purchasableGridsMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.purchasableGridsMesh.normalBuffer);
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.purchasableGridsMesh.uvBuffer);
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.purchasableGridsMesh.indexBuffer);

        const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
        const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
        const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
        const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
        const colorLoc = gl.getUniformLocation(this.trackProgram, 'uColor');
        const uvScaleLoc = gl.getUniformLocation(this.trackProgram, 'uUvScale');
        const isGroundLoc = gl.getUniformLocation(this.trackProgram, 'uIsGround');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
        if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
        if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
        // 可购买格子颜色（更明显的绿色）
        if (colorLoc) gl.uniform3f(colorLoc, 0.0, 1.0, 0.0); // 纯绿色，更明显
        if (uvScaleLoc) gl.uniform1f(uvScaleLoc, 1.0);
        if (isGroundLoc) gl.uniform1i(isGroundLoc, 1);

        gl.drawElements(gl.TRIANGLES, this.purchasableGridsMesh.indexCount, gl.UNSIGNED_INT, 0);

        // 恢复状态
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
    }

    /**
     * 更新栅栏（根据公园管理器）
     */
    updateFence(parkManager) {
        if (!parkManager) {
            console.warn('updateFence: parkManager为空');
            return;
        }

        const boundary = parkManager.getParkBoundary();
        console.log('更新栅栏，边界线段数:', boundary.length);

        if (boundary.length === 0) {
            this.fenceMesh = null;
            return;
        }

        const meshData = this.fenceGenerator.generateFence(boundary);
        if (!meshData) {
            console.warn('栅栏网格生成失败');
            this.fenceMesh = null;
            return;
        }

        console.log('栅栏网格生成成功，顶点数:', meshData.vertices.length / 3, '索引数:', meshData.indices.length);

        const gl = this.gl;

        // 清理旧的栅栏网格
        if (this.fenceMesh) {
            if (this.fenceMesh.vertexBuffer) gl.deleteBuffer(this.fenceMesh.vertexBuffer);
            if (this.fenceMesh.normalBuffer) gl.deleteBuffer(this.fenceMesh.normalBuffer);
            if (this.fenceMesh.uvBuffer) gl.deleteBuffer(this.fenceMesh.uvBuffer);
            if (this.fenceMesh.indexBuffer) gl.deleteBuffer(this.fenceMesh.indexBuffer);
        }

        // 创建新的栅栏网格
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.normals, gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.uvs, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

        this.fenceMesh = {
            vertexBuffer,
            normalBuffer,
            uvBuffer,
            indexBuffer,
            indexCount: meshData.indices.length
        };

        console.log('栅栏网格缓冲区创建完成');
    }

    /**
     * 更新可购买格子可视化
     */
    updatePurchasableGrids(parkManager, isBuyMode) {
        if (!parkManager || !isBuyMode) {
            this.purchasableGridsMesh = null;
            return;
        }

        const purchasableGrids = parkManager.getPurchasableAdjacentGrids();
        console.log('更新可购买格子，数量:', purchasableGrids.length);

        if (purchasableGrids.length === 0) {
            this.purchasableGridsMesh = null;
            return;
        }

        const gl = this.gl;
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let vertexOffset = 0;

        // 为每个可购买格子创建一个半透明的平面
        for (const grid of purchasableGrids) {
            const bounds = grid.bounds || parkManager.getGridBounds(grid.gridX, grid.gridZ);
            const y = 0.02; // 稍微高于地面（提高一点，确保可见）

            // 创建平面（两个三角形）- 反转索引顺序使法线向上
            const planeVertices = [
                bounds.minX, y, bounds.minZ,
                bounds.maxX, y, bounds.minZ,
                bounds.maxX, y, bounds.maxZ,
                bounds.minX, y, bounds.maxZ
            ];

            const planeNormals = [
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,
                0, 1, 0
            ];

            const planeUvs = [
                0, 0,
                1, 0,
                1, 1,
                0, 1
            ];

            // 反转索引顺序，使法线向上（从上方可以看到）
            const planeIndices = [
                0, 2, 1,
                0, 3, 2
            ];

            for (let i = 0; i < 4; i++) {
                vertices.push(planeVertices[i * 3], planeVertices[i * 3 + 1], planeVertices[i * 3 + 2]);
                normals.push(planeNormals[i * 3], planeNormals[i * 3 + 1], planeNormals[i * 3 + 2]);
                uvs.push(planeUvs[i * 2], planeUvs[i * 2 + 1]);
            }

            for (let idx of planeIndices) {
                indices.push(vertexOffset + idx);
            }
            vertexOffset += 4;
        }

        // 清理旧的网格
        if (this.purchasableGridsMesh) {
            if (this.purchasableGridsMesh.vertexBuffer) gl.deleteBuffer(this.purchasableGridsMesh.vertexBuffer);
            if (this.purchasableGridsMesh.normalBuffer) gl.deleteBuffer(this.purchasableGridsMesh.normalBuffer);
            if (this.purchasableGridsMesh.uvBuffer) gl.deleteBuffer(this.purchasableGridsMesh.uvBuffer);
            if (this.purchasableGridsMesh.indexBuffer) gl.deleteBuffer(this.purchasableGridsMesh.indexBuffer);
        }

        // 创建新的网格
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

        this.purchasableGridsMesh = {
            vertexBuffer,
            normalBuffer,
            uvBuffer,
            indexBuffer,
            indexCount: indices.length
        };

        console.log('可购买格子网格创建完成，格子数:', purchasableGrids.length);
    }

    /**
     * 设置轨道网格
     */
    /**
     * 设置轨道网格
     * @param {string} id - 轨道ID
     * @param {Object} meshData - 网格数据
     */
    setTrackMesh(id, meshData) {
        if (!id) {
            console.warn('setTrackMesh: id为空');
            return;
        }

        if (!meshData) {
            // 如果数据为空，删除该轨道的网格
            const existing = this.trackMeshesMap.get(id);
            if (existing) {
                this.cleanupTrackMesh(existing);
                this.trackMeshesMap.delete(id);
            }
            return;
        }

        const gl = this.gl;

        // 清理旧的网格
        const existing = this.trackMeshesMap.get(id);
        if (existing) {
            this.cleanupTrackMesh(existing);
        }

        // 检查是否是多网格（木架过山车）
        /* console.log(`setTrackMesh [${id}] 接收到的数据:`, {
            isMultiMesh: meshData.isMultiMesh,
            hasMeshes: !!meshData.meshes,
            meshKeys: meshData.meshes ? Object.keys(meshData.meshes) : null,
            hasVertices: !!meshData.vertices
        }); */

        if (meshData.isMultiMesh && meshData.meshes) {
            // console.log(`✓ [${id}] 检测到多网格结构（木架过山车）`);

            // 创建多网格存储对象
            const multiMesh = {
                isMultiMesh: true,
                meshes: {}
            };

            // 为每个子网格创建缓冲区
            for (const [name, mesh] of Object.entries(meshData.meshes)) {
                if (!mesh) continue;

                const vertexBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

                const normalBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

                const uvBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);

                const indexBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

                multiMesh.meshes[name] = {
                    vertexBuffer,
                    normalBuffer,
                    uvBuffer,
                    indexBuffer,
                    indexCount: mesh.indices.length,
                    materialType: mesh.materialType
                };
            }

            this.trackMeshesMap.set(id, multiMesh);
            return;
        }

        // 单网格模式
        // console.log(`⚠ [${id}] 使用单网格模式`);

        // 创建新的缓冲区
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.normals, gl.STATIC_DRAW);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.uvs, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

        const singleMesh = {
            isMultiMesh: false,
            vertexBuffer,
            normalBuffer,
            uvBuffer,
            indexBuffer,
            indexCount: meshData.indices.length,
            materialType: meshData.materialType || 'default'
        };

        this.trackMeshesMap.set(id, singleMesh);
    }

    /**
     * 清理单个轨道网格资源
     */
    cleanupTrackMesh(meshData) {
        const gl = this.gl;
        if (meshData.isMultiMesh && meshData.meshes) {
            for (const mesh of Object.values(meshData.meshes)) {
                if (mesh.vertexBuffer) gl.deleteBuffer(mesh.vertexBuffer);
                if (mesh.normalBuffer) gl.deleteBuffer(mesh.normalBuffer);
                if (mesh.uvBuffer) gl.deleteBuffer(mesh.uvBuffer);
                if (mesh.indexBuffer) gl.deleteBuffer(mesh.indexBuffer);
            }
        } else {
            if (meshData.vertexBuffer) gl.deleteBuffer(meshData.vertexBuffer);
            if (meshData.normalBuffer) gl.deleteBuffer(meshData.normalBuffer);
            if (meshData.uvBuffer) gl.deleteBuffer(meshData.uvBuffer);
            if (meshData.indexBuffer) gl.deleteBuffer(meshData.indexBuffer);
        }
    }

    /**
     * 清理多网格轨道
     */
    cleanupMultiTrackMeshes() {
        if (!this.trackMeshes) return;

        const gl = this.gl;
        for (const mesh of Object.values(this.trackMeshes)) {
            if (mesh.vertexBuffer) gl.deleteBuffer(mesh.vertexBuffer);
            if (mesh.normalBuffer) gl.deleteBuffer(mesh.normalBuffer);
            if (mesh.uvBuffer) gl.deleteBuffer(mesh.uvBuffer);
            if (mesh.indexBuffer) gl.deleteBuffer(mesh.indexBuffer);
        }
        this.trackMeshes = null;
    }


    /**
     * 设置曲线线条网格
     */
    setCurveLineMesh(points, isDragging = false) {
        // 如果points为空数组，清空曲线显示
        if (!points || points.length < 1) {
            if (this.curveLineMesh) {
                const gl = this.gl;
                if (this.curveLineMesh.vertexBuffer) {
                    gl.deleteBuffer(this.curveLineMesh.vertexBuffer);
                }
                this.curveLineMesh = null;
            }
            return;
        }

        if (points.length < 2) return;

        const gl = this.gl;

        // 创建顶点数据
        const vertices = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            vertices[i * 3] = points[i].x;
            vertices[i * 3 + 1] = points[i].y;
            vertices[i * 3 + 2] = points[i].z;
        }

        // 如果已有缓冲区且大小相同，使用动态更新（拖动时）
        if (this.curveLineMesh && this.curveLineMesh.vertexBuffer &&
            this.curveLineMesh.vertexCount === points.length && isDragging) {
            // 重用现有缓冲区，只更新数据
            gl.bindBuffer(gl.ARRAY_BUFFER, this.curveLineMesh.vertexBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
        } else {
            // 删除旧的缓冲区
            if (this.curveLineMesh && this.curveLineMesh.vertexBuffer) {
                gl.deleteBuffer(this.curveLineMesh.vertexBuffer);
            }

            // 创建新缓冲区
            const vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, isDragging ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);

            this.curveLineMesh = {
                vertexBuffer,
                vertexCount: points.length
            };
        }
    }

    /**
     * 设置高曲率曲线线条网格（红色部分）
     */
    setCurveDangerLineMesh(points, isDragging = false) {
        // 如果points为空数组，清空危险曲线显示
        if (!points || points.length < 1) {
            if (this.curveDangerLineMesh) {
                const gl = this.gl;
                if (this.curveDangerLineMesh.vertexBuffer) {
                    gl.deleteBuffer(this.curveDangerLineMesh.vertexBuffer);
                }
                this.curveDangerLineMesh = null;
            }
            return;
        }

        if (points.length < 2) return;

        const gl = this.gl;

        const vertices = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            vertices[i * 3] = points[i].x;
            vertices[i * 3 + 1] = points[i].y;
            vertices[i * 3 + 2] = points[i].z;
        }

        if (this.curveDangerLineMesh && this.curveDangerLineMesh.vertexBuffer &&
            this.curveDangerLineMesh.vertexCount === points.length && isDragging) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.curveDangerLineMesh.vertexBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
        } else {
            if (this.curveDangerLineMesh && this.curveDangerLineMesh.vertexBuffer) {
                gl.deleteBuffer(this.curveDangerLineMesh.vertexBuffer);
            }

            const vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, isDragging ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);

            this.curveDangerLineMesh = {
                vertexBuffer,
                vertexCount: points.length
            };
        }
    }

    /**
     * 渲染
     */
    render() {
        const gl = this.gl;

        // 如果着色器还没加载完成，只清除画布
        if (!this.shadersReady) {
            gl.clearColor(0.1, 0.1, 0.2, 1.0); // 深蓝色表示等待中
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            return;
        }

        const aspect = this.canvas.width / this.canvas.height;

        // 清除画布
        gl.clearColor(0.2, 0.3, 0.4, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // 计算投影和视图矩阵
        const projectionMatrix = Mat4.perspective(
            this.camera.fov,
            aspect,
            this.camera.near,
            this.camera.far
        );

        const viewMatrix = Mat4.lookAt(
            this.camera.position,
            this.camera.target,
            this.camera.up
        );

        const modelMatrix = Mat4.identity();

        // 渲染天空盒
        if (this.skyboxProgram && this.skyboxVao) {
            this.renderSkybox(projectionMatrix, viewMatrix);
        }

        // 渲染地面
        if (this.groundMesh) {
            this.renderGround(projectionMatrix, viewMatrix, modelMatrix);
        }

        // 渲染可购买格子（购买模式下）
        // 渲染曲线线条（只在编辑模式下渲染）
        // 注意：这里不检查编辑模式，因为curveLineMesh在非编辑模式下应该已经被清空为null
        if (this.lineProgram) {
            if (this.curveLineMesh && this.curveLineMesh.vertexBuffer) {
                this.renderCurveLine(projectionMatrix, viewMatrix, modelMatrix);
            }
            if (this.curveDangerLineMesh && this.curveDangerLineMesh.vertexBuffer) {
                this.renderDangerCurveLine(projectionMatrix, viewMatrix, modelMatrix);
            }
        }

        // 渲染轨道
        // 渲染轨道
        if (this.trackProgram && this.trackMeshesMap.size > 0) {
            for (const [id, mesh] of this.trackMeshesMap) {
                if (mesh.isMultiMesh && mesh.meshes) {
                    // 渲染多网格轨道（木架过山车）
                    this.renderMultiTrack(projectionMatrix, viewMatrix, modelMatrix, mesh.meshes);
                } else {
                    // 渲染单网格轨道（其他类型）
                    this.renderTrack(projectionMatrix, viewMatrix, modelMatrix, mesh);
                }
            }
        }

        // 渲染控制点（如果设置了）
        if (this.controlPointsMesh && this.lineProgram) {
            this.renderControlPoints(projectionMatrix, viewMatrix, modelMatrix);
        }

        // 渲染小车（如果设置了）
        if (this.carMesh && this.trackProgram && this.carTransform) {
            this.renderCar(projectionMatrix, viewMatrix);
        }
    }

    /**
     * 渲染曲线线条
     */
    renderCurveLine(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        // 检查曲线网格是否存在且有效
        if (!this.lineProgram || !this.curveLineMesh || !this.curveLineMesh.vertexBuffer) {
            return;
        }

        gl.useProgram(this.lineProgram);

        // 禁用所有属性（避免之前的状态影响）
        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        // 设置属性
        const positionLoc = gl.getAttribLocation(this.lineProgram, 'aPosition');
        if (positionLoc < 0) {
            console.warn('无法找到aPosition属性');
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.curveLineMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        // 设置uniform
        const projLoc = gl.getUniformLocation(this.lineProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.lineProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.lineProgram, 'uModelMatrix');
        const colorLoc = gl.getUniformLocation(this.lineProgram, 'uColor');
        const pointSizeLoc = gl.getUniformLocation(this.lineProgram, 'uPointSize');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (colorLoc) gl.uniform3f(colorLoc, 1.0, 1.0, 0.0); // 黄色（正常曲率）
        if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 1.0); // 线条不需要点大小

        // 绘制线条（每两个点为一段）
        gl.drawArrays(gl.LINES, 0, this.curveLineMesh.vertexCount);

        // 检查错误
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn('渲染曲线线条时出现WebGL错误:', error);
        }
    }

    /**
     * 渲染高曲率曲线线条（红色）
     */
    renderDangerCurveLine(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        if (!this.lineProgram || !this.curveDangerLineMesh || !this.curveDangerLineMesh.vertexBuffer) {
            return;
        }

        gl.useProgram(this.lineProgram);

        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        const positionLoc = gl.getAttribLocation(this.lineProgram, 'aPosition');
        if (positionLoc < 0) {
            console.warn('无法找到aPosition属性(高曲率)');
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.curveDangerLineMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        const projLoc = gl.getUniformLocation(this.lineProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.lineProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.lineProgram, 'uModelMatrix');
        const colorLoc = gl.getUniformLocation(this.lineProgram, 'uColor');
        const pointSizeLoc = gl.getUniformLocation(this.lineProgram, 'uPointSize');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (colorLoc) gl.uniform3f(colorLoc, 1.0, 0.0, 0.0); // 红色（高曲率）
        if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 1.0);

        // 绘制线条（每两个点为一段）
        gl.drawArrays(gl.LINES, 0, this.curveDangerLineMesh.vertexCount);

        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn('渲染高曲率曲线线条时出现WebGL错误:', error);
        }
    }

    /**
     * 渲染轨道
     */
    /**
     * 渲染轨道
     */
    renderTrack(projectionMatrix, viewMatrix, modelMatrix, trackMesh) {
        const gl = this.gl;

        if (!this.trackProgram || !trackMesh) {
            return;
        }

        gl.useProgram(this.trackProgram);

        // 禁用所有属性（避免之前的状态影响）
        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        // 设置属性
        const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
        const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
        const texCoordLoc = gl.getAttribLocation(this.trackProgram, 'aTexCoord');

        if (positionLoc < 0 || normalLoc < 0 || texCoordLoc < 0) {
            console.warn('无法找到轨道着色器属性');
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, trackMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, trackMesh.normalBuffer);
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, trackMesh.uvBuffer);
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trackMesh.indexBuffer);

        // 设置uniform
        const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
        const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
        const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
        const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
        const colorLoc = gl.getUniformLocation(this.trackProgram, 'uColor');
        const isGroundLoc = gl.getUniformLocation(this.trackProgram, 'uIsGround');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
        if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
        if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
        if (isGroundLoc) gl.uniform1i(isGroundLoc, 0);
        // 根据材质类型设置颜色
        const materialType = trackMesh.materialType || 'default';
        const materialColors = {
            'wood': [0.6, 0.4, 0.2],      // 木色
            'steel': [0.7, 0.7, 0.75],    // 金属色
            'modern': [0.3, 0.6, 0.9],    // 现代蓝色
            'default': [0.8, 0.2, 0.2]    // 默认红色
        };
        const color = materialColors[materialType] || materialColors['default'];
        if (colorLoc) gl.uniform3f(colorLoc, color[0], color[1], color[2]);

        // 绘制
        gl.drawElements(gl.TRIANGLES, trackMesh.indexCount, gl.UNSIGNED_INT, 0);

        // 检查错误
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn('渲染轨道时出现WebGL错误:', error);
        }
    }

    /**
     * 渲染多网格轨道（木架过山车）
     */
    renderMultiTrack(projectionMatrix, viewMatrix, modelMatrix, meshes) {
        const gl = this.gl;

        if (!this.trackProgram || !meshes) {
            return;
        }

        // 材质颜色映射
        const materialColors = {
            'wood': [0.6, 0.4, 0.2],      // 木色（棕色）
            'steel': [0.7, 0.7, 0.75],    // 金属色（银色）
            'default': [0.8, 0.2, 0.2]    // 默认红色
        };

        // 渲染顺序（木架过山车目前只使用枕木和铁轨）
        const renderOrder = ['ties', 'rails'];

        for (const meshName of renderOrder) {
            const mesh = meshes[meshName];
            if (!mesh) continue;

            gl.useProgram(this.trackProgram);

            // 禁用所有属性
            for (let i = 0; i < 16; i++) {
                gl.disableVertexAttribArray(i);
            }

            // 设置属性
            const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
            const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
            const texCoordLoc = gl.getAttribLocation(this.trackProgram, 'aTexCoord');

            if (positionLoc < 0 || normalLoc < 0 || texCoordLoc < 0) {
                console.warn('无法找到轨道着色器属性');
                continue;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
            gl.enableVertexAttribArray(normalLoc);
            gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
            gl.enableVertexAttribArray(texCoordLoc);
            gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

            // 设置uniform
            const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
            const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
            const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
            const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
            const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
            const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
            const colorLoc = gl.getUniformLocation(this.trackProgram, 'uColor');
            const isGroundLoc = gl.getUniformLocation(this.trackProgram, 'uIsGround');

            if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
            if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
            if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
            if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
            if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
            if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
            if (isGroundLoc) gl.uniform1i(isGroundLoc, 0);

            // 根据材质类型设置颜色
            const color = materialColors[mesh.materialType] || materialColors['default'];
            if (colorLoc) gl.uniform3f(colorLoc, color[0], color[1], color[2]);

            // 绘制
            gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        }

        // 检查错误
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn('渲染多网格轨道时出现WebGL错误:', error);
        }
    }


    /**
     * 设置小车网格
     */
    setCarMesh(meshData) {
        if (!meshData) {
            this.carMesh = null;
            return;
        }

        const gl = this.gl;

        // 删除旧的缓冲区
        if (this.carMesh) {
            gl.deleteBuffer(this.carMesh.vertexBuffer);
            gl.deleteBuffer(this.carMesh.normalBuffer);
            gl.deleteBuffer(this.carMesh.colorBuffer);
            gl.deleteBuffer(this.carMesh.indexBuffer);
        }

        // 创建新的缓冲区
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.vertices, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.normals, gl.STATIC_DRAW);

        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.colors, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

        this.carMesh = {
            vertexBuffer,
            normalBuffer,
            colorBuffer,
            indexBuffer,
            indexCount: meshData.indices.length
        };
    }

    /**
     * 渲染小车
     */
    renderCar(projectionMatrix, viewMatrix) {
        const gl = this.gl;

        if (!this.trackProgram || !this.carMesh || !this.carTransform) {
            return;
        }

        gl.useProgram(this.trackProgram);

        // 禁用所有属性
        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        // 设置属性
        const positionLoc = gl.getAttribLocation(this.trackProgram, 'aPosition');
        const normalLoc = gl.getAttribLocation(this.trackProgram, 'aNormal');
        const colorLoc = gl.getAttribLocation(this.trackProgram, 'aColor');

        if (positionLoc < 0 || normalLoc < 0) {
            console.warn('无法找到小车着色器属性');
            return;
        }

        // 顶点位置
        gl.bindBuffer(gl.ARRAY_BUFFER, this.carMesh.vertexBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

        // 法线
        gl.bindBuffer(gl.ARRAY_BUFFER, this.carMesh.normalBuffer);
        gl.enableVertexAttribArray(normalLoc);
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

        // 颜色（如果有）
        if (colorLoc >= 0 && this.carMesh.colorBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.carMesh.colorBuffer);
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
        }

        // 索引
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.carMesh.indexBuffer);

        // 设置uniform
        const projLoc = gl.getUniformLocation(this.trackProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.trackProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.trackProgram, 'uModelMatrix');
        const lightDirLoc = gl.getUniformLocation(this.trackProgram, 'uLightDirection');
        const lightColorLoc = gl.getUniformLocation(this.trackProgram, 'uLightColor');
        const ambientLoc = gl.getUniformLocation(this.trackProgram, 'uAmbientColor');
        const colorUniformLoc = gl.getUniformLocation(this.trackProgram, 'uColor');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, this.carTransform);
        if (lightDirLoc) gl.uniform3f(lightDirLoc, this.light.direction.x, this.light.direction.y, this.light.direction.z);
        if (lightColorLoc) gl.uniform3f(lightColorLoc, this.light.color.x, this.light.color.y, this.light.color.z);
        if (ambientLoc) gl.uniform3f(ambientLoc, this.light.ambient.x, this.light.ambient.y, this.light.ambient.z);
        if (colorUniformLoc) gl.uniform3f(colorUniformLoc, 0.2, 0.4, 0.8); // 蓝色小车

        // 绘制
        gl.drawElements(gl.TRIANGLES, this.carMesh.indexCount, gl.UNSIGNED_INT, 0);

        // 检查错误
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.warn('渲染小车时出现WebGL错误:', error);
        }
    }

    /**
     * 设置小车变换矩阵
     */
    setCarTransform(matrix) {
        this.carTransform = matrix;
    }

    /**
     * 设置控制点网格（用于可视化）
     */
    setControlPointsMesh(controlPoints, selectedIndex = -1, selectedAxis = -1) {
        if (!controlPoints || controlPoints.length === 0) {
            this.controlPointsMesh = null;
            return;
        }

        const gl = this.gl;

        // 删除旧的缓冲区
        if (this.controlPointsMesh) {
            if (this.controlPointsMesh.vertexBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.vertexBuffer);
            }
            if (this.controlPointsMesh.tangentBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.tangentBuffer);
            }
            if (this.controlPointsMesh.leftTangentPointBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.leftTangentPointBuffer);
            }
            if (this.controlPointsMesh.rightTangentPointBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.rightTangentPointBuffer);
            }
            if (this.controlPointsMesh.selectedBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.selectedBuffer);
            }
            if (this.controlPointsMesh.arrowBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.arrowBuffer);
            }
            if (this.controlPointsMesh.liftSectionBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.liftSectionBuffer);
            }
            if (this.controlPointsMesh.platformSectionBuffer) {
                gl.deleteBuffer(this.controlPointsMesh.platformSectionBuffer);
            }
        }

        // 创建控制点顶点数据（点和线条）
        const pointVertices = [];
        const selectedVertices = [];
        const liftSectionVertices = []; // 牵引区域控制点
        const platformSectionVertices = []; // 站台区域控制点
        const electromagneticBoostVertices = []; // 电磁加速区域控制点
        const electromagneticBrakeVertices = []; // 电磁减速区域控制点
        const tangentVertices = [];
        const leftTangentPointVertices = []; // 左侧切线控制点
        const rightTangentPointVertices = []; // 右侧切线控制点
        const arrowVertices = []; // 箭头线条


        for (let i = 0; i < controlPoints.length; i++) {
            const point = controlPoints[i];
            if (!point) {
                console.warn('控制点', i, '为空');
                continue;
            }

            if (!point.position) {
                console.warn('控制点', i, '没有位置信息');
                continue;
            }

            const pos = point.position;
            const isSelected = (i === selectedIndex);
            const isLiftSection = point.isLiftSection || false;
            const isPlatformSection = point.isPlatformSection || false;
            const isElectromagneticBoost = point.isElectromagneticBoost || false;
            const isElectromagneticBrake = point.isElectromagneticBrake || false;


            // 控制点位置（直接使用位置，渲染时用大点）
            if (isSelected) {
                selectedVertices.push(pos.x, pos.y, pos.z);

                // 为选中的控制点添加3D箭头（X、Y、Z轴）
                const arrowLength = 2.0; // 箭头长度
                const arrowHeadLength = 0.3; // 箭头头部长度
                const arrowHeadWidth = 0.15; // 箭头头部宽度

                // X轴箭头（红色）
                const xAxis = new Vec3(arrowLength, 0, 0);
                arrowVertices.push(pos.x, pos.y, pos.z);
                arrowVertices.push(pos.x + xAxis.x, pos.y + xAxis.y, pos.z + xAxis.z);
                // 箭头头部
                arrowVertices.push(pos.x + xAxis.x, pos.y + xAxis.y, pos.z + xAxis.z);
                arrowVertices.push(pos.x + xAxis.x - arrowHeadLength, pos.y + arrowHeadWidth, pos.z);
                arrowVertices.push(pos.x + xAxis.x, pos.y + xAxis.y, pos.z + xAxis.z);
                arrowVertices.push(pos.x + xAxis.x - arrowHeadLength, pos.y - arrowHeadWidth, pos.z);
                arrowVertices.push(pos.x + xAxis.x, pos.y + xAxis.y, pos.z + xAxis.z);
                arrowVertices.push(pos.x + xAxis.x - arrowHeadLength, pos.y, pos.z + arrowHeadWidth);
                arrowVertices.push(pos.x + xAxis.x, pos.y + xAxis.y, pos.z + xAxis.z);
                arrowVertices.push(pos.x + xAxis.x - arrowHeadLength, pos.y, pos.z - arrowHeadWidth);

                // Y轴箭头（绿色）
                const yAxis = new Vec3(0, arrowLength, 0);
                arrowVertices.push(pos.x, pos.y, pos.z);
                arrowVertices.push(pos.x + yAxis.x, pos.y + yAxis.y, pos.z + yAxis.z);
                // 箭头头部
                arrowVertices.push(pos.x + yAxis.x, pos.y + yAxis.y, pos.z + yAxis.z);
                arrowVertices.push(pos.x + arrowHeadWidth, pos.y + yAxis.y - arrowHeadLength, pos.z);
                arrowVertices.push(pos.x + yAxis.x, pos.y + yAxis.y, pos.z + yAxis.z);
                arrowVertices.push(pos.x - arrowHeadWidth, pos.y + yAxis.y - arrowHeadLength, pos.z);
                arrowVertices.push(pos.x + yAxis.x, pos.y + yAxis.y, pos.z + yAxis.z);
                arrowVertices.push(pos.x, pos.y + yAxis.y - arrowHeadLength, pos.z + arrowHeadWidth);
                arrowVertices.push(pos.x + yAxis.x, pos.y + yAxis.y, pos.z + yAxis.z);
                arrowVertices.push(pos.x, pos.y + yAxis.y - arrowHeadLength, pos.z - arrowHeadWidth);

                // Z轴箭头（蓝色）
                const zAxis = new Vec3(0, 0, arrowLength);
                arrowVertices.push(pos.x, pos.y, pos.z);
                arrowVertices.push(pos.x + zAxis.x, pos.y + zAxis.y, pos.z + zAxis.z);
                // 箭头头部
                arrowVertices.push(pos.x + zAxis.x, pos.y + zAxis.y, pos.z + zAxis.z);
                arrowVertices.push(pos.x + arrowHeadWidth, pos.y, pos.z + zAxis.z - arrowHeadLength);
                arrowVertices.push(pos.x + zAxis.x, pos.y + zAxis.y, pos.z + zAxis.z);
                arrowVertices.push(pos.x - arrowHeadWidth, pos.y, pos.z + zAxis.z - arrowHeadLength);
                arrowVertices.push(pos.x + zAxis.x, pos.y + zAxis.y, pos.z + zAxis.z);
                arrowVertices.push(pos.x, pos.y + arrowHeadWidth, pos.z + zAxis.z - arrowHeadLength);
                arrowVertices.push(pos.x + zAxis.x, pos.y + zAxis.y, pos.z + zAxis.z);
                arrowVertices.push(pos.x, pos.y - arrowHeadWidth, pos.z + zAxis.z - arrowHeadLength);
            } else if (isElectromagneticBoost) {
                // 电磁加速区域控制点（蓝色）
                electromagneticBoostVertices.push(pos.x, pos.y, pos.z);
            } else if (isElectromagneticBrake) {
                // 电磁减速区域控制点（红色）
                electromagneticBrakeVertices.push(pos.x, pos.y, pos.z);
            } else if (isPlatformSection) {
                // 站台区域控制点（紫色）
                platformSectionVertices.push(pos.x, pos.y, pos.z);
            } else if (isLiftSection) {
                // 牵引区域控制点（橙色）
                liftSectionVertices.push(pos.x, pos.y, pos.z);
            } else {
                pointVertices.push(pos.x, pos.y, pos.z);
            }

            // 只显示选中控制点的切线
            if (isSelected) {
                // 添加切线线条
                if (point.leftTangent && typeof point.leftTangent.length === 'function' && point.leftTangent.length() > 0.01) {
                    try {
                        const leftPos = point.getLeftControlPoint();
                        if (leftPos && leftPos.x !== undefined) {
                            // 切线线条
                            tangentVertices.push(pos.x, pos.y, pos.z);
                            tangentVertices.push(leftPos.x, leftPos.y, leftPos.z);

                            // 左侧切线控制点位置（单独存储）
                            leftTangentPointVertices.push(leftPos.x, leftPos.y, leftPos.z);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }

                if (point.rightTangent && typeof point.rightTangent.length === 'function' && point.rightTangent.length() > 0.01) {
                    try {
                        const rightPos = point.getRightControlPoint();
                        if (rightPos && rightPos.x !== undefined) {
                            // 切线线条
                            tangentVertices.push(pos.x, pos.y, pos.z);
                            tangentVertices.push(rightPos.x, rightPos.y, rightPos.z);

                            // 右侧切线控制点位置（单独存储）
                            rightTangentPointVertices.push(rightPos.x, rightPos.y, rightPos.z);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
            }
        }

        const pointBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pointVertices), gl.STATIC_DRAW);

        let selectedBuffer = null;
        if (selectedVertices.length > 0) {
            selectedBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, selectedBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(selectedVertices), gl.STATIC_DRAW);
        }

        let tangentBuffer = null;
        if (tangentVertices.length > 0) {
            tangentBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tangentBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tangentVertices), gl.STATIC_DRAW);
        }

        let leftTangentPointBuffer = null;
        if (leftTangentPointVertices.length > 0) {
            leftTangentPointBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, leftTangentPointBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(leftTangentPointVertices), gl.STATIC_DRAW);
        }

        let rightTangentPointBuffer = null;
        if (rightTangentPointVertices.length > 0) {
            rightTangentPointBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, rightTangentPointBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rightTangentPointVertices), gl.STATIC_DRAW);
        }

        let arrowBuffer = null;
        if (arrowVertices.length > 0) {
            arrowBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, arrowBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrowVertices), gl.STATIC_DRAW);
        }

        let liftSectionBuffer = null;
        if (liftSectionVertices.length > 0) {
            liftSectionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, liftSectionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(liftSectionVertices), gl.STATIC_DRAW);
        }

        let platformSectionBuffer = null;
        if (platformSectionVertices.length > 0) {
            platformSectionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, platformSectionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(platformSectionVertices), gl.STATIC_DRAW);
        }

        let electromagneticBoostBuffer = null;
        if (electromagneticBoostVertices.length > 0) {
            electromagneticBoostBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, electromagneticBoostBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(electromagneticBoostVertices), gl.STATIC_DRAW);
        }

        let electromagneticBrakeBuffer = null;
        if (electromagneticBrakeVertices.length > 0) {
            electromagneticBrakeBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, electromagneticBrakeBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(electromagneticBrakeVertices), gl.STATIC_DRAW);
        }

        this.controlPointsMesh = {
            vertexBuffer: pointBuffer,
            selectedBuffer: selectedBuffer,
            liftSectionBuffer: liftSectionBuffer,
            platformSectionBuffer: platformSectionBuffer,
            electromagneticBoostBuffer: electromagneticBoostBuffer,
            electromagneticBrakeBuffer: electromagneticBrakeBuffer,
            tangentBuffer: tangentBuffer,
            leftTangentPointBuffer: leftTangentPointBuffer,
            rightTangentPointBuffer: rightTangentPointBuffer,
            leftTangentPointCount: leftTangentPointVertices.length / 3,
            rightTangentPointCount: rightTangentPointVertices.length / 3,
            arrowBuffer: arrowBuffer,
            pointCount: pointVertices.length / 3,
            selectedCount: selectedVertices.length / 3,
            liftSectionCount: liftSectionVertices.length / 3,
            platformSectionCount: platformSectionVertices.length / 3,
            electromagneticBoostCount: electromagneticBoostVertices.length / 3,
            electromagneticBrakeCount: electromagneticBrakeVertices.length / 3,
            tangentCount: tangentVertices.length / 3,
            arrowCount: arrowVertices.length / 3,
            selectedIndex,
            selectedAxis
        };

        // 控制点网格创建完成
    }

    /**
     * 更新单个控制点的位置（拖动时优化，避免重建整个网格）
     * @param {number} index - 控制点索引
     * @param {BezierPoint} point - 控制点对象
     * @param {number} selectedAxis - 选中的轴
     */
    updateControlPointPosition(index, point, selectedAxis = -1) {
        if (!this.controlPointsMesh || !point || !point.position) {
            return;
        }

        const gl = this.gl;
        const pos = point.position;
        const isSelected = (this.controlPointsMesh.selectedIndex === index);

        // 只更新选中的控制点相关缓冲区
        if (isSelected) {
            // 更新选中控制点位置
            if (this.controlPointsMesh.selectedBuffer) {
                const selectedVertices = new Float32Array([pos.x, pos.y, pos.z]);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.selectedBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, selectedVertices);
            }

            // 更新切线
            if (this.controlPointsMesh.tangentBuffer) {
                const tangentVertices = [];

                if (point.leftTangent && typeof point.leftTangent.length === 'function' && point.leftTangent.length() > 0.01) {
                    try {
                        const leftPos = point.getLeftControlPoint();
                        if (leftPos) {
                            tangentVertices.push(pos.x, pos.y, pos.z);
                            tangentVertices.push(leftPos.x, leftPos.y, leftPos.z);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }

                if (point.rightTangent && typeof point.rightTangent.length === 'function' && point.rightTangent.length() > 0.01) {
                    try {
                        const rightPos = point.getRightControlPoint();
                        if (rightPos) {
                            tangentVertices.push(pos.x, pos.y, pos.z);
                            tangentVertices.push(rightPos.x, rightPos.y, rightPos.z);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }

                if (tangentVertices.length > 0) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.tangentBuffer);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(tangentVertices));
                }
            }

            // 更新切线控制点
            if (point.leftTangent && typeof point.leftTangent.length === 'function' && point.leftTangent.length() > 0.01) {
                try {
                    const leftPos = point.getLeftControlPoint();
                    if (leftPos && this.controlPointsMesh.leftTangentPointBuffer) {
                        const leftVertices = new Float32Array([leftPos.x, leftPos.y, leftPos.z]);
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.leftTangentPointBuffer);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, leftVertices);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }

            if (point.rightTangent && typeof point.rightTangent.length === 'function' && point.rightTangent.length() > 0.01) {
                try {
                    const rightPos = point.getRightControlPoint();
                    if (rightPos && this.controlPointsMesh.rightTangentPointBuffer) {
                        const rightVertices = new Float32Array([rightPos.x, rightPos.y, rightPos.z]);
                        gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.rightTangentPointBuffer);
                        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rightVertices);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }

            // 注意：箭头更新比较复杂，拖动时暂时跳过，松开时会重建整个网格
        }
    }

    /**
     * 渲染控制点
     */
    renderControlPoints(projectionMatrix, viewMatrix, modelMatrix) {
        const gl = this.gl;

        if (!this.lineProgram) {
            console.warn('线条着色器程序未准备好');
            return;
        }

        if (!this.controlPointsMesh) {
            console.warn('控制点网格未设置');
            return;
        }

        // 渲染控制点

        gl.useProgram(this.lineProgram);

        // 启用混合，以便点的透明效果正确显示
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // 禁用深度测试，确保控制点始终可见
        gl.disable(gl.DEPTH_TEST);

        // 禁用所有属性（避免之前的状态影响）
        for (let i = 0; i < 16; i++) {
            gl.disableVertexAttribArray(i);
        }

        // 设置uniform
        const projLoc = gl.getUniformLocation(this.lineProgram, 'uProjectionMatrix');
        const viewLoc = gl.getUniformLocation(this.lineProgram, 'uViewMatrix');
        const modelLoc = gl.getUniformLocation(this.lineProgram, 'uModelMatrix');
        const colorLoc = gl.getUniformLocation(this.lineProgram, 'uColor');
        const pointSizeLoc = gl.getUniformLocation(this.lineProgram, 'uPointSize');

        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewMatrix);
        if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, modelMatrix);

        const positionLoc = gl.getAttribLocation(this.lineProgram, 'aPosition');
        if (positionLoc < 0) {
            return;
        }

        // 绘制切线线条（青色，加粗）
        if (this.controlPointsMesh.tangentBuffer && this.controlPointsMesh.tangentCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.tangentBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 0.0, 1.0, 1.0); // 青色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 1.0); // 线条不需要点大小
            gl.lineWidth(3.0); // 加粗线条
            gl.drawArrays(gl.LINES, 0, this.controlPointsMesh.tangentCount);
        }

        // 绘制左侧切线控制点（蓝色小点）
        if (this.controlPointsMesh.leftTangentPointBuffer && this.controlPointsMesh.leftTangentPointCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.leftTangentPointBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 0.0, 0.0, 1.0); // 蓝色（左侧）
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 12.0); // 缩小切线控制点
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.leftTangentPointCount);
        }

        // 绘制右侧切线控制点（青色小点）
        if (this.controlPointsMesh.rightTangentPointBuffer && this.controlPointsMesh.rightTangentPointCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.rightTangentPointBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 0.0, 1.0, 1.0); // 青色（右侧）
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 12.0); // 缩小切线控制点
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.rightTangentPointCount);
        }

        // 绘制电磁加速区域控制点（蓝色，大点）
        if (this.controlPointsMesh.electromagneticBoostBuffer && this.controlPointsMesh.electromagneticBoostCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.electromagneticBoostBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 0.2, 0.6, 1.0); // 亮蓝色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 20.0);
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.electromagneticBoostCount);
        }

        // 绘制电磁减速区域控制点（红色，大点）
        if (this.controlPointsMesh.electromagneticBrakeBuffer && this.controlPointsMesh.electromagneticBrakeCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.electromagneticBrakeBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 1.0, 0.2, 0.2); // 红色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 20.0);
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.electromagneticBrakeCount);
        }

        // 绘制站台区域控制点（紫色，大点）
        if (this.controlPointsMesh.platformSectionBuffer && this.controlPointsMesh.platformSectionCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.platformSectionBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 0.6, 0.2, 0.8); // 紫色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 20.0);
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.platformSectionCount);
        }

        // 绘制牵引区域控制点（橙色，大点）
        if (this.controlPointsMesh.liftSectionBuffer && this.controlPointsMesh.liftSectionCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.liftSectionBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 1.0, 0.5, 0.0); // 橙色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 20.0);
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.liftSectionCount);
        }

        // 绘制普通控制点（黄色，大点）
        if (this.controlPointsMesh.pointCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.vertexBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 1.0, 1.0, 0.0); // 黄色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 20.0); // 缩小控制点
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.pointCount);

            // 检查错误
            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('绘制控制点时出现WebGL错误:', error);
            }
        } else {
        }

        // 绘制选中的控制点（红色，更大）
        if (this.controlPointsMesh.selectedBuffer && this.controlPointsMesh.selectedCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.selectedBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            if (colorLoc) gl.uniform3f(colorLoc, 1.0, 0.0, 0.0); // 红色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 25.0); // 缩小选中控制点
            gl.drawArrays(gl.POINTS, 0, this.controlPointsMesh.selectedCount);
        }

        // 绘制3D箭头（X、Y、Z轴）
        if (this.controlPointsMesh.arrowBuffer && this.controlPointsMesh.arrowCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.controlPointsMesh.arrowBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            gl.lineWidth(3.0); // 加粗箭头线条

            // 每个箭头有1条主线 + 4条头部线 = 5条线，每条线2个点 = 10个点
            const pointsPerArrow = 10;

            // X轴箭头（红色）
            if (colorLoc) gl.uniform3f(colorLoc, 1.0, 0.0, 0.0); // 红色
            if (pointSizeLoc) gl.uniform1f(pointSizeLoc, 1.0);
            gl.drawArrays(gl.LINES, 0, pointsPerArrow);

            // Y轴箭头（绿色）
            if (colorLoc) gl.uniform3f(colorLoc, 0.0, 1.0, 0.0); // 绿色
            gl.drawArrays(gl.LINES, pointsPerArrow, pointsPerArrow);

            // Z轴箭头（蓝色）
            if (colorLoc) gl.uniform3f(colorLoc, 0.0, 0.0, 1.0); // 蓝色
            gl.drawArrays(gl.LINES, pointsPerArrow * 2, pointsPerArrow);
        }

        // 重新启用深度测试，禁用混合
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
    }

    initSkyboxMesh() {
        const gl = this.gl;
        if (!this.skyboxProgram) return;

        const vertices = new Float32Array([
            -1, -1, -1,
             1, -1, -1,
             1,  1, -1,
            -1,  1, -1,
            -1, -1,  1,
             1, -1,  1,
             1,  1,  1,
            -1,  1,  1
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
            4, 5, 1, 4, 1, 0,
            3, 2, 6, 3, 6, 7,
            1, 5, 6, 1, 6, 2,
            4, 0, 3, 4, 3, 7
        ]);

        this.skyboxVao = gl.createVertexArray();
        gl.bindVertexArray(this.skyboxVao);

        this.skyboxVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyboxVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(this.skyboxProgram, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
    }

    renderSkybox(projectionMatrix, viewMatrix) {
        const gl = this.gl;
        if (!this.skyboxProgram || !this.skyboxVao) return;

        gl.depthMask(false);
        gl.depthFunc(gl.LEQUAL);
        gl.cullFace(gl.FRONT); // 反面朝内

        gl.useProgram(this.skyboxProgram);
        gl.bindVertexArray(this.skyboxVao);

        // 去除平移，让天空盒跟随相机
        const viewNoTrans = viewMatrix.slice();
        viewNoTrans[12] = 0;
        viewNoTrans[13] = 0;
        viewNoTrans[14] = 0;

        const projLoc = gl.getUniformLocation(this.skyboxProgram, 'uProjection');
        const viewLoc = gl.getUniformLocation(this.skyboxProgram, 'uView');
        if (projLoc) gl.uniformMatrix4fv(projLoc, false, projectionMatrix);
        if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, viewNoTrans);

        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

        gl.bindVertexArray(null);
        gl.cullFace(gl.BACK);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
    }

    /**
     * 设置相机位置
     */
    setCamera(position, target) {
        this.camera.position = position;
        this.camera.target = target;
    }
}

