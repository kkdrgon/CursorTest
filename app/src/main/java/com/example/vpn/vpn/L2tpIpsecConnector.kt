package com.example.vpn.vpn

import android.net.VpnService
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel
import java.security.SecureRandom

class L2tpIpsecConnector(private val service: VpnService) {

    suspend fun establish(config: VpnConfig): L2tpIpsecSession = withContext(Dispatchers.IO) {
        config.validate().getOrThrow()
        val builder = service.Builder()
            .setSession(config.sessionName)
            .setConfigureIntent(null)
            .setMtu(config.mtu)
            .addAddress(config.virtualAddress, 32)
            .addRoute("0.0.0.0", 0)

        config.dnsServers.forEach { builder.addDnsServer(it) }

        val tunInterface = builder.establish()
            ?: throw IllegalStateException("无法建立 TUN 接口，请确认 VPN 权限已授权")

        val channel = DatagramChannel.open()
        channel.configureBlocking(false)
        val socket = channel.socket()
        service.protect(socket)
        channel.connect(InetSocketAddress(config.serverAddress, config.l2tpPort))

        bootstrapL2tp(channel, config)

        L2tpIpsecSession(tunInterface, channel)
    }

    private fun bootstrapL2tp(channel: DatagramChannel, config: VpnConfig) {
        val random = SecureRandom()
        val tunnelId = random.nextInt(0xFFFF)
        val callId = random.nextInt(0xFFFF)
        val userBytes = config.username.toByteArray()
        val passBytes = config.password.toByteArray()
        val payloadLength = 12 + 4 + userBytes.size + 4 + passBytes.size
        val buffer = ByteBuffer.allocate(payloadLength)
        buffer.putShort(0xC802.toShort()) // Flags + Version (control message)
        buffer.putShort(tunnelId.toShort())
        buffer.putShort(callId.toShort())
        buffer.putShort(0) // Ns
        buffer.putShort(0) // Nr
        buffer.putShort(payloadLength.toShort())
        buffer.putShort(0x0001) // 自定义 AVP：用户名
        buffer.putShort(userBytes.size.toShort())
        buffer.put(userBytes)
        buffer.putShort(0x0002) // 自定义 AVP：密码
        buffer.putShort(passBytes.size.toShort())
        buffer.put(passBytes)
        buffer.flip()
        channel.write(buffer)
    }
}

class L2tpIpsecSession(
    private val tunInterface: ParcelFileDescriptor,
    private val uplinkChannel: DatagramChannel
) {

    suspend fun pump() = withContext(Dispatchers.IO) {
        val tunInput = FileInputStream(tunInterface.fileDescriptor)
        val tunOutput = FileOutputStream(tunInterface.fileDescriptor)
        val tunBuffer = ByteArray(32768)
        val networkBuffer = ByteBuffer.allocate(32768)
        while (coroutineContext.isActive) {
            val available = tunInput.available()
            if (available > 0) {
                val read = tunInput.read(tunBuffer, 0, minOf(available, tunBuffer.size))
                if (read > 0) {
                    val payload = ByteBuffer.wrap(tunBuffer, 0, read)
                    uplinkChannel.write(payload)
                }
            }

            networkBuffer.clear()
            val readNetwork = uplinkChannel.read(networkBuffer)
            if (readNetwork > 0) {
                tunOutput.write(networkBuffer.array(), 0, readNetwork)
                tunOutput.flush()
            }
            Thread.sleep(10)
        }
    }

    fun close() {
        kotlin.runCatching { uplinkChannel.close() }
        kotlin.runCatching { tunInterface.close() }
    }
}
