// worker.js
const PI = Math.PI;

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

class GameState {
  constructor() {
    this.towers = new Map();
    this.enemys = new Map();
    this.bullets = new Map();

    
    this.delTowers=new Set();
    this.delEnemys=new Set();
    this.delBullets=new Set();

    this.enemyInfo=this.enemyData();
    this.towerInfo=this.towerData();
    this.bulletInfo=this.bulletData();

    this.init();
  }
  init(){
    this.towers.clear();
    this.enemys.clear();
    this.bullets.clear();
    
    this.check =[];

    this.towerId=0;
    this.enemyId=0;
    this.bulletId=0;

    this.delTowers.clear();
    this.delEnemys.clear();
    this.delBullets.clear();

    this.ticks=0;
    this.npt=0;//当前波次开始ticks
    this.nlv=0;//当前波次
    this.HP=20;
    this.gold=20;
    this.eNow=false;

    this.clickTowerId=-1;
    this.cL=new Vector2(-50,-50);
    this.cr=1;

    this.w=50;
    this.h=30;
    this.dir=[-this.w,this.w,-1,1,-this.w-1,-this.w+1,this.w-1,this.w+1];
    
    this.grid = new Uint32Array(1500).fill(60000);

    const s=this.w*this.h;
    for(let i=0;i<this.w;i++){
      this.grid[i]=65535;
      this.grid[i+this.w]=65535;
      this.grid[s-i-1]=65535;
      this.grid[s-i-1-this.w]=65535;
    }
    for(let i=0;i<this.h;i++){
      this.grid[i*this.w]=65535;
      this.grid[i*this.w+1]=65535;
      this.grid[i*this.w+this.w-1]=65535;
      this.grid[i*this.w+this.w-2]=65535;
    }
    for(let i=0;i<6;i++){
      this.grid[this.w/2+this.w*(this.h-2)-3+i]=60000;
      this.grid[(this.h/2-3+i)*this.w+1]=60000;
      this.grid[this.w/2+this.w-3+i]=60000;
      this.grid[(this.h/2-3+i)*this.w+this.w-2]=60000;
    }

    this.path=[new Uint32Array(1500).fill(65535),new Uint32Array(1500).fill(65535)];

    this.rePath();
    this.sharedArray= new Uint32Array(4000);
  }
  rePath(){
    for(let p=0;p<2;p++){
      const gridCopy = this.grid.map(value => value);

      const q=[];
      let c,d;
      if(p==0){
        c=this.w/2+this.w*(this.h-2)-3;
        d=1;
      }else{
        c=(this.h/2-3)*this.w+1;
        d=this.w;
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
      for(c=this.w+1;c<this.w*this.h-this.w-1;c++){
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
        this.path[p][c]=min_index==1000000?65535:min_index;
      }
    }
  }
  enemyData(){
    const a = new Array(200);
    for (let i = 0; i < 200; i++) {
        a[i] = {
            isF: false, 
            HP: 10 * Math.floor(Math.sqrt((i + 1) ** 3)),
            speed: Math.sqrt(i + 1) * 20.0,             
            gold: 1 + Math.floor(i / 10),              
            uv:new Vector2(23, 2)                                 
        };
    }

    for (let i = 4; i < 200; i += 10) {
        a[i].speed *= 2.0;    
        a[i].uv =new Vector2(26, 2);    
        a[i].HP = Math.floor(a[i].HP / 2);  
        a[i].gold *= 2;      
    }

    for (let i = 19; i < 200; i += 20) {
        a[i].a = 1;        
        a[i].uv =new Vector2(32, 2);   
        a[i].gold *= 2;  
        a[i].isF=true;     
    }

    for (let i = 9; i < 200; i += 20) {
        a[i].HP *= 4;         
        a[i].speed /= 2.0;    
        a[i].uv = new Vector2(29, 2);   
        a[i].gold *= 2;   
    }
    return a;
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
  bulletData(){
    const a =[{speed:1200,atk:10,range:2,mode:0,uv:new Vector2(35,2)},
        {speed:200,atk:20,range:1.5,mode:1,uv:new Vector2(38,2)},
        {speed:500,atk:50,range:2,mode:2,uv:new Vector2(41,2)},
        {speed:1200,atk:20,range:2,mode:0,uv:new Vector2(35,2)},
        {speed:250,atk:40,range:2,mode:1,uv:new Vector2(38,2)},
        {speed:600,atk:100,range:2.4,mode:2,uv:new Vector2(41,2)},
        {speed:1200,atk:50,range:2,mode:0,uv:new Vector2(35,2)},
        {speed:300,atk:100,range:2.4,mode:1,uv:new Vector2(38,2)},
        {speed:700,atk:200,range:3,mode:2,uv:new Vector2(41,2)}];
    return a;
  }

    processTower() {
        this.towers.forEach((tower,_) => {
            const ti=this.towerInfo[tower.id];
            
            let eRangePow=ti.range**2;
            let e_Id=-1;
            let efly=false;
            this.enemys.forEach((enemy,eid)=>{
                const ei=this.enemyInfo[enemy.id];
                if((ei.isF&&ti.canF)||(!ei.isF&&ti.canG)){
                    const p=tower.loc.subtract(enemy.loc);
                    const rangePow=p.lenPow();
                    
                    if((eid<-0.001&&rangePow<=eRangePow)|| (enemy.isF&&(!efly||rangePow<=eRangePow))||(!enemy.isF&&!efly&&(rangePow<=eRangePow))){
                        eRangePow=rangePow;
                        e_Id=eid;
                        efly=enemy.isF;
                    }
                }
            })

            if(e_Id>-0.001){
              
                tower.dir=this.enemys.get(e_Id).loc.subtract(tower.loc).normalize();

                if(this.ticks>tower.ticks+ti.cooldown){
                    tower.ticks=this.ticks;
                    const tloc=this.enemys.get(e_Id).loc.add(tower.id%3==2?Vector2.unitVector(Math.random(2)*Math.PI):Vector2.ZERO);
                    const b={
                        id:ti.bulletId,
                        tag:e_Id,
                        tagLoc:tloc,
                        loc:tower.loc,
                        dir:tower.dir,
                        uv:this.bulletInfo[ti.bulletId].uv
                    };
                    
                    this.bullets.set(this.bulletId++,b);
                }
            }
        });
    }
    processBullet() {
        this.bullets.forEach((bullet,bid) => {
            const bi=this.bulletInfo[bullet.id];
            if(bi.mode==0&&this.enemys.has(bullet.tag)){
                bullet.tagLoc=this.enemys.get(bullet.tag).loc;
            }

            const p=bullet.tagLoc.subtract(bullet.loc);
            const np=p.normalize();
            const dt=np.multiplyScalar(bi.speed/1000);
            const dotp=p.lenPow();

            if(dotp<0.01||dotp<dt.lenPow()){
                this.delBullets.add(bid);
                if(bi.mode==0&&this.enemys.has(bullet.tag)){
                    this.enemys.get(bullet.tag).HP-=bi.atk;
                    this.enemys.get(bullet.tag).isUdAtk=1;
                }
                if(bullet.mode!=0){
                  const drp=bi.range*bi.range;
                  this.enemys.forEach((enemy,_)=>{
                    const ee=this.enemyInfo[enemy.id];
                    if((!ee.isF&&bi.mode==1)||(ee.isF&&bi.mode==2)){
                      const delta=enemy.loc.subtract(bullet.loc);
                      
                      if(delta.lenPow()<=drp){
                        enemy.HP-=bi.atk;
                        enemy.isUdAtk=1;
                      }
                    }
                  })
                }
            }else{
              bullet.loc=bullet.loc.add(dt);
            }
        });

        this.delBullets.forEach((_,bid)=>{
          this.bullets.delete(bid);
        })
        this.delBullets.clear();
    }

    processEnemy() {
      this.enemys.forEach((enemy,eid) => {
        if(enemy.HP<0){
          this.delEnemys.add(eid);
          this.gold+=this.enemyInfo[enemy.id].gold;
          self.postMessage({ type: 'gold', data: this.gold });
        }else{
          let epi =new Vector2(Math.floor(enemy.loc.x) | 0, Math.floor(enemy.loc.y) | 0);
          const map_idx=epi.y*this.w+epi.x;
          if((enemy.path==0&&epi.y==28)||(enemy.path==1&&epi.x==1)){
            //到达终点
            this.delEnemys.add(eid);
            this.HP--;
            self.postMessage({ type: 'hp', data: this.HP });
            if(this.HP<=0) 
              self.postMessage({ type: 'defeat', data:this.nlv});
          }else{
            let dt = enemy.path==0?new Vector2(0.0,1.0):new Vector2(-1.0,0.0);
            const ei=this.enemyInfo[enemy.id];
            if(!ei.isF){
              const p1=epi.x+epi.y*this.w;
              const temp=this.path[enemy.path][p1];

              if(temp>=60000){
                if(enemy.ticks+60<this.ticks){
                  //卡死
                }
              }else{
                const pi=new Vector2(temp%this.w,Math.floor(temp/this.w));
                const pd1=epi.subtract(pi);
                const tp=pi.add(Vector2.v05);
                dt=tp.subtract(enemy.loc);
                
                const powd1=pd1.lenPow();
                const powd2=dt.lenPow();

                if(powd2>powd1+0.03){
                  dt=epi.subtract(enemy.loc).add(Vector2.v05);
                }
                dt=dt.normalize();
              }
            }
            
            enemy.ticks=this.ticks;
            enemy.loc=enemy.loc.add(dt.multiplyScalar(ei.speed/1000.0));
            enemy.dir=dt;
          }
        }
      });
      this.delEnemys.forEach((_,eid)=>{
        this.enemys.delete(eid);
      })
      this.delEnemys.clear();
    }

  update() {
    if(this.nlv<199&&((this.ticks>=(this.npt+600)&&(this.eNow))||(this.ticks>=(this.npt+900)))){
      this.eNow=false;
      this.npt=this.ticks;
      this.nlv+=1;
      self.postMessage({ type: 'lv', lv: this.nlv});
      
      this.gold*=1.05;
      self.postMessage({ type: 'gold', data: this.gold});
    }
    let t=this.ticks-this.npt;
    if(t<=600&&t%10==0){

      const r=Math.floor(Math.random()*6);
      const e={
        id:this.nlv,
        path:t%20==0?0:1,
        ticks:this.ticks,
        HP:this.enemyInfo[this.nlv].HP,
        isUdAtk:0,
        loc:t%20==0?new Vector2(this.w/2+r-2.5,1.5):new Vector2(this.w-1.5,this.h/2+r-2.5),
        dir:new Vector2(1,0),
        uv:this.enemyInfo[this.nlv].uv
      };
      this.enemys.set(this.enemyId++,e)
    }
  }
  
  nextTick(){
    this.ticks++;
    const t= this.ticks-this.npt;
    if(t%30==0&&this.nlv<199)
      self.postMessage({type:'nextTime',t:30-t/30})
    this.processTower();
    this.processBullet();
    this.processEnemy();
    this.update();
  }

  checkTower(x,y){
    if(x>=3&&y>=3&&x<=47&&y<=27){
      let b=x+y*this.w-this.w;
      let ch=this.checkPath(b);
        this.check=[{x:x-0.5,y:y-0.5,uv:this.grid[b-1]<=60000&&ch?50:53},
                  {x:x-0.5,y:y+0.5,uv:this.grid[b+this.w-1]<=60000&&ch?50:53},
                  {x:x+0.5,y:y+0.5,uv:this.grid[b+this.w]<=60000&&ch?50:53},
                  {x:x+0.5,y:y-0.5,uv:this.grid[b]<=60000&&ch?50:53}];

      this.clickTowerId=-2;
      this.cL.x=x;
      this.cL.y=y;
      this.cr=0;
    }
  }
  checkPath(b){
    for(let p=0;p<2;p++){
      const gridCopy = this.grid.map(value => value);
      gridCopy[b-1]=62000;
      gridCopy[b+this.w-1]=62000;
      gridCopy[b+this.w]=62000;
      gridCopy[b]=62000;

      const q=[];
      let c,d;
      if(p==0){
        c=this.w/2+this.w*(this.h-2)-3;
        d=1;
      }else{
        c=(this.h/2-3)*this.w+1;
        d=this.w;
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
        c=this.w/2+this.w-3;
        d=1;
      }else{
        c=(this.h/2-3)*this.w+this.w-2;
        d=this.w;
      }
      for(let i=0;i<6;i++){
        if(gridCopy[c+d*i]>50000){
          return false;
        }
      }
    }
    return true;
  }
  buildTower(x,y,t){
    if(x>=3&&y>=3&&x<=47&&y<=27){
      let b=x+y*this.w-this.w;
      const ti=this.towerInfo[t];

      if(ti.gold<=this.gold){

        if(this.grid[b-1]<=60000&&
          this.grid[b+this.w-1]<=60000&&
          this.grid[b+this.w]<=60000&&
          this.grid[b]<=60000&&this.checkPath(b)){
          
          const tw={
            id:ti.id,
            HP:1,
            ticks:this.ticks,
            loc:new Vector2(x,y),
            dir:new Vector2(0,1),
            uv:ti.uv.copy()
          }
          this.gold-=ti.gold;
          
          self.postMessage({ type: 'gold', data: this.gold});
          this.towers.set(this.towerId++,tw);
          this.grid[b-1]=62000;
          this.grid[b+this.w-1]=62000;
          this.grid[b+this.w]=62000;
          this.grid[b]=62000;
          this.rePath();
        }
      }else{
        self.postMessage({ type: 'msg', data:`You need ${ti.gold} Gold to build this tower!`});
      }
    }
      this.check=[{x:-100,y:-100,uv:53},
                  {x:-100,y:-100,uv:53},
                  {x:-100,y:-100,uv:53},
                  {x:-100,y:-100,uv:53}];
      this.cL.x=-50;
      this.cL.y=-50;
      this.clickTowerId=-1;
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
  deleteTower(){
    const tower=this.towers.get(this.clickTowerId);
    let x=Math.floor(tower.loc.x+0.5);
    let y=Math.floor(tower.loc.y+0.5);
    let b=x+y*this.w-this.w;
          this.grid[b]=60000;
          this.grid[b-1]=60000;
          this.grid[b+this.w]=60000;
          this.grid[b+this.w-1]=60000;

    this.towers.delete(this.clickTowerId);
    this.clickTowerId=-1;
    this.cL.x=-50;
    this.cL.y=-50;
    this.rePath();
  }
  updateTower(){
    const tower=this.towers.get(this.clickTowerId);
    const ti=this.towerInfo[tower.id];

    
    if(ti.updateId>0){
      const tu=this.towerInfo[ti.updateId];
      if(tu.gold<=this.gold){
        this.gold-=tu.gold;
        self.postMessage({ type: 'gold', data: this.gold});
        tower.id=ti.updateId;
        this.cr=tu.range;
      }else{
        self.postMessage({ type: 'msg', data:`You need ${tu.gold} Gold to update this tower!`});
      }
    }
  }
  //保存游戏所有数据
  getAll(){
    const ret={};
    ret.towers=[];
    this.towers.forEach((tower,tid)=>{
      ret.towers.push({id:tid,t:tower});
    });
    ret.enemys=[];
    this.enemys.forEach((enemy,eid)=>{
      ret.enemys.push({id:eid,e:enemy});
    });
    ret.bullets=[];
    this.bullets.forEach((bullet,bid)=>{
      ret.bullets.push({id:bid,b:bullet});
    });
    
    ret.check=this.check;

    ret.towerId=this.towerId;
    ret.enemyId=this.enemyId;
    ret.bulletId=this.bulletId;

    ret.ticks=this.ticks;
    ret.npt=this.npt;
    ret.nlv=this.nlv;
    ret.HP=this.HP;
    ret.gold=this.gold;
    ret.eNow=this.eNow;

    ret.clickTowerId=this.clickTowerId;
    ret.cL=this.cL;
    ret.cr=this.cr;

    ret.w=this.w;
    ret.h=this.h;

    ret.dir=this.dir;

    ret.grid=this.grid;
    console.log(ret);
    return ret;
  }
  setAll(data){
    console.log(data);
  }
}

let gameState = new GameState();

self.onmessage = function(e) {
  const { data } = e;
  
  switch (data.type) {
    case 'init':
      gameState.init();
      break;

    case 'nextTick':
      gameState.nextTick();
      
      let fid=0|0;
      gameState.towers.forEach((t,_)=>{
        gameState.sharedArray[fid++]=Math.floor((t.loc.x+100)*100)*65536+Math.floor((t.loc.y+100)*100);
        gameState.sharedArray[fid++]=Math.floor((t.dir.x+1)*128)*1024*2048+Math.floor((t.dir.y+1)*128)*2048+t.uv.x*8+(t.id==9?1:(Math.floor(t.id/3)+1))*2+(t.HP==-1?0:1);
      });
      
      gameState.enemys.forEach((t,_)=>{
        gameState.sharedArray[fid++]=Math.floor((t.loc.x+100)*100)*65536+Math.floor((t.loc.y+100)*100);
        gameState.sharedArray[fid++]=Math.floor((t.dir.x+1)*128)*1024*2048+Math.floor((t.dir.y+1)*128)*2048+t.uv.x*8+t.isUdAtk*2+1;
        t.isUdAtk=0;
      });
      
      gameState.bullets.forEach((t,_)=>{
        gameState.sharedArray[fid++]=Math.floor((t.loc.x+100)*100)*65536+Math.floor((t.loc.y+100)*100);
        gameState.sharedArray[fid++]=Math.floor((t.dir.x+1)*128)*1024*2048+Math.floor((t.dir.y+1)*128)*2048+t.uv.x*8+1;
      });
      gameState.check.forEach(o=>{
        gameState.sharedArray[fid++]=Math.floor((o.x+100)*100)*65536+Math.floor((o.y+100)*100);
        gameState.sharedArray[fid++]=128*1024*2048+2*128*2048+o.uv*8+1;

      })
      self.postMessage({ type: 'render', 
        data:gameState.sharedArray,
        x:gameState.cL.x,
        y:gameState.cL.y,
        r:gameState.cr,
        tid:gameState.clickTowerId,
        tsize:gameState.towers.size,
        size:gameState.towers.size+gameState.enemys.size+gameState.bullets.size+gameState.check.length });
      break;
    case 'checkTower':
      gameState.checkTower(data.data.x,data.data.y);
      break;      
    case 'buildTower':
      gameState.buildTower(data.data.x,data.data.y,data.data.t);
      break;
    case 'clickTower':
      gameState.clickTower(data.data.x,data.data.y);
      break;
    case 'delete':
      gameState.deleteTower();
      break;
    case 'update':
      gameState.updateTower();
      break;
    case 'next':
      gameState.eNow=true;
      break;
    case 'allS':
      self.postMessage({type:'save',data:gameState.getAll()});
      break;
    case 'allL':
      gameState.setAll(data.data);
      break;
    case 'initSharedBuffer':
      gameState.sharedArray = new Uint32Array(data.buffer);
      break;
  }
};