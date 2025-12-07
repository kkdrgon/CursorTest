package com.example.vpn.vpn

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

enum class VpnStatus {
    IDLE,
    CONNECTING,
    CONNECTED,
    DISCONNECTED,
    ERROR
}

@Parcelize
data class VpnStateMessage(
    val status: VpnStatus,
    val detail: String? = null
) : Parcelable
