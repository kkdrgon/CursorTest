import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Network } from './network.js';

class Client {
    constructor() {
        this.canvas = document.getElementById('canvas');
        
        if (!this.canvas) {
            console.error('找不到canvas元素');
            return;
        }
        
        console.log('初始化客户端...');
        
        try {
            this.renderer = new Renderer(this.canvas);
            console.log('渲染器创建成功');
        } catch (error) {
            console.error('渲染器创建失败:', error);
            alert('渲染器初始化失败: ' + error.message);
            return;
        }
        
        this.network = new Network();
        this.game = new Game(this.renderer, this.network);
        
        // 输入状态
        this.keys = {};
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.joystickInput = { x: 0, y: 0 };
        this.touchLook = { x: 0, y: 0 };
        
        this.setupEventListeners();
        this.setupVirtualJoystick();
        
        console.log('开始游戏循环');
        this.gameLoop();
    }
    
    setupEventListeners() {
        // 键盘输入
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            if (key === 'r') {
                this.game.respawn();
            }
            if (e.code === 'Space') {
                this.game.jump();
            }
            e.preventDefault();
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            e.preventDefault();
        });
        
        // 鼠标输入（桌面端）
        let lastMouseX = 0, lastMouseY = 0;
        let isMouseDown = false;
        
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                isMouseDown = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                this.game.shoot();
            }
            e.preventDefault();
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                isMouseDown = false;
            }
            e.preventDefault();
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (isMouseDown) {
                this.mouseDeltaX += (e.clientX - lastMouseX) * 0.002;
                this.mouseDeltaY += (e.clientY - lastMouseY) * 0.002;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
            e.preventDefault();
        });
        
        // 触摸输入（移动端）
        let touchLookStart = null;
        const lookArea = document.getElementById('lookArea');
        
        lookArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchLookStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            e.preventDefault();
        });
        
        lookArea.addEventListener('touchmove', (e) => {
            if (touchLookStart && e.touches.length === 1) {
                const touch = e.touches[0];
                this.mouseDeltaX += (touch.clientX - touchLookStart.x) * 0.003;
                this.mouseDeltaY += (touch.clientY - touchLookStart.y) * 0.003;
                touchLookStart = { x: touch.clientX, y: touch.clientY };
            }
            e.preventDefault();
        });
        
        lookArea.addEventListener('touchend', (e) => {
            touchLookStart = null;
            e.preventDefault();
        });
        
        // 防止页面滚动
        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
        
        // 更新输入
        setInterval(() => {
            const input = {
                forward: this.keys['w'] || this.keys['arrowup'] || this.joystickInput.y < -0.1,
                backward: this.keys['s'] || this.keys['arrowdown'] || this.joystickInput.y > 0.1,
                left: this.keys['a'] || this.keys['arrowleft'] || this.joystickInput.x < -0.1,
                right: this.keys['d'] || this.keys['arrowright'] || this.joystickInput.x > 0.1,
                mouseDeltaX: this.mouseDeltaX,
                mouseDeltaY: this.mouseDeltaY
            };
            
            this.mouseDeltaX = 0;
            this.mouseDeltaY = 0;
            
            this.game.updateInput(input);
        }, 16);
    }
    
    setupVirtualJoystick() {
        const container = document.getElementById('joystickContainer');
        const knob = document.getElementById('joystickKnob');
        const base = document.getElementById('joystickBase');
        const shootButton = document.getElementById('shootButton');
        
        let isActive = false;
        let baseRect = null;
        const maxDistance = 45; // 最大移动距离
        
        const updateJoystick = (x, y) => {
            if (!baseRect) return;
            
            const centerX = baseRect.left + baseRect.width / 2;
            const centerY = baseRect.top + baseRect.height / 2;
            
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
            const angle = Math.atan2(dy, dx);
            
            const knobX = Math.cos(angle) * distance;
            const knobY = Math.sin(angle) * distance;
            
            knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
            
            // 归一化输入值 (-1 到 1)
            this.joystickInput.x = knobX / maxDistance;
            this.joystickInput.y = knobY / maxDistance;
        };
        
        const startJoystick = (x, y) => {
            baseRect = base.getBoundingClientRect();
            isActive = true;
            container.classList.add('active');
            updateJoystick(x, y);
        };
        
        const moveJoystick = (x, y) => {
            if (isActive) {
                updateJoystick(x, y);
            }
        };
        
        const endJoystick = () => {
            isActive = false;
            container.classList.remove('active');
            knob.style.transform = 'translate(-50%, -50%)';
            this.joystickInput.x = 0;
            this.joystickInput.y = 0;
        };
        
        // 鼠标事件
        container.addEventListener('mousedown', (e) => {
            startJoystick(e.clientX, e.clientY);
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            moveJoystick(e.clientX, e.clientY);
        });
        
        document.addEventListener('mouseup', () => {
            endJoystick();
        });
        
        // 触摸事件
        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                startJoystick(e.touches[0].clientX, e.touches[0].clientY);
            }
            e.preventDefault();
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isActive && e.touches.length === 1) {
                moveJoystick(e.touches[0].clientX, e.touches[0].clientY);
            }
            e.preventDefault();
        });
        
        document.addEventListener('touchend', () => {
            endJoystick();
        });
        
        // 射击按钮
        shootButton.addEventListener('mousedown', () => {
            this.game.shoot();
        });
        
        shootButton.addEventListener('touchstart', (e) => {
            this.game.shoot();
            e.preventDefault();
        });
        
        // 重生按钮（状态区域）
        const status = document.getElementById('status');
        if (status) {
            status.addEventListener('click', () => {
                this.game.respawn();
            });
            status.addEventListener('touchend', (e) => {
                this.game.respawn();
                e.preventDefault();
            });
        }
    }
    
    gameLoop() {
        try {
            this.game.update();
            this.game.render();
        } catch (error) {
            console.error('游戏循环错误:', error);
        }
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 启动客户端
new Client();
