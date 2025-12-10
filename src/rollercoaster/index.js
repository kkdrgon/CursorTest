class RollerCoasterApp {
  constructor({ canvas, gl, systemInfo }) {
    this.canvas = canvas;
    this.gl = gl;
    this.systemInfo = systemInfo;
    this._isRunning = false;
    this._frameHandle = null;

    this._initGLState();
  }

  _initGLState() {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  start() {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;
    this._tick();
  }

  pause() {
    this._isRunning = false;
    if (this._frameHandle && this.canvas.cancelAnimationFrame) {
      this.canvas.cancelAnimationFrame(this._frameHandle);
    }
  }

  resume() {
    if (!this._isRunning) {
      this._isRunning = true;
      this._tick();
    }
  }

  _tick() {
    if (!this._isRunning) {
      return;
    }

    this._renderFrame();

    const raf =
      this.canvas.requestAnimationFrame ||
      globalThis.requestAnimationFrame ||
      function (cb) {
        return setTimeout(cb, 16);
      };

    this._frameHandle = raf(() => this._tick());
  }

  _renderFrame() {
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // TODO: 在这里整合真实的 WebGL 过山车渲染逻辑
  }
}

function createRollerCoasterApp(context) {
  return new RollerCoasterApp(context);
}

module.exports = {
  createRollerCoasterApp
};
