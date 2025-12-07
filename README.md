# L2TP/IPSec VPN Android Demo

该示例工程展示了如何使用 `VpnService` + `DatagramChannel` 管理 L2TP/IPSec 隧道的关键结构，包含：

- Kotlin + ViewBinding 的基础 UI，可输入服务器、账号、PSK、虚拟 IP、DNS 与 MTU。
- `L2tpIpsecVpnService`：运行在前台服务中，负责申请 VPN 权限、启动/停止隧道、发送状态广播。
- `L2tpIpsecConnector`：演示如何建立 TUN 接口、保护底层 `DatagramChannel` 以及最简化的 L2TP 控制报文握手。
- `VpnStateMessage`：通过 `LocalBroadcastManager` 将连接状态推送给界面。

> ⚠️ **重要提示**：示例为了保持纯 Java/Kotlin 实现，仅展示了 L2TP/IPSec 连接的流程骨架，并未实现完整的 IKE 协商、ESP 密钥派生以及 PPP/L2TP 数据链路。要连接真实服务器，需要接入成熟的 IKE/L2TP 协议栈（例如 strongSwan、libreswan 或自研 native 模块），并在 `L2tpIpsecConnector` 中替换为可用的实现。

## 运行方式

1. 使用 Android Studio (Giraffe 以上) 打开根目录；
2. 同步 Gradle（本仓库已包含 8.7 wrapper）；
3. 运行 `app` 模块到实体设备（需 Android 8.0+）；
4. 首次点击“连接”会弹出 VPN 权限弹窗，允许后即可开始调试。

## 后续扩展建议

- 在 `L2tpIpsecConnector` 中集成实际的 IKEv1/L2TP 堆栈，并将协商得到的 ESP/SPD 结果应用到 `IpSecManager`；
- 根据企业安全需求，加入证书管理、日志持久化与自动重连逻辑；
- 在 `MainActivity` 中为配置增加持久化（DataStore）以及更完备的输入校验。