class Vector2 {
      constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
      }
      static ZERO=new Vector2();
      static v05=new Vector2(0.5,0.5);
      static unitVector(a=0){
          return new Vector2(Math.cos(a),Math.sin(a));
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
      lenPow(){
        return this.x ** 2 + this.y ** 2;
      }
      
    
      equals(v, epsilon = 1e-6) {
        return Math.abs(this.x - v.x) < epsilon &&
              Math.abs(this.y - v.y) < epsilon;
      }
      copy(){
        return new Vector2(this.x,this.y);
      }
  }
class TowerDefenseShader {
  constructor(gl) {
    this.gl = gl;
    this.computeProgram = null;  // 计算程序（使用您提供的GLSL）
    this.renderProgram = null;   // 渲染程序（单独的顶点/片元着色器）
    this.uniformBuffers = new Map();
    this.textures = new Map();
    this.framebuffers = new Map();
    this.vertexArray = null;
    
    this.UBO_BINDING_POINTS = {
      GAME_BASE: 0,
      BULLET_INFOS: 1,
      TOWER_INFOS: 2,
      PATH_DATA: 3
    };

    this.currentReadTexture = 0;
  }

  // 初始化计算和渲染程序
  async init(computeShaderSource, renderVertexSource, renderFragmentSource) {
    // 创建计算程序（使用您提供的片段着色器）
    this.computeProgram = await this.createProgram(
      this.getFullscreenVertexShader(),
      computeShaderSource
    );

    // 创建渲染程序（使用单独的渲染着色器）
    this.renderProgram = await this.createProgram(
      renderVertexSource,
      renderFragmentSource
    );

    this.setupUBOs();
    this.setupTextures();
    this.setupVertexArray();
  }

  // 全屏四边形顶点着色器（计算使用）
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

