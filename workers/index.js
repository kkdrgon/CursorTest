self.onmessage = function (message) {
  // TODO: 在此编写耗时计算，例如轨迹生成或顶点预处理
  console.log('worker收到消息', message);
  self.postMessage({ type: 'noop' });
};
