
class Queue{
    constructor(){
        this.item={};
        this.a=0;
        this.b=0;
    }
    enqueue(e){
        this.item[this.b]=e;
        this.b++;
        return this;
    }
    dequeue(){
        const r=this.item[this.a];
        delete this.item[this.a];
        this.a++;
        return r;
    }
    size(){
        return this.b-this.a;
    }
}
function projection(x, y,dx,dy,zoom,w,h) {
    return [(2*x-w) / 50.0 / zoom + dx+0.5,-(2*y-h) / 50.0 / zoom + dy+0.5];
}
document.addEventListener('dragstart',e => {
    if (!e.target.classList.contains('tool-btn')) return;
    e.dataTransfer.dropEffect = 'move';
    e.dataTransfer.setData('tower', e.target.dataset.type);
});

// 创建透明拖拽图像
const transparentImg = new Image();
transparentImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1透明像素

// 获取所有可拖拽按钮
document.querySelectorAll('.tool-btn').forEach(btn => {
btn.addEventListener('dragstart', (e) => {
    // 关键设置：将拖拽图像替换为透明图片
    e.dataTransfer.setDragImage(transparentImg, 0, 0);
    
    // 携带需要传输的数据（根据你的实际需求）
    e.dataTransfer.setData('text/plain', btn.dataset.type);
    
    // 可选：添加视觉反馈
    btn.classList.add('dragging');
});

btn.addEventListener('dragend', () => {
        // 清除视觉反馈
        btn.classList.remove('dragging');
    });
});

