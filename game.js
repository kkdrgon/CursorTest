const { bootstrapRollerCoaster } = require('./src/main.js');

function ensureEnvironment() {
  if (typeof wx === 'undefined' || !wx.createCanvas) {
    throw new Error('当前环境不支持微信小游戏的 WebGL 接口');
  }
}

function run() {
  ensureEnvironment();
  bootstrapRollerCoaster();
}

run();