  async createProgram(vsSource, fsSource) {
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);
    
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${this.gl.getProgramInfoLog(program)}`);
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

  // 设置统一缓冲区对象（两个程序都要设置）
  setupUBOs() {
    const uboNames = ['GameBase', 'PathData'];
    
    // 为计算程序设置UBO绑定点
    this.gl.useProgram(this.computeProgram);
    uboNames.forEach((name, index) => {
      const buffer = this.gl.createBuffer();
      const blockIndex = this.gl.getUniformBlockIndex(this.computeProgram, name);
      
      if (blockIndex !== this.gl.INVALID_INDEX) {
        this.gl.uniformBlockBinding(this.computeProgram, blockIndex, this.UBO_BINDING_POINTS[name.toUpperCase()]);
        this.uniformBuffers.set(name, buffer);
      }
    });

    // 为渲染程序设置UBO绑定点（如果渲染程序也需要访问相同的UBO）
    // 注意：如果渲染程序不需要访问这些UBO，可以省略此部分
    /*this.gl.useProgram(this.renderProgram);
    uboNames.forEach((name, index) => {
      const buffer = this.uniformBuffers.get(name);
      const blockIndex = this.gl.getUniformBlockIndex(this.renderProgram, name);
      
      if (blockIndex !== this.gl.INVALID_INDEX && buffer) {
        this.gl.uniformBlockBinding(this.renderProgram, blockIndex, this.UBO_BINDING_POINTS[name.toUpperCase()]);
      }
    });*/

    this.gl.useProgram(null);
  }

  // 更新UBO数据（两个程序共享）
  updateUBO(name, data, usage = this.gl.DYNAMIC_DRAW) {
    const buffer = this.uniformBuffers.get(name);
    if (!buffer) return;

    const bindingPoint = this.UBO_BINDING_POINTS[name.toUpperCase()];
    
    this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, buffer);
    this.gl.bufferData(this.gl.UNIFORM_BUFFER, data, usage);
    this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, bindingPoint, buffer);
    this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, null);
  }

  // 设置纹理（乒乓纹理）
  setupTextures() {
    for (let i = 0; i < 2; i++) {
      const texture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      
      // 使用RGBA32UI格式存储无符号整数
      this.gl.texStorage2D(this.gl.TEXTURE_2D, 1, this.gl.RGBA32UI, 300, 26);
      
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      
      this.textures.set(`unitTexture${i}`, texture);
      
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
      
      this.framebuffers.set(`framebuffer${i}`, framebuffer);
    }
    
    this.currentReadTexture = 0;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  // 设置顶点数组（全屏四边形）
  setupVertexArray() {
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    this.vertexArray = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vertexArray);

    // 位置属性
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
    
    // 纹理坐标属性
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  // 执行计算步骤（使用计算程序）
  computeStep() {
    const readTexIndex = this.currentReadTexture;
    const writeTexIndex = 1 - this.currentReadTexture;
    
    const readTexture = this.textures.get(`unitTexture${readTexIndex}`);
    const writeFramebuffer = this.framebuffers.get(`framebuffer${writeTexIndex}`);
    
    // 绑定帧缓冲区
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, writeFramebuffer);
    this.gl.viewport(0, 0, 300, 26);
    
    // 使用计算程序
    this.gl.useProgram(this.computeProgram);
    
    // 绑定顶点数组
    this.gl.bindVertexArray(this.vertexArray);
    
    // 设置输入纹理
    const textureUnit = 0;
    this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, readTexture);
    
    const unitTextureLocation = this.gl.getUniformLocation(this.computeProgram, 'unitTexture');
    this.gl.uniform1i(unitTextureLocation, textureUnit);
    
    // 绘制全屏四边形
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    
    // 清理状态
    this.gl.bindVertexArray(null);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    
    // 交换纹理
    this.currentReadTexture = writeTexIndex;
  }

  // 渲染到屏幕（使用渲染程序）
  renderToScreen() {
    const texture = this.textures.get(`unitTexture${this.currentReadTexture}`);
    
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    
    // 使用渲染程序
    this.gl.useProgram(this.renderProgram);
    this.gl.bindVertexArray(this.vertexArray);
    
    // 设置纹理
    const textureUnit = 0;
    this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    
    // 渲染程序中的纹理uniform名称可能不同，比如"u_texture"
    const textureLocation = this.gl.getUniformLocation(this.renderProgram, 'u_texture');
    if (textureLocation) {
      this.gl.uniform1i(textureLocation, textureUnit);
    }
    
    // 设置其他渲染参数（分辨率等）
    const resolutionLocation = this.gl.getUniformLocation(this.renderProgram, 'uResolution');
    if (resolutionLocation) {
      this.gl.uniform2f(resolutionLocation, this.gl.canvas.width, this.gl.canvas.height);
    }
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.bindVertexArray(null);
  }

  // 从纹理读取数据
  readTextureData(x, y, width = 1, height = 1) {
    const readTexture = this.textures.get(`unitTexture${this.currentReadTexture}`);
    
    // 临时绑定到帧缓冲区来读取数据
    const tempFramebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tempFramebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER, 
      this.gl.COLOR_ATTACHMENT0, 
      this.gl.TEXTURE_2D, 
      readTexture, 
      0
    );
    
    // 创建像素缓冲区
    const pixels = new Uint32Array(width * height * 4);
    
    // 读取像素数据
    this.gl.readPixels(x, y, width, height, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT, pixels);
    
    // 清理
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(tempFramebuffer);
    
    return pixels;
  }

  // 读取特定位置的单元数据
  readUnitData(coord) {
    const data = this.readTextureData(coord.x, coord.y, 1, 1);
    return {
      x: data[0],
      y: data[1],
      z: data[2],
      w: data[3]
    };
  }

  // 初始化纹理数据
  initializeTextureData() {
    const initialData = new Uint32Array(300 * 26 * 4); // RGBA32UI格式
    
    for (let i = 0; i < 2; i++) {
      const texture = this.textures.get(`unitTexture${i}`);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texSubImage2D(
        this.gl.TEXTURE_2D,
        0,
        0, 0,
        300, 26,
        this.gl.RGBA_INTEGER,
        this.gl.UNSIGNED_INT,
        initialData
      );
    }
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  // 清理资源
  cleanup() {
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.framebuffers.forEach(framebuffer => this.gl.deleteFramebuffer(framebuffer));
    this.uniformBuffers.forEach(buffer => this.gl.deleteBuffer(buffer));
    
    if (this.vertexArray) {
      this.gl.deleteVertexArray(this.vertexArray);
    }
    
    if (this.computeProgram) {
      this.gl.deleteProgram(this.computeProgram);
    }
    
    if (this.renderProgram) {
      this.gl.deleteProgram(this.renderProgram);
    }
  }
}

// 使用示例
class TowerDefenseGame {
  constructor(canvas) {
    this.gl = canvas.getContext('webgl2');
    this.shader = new TowerDefenseShader(this.gl);
    
    // 游戏状态
    this.gameState = {
      ticks: 0,
      w: 50,
      h: 30,
      r: 0,
      npt: 0,
      towerCtrl: 0,
      tId: -1,
      tx: -50,
      ty: -50,
      tr: 0,
      check: 0,
      lv: 0
    };

    this.towers = new Map();

    this.dir=[-this.gameState.w,this.gameState.w,-1,1,-this.gameState.w-1,-this.gameState.w+1,this.gameState.w-1,this.gameState.w+1];

    this.grid = new Uint32Array(1500).fill(60000);

    const s=this.gameState.w*this.gameState.h;
    for(let i=0;i<this.gameState.w;i++){
      this.grid[i]=65535;
      this.grid[i+this.gameState.w]=65535;
      this.grid[s-i-1]=65535;
      this.grid[s-i-1-this.gameState.w]=65535;
    }
    for(let i=0;i<this.gameState.h;i++){
      this.grid[i*this.gameState.w]=65535;
      this.grid[i*this.gameState.w+1]=65535;
      this.grid[i*this.gameState.w+this.gameState.w-1]=65535;
      this.grid[i*this.gameState.w+this.gameState.w-2]=65535;
    }
    for(let i=0;i<6;i++){
      this.grid[this.gameState.w/2+this.gameState.w*(this.gameState.h-2)-3+i]=60000;
      this.grid[(this.gameState.h/2-3+i)*this.gameState.w+1]=60000;
      this.grid[this.gameState.w/2+this.gameState.w-3+i]=60000;
      this.grid[(this.gameState.h/2-3+i)*this.gameState.w+this.gameState.w-2]=60000;
    }

    this.path=new Uint32Array(3000).fill(65535);

    this.rePath();
    this.towerInfo=this.towerData();

    this.cmdQueue = [];
    this.gold = 20;
    
  }

  async init() {
    // 从外部文件加载着色器代码
    const [computeShader, renderVertex, renderFragment] = await Promise.all([
      fetch('shaders/compute.frag').then(r => r.text()),
      fetch('shaders/render.vert').then(r => r.text()),
      fetch('shaders/render.frag').then(r => r.text())
    ]);

    await this.shader.init(computeShader, renderVertex, renderFragment);
    this.setupGameData();
  }

  setupGameData() {
    // 初始化游戏基础数据UBO
    const gameBaseData = new Int32Array([
      this.gameState.ticks,
      this.gameState.w,
      this.gameState.h,
      this.gameState.r,
      this.gameState.npt,
      this.gameState.towerCtrl,
      this.gameState.tId,
      this.gameState.tx,
      this.gameState.ty,
      this.gameState.tr,
      this.gameState.check,
      this.gameState.lv
    ]);
    
    this.shader.updateUBO('GameBase', gameBaseData);
    
    // 初始化其他UBO数据...
    this.initializePathData();
    
    // 初始化纹理
    this.shader.initializeTextureData();
  }


  initializePathData() {
    // 路径数据初始化
    const pathData = new Int32Array(3000);
    pathData.fill(65535);
    // 设置路径数据...
    this.shader.updateUBO('PathData', pathData);
  }

  update() {
    this.gameState.ticks++;
    this.gameState.r = Math.floor(Math.random() * 6);
    
    if(this.cmdQueue.length>0){
      const cmd=this.cmdQueue.shift();
      if(cmd.operation=='build'){
        this.gameState.towerCtrl=1;
        this.gameState.tId=cmd.towerId;
        this.gameState.tx=cmd.x;
        this.gameState.ty=cmd.y;
      }else if(cmd.operation=='remove'){
        this.gameState.towerCtrl=2;
        this.gameState.tId=cmd.towerIndex;
      }else if(cmd.operation=='upgrade'){
        this.gameState.towerCtrl=3;
        this.gameState.tId=cmd.towerIndex;
      }
    }
        // 更新UBO
    const gameBaseData = new Int32Array([
      this.gameState.ticks,
      this.gameState.w,
      this.gameState.h,
      this.gameState.r,
      this.gameState.npt,
      this.gameState.towerCtrl,
      this.gameState.tId,
      this.gameState.tx,
      this.gameState.ty,
      this.gameState.tr,
      this.gameState.check,
      this.gameState.lv
    ]);
    this.shader.updateUBO('GameBase', gameBaseData);
    
    // 执行计算步骤
    this.shader.computeStep();
    
    // 重置操作状态
    this.gameState.towerCtrl = 0;
    this.gameState.tId = -1;
  }
  towerData(){
    const a =[{id:0,range:6,cooldown:10,canF:true,canG:true,gold:5,bulletId:0,updateId:3,uv:new Vector2(14, 2)},
        {id:1,range:8,cooldown:40,canF:false,canG:true,gold:20,bulletId:1,updateId:4,uv:new Vector2(17, 2)},
        {id:2,range:10,cooldown:4,canF:true,canG:false,gold:100,bulletId:2,updateId:5,uv:new Vector2(20, 2)},
        {id:3,range:10,cooldown:8,canF:true,canG:true,gold:20,bulletId:3,updateId:6,uv:new Vector2(14,2)},
        {id:4,range:10,cooldown:35,canF:false,canG:true,gold:100,bulletId:4,updateId:7,uv:new Vector2(17,2)},
        {id:5,range:12,cooldown:3,canF:true,canG:false,gold:500,bulletId:5,updateId:8,uv:new Vector2(20,2)},
        {id:6,range:15,cooldown:6,canF:true,canG:true,gold:100,bulletId:6,updateId:-1,uv:new Vector2(14,2)},
        {id:7,range:12,cooldown:30,canF:false,canG:true,gold:500,bulletId:7,updateId:-1,uv:new Vector2(17,2)},
        {id:8,range:14,cooldown:2,canF:true,canG:false,gold:5000,bulletId:8,updateId:-1,uv:new Vector2(20,2)},
        {id:9,range:2,cooldown:2,canF:false,canG:false,gold:5,bulletId:-1,updateId:-1,uv:new Vector2(23,2)}];
    return a;
  }
  render() {
    this.shader.renderToScreen();
  }
  rePath(){
    for(let p=0;p<2;p++){
      const gridCopy = this.grid.map(value => value);

      const q=[];
      let c,d;
      if(p==0){
        c=this.gameState.w/2+this.gameState.w*(this.gameState.h-2)-3;
        d=1;
      }else{
        c=(this.gameState.h/2-3)*this.gameState.w+1;
        d=this.gameState.w;
      }

      for(let i=0;i<6;i++){
        q.push([c+d*i,0]);
      }

      while(q.length>0){
        const t=q.shift();
        if(gridCopy[t[0]]==60000){
          gridCopy[t[0]]=t[1];
          for(let d=0;d<8;d++){
            const e=t[0]+this.dir[d];
            if(gridCopy[e]==60000){
              q.push([e,t[1]+1]);
            }
          }
        }
      }
      for(c=this.gameState.w+1;c<this.gameState.w*this.gameState.h-this.gameState.w-1;c++){
        d=gridCopy[c];
        const imax=d>60000?4:8;
        let min_val=60000;
        let min_index=1000000;
        for(let i=0;i<imax;i++){
          const e=c+this.dir[i];
          if(gridCopy[e]<min_val){
            min_val=gridCopy[e];
            min_index=e;
          }
        }
        this.path[p*1500+c]=min_index==1000000?65535:min_index;
      }
    }
  }
  checkPath(b){
    for(let p=0;p<2;p++){
      const gridCopy = this.grid.map(value => value);
      gridCopy[b-1]=62000;
      gridCopy[b+this.gameState.w-1]=62000;
      gridCopy[b+this.gameState.w]=62000;
      gridCopy[b]=62000;

      const q=[];
      let c,d;
      if(p==0){
        c=this.gameState.w/2+this.gameState.w*(this.gameState.h-2)-3;
        d=1;
      }else{
        c=(this.gameState.h/2-3)*this.gameState.w+1;
        d=this.gameState.w;
      }

      for(let i=0;i<6;i++){
        q.push([c+d*i,0]);
      }

      while(q.length>0){
        const t=q.shift();
        if(gridCopy[t[0]]==60000){
          gridCopy[t[0]]=t[1];
          for(let d=0;d<8;d++){
            const e=t[0]+this.dir[d];
            if(gridCopy[e]==60000){
              q.push([e,t[1]+1]);
            }
          }
        }
      }

      if(p==0){
        c=this.gameState.w/2+this.gameState.w-3;
        d=1;
      }else{
        c=(this.gameState.h/2-3)*this.gameState.w+this.gameState.w-2;
        d=this.gameState.w;
      }
      for(let i=0;i<6;i++){
        if(gridCopy[c+d*i]>50000){
          return false;
        }
      }
    }
    return true;
  }
  // 塔操作接口
  checkTower(x, y) {
    if (x >= 3 && y >= 3 && x <= 47 && y <= 27) {
      const b = x + y * this.gameState.w - this.gameState.w;
      let ch=this.checkPath(b);

      this.gameState.check=this.grid[b-1]<=60000&&ch?0:1
                          +this.grid[b+this.gameState.w-1]<=60000&&ch?0:2
                          +this.grid[b+this.gameState.w]<=60000&&ch?0:4
                          +this.grid[b]<=60000&&ch?0:8;
      this.gameState.tId=-2;
      this.gameState.tx=x;
      this.gameState.ty=y;
      this.gameState.tr=0;
    }
  }
  clickTower(x,y){
    const cp=new Vector2(x,y);
    this.clickTowerId=-1;
    this.cL.x=-50;
    this.cL.y=-50;
    this.cr=1;

    this.towers.forEach((tower,tid)=>{
      let delta=tower.loc.subtract(cp);
      if(delta.x<1.1&&delta.y<1.1&&delta.x>-1.1&&delta.y>-1.1){
        let x=Math.floor(tower.loc.x+0.5);
        let y=Math.floor(tower.loc.y+0.5);
        this.clickTowerId=tid;

        if(tower.id==9){
          let b=x+y*this.w-this.w;
          if(this.checkPath(b)){
            this.gold-=this.towerInfo[9].gold;
            self.postMessage({ type: 'gold', data: this.gold});
            tower.HP=-tower.HP;

            const m=tower.HP==-1?60000:62000;
            tower.uv.x-=tower.HP*3;

            let b=x+y*this.w-this.w;
            this.grid[b]=m;
            this.grid[b-1]=m;
            this.grid[b+this.w]=m;
            this.grid[b+this.w-1]=m;

            this.rePath();
          }else{
            self.postMessage({ type: 'msg', data:"Can not block enemys paths!"});
          }
        }//else{
          this.clickTowerId=tid;
          this.cL.x=x;
          this.cL.y=y;
          this.cr=this.towerInfo[tower.id].range;
        //}
        return;
      }
    })
  }
  buildTower(towerId, x, y) {
    if(x>=3&&y>=3&&x<=47&&y<=27){
      const b=x+y*this.gameState.w-this.gameState.w;
      const ti=this.towerInfo[towerId];

      if(ti.gold<=this.gold){
        if(this.grid[b-1]<=60000&&
          this.grid[b+this.gameState.w-1]<=60000&&
          this.grid[b+this.gameState.w]<=60000&&
          this.grid[b]<=60000&&this.checkPath(b)){
            const cmd={
              operation: 'build',
              towerId: towerId,
              x: x,
              y: y,
              towerIndex:this.towerIndex++
            }
            this.cmdQueue.push(cmd);
            const tw={
              id:towerId,
              loc:new Vector2(x,y),
              HP:1
            }
            this.towers.set(this.towerId++,tw);
            this.gold-=ti.gold;
            this.grid[b-1]=62000;
            this.grid[b+this.gameState.w-1]=62000;
            this.grid[b+this.gameState.w]=62000;
            this.grid[b]=62000;
            this.rePath();
        }
      }else{
        self.postMessage({ type: 'msg', data:`You need ${ti.gold} Gold to build this tower!`});
      }
    }
  }

  removeTower(towerIndex) {
    const cmd = {
      operation: 'remove',
      towerIndex: towerIndex
    };

    this.cmdQueue.push(cmd);
  }

  upgradeTower(towerIndex) {
    const cmd = {
      operation: 'upgrade',
      towerIndex: towerIndex
    };
    this.cmdQueue.push(cmd);
  }
}

export { TowerDefenseShader, TowerDefenseGame };