async function generateGeometryOptimized(n) {
    const vertexCount = n * 6 * 4;
    
    const vertices = new Float32Array(vertexCount);

    for(let i = 0; i < n; i++) {
        const vBase = i * 24; 
        // 顶点数据
        vertices[vBase] = 0; vertices[vBase+1] = 2; vertices[vBase+2] = i;vertices[vBase+3] = 0;
        vertices[vBase+4] = 2; vertices[vBase+5] = 0; vertices[vBase+6] = i;vertices[vBase+7] = 2;
        vertices[vBase+8] = -2; vertices[vBase+9] = 0; vertices[vBase+10] = i;vertices[vBase+11] = 1;
        vertices[vBase+12] = -2; vertices[vBase+13] = 0; vertices[vBase+14] = i;vertices[vBase+15] = 1;
        vertices[vBase+16] = 2; vertices[vBase+17] = 0; vertices[vBase+18] = i;vertices[vBase+19] = 2;
        vertices[vBase+20] = 0; vertices[vBase+21] = -2; vertices[vBase+22] = i;vertices[vBase+23] = 3;
    }
    return { vertices:vertices };
}
async function loadShader(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load shader: ${url}`);
    return await response.text();
}
async function loadImageToTexture(url) {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    return {
        data: new Uint8Array(imageData.data.buffer),
        width: img.width,
        height: img.height
    };
}

function resizeCanvas() {
    // 获取父容器的可用尺寸
    //const canvas = document.createElement('canvas');
    //const cw = canvas.clientWidth;
    //const ch = canvas.clientHeight;

    // 根据宽高比计算新尺寸
    let newWidth = parentWidth;
    let newHeight = newWidth / ASPECT_RATIO;

    // 如果高度超出可用空间，则根据高度调整
    if (newHeight > parentHeight) {
        newHeight = parentHeight;
        newWidth = newHeight * ASPECT_RATIO;
    }

    // 设置canvas的CSS尺寸
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;

    // 设置实际渲染尺寸（考虑设备像素比）
    canvas.width = Math.floor(newWidth * devicePixelRatio);
    canvas.height = Math.floor(newHeight * devicePixelRatio);

    console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
}

window.addEventListener('resize', () => {
    resizeCanvas();
});

// 着色器程序创建函数
function createProgram(gl, vsSource, fsSource) {
    const program = gl.createProgram();
    
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    console.log(vertexShader);
    
    gl.attachShader(program, vertexShader);
    console.log(fragmentShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

var isGameplayActive=false;
async function initWebGPU() {
    await window.CrazyGames.SDK.init();
    try {
        window.CrazyGames.SDK.game.loadingStart();
        newTQueue=new Queue();
        const canvas = document.getElementById('webgpu-canvas');
        const gl = canvas.getContext('webgl2');
        gl.enable(gl.DEPTH_TEST);
        const worker = new Worker('worker.js');
        
        const waveElement = document.getElementById('wave');
        const healthElement = document.getElementById('health');
        const goldElement = document.getElementById('gold');
        const ntElement = document.getElementById('nextTime');
        const ntButton =ntElement.parentNode;
        const leftElement=document.getElementById('toolPaletteLeft');
        const gcElement=document.getElementById('game-controls');
        const deleteElement=document.getElementById('delete');
        const updateElement=document.getElementById('update');
        const pauseElement=document.getElementById('pause');
        const newElement=document.getElementById('new');
        const saveElement=document.getElementById('save');
        const loadElement=document.getElementById('load');
        const continueElement=document.getElementById('continue');

        try {
            // await is not mandatory when requesting banners, but it will allow you to catch errors
            await window.CrazyGames.SDK.banner.requestResponsiveBanner("responsive-banner-container");
          } catch (e) {
            console.log("Error on request responsive banner", e);
          }
          function showMsg(msg) {
            const tip = document.createElement('div');
            tip.className = 'tip-message';
            tip.textContent = msg;
            
            const container = document.createElement('div');
            container.className = 'tip-container';
            container.appendChild(tip);
            
            document.getElementById('baseDiv').appendChild(container);
            
            // 触发动画
            setTimeout(() => tip.classList.add('show'), 10);
            
            // 3秒后移除提示
            setTimeout(() => {
                tip.classList.remove('show');
                setTimeout(() => container.remove(), 300);
            }, 3000);
        }
        function showVictoryScreen() {
            // 创建覆盖层
            const overlay = document.createElement('div');
            overlay.id = 'victoryOverlay';
            
            // 创建内容容器
            const content = document.createElement('div');
            content.className = 'victory-content';
            
            // 添加标题
            const title = document.createElement('h1');
            title.className = 'victory-title';
            title.textContent = 'Victory!';
            
            // 添加说明文字
            const text = document.createElement('p');
            text.textContent = 'You successfully resisted all the enemies!';
            text.style.color = '#ecf0f1';
            text.style.marginBottom = '1.5rem';
            
            // 添加重新开始按钮
            const restartBtn = document.createElement('button');
            restartBtn.id = 'restartButton';
            restartBtn.textContent = 'Play Again';
            
            // 组装元素
            content.appendChild(title);
            content.appendChild(text);
            content.appendChild(restartBtn);
            overlay.appendChild(content);
            
            // 添加到页面
            document.body.appendChild(overlay);
            
            // 显示覆盖层
            overlay.style.display = 'flex';
            window.CrazyGames.SDK.game.happytime();
            // 按钮点击事件
            restartBtn.addEventListener('click', () => {
                restartGame();
                overlay.remove();
            });
        }

        // 示例游戏重置函数（需要根据你的游戏逻辑实现）
        function restartGame() {
            worker.postMessage({type:'init'});
            isGameplayActive=true;
        }
        function showDefeatScreen() {
            // 创建覆盖层
            const overlay = document.createElement('div');
            overlay.id = 'defeatOverlay';
            
            // 创建内容容器
            const content = document.createElement('div');
            content.className = 'defeat-content';
            
            // 添加标题
            const title = document.createElement('h1');
            title.className = 'defeat-title';
            title.textContent = 'GameOver!';
            
            // 添加说明文字
            const text = document.createElement('p');
            text.textContent = 'Defense failure!';
            text.style.color = '#ecf0f1';
            text.style.marginBottom = '1.5rem';
            
            // 添加额外统计信息
            //const stats = document.createElement('div');
            //stats.innerHTML = `
            //    <p>存活波次: ${currentWave}</p>
            //    <p>消灭敌人: ${killedEnemies}</p>
            //`;
            //stats.style.color = '#bdc3c7';
            
            // 添加重试按钮
            const retryBtn = document.createElement('button');
            retryBtn.id = 'retryButton';
            retryBtn.textContent = 'Replay';
            
            // 组装元素
            content.appendChild(title);
            content.appendChild(text);
            //content.appendChild(stats);
            content.appendChild(retryBtn);
            overlay.appendChild(content);
            
            // 添加到页面
            document.body.appendChild(overlay);
            
            // 显示覆盖层
            overlay.style.display = 'flex';
            
            // 按钮点击事件
            retryBtn.addEventListener('click', () => {
                restartGame();
                overlay.remove();
            });
        }

        saveElement.addEventListener('click', (e) => {
            console.log(1234567);
            
            worker.postMessage({type:'allS'});

            const callbacks = {
                adFinished: () =>{
                    save(device,[ssbos.logBuffer,ssbos.unitBuffer,ssbos.ctrlBuffer],ticks);
                },
                adError: (error) => {
                    console.log("Error rewarded ad", error);
                    save(device,[ssbos.logBuffer,ssbos.unitBuffer,ssbos.ctrlBuffer],ticks);
                },
                adStarted: () =>console.log("Start midgame ad")
              };
            window.CrazyGames.SDK.ad.requestAd("rewarded", callbacks);
        });
        loadElement.addEventListener('click', async (e) => {
            const callbacks = {
                adFinished: () =>{
                    Promise.all([
                        load([ssbos.logBuffer,ssbos.unitBuffer,ssbos.ctrlBuffer]).then(ret=>ticks=ret)
                    ]).then(ret=>{
                        isGameplayActive=true;
                        gcElement.style.display ="none";
                    });
                },
                adError: (error) => console.log("Error midgame ad", error),
                adStarted: () => console.log("Start midgame ad")
              };
              window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
        });
        newElement.addEventListener('click', (e) => {
            worker.postMessage({type:'init'});
            isGameplayActive=true;
            gcElement.style.display ="none";
        });
        continueElement.addEventListener('click', (e) => {
            gcElement.style.display ="none";
            isGameplayActive=true;
        });
        pauseElement.addEventListener('click', (e) => {
            gcElement.style.display ="flex";
            window.CrazyGames.SDK.game.gameplayStop();
            isGameplayActive=false;
        });
        async function newGame() {
            worker.postMessage({type:'init'});
        }
        leftElement.classList.toggle('hidden', true);
        deleteElement.addEventListener('click', (e) => {
            worker.postMessage({type:'delete'});
        });
        updateElement.addEventListener('click', (e) => {
            worker.postMessage({type:'update'});
        });
        ntButton.addEventListener('click', (e) => {
            worker.postMessage({type:'next'});
        });

        canvas.addEventListener('dragover', e => {
            e.preventDefault();
            if(newTQueue.size()<2){
                const x = e.offsetX/canvas.clientWidth*canvas.width;
                const y = e.offsetY/canvas.clientHeight*canvas.height;
                r=projection(x,y,29.0,16.0,1.05,canvas.width,canvas.height);
                nt=new Int32Array([1000,Math.trunc(r[0]),Math.trunc(r[1]),0]);
                worker.postMessage({type:'checkTower',data:{x:nt[1],y:nt[2]}});
                
                isDrag=true;
            }
        });
        canvas.addEventListener('click', (e) => {
            e.preventDefault();
            const x = e.offsetX/canvas.clientWidth*canvas.width;
            const y = e.offsetY/canvas.clientHeight*canvas.height;
            r=projection(x,y,29.0,16.0,1.05,canvas.width,canvas.height);
            nt=new Int32Array([0,Math.trunc(r[0]),Math.trunc(r[1]), 2]);

            worker.postMessage({type:'clickTower',data:{x:nt[1],y:nt[2]}});
        });
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            const x = e.offsetX/canvas.clientWidth*canvas.width;
            const y = e.offsetY/canvas.clientHeight*canvas.height;
            r=projection(x,y,29.0,16.0,1.05,canvas.width,canvas.height);
            s=e.dataTransfer.getData('tower');
            nt=new Int32Array([parseInt(s.substring(1)),Math.trunc(r[0]),Math.trunc(r[1]), 1]);
            worker.postMessage({type:'buildTower',data:{x:nt[1],y:nt[2],t:nt[0]}});
            isDrag=false;
        });
        canvas.width=1600;
        canvas.height=1000;

        const [vertexShaderCode, fragmentShaderCode,geometry,img] = await Promise.all([
            loadShader('vs.glsl'),
            loadShader('fs.glsl'),
            generateGeometryOptimized(5000),
            loadImageToTexture('abc.png')
        ]);
        const program = createProgram(gl, vertexShaderCode, fragmentShaderCode);
        gl.useProgram(program);
        this.scLoc = gl.getUniformLocation(program, 's');
        this.dzLoc = gl.getUniformLocation(program, 'dz');
        this.unitLoc = gl.getUniformLocation(program, 'unit');
        this.attrLoc = gl.getUniformLocation(program, 'attr');
        this.textureLoc = gl.getUniformLocation(program, "uTexture");
        this.posLoc = gl.getAttribLocation(program, 'aPosition');

        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
            
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            img.width,
            img.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            img.data
        );


        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);

        window.CrazyGames.SDK.game.loadingStop();

        var ticks=0;
        var newTClean=true;
        var eNow=0;
        var showMinWindow=false;
        var minWindowLoc=950;
        var isDrag=false;
        var zoomedDx=0;
        var zoomedDy=0;
        function setMin(x,y,tid){
            zoomedDx=x;
            zoomedDy=y;
            showMinWindow=tid!=-1;
            leftElement.style.display =tid>=0?"flex": "none";
            minWindowLoc=(x<=15&&y>15)?950:450;
            if(tid>=0){
                leftElement.style.top=(x<=15&&y>15)?'90%':'50%';
            }
        }

        function render() {
            gl.viewport(0,0,canvas.width,canvas.height);
            gl.useProgram(program);
            gl.uniform4f(dzLoc,29.0,16.0,1.05,0);
            gl.uniform4f(scLoc,canvas.width,canvas.height,0.5,0)

            gl.enableVertexAttribArray(this.posLoc);
            gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1i(this.textureLoc, 0); // 传递纹理单元

            gl.drawArrays(gl.TRIANGLES, 0, geometry.vertices.length / 4);
            
            if(showMinWindow){
                gl.viewport(0,canvas.height - minWindowLoc,400,400);
                gl.useProgram(program);
                
                gl.uniform4f(dzLoc,zoomedDx,zoomedDy,2.5,0);
                gl.uniform4f(scLoc,400,400,0.3,0)
    
                gl.enableVertexAttribArray(this.posLoc);
                gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);
    
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.uniform1i(this.textureLoc, 0); // 传递纹理单元
    
                gl.drawArrays(gl.TRIANGLES, 0, geometry.vertices.length / 4);
            }
            requestAnimationFrame(render);
        }
        // 优化后的游戏循环
        let accDelta = 0;
        const TIME_STEP = 33; // 60FPS

        let lastUpdate = 0;
        function gameLoop(timestamp) {
            const delta = timestamp - (lastUpdate || timestamp);
            lastUpdate = timestamp;
            
            accDelta += delta;
            
            while(accDelta >= TIME_STEP) {
                if(isGameplayActive)
                    worker.postMessage({type: 'nextTick'});
                accDelta -= TIME_STEP;
            }
            requestAnimationFrame(gameLoop);
        }
        
        requestAnimationFrame(gameLoop);
        worker.onmessage = function(e) {
            switch (e.data.type) {
                case 'render':
                    gl.uniform4iv(unitLoc,e.data.data);
                    //gl.uniform4f(attrLoc,(e.data.x+50)*1024+e.data.y+50,e.data.r,e.data.tsize,e.data.size);
                    gl.uniform4f(attrLoc,e.data.x,e.data.y,e.data.r,e.data.size*1024+e.data.tsize);
                    setMin(e.data.x,e.data.y,e.data.tid);

                    break;
                case 'defeat':
                    isGameplayActive=false;
                    showDefeatScreen();
                    break;
                case 'victory':
                    isGameplayActive=false;
                    showVictoryScreen();
                    break;
                case 'gold':
                    goldElement.textContent=Math.floor(e.data.data);
                    break;
                case 'hp':
                    healthElement.textContent=Math.floor(e.data.data);
                    break;
                case 'lv':
                    if(e.data.lv>=199){
                        ntElement.textContent="∞";
                        ntButton.disabled = true;
                    }
                    waveElement.textContent=Math.floor(e.data.lv);
                    break;
                case 'nextTime':
                    ntElement.textContent=e.data.t;
                    ntButton.disabled = e.data.t>10;
                    break;
                case 'save':
                    window.CrazyGames.SDK.data.set("game_state", JSON.stringify(e.data.data))
                        .then(() => console.log("Saved!"))
                        .catch(error => console.error("Save failed!:", error));
                    break;
                case 'msg':
                    showMsg(e.data.data)
                    break;
            }
        };
        render();

    } catch (error) {
        document.getElementById('error').textContent = error.message;
    }
}

initWebGPU();