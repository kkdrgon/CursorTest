package com.example.vpn.vpn

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class VpnConfig(
    val serverAddress: String,
    val username: String,
    val password: String,
    val preSharedKey: String,
    val virtualAddress: String,
    val dnsServers: List<String>,
    val mtu: Int = 1400,
    val sessionName: String = "L2TP/IPSec",
    val l2tpPort: Int = 1701
) : Parcelable {
    fun validate(): Result<Unit> {
        if (serverAddress.isBlank()) return Result.failure(IllegalArgumentException("服务器地址不能为空"))
        if (username.isBlank()) return Result.failure(IllegalArgumentException("用户名不能为空"))
        if (password.isBlank()) return Result.failure(IllegalArgumentException("密码不能为空"))
        if (preSharedKey.isBlank()) return Result.failure(IllegalArgumentException("PSK 不能为空"))
        if (virtualAddress.isBlank()) return Result.failure(IllegalArgumentException("虚拟 IP 不能为空"))
        if (mtu !in 800..2000) return Result.failure(IllegalArgumentException("MTU 不合法"))
        if (dnsServers.isEmpty()) return Result.failure(IllegalArgumentException("至少配置一个 DNS"))
        return Result.success(Unit)
    }
}
