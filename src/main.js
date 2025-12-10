const { createRollerCoasterApp } = require('./rollercoaster/index.js');

function createRenderingContext() {
  const canvas = wx.createCanvas();
  const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : { pixelRatio: 1 };
  const pixelRatio = systemInfo.pixelRatio || 1;
  canvas.width = systemInfo.screenWidth * pixelRatio;
  canvas.height = systemInfo.screenHeight * pixelRatio;
  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });

  if (!gl) {
    throw new Error('未能创建 WebGL 渲染上下文');
  }

  return { canvas, gl, systemInfo };
}

function registerLifecycle(app) {
  if (!wx || !wx.onShow) {
    return;
  }

  wx.onShow(() => app.resume && app.resume());
  wx.onHide(() => app.pause && app.pause());
}

function bootstrapRollerCoaster() {
  const { canvas, gl, systemInfo } = createRenderingContext();
  const app = createRollerCoasterApp({ canvas, gl, systemInfo });

  if (app && app.start) {
    app.start();
  }

  registerLifecycle(app);
}

module.exports = {
  bootstrapRollerCoaster
};
