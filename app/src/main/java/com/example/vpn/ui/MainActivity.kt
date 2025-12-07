package com.example.vpn.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.example.vpn.R
import com.example.vpn.databinding.ActivityMainBinding
import com.example.vpn.vpn.L2tpIpsecVpnService
import com.example.vpn.vpn.VpnConfig
import com.example.vpn.vpn.VpnContract
import com.example.vpn.vpn.VpnStateMessage
import com.example.vpn.vpn.VpnStatus

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var pendingConfig: VpnConfig? = null

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            pendingConfig?.let { startVpnService(it) }
        } else {
            Toast.makeText(this, "用户拒绝了 VPN 权限", Toast.LENGTH_SHORT).show()
        }
    }

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val state = intent?.getParcelableExtra<VpnStateMessage>(VpnContract.EXTRA_STATE)
            state?.let { renderState(it) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupListeners()
        renderState(VpnStateMessage(VpnStatus.IDLE))
    }

    override fun onStart() {
        super.onStart()
        LocalBroadcastManager.getInstance(this)
            .registerReceiver(stateReceiver, IntentFilter(VpnContract.ACTION_STATE_CHANGED))
    }

    override fun onStop() {
        LocalBroadcastManager.getInstance(this).unregisterReceiver(stateReceiver)
        super.onStop()
    }

    private fun setupListeners() {
        binding.buttonConnect.setOnClickListener { requestVpn() }
        binding.buttonDisconnect.setOnClickListener { disconnectVpn() }
    }

    private fun requestVpn() {
        val config = assembleConfig() ?: return
        pendingConfig = config
        val prepare = android.net.VpnService.prepare(this)
        if (prepare != null) {
            vpnPermissionLauncher.launch(prepare)
        } else {
            startVpnService(config)
        }
    }

    private fun startVpnService(config: VpnConfig) {
        val intent = Intent(this, L2tpIpsecVpnService::class.java).apply {
            action = VpnContract.ACTION_CONNECT
            putExtra(VpnContract.EXTRA_CONFIG, config)
        }
        startService(intent)
        pendingConfig = null
    }

    private fun disconnectVpn() {
        val intent = Intent(this, L2tpIpsecVpnService::class.java).apply {
            action = VpnContract.ACTION_DISCONNECT
        }
        startService(intent)
    }

    private fun assembleConfig(): VpnConfig? {
        val server = binding.inputServer.text?.toString()?.trim().orEmpty()
        val username = binding.inputUsername.text?.toString()?.trim().orEmpty()
        val password = binding.inputPassword.text?.toString()?.trim().orEmpty()
        val psk = binding.inputPsk.text?.toString()?.trim().orEmpty()
        val virtualIp = binding.inputVirtualIp.text?.toString()?.trim().orEmpty()
        val mtu = binding.inputMtu.text?.toString()?.trim()?.toIntOrNull() ?: 1400
        val dnsInput = binding.inputDns.text?.toString()?.split(',')
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: emptyList()
        val dns = if (dnsInput.isEmpty()) listOf("1.1.1.1") else dnsInput

        val config = VpnConfig(
            serverAddress = server,
            username = username,
            password = password,
            preSharedKey = psk,
            virtualAddress = virtualIp,
            dnsServers = dns,
            mtu = mtu
        )
        val result = config.validate()
        return if (result.isSuccess) {
            config
        } else {
            val message = result.exceptionOrNull()?.localizedMessage ?: "配置不完整"
            binding.textStatus.text = getString(R.string.label_status_failure, message)
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
            null
        }
    }

    private fun renderState(state: VpnStateMessage) {
        when (state.status) {
            VpnStatus.IDLE -> {
                binding.textStatus.text = getString(R.string.label_status_idle)
                setButtonsEnabled(connectEnabled = true)
            }
            VpnStatus.CONNECTING -> {
                binding.textStatus.text = getString(R.string.label_status_connecting)
                setButtonsEnabled(connectEnabled = false)
            }
            VpnStatus.CONNECTED -> {
                binding.textStatus.text = getString(R.string.label_status_connected)
                setButtonsEnabled(connectEnabled = false)
            }
            VpnStatus.DISCONNECTED -> {
                binding.textStatus.text = getString(R.string.label_status_idle)
                setButtonsEnabled(connectEnabled = true)
            }
            VpnStatus.ERROR -> {
                binding.textStatus.text = getString(R.string.label_status_failure, state.detail ?: "未知错误")
                setButtonsEnabled(connectEnabled = true)
            }
        }
    }

    private fun setButtonsEnabled(connectEnabled: Boolean) {
        binding.buttonConnect.isEnabled = connectEnabled
        binding.buttonDisconnect.isEnabled = !connectEnabled
    }
}
