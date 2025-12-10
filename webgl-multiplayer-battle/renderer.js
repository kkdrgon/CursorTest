import { Vec3, Mat4 } from './math3d.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', {
            antialias: true,
            depth: true,
            alpha: false
        });
        
        if (!this.gl) {
            const errorMsg = 'WebGL2 不支持，请使用支持WebGL2的浏览器';
            console.error(errorMsg);
            alert(errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('WebGL2 上下文已创建');
        
        // 设置画布大小
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        
        this.normalMatrixData = new Float32Array(9);
        try {
            this.initShaders();
            this.initBuffers();
            console.log('渲染器初始化成功');
        } catch (error) {
            console.error('渲染器初始化失败:', error);
            alert('渲染器初始化失败: ' + error.message);
            throw error;
        }
        
        // 相机参数
        this.camera = {
            position: new Vec3(0, 2.6, 0), // 眼睛高度
            yaw: 0,    // 水平旋转
            pitch: 0   // 垂直旋转
        };
    }
    
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    
    initShaders() {
        const vertexShaderSource = `#version 300 es
            in vec3 a_position;
            in vec3 a_normal;
            in vec2 a_texCoord;
            
            out vec3 v_normal;
            out vec3 v_position;
            out vec2 v_texCoord;
            
            uniform mat4 u_projection;
            uniform mat4 u_view;
            uniform mat4 u_model;
            uniform mat3 u_normalMatrix;
            
            void main() {
                vec4 worldPos = u_model * vec4(a_position, 1.0);
                v_position = worldPos.xyz;
                v_normal = u_normalMatrix * a_normal;
                v_texCoord = a_texCoord;
                gl_Position = u_projection * u_view * worldPos;
            }
        `;
        
        const fragmentShaderSource = `#version 300 es
            precision highp float;
            
            in vec3 v_normal;
            in vec3 v_position;
            in vec2 v_texCoord;
            
            out vec4 outColor;
            
            uniform vec4 u_color;
            uniform float u_type; // 0=玩家, 1=子弹, 2=地面, 3=墙壁, 4=水面
            
            void main() {
                vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                vec3 normal = normalize(v_normal);
                float diff = max(dot(normal, lightDir), 0.3);
                
                if (u_type < 0.5) {
                    outColor = vec4(u_color.rgb * diff, u_color.a);
                } else if (u_type < 1.5) {
                    outColor = u_color;
                } else if (u_type < 2.5) {
                    vec3 color = vec3(0.2, 0.3, 0.2) * diff;
                    outColor = vec4(color, 1.0);
                } else if (u_type < 3.5) {
                    vec3 color = vec3(0.3, 0.3, 0.35) * diff;
                    outColor = vec4(color, 1.0);
                } else {
                    vec3 color = vec3(0.1, 0.2, 0.4) * diff;
                    outColor = vec4(color, 0.8);
                }
            }
        `;
        
        this.vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        this.fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = this.createProgram(this.vertexShader, this.fragmentShader);
        
        // 获取属性位置
        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.normalLocation = this.gl.getAttribLocation(this.program, 'a_normal');
        this.texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
        
        // 获取uniform位置
        this.projectionLocation = this.gl.getUniformLocation(this.program, 'u_projection');
        this.viewLocation = this.gl.getUniformLocation(this.program, 'u_view');
        this.modelLocation = this.gl.getUniformLocation(this.program, 'u_model');
        this.colorLocation = this.gl.getUniformLocation(this.program, 'u_color');
        this.typeLocation = this.gl.getUniformLocation(this.program, 'u_type');
        this.normalMatrixLocation = this.gl.getUniformLocation(this.program, 'u_normalMatrix');
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error('着色器编译错误: ' + info);
        }
        
        return shader;
    }
    
    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            throw new Error('程序链接错误: ' + info);
        }
        
        return program;
    }
    
    initBuffers() {
        // 创建立方体几何体
        this.createCubeBuffers();
        this.createSphereBuffers();
        this.createPlaneBuffers();
        this.createEllipseBuffers();
        this.terrainBuffer = null;
        this.terrainVertexCount = 0;
    }
    
    createCubeBuffers() {
        // 立方体顶点（位置、法线、纹理坐标）
        const vertices = new Float32Array([
            // 前面
            -1, -1,  1,  0,  0,  1,  0, 0,
             1, -1,  1,  0,  0,  1,  1, 0,
             1,  1,  1,  0,  0,  1,  1, 1,
            -1, -1,  1,  0,  0,  1,  0, 0,
             1,  1,  1,  0,  0,  1,  1, 1,
            -1,  1,  1,  0,  0,  1,  0, 1,
            // 后面
            -1, -1, -1,  0,  0, -1,  1, 0,
            -1,  1, -1,  0,  0, -1,  1, 1,
             1,  1, -1,  0,  0, -1,  0, 1,
            -1, -1, -1,  0,  0, -1,  1, 0,
             1,  1, -1,  0,  0, -1,  0, 1,
             1, -1, -1,  0,  0, -1,  0, 0,
            // 左面
            -1, -1, -1, -1,  0,  0,  0, 0,
            -1,  1, -1, -1,  0,  0,  0, 1,
            -1,  1,  1, -1,  0,  0,  1, 1,
            -1, -1, -1, -1,  0,  0,  0, 0,
            -1,  1,  1, -1,  0,  0,  1, 1,
            -1, -1,  1, -1,  0,  0,  1, 0,
            // 右面
             1, -1, -1,  1,  0,  0,  1, 0,
             1, -1,  1,  1,  0,  0,  0, 0,
             1,  1,  1,  1,  0,  0,  0, 1,
             1, -1, -1,  1,  0,  0,  1, 0,
             1,  1,  1,  1,  0,  0,  0, 1,
             1,  1, -1,  1,  0,  0,  1, 1,
            // 上面
            -1,  1, -1,  0,  1,  0,  0, 1,
             1,  1, -1,  0,  1,  0,  1, 1,
             1,  1,  1,  0,  1,  0,  1, 0,
            -1,  1, -1,  0,  1,  0,  0, 1,
             1,  1,  1,  0,  1,  0,  1, 0,
            -1,  1,  1,  0,  1,  0,  0, 0,
            // 下面
            -1, -1, -1,  0, -1,  0,  0, 0,
            -1, -1,  1,  0, -1,  0,  0, 1,
             1, -1,  1,  0, -1,  0,  1, 1,
            -1, -1, -1,  0, -1,  0,  0, 0,
             1, -1,  1,  0, -1,  0,  1, 1,
             1, -1, -1,  0, -1,  0,  1, 0,
        ]);
        
        this.cubeBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cubeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.cubeVertexCount = 36;
    }
    
    createSphereBuffers() {
        // 简单的球体（使用立方体近似）
        // 为了简化，我们使用立方体，实际游戏中可以用更精细的球体
        this.sphereBuffer = this.cubeBuffer; // 复用立方体
        this.sphereVertexCount = this.cubeVertexCount;
    }
    
    createPlaneBuffers() {
        // 平面（地面）- 逆时针顶点保证法线朝上
        const vertices = new Float32Array([
            -1, 0, -1,  0, 1, 0,  0, 0,
            -1, 0,  1,  0, 1, 0,  0, 1,
             1, 0,  1,  0, 1, 0,  1, 1,
            -1, 0, -1,  0, 1, 0,  0, 0,
             1, 0,  1,  0, 1, 0,  1, 1,
             1, 0, -1,  0, 1, 0,  1, 0,
        ]);
        
        this.planeBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.planeBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.planeVertexCount = 6;
    }

    createEllipseBuffers(segments = 64) {
        const vertexCount = segments + 2;
        const data = new Float32Array(vertexCount * 8);
        // center vertex
        data[0] = 0; data[1] = 0; data[2] = 0;
        data[3] = 0; data[4] = 1; data[5] = 0;
        data[6] = 0.5; data[7] = 0.5;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle);
            const z = Math.sin(angle);
            const offset = (i + 1) * 8;
            data[offset] = x;
            data[offset + 1] = 0;
            data[offset + 2] = z;
            data[offset + 3] = 0;
            data[offset + 4] = 1;
            data[offset + 5] = 0;
            data[offset + 6] = (x + 1) * 0.5;
            data[offset + 7] = (z + 1) * 0.5;
        }
        this.ellipseBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.ellipseBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
        this.ellipseVertexCount = vertexCount;
    }

    drawDoubleSided(drawFn) {
        const enabled = this.gl.isEnabled(this.gl.CULL_FACE);
        if (enabled) {
            this.gl.disable(this.gl.CULL_FACE);
        }
        drawFn();
        if (enabled) {
            this.gl.enable(this.gl.CULL_FACE);
            this.gl.cullFace(this.gl.BACK);
        }
    }

    computeNormalMatrix(model) {
        const a00 = model[0], a01 = model[1], a02 = model[2];
        const a10 = model[4], a11 = model[5], a12 = model[6];
        const a20 = model[8], a21 = model[9], a22 = model[10];

        const b00 = a11 * a22 - a12 * a21;
        const b01 = a02 * a21 - a01 * a22;
        const b02 = a01 * a12 - a02 * a11;
        const det = a00 * b00 + a10 * b01 + a20 * b02;

        const normal = this.normalMatrixData;

        if (!det) {
            normal[0] = 1; normal[1] = 0; normal[2] = 0;
            normal[3] = 0; normal[4] = 1; normal[5] = 0;
            normal[6] = 0; normal[7] = 0; normal[8] = 1;
            return normal;
        }

        const invDet = 1 / det;
        normal[0] = b00 * invDet;
        normal[1] = b01 * invDet;
        normal[2] = b02 * invDet;
        normal[3] = (a12 * a20 - a10 * a22) * invDet;
        normal[4] = (a00 * a22 - a02 * a20) * invDet;
        normal[5] = (a02 * a10 - a00 * a12) * invDet;
        normal[6] = (a10 * a21 - a11 * a20) * invDet;
        normal[7] = (a01 * a20 - a00 * a21) * invDet;
        normal[8] = (a00 * a11 - a01 * a10) * invDet;
        return normal;
    }
    
    setCamera(position, yaw, pitch) {
        this.camera.position = position;
        this.camera.yaw = yaw;
        this.camera.pitch = pitch;
    }
    
    clear() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.5, 0.7, 1.0, 1.0); // 天空蓝
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
    
    beginRender() {
        if (!this.gl || !this.program) {
            console.error('WebGL或程序未初始化');
            return;
        }
        
        this.gl.useProgram(this.program);
        
        // 设置投影矩阵
        const aspect = this.canvas.width / this.canvas.height;
        if (aspect <= 0 || !isFinite(aspect)) {
            console.warn('无效的宽高比:', aspect);
            return;
        }
        
        const projection = Mat4.perspective(Math.PI / 4, aspect, 0.1, 1000.0);
        this.gl.uniformMatrix4fv(this.projectionLocation, false, projection);
        
        // 计算视图矩阵（第一人称相机）
        const forward = new Vec3(
            Math.cos(this.camera.pitch) * Math.cos(this.camera.yaw),
            Math.sin(this.camera.pitch),
            Math.cos(this.camera.pitch) * Math.sin(this.camera.yaw)
        ).normalize();
        
        const center = this.camera.position.add(forward);
        const up = new Vec3(0, 1, 0);
        const view = Mat4.lookAt(this.camera.position, center, up);
        this.gl.uniformMatrix4fv(this.viewLocation, false, view);
        
    }
    
    drawCube(position, scale, rotation, color, type = 0) {
        let model = Mat4.translate(position.x, position.y, position.z);
        if (rotation) {
            if (rotation.y !== undefined) {
                model = Mat4.multiply(model, Mat4.rotateY(rotation.y));
            }
            if (rotation.x !== undefined) {
                model = Mat4.multiply(model, Mat4.rotateX(rotation.x));
            }
            if (rotation.z !== undefined) {
                model = Mat4.multiply(model, Mat4.rotateZ(rotation.z));
            }
        }
        model = Mat4.multiply(model, Mat4.scale(scale.x, scale.y, scale.z));
        
        this.gl.uniformMatrix4fv(this.modelLocation, false, model);
        if (this.normalMatrixLocation) {
            this.gl.uniformMatrix3fv(this.normalMatrixLocation, false, this.computeNormalMatrix(model));
        }
        this.gl.uniform4f(this.colorLocation, color.r, color.g, color.b, color.a);
        this.gl.uniform1f(this.typeLocation, type);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.cubeBuffer);
        this.setupAttributes();
        this.gl.drawArrays(this.gl.TRIANGLES, 0, this.cubeVertexCount);
    }
    
    drawSphere(position, radius, color, type = 0) {
        const model = Mat4.multiply(
            Mat4.translate(position.x, position.y, position.z),
            Mat4.scale(radius, radius, radius)
        );
        
        this.gl.uniformMatrix4fv(this.modelLocation, false, model);
        if (this.normalMatrixLocation) {
            this.gl.uniformMatrix3fv(this.normalMatrixLocation, false, this.computeNormalMatrix(model));
        }
        this.gl.uniform4f(this.colorLocation, color.r, color.g, color.b, color.a);
        this.gl.uniform1f(this.typeLocation, type);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.sphereBuffer);
        this.setupAttributes();
        this.gl.drawArrays(this.gl.TRIANGLES, 0, this.sphereVertexCount);
    }
    
    drawPlane(position, size, color, type = 2) {
        const draw = () => {
            const model = Mat4.multiply(
                Mat4.translate(position.x, position.y, position.z),
                Mat4.scale(size.x, 1, size.z)
            );
            
            this.gl.uniformMatrix4fv(this.modelLocation, false, model);
            if (this.normalMatrixLocation) {
                this.gl.uniformMatrix3fv(this.normalMatrixLocation, false, this.computeNormalMatrix(model));
            }
            this.gl.uniform4f(this.colorLocation, color.r, color.g, color.b, color.a);
            this.gl.uniform1f(this.typeLocation, type);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.planeBuffer);
            this.setupAttributes();
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.planeVertexCount);
        };
        
        this.drawDoubleSided(draw);
    }
    
    drawEllipse(position, radiusX, radiusZ, color, type = 2) {
        const draw = () => {
            const model = Mat4.multiply(
                Mat4.translate(position.x, position.y, position.z),
                Mat4.scale(radiusX, 1, radiusZ)
            );
            this.gl.uniformMatrix4fv(this.modelLocation, false, model);
            if (this.normalMatrixLocation) {
                this.gl.uniformMatrix3fv(this.normalMatrixLocation, false, this.computeNormalMatrix(model));
            }
            this.gl.uniform4f(this.colorLocation, color.r, color.g, color.b, color.a);
            this.gl.uniform1f(this.typeLocation, type);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.ellipseBuffer);
            this.setupAttributes();
            this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, this.ellipseVertexCount);
        };
        
        this.drawDoubleSided(draw);
    }

    setTerrainMesh(vertexData) {
        if (!this.gl) return;
        if (this.terrainBuffer) {
            this.gl.deleteBuffer(this.terrainBuffer);
        }
        this.terrainBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexData, this.gl.STATIC_DRAW);
        this.terrainVertexCount = vertexData.length / 8;
    }

    drawTerrain(color, type = 2) {
        if (!this.terrainBuffer || this.terrainVertexCount === 0) return;
        const draw = () => {
            const model = Mat4.identity();
            this.gl.uniformMatrix4fv(this.modelLocation, false, model);
            if (this.normalMatrixLocation) {
                this.gl.uniformMatrix3fv(this.normalMatrixLocation, false, this.computeNormalMatrix(model));
            }
            this.gl.uniform4f(this.colorLocation, color.r, color.g, color.b, color.a);
            this.gl.uniform1f(this.typeLocation, type);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
            this.setupAttributes();
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.terrainVertexCount);
        };
        
        this.drawDoubleSided(draw);
    }
    
    setupAttributes() {
        const stride = 8 * 4; // 8个float，每个4字节
        
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 3, this.gl.FLOAT, false, stride, 0);
        
        this.gl.enableVertexAttribArray(this.normalLocation);
        this.gl.vertexAttribPointer(this.normalLocation, 3, this.gl.FLOAT, false, stride, 3 * 4);
        
        this.gl.enableVertexAttribArray(this.texCoordLocation);
        this.gl.vertexAttribPointer(this.texCoordLocation, 2, this.gl.FLOAT, false, stride, 6 * 4);
    }
    
    hslToRgb(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return { r, g, b, a: 1.0 };
    }
}
