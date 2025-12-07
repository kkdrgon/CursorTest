package com.example.vpn.vpn

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.example.vpn.R
import com.example.vpn.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class L2tpIpsecVpnService : android.net.VpnService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connector by lazy { L2tpIpsecConnector(this) }
    private var session: L2tpIpsecSession? = null
    private var connectionJob: Job? = null

    override fun onBind(intent: Intent): IBinder? {
        return if (intent.action == SERVICE_INTERFACE) {
            super.onBind(intent)
        } else {
            null
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            VpnContract.ACTION_CONNECT -> {
                val config = intent.getParcelableExtra<VpnConfig>(VpnContract.EXTRA_CONFIG)
                if (config != null) {
                    startForegroundIfNeeded()
                    connect(config)
                } else {
                    notifyState(VpnStatus.ERROR, "缺少配置")
                }
            }
            VpnContract.ACTION_DISCONNECT -> disconnect("用户断开")
            else -> Unit
        }
        return START_STICKY
    }

    private fun connect(config: VpnConfig) {
        notifyState(VpnStatus.CONNECTING)
        connectionJob?.cancel()
        connectionJob = serviceScope.launch {
            try {
                session?.close()
                session = connector.establish(config)
                notifyState(VpnStatus.CONNECTED, "虚拟 IP ${config.virtualAddress}")
                session?.pump()
                disconnect("会话结束")
            } catch (c: CancellationException) {
                throw c
            } catch (t: Throwable) {
                notifyState(VpnStatus.ERROR, t.localizedMessage ?: "未知错误")
                disconnect("异常：${t.localizedMessage}")
            }
        }
    }

    private fun disconnect(reason: String? = null) {
        serviceScope.launch {
            connectionJob?.cancel()
            connectionJob = null
            session?.close()
            session = null
            notifyState(VpnStatus.DISCONNECTED, reason)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun startForegroundIfNeeded() {
        val channelId = ensureChannel()
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("L2TP/IPSec 服务正在运行")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun ensureChannel(): String {
        val channelId = "vpn_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(channelId, "VPN", NotificationManager.IMPORTANCE_LOW)
            manager?.createNotificationChannel(channel)
        }
        return channelId
    }

    private fun notifyState(status: VpnStatus, detail: String? = null) {
        val intent = Intent(VpnContract.ACTION_STATE_CHANGED).apply {
            putExtra(VpnContract.EXTRA_STATE, VpnStateMessage(status, detail))
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    override fun onDestroy() {
        disconnect("服务销毁")
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
    }
}
