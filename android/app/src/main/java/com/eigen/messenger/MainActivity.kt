package com.eigen.messenger

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.widget.Toast
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.InsertEmoticon
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.automirrored.filled.CallReceived
import androidx.compose.material.icons.automirrored.filled.CallMade
import androidx.compose.material.icons.automirrored.filled.CallMissed
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import coil.compose.AsyncImage
import coil.request.ImageRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.MultipartBody
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.net.URLEncoder
import kotlin.math.absoluteValue

private val WaGreen = Color(0xFF25D366)
private val WaGreenDark = Color(0xFF128C7E)
private val Bg = Color(0xFF071013)
private val Surface = Color(0xFF0D1B1F)
private val Surface2 = Color(0xFF15272D)
private val BubbleIn = Color(0xFF1D2B31)
private val BubbleOut = Color(0xFF06745F)
private val TextPrimary = Color(0xFFEFF7F6)
private val TextSecondary = Color(0xFFA7B1B5)
private val Divider = Color(0x1AFFFFFF)
private val Danger = Color(0xFFFF6B6B)
private val SenderNameColor = Color(0xFFFFD166)
private val HeaderNameColor = Color(0xFFB6FFE2)

private data class EmojiItem(
    val emoji: String,
    val name: String,
    val category: String,
    val keywords: List<String>
)

private fun emoji(category: String, symbol: String, name: String, vararg keywords: String) =
    EmojiItem(symbol, name, category, listOf(name, *keywords))

private val EmojiDatabase = listOf(
    emoji("Smileys", "😀", "grinsend", "smile", "lach", "happy", "freude"),
    emoji("Smileys", "😃", "großes lachen", "smile", "lach", "glücklich"),
    emoji("Smileys", "😄", "lachend", "haha", "freude", "happy"),
    emoji("Smileys", "😁", "breites grinsen", "grins", "zähne"),
    emoji("Smileys", "😆", "stark lachen", "lol", "lustig"),
    emoji("Smileys", "😅", "schweiß lachen", "peinlich", "erleichtert"),
    emoji("Smileys", "😂", "tränen lachen", "lol", "haha", "lustig"),
    emoji("Smileys", "🤣", "rofl", "kaputt lachen", "lustig"),
    emoji("Smileys", "😊", "lächeln", "nett", "zufrieden"),
    emoji("Smileys", "🙂", "leichtes lächeln", "smile"),
    emoji("Smileys", "😉", "zwinkern", "wink", "flirt"),
    emoji("Smileys", "😍", "verliebt", "liebe", "herz", "love"),
    emoji("Smileys", "😘", "kuss", "liebe", "bussi"),
    emoji("Smileys", "😎", "cool", "sonnenbrille"),
    emoji("Smileys", "🤔", "nachdenken", "denken", "frage"),
    emoji("Smileys", "😐", "neutral", "egal"),
    emoji("Smileys", "🙄", "augen rollen", "genervt"),
    emoji("Smileys", "😢", "traurig", "wein", "sad"),
    emoji("Smileys", "😭", "weinen", "heulen", "traurig"),
    emoji("Smileys", "😡", "wütend", "zorn", "sauer"),
    emoji("Smileys", "🤯", "kopf explodiert", "wow", "krass"),
    emoji("Smileys", "😴", "schlafen", "müde"),
    emoji("Smileys", "🤒", "krank", "fieber"),
    emoji("Smileys", "🤮", "übel", "kotzen", "krank"),
    emoji("Hände", "👍", "daumen hoch", "ok", "gut", "like"),
    emoji("Hände", "👎", "daumen runter", "schlecht", "dislike"),
    emoji("Hände", "👌", "perfekt", "ok", "gut"),
    emoji("Hände", "✌️", "peace", "sieg", "zwei"),
    emoji("Hände", "🤞", "daumen drücken", "glück"),
    emoji("Hände", "🙏", "bitte danke", "danke", "beten"),
    emoji("Hände", "👏", "applaus", "klatschen"),
    emoji("Hände", "👋", "winken", "hallo", "tschüss"),
    emoji("Hände", "🤝", "handschlag", "deal"),
    emoji("Hände", "💪", "stark", "muskel", "kraft"),
    emoji("Herzen & Symbole", "❤️", "rotes herz", "liebe", "love"),
    emoji("Herzen & Symbole", "🧡", "oranges herz", "liebe"),
    emoji("Herzen & Symbole", "💛", "gelbes herz", "liebe"),
    emoji("Herzen & Symbole", "💚", "grünes herz", "liebe"),
    emoji("Herzen & Symbole", "💙", "blaues herz", "liebe"),
    emoji("Herzen & Symbole", "💜", "lila herz", "liebe"),
    emoji("Herzen & Symbole", "🖤", "schwarzes herz", "liebe"),
    emoji("Herzen & Symbole", "💔", "gebrochenes herz", "traurig"),
    emoji("Herzen & Symbole", "🔥", "feuer", "hot", "stark"),
    emoji("Herzen & Symbole", "🎉", "party", "feiern", "konfetti"),
    emoji("Herzen & Symbole", "✅", "haken", "ok", "erledigt"),
    emoji("Herzen & Symbole", "❌", "kreuz", "nein", "falsch"),
    emoji("Herzen & Symbole", "⚠️", "warnung", "achtung"),
    emoji("Herzen & Symbole", "⭐", "stern", "favorit"),
    emoji("Herzen & Symbole", "💯", "hundert", "top", "perfekt"),
    emoji("Tiere", "🐶", "hund", "dog"),
    emoji("Tiere", "🐱", "katze", "cat"),
    emoji("Tiere", "🐭", "maus"),
    emoji("Tiere", "🐰", "hase"),
    emoji("Tiere", "🦊", "fuchs"),
    emoji("Tiere", "🐻", "bär"),
    emoji("Tiere", "🐼", "panda"),
    emoji("Tiere", "🐵", "affe"),
    emoji("Tiere", "🐸", "frosch"),
    emoji("Tiere", "🐝", "biene"),
    emoji("Essen", "🍎", "apfel", "obst"),
    emoji("Essen", "🍌", "banane", "obst"),
    emoji("Essen", "🍕", "pizza", "essen"),
    emoji("Essen", "🍔", "burger", "essen"),
    emoji("Essen", "🍟", "pommes", "essen"),
    emoji("Essen", "🌭", "hotdog", "essen"),
    emoji("Essen", "🍩", "donut", "süß"),
    emoji("Essen", "🍰", "kuchen", "süß"),
    emoji("Essen", "☕", "kaffee", "trinken"),
    emoji("Reisen", "🚗", "auto", "fahren"),
    emoji("Reisen", "🚕", "taxi", "fahren"),
    emoji("Reisen", "🚌", "bus", "fahren"),
    emoji("Reisen", "🚆", "zug", "bahn"),
    emoji("Reisen", "✈️", "flugzeug", "reise", "fliegen"),
    emoji("Reisen", "🚲", "fahrrad", "bike"),
    emoji("Objekte", "📷", "kamera", "foto", "bild"),
    emoji("Objekte", "🖼️", "bild", "foto", "galerie"),
    emoji("Objekte", "📍", "standort", "pin", "ort"),
    emoji("Objekte", "📞", "telefon", "anruf"),
    emoji("Objekte", "💬", "nachricht", "chat"),
    emoji("Objekte", "💡", "idee", "licht"),
    emoji("Objekte", "🔒", "schloss", "sicher"),
    emoji("Objekte", "🔧", "werkzeug", "reparatur"),
    emoji("Objekte", "📦", "paket", "box"),
    emoji("Objekte", "🎵", "musik", "song")
)

class MainActivity : ComponentActivity() {
    private lateinit var settings: SettingsStore
    private lateinit var notifier: AppNotifier
    private val api = ServerApi()
    private var socket: WebSocket? = null
    private var websocketRetryJob: Job? = null

    private var serverUrl by mutableStateOf("")
    private var appKey by mutableStateOf("")
    private var currentTab by mutableStateOf(HomeTab.Chats)
    private var selectedChat by mutableStateOf<ChatItem?>(null)
    private var showSettings by mutableStateOf(false)
    private var connectionState by mutableStateOf("offline")
    private var errorText by mutableStateOf<String?>(null)
    private var notificationsEnabled by mutableStateOf(true)
    private var qrText by mutableStateOf<String?>(null)
    private var chatBackgroundUri by mutableStateOf("")

    private var chats by mutableStateOf(emptyList<ChatItem>())
    private var messagesByChat by mutableStateOf(emptyMap<String, List<MessageItem>>())
    private var calls by mutableStateOf(emptyList<CallItem>())
    private var contactNames by mutableStateOf(emptyMap<String, String>())

    private var pendingCameraUri: Uri? = null
    private var pendingVoiceUri: Uri? = null
    private var pendingVoiceFile: File? = null
    private var pendingVoiceChat: ChatItem? = null
    private var voiceRecorder: MediaRecorder? = null
    private var voiceRecordingStartedAt = 0L
    private var isRecordingVoice by mutableStateOf(false)
    private var voicePreview by mutableStateOf<VoicePreview?>(null)

    companion object {
        @Volatile
        var isActivityVisible: Boolean = false
    }

    private val imagePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        val chat = selectedChat
        if (uri != null && chat != null) sendMedia(chat, uri, "image")
    }

    private val cameraLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val chat = selectedChat
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (success && uri != null && chat != null) sendMedia(chat, uri, "image")
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            openCamera()
        } else {
            errorText = "Kamera-Berechtigung wurde nicht erteilt."
        }
    }

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val chat = pendingVoiceChat
        if (granted && chat != null) {
            startVoiceRecordingNow(chat)
        } else {
            pendingVoiceChat = null
            errorText = "Mikrofon-Berechtigung wurde nicht erteilt."
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        val chat = selectedChat
        if (uri != null && chat != null) sendMedia(chat, uri, "document")
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        notificationsEnabled = granted
        settings.notificationsEnabled = granted
        if (granted) startPushServiceIfEnabled() else stopPushService()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = SettingsStore(this)
        notifier = AppNotifier(this)
        notifier.createChannels()

        serverUrl = settings.serverUrl
        appKey = settings.appKey
        notificationsEnabled = settings.notificationsEnabled
        contactNames = settings.contactNames
        chatBackgroundUri = settings.chatBackgroundUri

        setContent {
            OwnMessengerTheme {
                AppContent()
            }
        }

        if (serverUrl.isNotBlank()) {
            startNetworking(serverUrl)
        }
        startPushServiceIfEnabled()
    }

    override fun onResume() {
        super.onResume()
        isActivityVisible = true
    }

    override fun onPause() {
        isActivityVisible = false
        super.onPause()
    }

    override fun onDestroy() {
        socket?.close(1000, "Activity destroyed")
        releaseVoiceRecorder()
        super.onDestroy()
    }

    @Composable
    private fun AppContent() {
        when {
            serverUrl.isBlank() -> ServerSetupScreen(
                initialValue = "https://deine-domain.de",
                initialAppKey = appKey,
                onSave = { url, key -> saveServer(url, key) }
            )

            showSettings -> SettingsScreen(
                serverUrl = serverUrl,
                appKey = appKey,
                deviceId = settings.deviceId,
                notificationsEnabled = notificationsEnabled,
                connectionState = connectionState,
                errorText = errorText,
                chatBackgroundUri = chatBackgroundUri,
                onBack = { showSettings = false },
                onSaveServer = { url, key -> saveServer(url, key) },
                onNotificationToggle = { enabled ->
                    if (enabled) requestNotificationPermissionIfNeeded()
                    notificationsEnabled = enabled
                    settings.notificationsEnabled = enabled
                    if (enabled) startPushServiceIfEnabled() else stopPushService()
                },
                onReconnect = { startNetworking(serverUrl) },
                onChatBackgroundSelected = { uri ->
                    chatBackgroundUri = uri
                    settings.chatBackgroundUri = uri
                },
                onClearChatBackground = {
                    chatBackgroundUri = ""
                    settings.chatBackgroundUri = ""
                }
            )

            selectedChat != null -> ChatScreen(
                chat = displayChat(selectedChat!!),
                messages = messagesByChat[selectedChat!!.id].orEmpty(),
                allChats = chats.map { displayChat(it) },
                qrText = qrText,
                connectionState = connectionState,
                serverUrl = serverUrl,
                auth = clientAuth(),
                onBack = { selectedChat = null },
                onSend = { text -> selectedChat?.let { sendMessage(it, text) } ?: run { errorText = "Chat nicht mehr geöffnet." } },
                onForwardMessage = { targetChat, message -> forwardMessage(targetChat, message) },
                onRenameContact = { newName -> renameContact(selectedChat!!.id, newName) },
                chatBackgroundUri = chatBackgroundUri,
                isRecordingVoice = isRecordingVoice,
                voiceRecordingStartedAt = voiceRecordingStartedAt,
                voicePreviewUri = voicePreview?.takeIf { it.chat.id == selectedChat!!.id }?.uri?.toString(),
                voicePreviewDurationMs = voicePreview?.takeIf { it.chat.id == selectedChat!!.id }?.durationMs,
                onVoiceClick = { toggleVoiceRecording(selectedChat!!) },
                onVoicePreviewSend = { sendVoicePreview() },
                onVoicePreviewDiscard = { discardVoicePreview() },
                onPickImage = { imagePickerLauncher.launch("image/*") },
                onTakePhoto = { startCameraCapture() },
                onPickFile = { filePickerLauncher.launch("*/*") }
            )

            else -> HomeScreen(
                currentTab = currentTab,
                connectionState = connectionState,
                qrText = qrText,
                chats = chats.map { displayChat(it) },
                calls = calls.map { displayCall(it) },
                onTabChange = { currentTab = it },
                onOpenSettings = { showSettings = true },
                onOpenChat = { chat ->
                    selectedChat = chat
                    chats = chats.map { if (it.id == chat.id) it.copy(unreadCount = 0) else it }
                },
                onStartChat = { number, name -> startLocalChat(number, name) }
            )
        }
    }

    private fun clientAuth(): AppClientAuth = AppClientAuth(
        appKey = appKey,
        deviceId = settings.deviceId,
        deviceName = Build.MANUFACTURER.orEmpty().ifBlank { "Android" },
        deviceModel = Build.MODEL.orEmpty().ifBlank { "Android" },
        appVersion = APP_VERSION
    )

    private fun saveServer(rawUrl: String, rawAppKey: String = appKey) {
        val normalized = ServerApi.normalizeBaseUrl(rawUrl)
        if (!ServerApi.isSecureServerUrl(normalized)) {
            errorText = "Unsichere Server-Adresse blockiert. Bitte https://DEINE-DOMAIN benutzen, nicht http://IP:3000."
            return
        }
        val cleanKey = rawAppKey.trim()
        settings.serverUrl = normalized
        settings.appKey = cleanKey
        serverUrl = normalized
        appKey = cleanKey
        errorText = null
        qrText = null
        selectedChat = null
        showSettings = false
        startNetworking(normalized)
        startPushServiceIfEnabled()
    }

    private fun startNetworking(url: String) {
        socket?.close(1000, "Reconnect")
        connectionState = "verbinde"
        errorText = null
        lifecycleScope.launch {
            try {
                val bootstrap = api.loadBootstrap(url, clientAuth())
                if (bootstrap != null) {
                    chats = bootstrap.chats
                    messagesByChat = bootstrap.messagesByChat
                    calls = mergeCalls(bootstrap.calls, callLogsFromMessages(bootstrap.messagesByChat, bootstrap.chats))
                }
            } catch (error: Exception) {
                errorText = "Sync fehlgeschlagen: ${error.message}"
            }
            connectWebSocket(url)
        }
    }

    private fun connectWebSocket(url: String) {
        websocketRetryJob?.cancel()
        socket = api.connectWebSocket(
            baseUrl = url,
            auth = clientAuth(),
            onState = { state ->
                runOnUiThread { connectionState = state }
                if (state == "offline" && serverUrl.isNotBlank()) scheduleWebSocketReconnect()
            },
            onMessage = { text -> runOnUiThread { handleSocketEvent(text) } },
            onError = { error ->
                runOnUiThread { errorText = error }
                scheduleWebSocketReconnect()
            }
        )
    }

    private fun scheduleWebSocketReconnect() {
        if (websocketRetryJob?.isActive == true) return
        websocketRetryJob = lifecycleScope.launch {
            delay(5000)
            if (serverUrl.isNotBlank() && connectionState != "live") {
                connectWebSocket(serverUrl)
            }
        }
    }

    private fun handleSocketEvent(text: String) {
        val json = runCatching { JSONObject(text) }.getOrNull() ?: return
        val event = json.optString("event", json.optString("type", ""))
        val data = json.optJSONObject("data") ?: json

        when (event) {
            "sync", "bootstrap" -> {
                val parsedChats = parseChats(data.optJSONArray("chats"))
                val parsedMessages = parseMessagesMap(data.optJSONObject("messagesByChat"))
                val parsedCalls = parseCalls(firstArray(data, "calls", "callLogs", "call_logs", "recentCalls", "recent_calls", "missedCalls", "missed_calls"))
                parsedChats?.let { chats = it }
                parsedMessages?.let { messagesByChat = it }
                if (parsedCalls != null || parsedMessages != null) {
                    calls = mergeCalls(parsedCalls ?: calls, callLogsFromMessages(parsedMessages ?: messagesByChat, parsedChats ?: chats))
                }
            }

            "qr", "auth.qr" -> {
                qrText = data.optStringOrNull("qr") ?: data.optStringOrNull("code")
            }

            "ready", "authenticated" -> {
                qrText = null
                connectionState = "live"
            }

            "message", "message.new", "message_create", "message.created", "message.new_call_log" -> {
                val message = data.toMessageOrNull() ?: return
                val chat = chatFromMessage(data, message)
                upsertChat(chat)
                upsertMessage(message)
                syncCallLogFromMessage(message)
                if (message.direction == MessageDirection.In && notificationsEnabled && selectedChat?.id != message.chatId) {
                    notifier.showMessage(aliasName(chat.id, chat.name), previewTextForMessage(message))
                }
            }

            "message_ack", "message.status", "ack" -> {
                val id = data.optStringOrNull("id") ?: data.optStringOrNull("messageId") ?: data.optStringOrNull("wa_message_id")
                val status = data.optStringOrNull("status") ?: data.optStringOrNull("ack")
                if (id != null && status != null) updateMessageStatus(id, status)
            }

            "chat", "chat.update" -> {
                data.toChatOrNull()?.let { upsertChat(it) }
            }


            "incoming_call", "call", "call.incoming", "call_log", "call.log", "call_logs", "calls", "call.missed", "call_missed", "call.rejected", "call_ended" -> {
                val batch = parseCalls(firstArray(data, "calls", "callLogs", "call_logs", "recentCalls", "recent_calls", "missedCalls", "missed_calls")).orEmpty()
                if (batch.isNotEmpty()) {
                    batch.forEach { handleCallEvent(it) }
                } else {
                    data.toCallOrNull()?.let { handleCallEvent(it) }
                        ?: data.toMessageOrNull()?.let { message ->
                            upsertMessage(message)
                            syncCallLogFromMessage(message)
                        }
                }
            }
        }
    }

    private fun handleCallEvent(call: CallItem) {
        calls = (listOf(call) + calls.filterNot { it.id == call.id }).sortedByDescending { it.timestamp }
        upsertChat(call.toChatItem())
        if (notificationsEnabled && call.direction != "out") notifier.showCall(aliasName(call.chatId, call.name), call)
    }

    private fun sendMessage(chat: ChatItem, text: String) {
        val localMessage = MessageItem(
            id = "local_${UUID.randomUUID()}",
            chatId = chat.id,
            senderName = "Ich",
            body = text,
            direction = MessageDirection.Out,
            type = MessageType.Text,
            timestamp = nowSeconds(),
            status = "sending"
        )
        upsertMessage(localMessage)
        upsertChat(chat.copy(lastMessage = text, lastTimestamp = localMessage.timestamp))

        lifecycleScope.launch {
            try {
                val sent = api.sendMessage(serverUrl, clientAuth(), chat.id, text)
                if (sent != null) {
                    replaceMessage(localMessage.id, sent.copy(chatId = chat.id, direction = MessageDirection.Out))
                } else {
                    updateMessageStatus(localMessage.id, "sent")
                }
            } catch (error: Exception) {
                updateMessageStatus(localMessage.id, "failed")
                errorText = "Senden fehlgeschlagen: ${error.message}"
            }
        }
    }

    private fun forwardMessage(targetChat: ChatItem, message: MessageItem) {
        val content = message.forwardableText()
        if (content.isBlank()) {
            errorText = "Diese Nachricht kann nicht weitergeleitet werden."
            return
        }
        sendMessage(targetChat, "Weitergeleitet:\n$content")
    }

    private fun sendMedia(chat: ChatItem, uri: Uri, fallbackType: String) {
        val meta = readMediaMeta(uri, fallbackType)
        val localType = meta.type.toMessageType()
        val previewText = when (localType) {
            MessageType.Image -> meta.caption.ifBlank { "[Bild]" }
            MessageType.Video -> meta.caption.ifBlank { "[Video]" }
            MessageType.Audio -> meta.caption.ifBlank { "[Audio]" }
            else -> meta.fileName ?: "[Datei]"
        }

        val localMessage = MessageItem(
            id = "local_${UUID.randomUUID()}",
            chatId = chat.id,
            senderName = "Ich",
            body = previewText,
            direction = MessageDirection.Out,
            type = localType,
            timestamp = nowSeconds(),
            status = "uploading",
            mediaUrl = uri.toString(),
            fileName = meta.fileName,
            mimeType = meta.mimeType,
            fileSize = meta.fileSize
        )
        upsertMessage(localMessage)
        upsertChat(chat.copy(lastMessage = previewText, lastTimestamp = localMessage.timestamp))

        lifecycleScope.launch {
            try {
                val sent = api.sendMedia(this@MainActivity, serverUrl, clientAuth(), chat.id, uri, meta.caption)
                if (sent != null) {
                    replaceMessage(localMessage.id, sent.copy(chatId = chat.id, direction = MessageDirection.Out))
                } else {
                    updateMessageStatus(localMessage.id, "sent")
                }
            } catch (error: Exception) {
                updateMessageStatus(localMessage.id, "failed")
                errorText = "Medien-Upload fehlgeschlagen: ${error.message}"
            }
        }
    }

    private fun readMediaMeta(uri: Uri, fallbackType: String): MediaMeta {
        val mime = contentResolver.getType(uri) ?: "application/octet-stream"
        var name: String? = null
        var size: Long? = null
        contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIndex >= 0) name = cursor.getString(nameIndex)
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
            }
        }
        val type = when {
            mime.startsWith("image/") -> "image"
            mime.startsWith("video/") -> "video"
            mime.startsWith("audio/") -> "audio"
            fallbackType == "image" -> "image"
            fallbackType == "audio" -> "audio"
            else -> "document"
        }
        return MediaMeta(
            type = type,
            mimeType = mime,
            fileName = name ?: uri.lastPathSegment?.substringAfterLast('/'),
            fileSize = size,
            caption = ""
        )
    }

    private fun startCameraCapture() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            openCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun openCamera() {
        val uri = createCameraImageUri()
        pendingCameraUri = uri
        cameraLauncher.launch(uri)
    }

    private fun toggleVoiceRecording(chat: ChatItem) {
        if (isRecordingVoice) {
            stopVoiceRecording(send = false)
            return
        }
        pendingVoiceChat = chat
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startVoiceRecordingNow(chat)
        } else {
            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun startVoiceRecordingNow(chat: ChatItem) {
        try {
            releaseVoiceRecorder()
            pendingVoiceUri = null
            pendingVoiceFile = null
            voicePreview = null
            val dir = File(cacheDir, "voice").apply { mkdirs() }
            val file = File(dir, "sprache_${System.currentTimeMillis()}.m4a")
            val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
            val recorder = createMediaRecorder()
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioEncodingBitRate(96_000)
            recorder.setAudioSamplingRate(44_100)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            voiceRecorder = recorder
            pendingVoiceUri = uri
            pendingVoiceFile = file
            pendingVoiceChat = chat
            voiceRecordingStartedAt = System.currentTimeMillis()
            isRecordingVoice = true
            errorText = null
        } catch (error: Exception) {
            releaseVoiceRecorder()
            isRecordingVoice = false
            pendingVoiceUri = null
            pendingVoiceFile = null
            pendingVoiceChat = null
            voiceRecordingStartedAt = 0L
            errorText = "Sprachnachricht konnte nicht gestartet werden: ${error.message}"
        }
    }

    private fun stopVoiceRecording(send: Boolean) {
        val uri = pendingVoiceUri
        val file = pendingVoiceFile
        val chat = pendingVoiceChat
        val elapsedMs = System.currentTimeMillis() - voiceRecordingStartedAt
        var canSend = send && uri != null && chat != null && file != null
        try {
            voiceRecorder?.stop()
        } catch (_: Exception) {
            canSend = false
            errorText = "Sprachnachricht war zu kurz. Bitte mindestens 1 Sekunde aufnehmen."
        } finally {
            releaseVoiceRecorder()
            isRecordingVoice = false
            pendingVoiceUri = null
            pendingVoiceFile = null
            pendingVoiceChat = null
            voiceRecordingStartedAt = 0L
        }
        if (uri != null && chat != null && file != null) {
            if (elapsedMs < 700 || !file.exists() || file.length() <= 0L) {
                errorText = "Sprachnachricht war zu kurz. Bitte nochmal aufnehmen."
                voicePreview = null
                return
            }
            if (canSend) {
                sendMedia(chat, uri, "audio")
            } else {
                voicePreview = VoicePreview(uri = uri, file = file, chat = chat, durationMs = elapsedMs)
                errorText = null
            }
        }
    }

    private fun sendVoicePreview() {
        val preview = voicePreview ?: return
        voicePreview = null
        sendMedia(preview.chat, preview.uri, "audio")
    }

    private fun discardVoicePreview() {
        val preview = voicePreview
        voicePreview = null
        if (preview != null) runCatching { preview.file.delete() }
    }

    @Suppress("DEPRECATION")
    private fun createMediaRecorder(): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()
    }

    private fun releaseVoiceRecorder() {
        runCatching { voiceRecorder?.reset() }
        runCatching { voiceRecorder?.release() }
        voiceRecorder = null
    }

    private fun createCameraImageUri(): Uri {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "foto_${System.currentTimeMillis()}.jpg")
        return FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
    }

    private fun startLocalChat(number: String, customName: String = "") {
        val id = number.trim()
        if (id.isBlank()) return
        val name = customName.trim().ifBlank { contactNames[id] ?: id }
        if (customName.trim().isNotBlank()) saveContactName(id, customName.trim())
        val chat = ChatItem(
            id = id,
            name = name,
            lastMessage = "Neuer Chat",
            lastTimestamp = nowSeconds(),
            unreadCount = 0,
            isGroup = false
        )
        upsertChat(chat)
        selectedChat = chat
    }

    private fun renameContact(chatId: String, newName: String) {
        val clean = newName.trim()
        if (clean.isBlank()) return
        saveContactName(chatId, clean)
        chats = chats.map { if (it.id == chatId) it.copy(name = clean) else it }
        selectedChat = selectedChat?.let { if (it.id == chatId) it.copy(name = clean) else it }
    }

    private fun saveContactName(chatId: String, name: String) {
        contactNames = contactNames.toMutableMap().apply { put(chatId, name) }
        settings.contactNames = contactNames
    }

    private fun aliasName(chatId: String, fallback: String): String = contactNames[chatId]?.takeIf { it.isNotBlank() } ?: fallback

    private fun displayChat(chat: ChatItem): ChatItem = chat.copy(name = aliasName(chat.id, chat.name))

    private fun displayCall(call: CallItem): CallItem = call.copy(name = aliasName(call.chatId, call.name))

    private fun upsertChat(chat: ChatItem) {
        val old = chats.firstOrNull { it.id == chat.id }
        val merged = if (old == null) chat else chat.copy(
            name = chat.name.takeIf { it.isNotBlank() } ?: old.name,
            lastMessage = chat.lastMessage.takeIf { it.isNotBlank() } ?: old.lastMessage,
            unreadCount = maxOf(chat.unreadCount, old.unreadCount),
            muted = chat.muted || old.muted,
            pinned = chat.pinned || old.pinned,
            online = chat.online || old.online,
            profilePicUrl = chat.profilePicUrl ?: old.profilePicUrl
        )
        chats = (listOf(merged) + chats.filterNot { it.id == chat.id }).sortedWith(
            compareByDescending<ChatItem> { it.pinned }.thenByDescending { it.lastTimestamp }
        )
    }

    private fun upsertMessage(message: MessageItem) {
        val list = messagesByChat[message.chatId].orEmpty()
        messagesByChat = messagesByChat.toMutableMap().apply {
            put(message.chatId, normalizeMessageList(list.filterNot { it.id == message.id } + message))
        }
    }

    private fun syncCallLogFromMessage(message: MessageItem) {
        message.toCallItemFromLog(chats)?.let { call ->
            calls = mergeCalls(listOf(call), calls)
        }
    }

    private fun replaceMessage(oldId: String, newMessage: MessageItem) {
        val list = messagesByChat[newMessage.chatId].orEmpty()
        messagesByChat = messagesByChat.toMutableMap().apply {
            // Wichtig: Wenn der Server die gleiche Nachricht zusätzlich per WebSocket zurückschickt,
            // kann sonst dieselbe Message-ID zweimal in der LazyColumn landen. Das crasht Compose
            // direkt nach dem Senden. Deshalb alte lokale ID und die neue Server-ID vorher entfernen.
            put(newMessage.chatId, normalizeMessageList(list.filterNot { it.id == oldId || it.id == newMessage.id } + newMessage))
        }
    }

    private fun normalizeMessageList(list: List<MessageItem>): List<MessageItem> {
        val seen = mutableSetOf<String>()
        return list
            .sortedWith(compareBy<MessageItem> { it.timestamp }.thenBy { it.id })
            .asReversed()
            .filter { seen.add(it.id) }
            .asReversed()
    }

    private fun updateMessageStatus(id: String, status: String) {
        messagesByChat = messagesByChat.mapValues { (_, list) ->
            list.map { if (it.id == id) it.copy(status = status) else it }
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (!granted) notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun startPushServiceIfEnabled() {
        if (!settings.notificationsEnabled || serverUrl.isBlank()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        val intent = Intent(this, MessengerPushService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
    }

    private fun stopPushService() {
        stopService(Intent(this, MessengerPushService::class.java))
    }
}

private class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("own_messenger_settings", Context.MODE_PRIVATE)
    private val deviceIdKey = "device_id"

    var serverUrl: String
        get() = prefs.getString("server_url", "").orEmpty()
        set(value) = prefs.edit().putString("server_url", value).apply()

    var notificationsEnabled: Boolean
        get() = prefs.getBoolean("notifications_enabled", true)
        set(value) = prefs.edit().putBoolean("notifications_enabled", value).apply()

    var appKey: String
        get() = prefs.getString("app_key", "").orEmpty()
        set(value) = prefs.edit().putString("app_key", value.trim()).apply()

    var chatBackgroundUri: String
        get() = prefs.getString("chat_background_uri", "").orEmpty()
        set(value) = prefs.edit().putString("chat_background_uri", value).apply()

    var contactNames: Map<String, String>
        get() {
            val raw = prefs.getString("contact_names", "{}") ?: "{}"
            val json = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
            return json.keys().asSequence().associateWith { key -> json.optString(key) }
        }
        set(value) {
            val json = JSONObject()
            value.forEach { (key, name) -> if (key.isNotBlank() && name.isNotBlank()) json.put(key, name) }
            prefs.edit().putString("contact_names", json.toString()).apply()
        }

    val deviceId: String
        get() {
            val existing = prefs.getString(deviceIdKey, null)
            if (existing != null) return existing
            val generated = UUID.randomUUID().toString()
            prefs.edit().putString(deviceIdKey, generated).apply()
            return generated
        }
}

private class AppNotifier(private val context: Context) {
    private val channelMessages = "messages"
    private val channelCalls = "calls"
    private val channelPush = "push_service"

    fun createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(channelMessages, "Nachrichten", NotificationManager.IMPORTANCE_HIGH)
            )
            manager.createNotificationChannel(
                NotificationChannel(channelCalls, "Anrufereignisse", NotificationManager.IMPORTANCE_HIGH)
            )
            manager.createNotificationChannel(
                NotificationChannel(channelPush, "Push-Verbindung", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    fun showMessage(title: String, body: String) {
        show(channelMessages, title, body, IconsForNotification.messageId(title, body))
    }

    fun showCall(name: String, call: CallItem) {
        val text = callDisplayText(call.copy(name = name))
        val title = if (call.missed || call.direction != "out") "Verpasster Anruf" else "Anruf"
        show(channelCalls, title, text, IconsForNotification.messageId(name, text))
    }

    fun foregroundNotification(status: String): Notification {
        val intent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(context, channelPush)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle("Eigener Messenger Push")
            .setContentText(status)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun show(channelId: String, title: String, body: String, notificationId: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        val intent = Intent(context, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }
}

class MessengerPushService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val api = ServerApi()
    private lateinit var settings: SettingsStore
    private lateinit var notifier: AppNotifier
    private var socket: WebSocket? = null
    private var retryJob: Job? = null
    private val seenEventIds = ArrayDeque<String>()

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(this)
        notifier = AppNotifier(this)
        notifier.createChannels()
        startForeground(42, notifier.foregroundNotification("Push-Verbindung wird gestartet"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!settings.notificationsEnabled || settings.serverUrl.isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }
        connect()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        retryJob?.cancel()
        socket?.close(1000, "Push service stopped")
        scope.cancel()
        super.onDestroy()
    }

    private fun connect() {
        retryJob?.cancel()
        val url = settings.serverUrl
        if (url.isBlank()) return
        socket?.close(1000, "Push reconnect")
        socket = api.connectWebSocket(
            baseUrl = url,
            auth = serviceAuth(),
            onState = { state ->
                if (state == "live") startForeground(42, notifier.foregroundNotification("Push aktiv"))
                if (state == "offline") scheduleReconnect()
            },
            onMessage = { text -> handlePushEvent(text) },
            onError = { scheduleReconnect() }
        )
    }

    private fun scheduleReconnect() {
        retryJob?.cancel()
        retryJob = scope.launch {
            delay(5_000)
            if (settings.notificationsEnabled && settings.serverUrl.isNotBlank()) connect()
        }
    }

    private fun serviceAuth(): AppClientAuth = AppClientAuth(
        appKey = settings.appKey,
        deviceId = settings.deviceId,
        deviceName = Build.MANUFACTURER.orEmpty().ifBlank { "Android" },
        deviceModel = Build.MODEL.orEmpty().ifBlank { "Android" },
        appVersion = APP_VERSION
    )

    private fun handlePushEvent(raw: String) {
        val obj = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val event = obj.optStringOrNull("event") ?: obj.optStringOrNull("type") ?: obj.optStringOrNull("name") ?: "message"
        val data = obj.optJSONObject("data") ?: obj.optJSONObject("message") ?: obj
        when (event.lowercase(Locale.ROOT)) {
            "message", "message.created", "message.new", "new_message", "chat.message" -> {
                val message = data.toMessageOrNull() ?: return
                if (message.direction != MessageDirection.In || MainActivity.isActivityVisible) return
                if (!rememberEvent(message.id)) return
                val chat = chatFromMessage(data, message)
                notifier.showMessage(aliasName(chat.id, chat.name), previewTextForMessage(message))
                message.toCallItemFromLog(listOf(chat))?.takeIf { it.direction != "out" }?.let { call ->
                    notifier.showCall(aliasName(call.chatId, call.name), call)
                }
            }
            "incoming_call", "call", "call.incoming", "call_log", "call.log", "call_logs", "calls", "call.missed", "call_missed", "call.rejected", "call_ended" -> {
                val batch = parseCalls(firstArray(data, "calls", "callLogs", "call_logs", "recentCalls", "recent_calls", "missedCalls", "missed_calls")).orEmpty()
                if (batch.isNotEmpty()) {
                    batch.forEach { notifyCall(it) }
                } else {
                    data.toCallOrNull()?.let { notifyCall(it) }
                        ?: data.toMessageOrNull()?.toCallItemFromLog(emptyList())?.let { notifyCall(it) }
                }
            }
        }
    }

    private fun notifyCall(call: CallItem) {
        if (call.direction == "out" || MainActivity.isActivityVisible) return
        if (!rememberEvent(call.id)) return
        notifier.showCall(aliasName(call.chatId, call.name), call)
    }

    private fun aliasName(chatId: String, fallback: String): String =
        settings.contactNames[chatId]?.takeIf { it.isNotBlank() } ?: fallback

    private fun rememberEvent(id: String): Boolean {
        if (id.isBlank()) return true
        if (seenEventIds.contains(id)) return false
        seenEventIds.addLast(id)
        while (seenEventIds.size > 200) seenEventIds.removeFirst()
        return true
    }
}

class PushBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val settings = SettingsStore(context)
        if (!settings.notificationsEnabled || settings.serverUrl.isBlank()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        val serviceIntent = Intent(context, MessengerPushService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
    }
}

private object IconsForNotification {
    fun messageId(a: String, b: String): Int = (a + b).hashCode().absoluteValue
}

private const val APP_VERSION = "1.0.0"

private data class AppClientAuth(
    val appKey: String,
    val deviceId: String,
    val deviceName: String,
    val deviceModel: String,
    val appVersion: String
)

private fun appAuthHeaders(auth: AppClientAuth): Map<String, String> = buildMap {
    if (auth.appKey.isNotBlank()) {
        put("Authorization", "Bearer ${auth.appKey}")
        put("X-App-Key", auth.appKey)
    }
    put("X-Device-Id", auth.deviceId)
    put("X-Device-Name", safeHeaderValue(auth.deviceName))
    put("X-Device-Model", safeHeaderValue(auth.deviceModel))
    put("X-Platform", "android")
    put("X-App-Version", auth.appVersion)
}

private fun safeHeaderValue(value: String): String = value.replace(Regex("[\r\n]"), " ").take(120)

private class ServerApi {
    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun loadBootstrap(baseUrl: String, auth: AppClientAuth): BootstrapData? = withContext(Dispatchers.IO) {
        val obj = getJsonOrNull(baseUrl, "/api/bootstrap", auth) ?: return@withContext null
        BootstrapData(
            chats = parseChats(obj.optJSONArray("chats")).orEmpty(),
            messagesByChat = parseMessagesMap(obj.optJSONObject("messagesByChat")).orEmpty(),
            calls = parseCalls(firstArray(obj, "calls", "callLogs", "call_logs", "recentCalls", "recent_calls", "missedCalls", "missed_calls")).orEmpty()
        )
    }

    suspend fun sendMessage(baseUrl: String, auth: AppClientAuth, chatId: String, text: String): MessageItem? = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("chatId", chatId)
            .put("to", chatId)
            .put("text", text)
            .toString()
            .toRequestBody(json)

        val first = postJsonOrNull(baseUrl, "/api/send", body, auth)
        val response = first ?: postJsonOrThrow(baseUrl, "/api/messages/send", body, auth)
        val data = response.optJSONObject("data") ?: response.optJSONObject("message") ?: response
        data.toMessageOrNull()
    }


    suspend fun sendMedia(context: Context, baseUrl: String, auth: AppClientAuth, chatId: String, uri: Uri, caption: String = ""): MessageItem? = withContext(Dispatchers.IO) {
        val fileName = queryDisplayName(context, uri) ?: "upload_${System.currentTimeMillis()}"
        val detectedMimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val mimeType = when {
            detectedMimeType != "application/octet-stream" -> detectedMimeType
            fileName.endsWith(".m4a", ignoreCase = true) -> "audio/mp4"
            fileName.endsWith(".mp3", ignoreCase = true) -> "audio/mpeg"
            fileName.endsWith(".jpg", ignoreCase = true) || fileName.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
            fileName.endsWith(".png", ignoreCase = true) -> "image/png"
            else -> detectedMimeType
        }
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("Datei konnte nicht gelesen werden")
        val mediaType = mimeType.toMediaType()
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("chatId", chatId)
            .addFormDataPart("to", chatId)
            .addFormDataPart("caption", caption)
            .addFormDataPart("file", fileName, bytes.toRequestBody(mediaType))
            .build()

        val response = postMultipartOrThrow(baseUrl, "/api/media/send", body, auth)
        val data = response.optJSONObject("data") ?: response.optJSONObject("message") ?: response
        data.toMessageOrNull()
    }

    private fun queryDisplayName(context: Context, uri: Uri): String? {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && cursor.moveToFirst()) return cursor.getString(idx)
        }
        return uri.lastPathSegment?.substringAfterLast('/')
    }

    fun connectWebSocket(
        baseUrl: String,
        auth: AppClientAuth,
        onState: (String) -> Unit,
        onMessage: (String) -> Unit,
        onError: (String) -> Unit
    ): WebSocket {
        val wsUrl = appendQueryToken(toWebSocketUrl(baseUrl), auth.appKey)
        val request = authenticatedRequestBuilder(wsUrl, auth).build()
        return client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onState("live")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                onMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onState("offline")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onState("offline")
                val codeText = response?.let { " HTTP ${it.code}" }.orEmpty()
                val reason = t.message?.takeIf { it.isNotBlank() } ?: t.javaClass.simpleName
                val hint = when {
                    reason.contains("Unable to resolve host", ignoreCase = true) -> "Domain/DNS nicht erreichbar"
                    reason.contains("failed to connect", ignoreCase = true) -> "Port 443/Caddy nicht erreichbar"
                    reason.contains("certificate", ignoreCase = true) || reason.contains("SSL", ignoreCase = true) -> "HTTPS-Zertifikat noch nicht gültig"
                    codeText.contains("401") || codeText.contains("403") -> "App-Key oder Gerätebindung prüfen"
                    else -> reason
                }
                onError("WebSocket getrennt:$codeText $hint")
            }
        })
    }

    private fun getJsonOrNull(baseUrl: String, path: String, auth: AppClientAuth): JSONObject? {
        return runCatching {
            val request = authenticatedRequestBuilder(normalizeBaseUrl(baseUrl) + path, auth).get().build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                JSONObject(response.body?.string().orEmpty())
            }
        }.getOrNull()
    }

    private fun postJsonOrNull(baseUrl: String, path: String, body: okhttp3.RequestBody, auth: AppClientAuth): JSONObject? {
        return runCatching {
            val request = authenticatedRequestBuilder(normalizeBaseUrl(baseUrl) + path, auth).post(body).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                JSONObject(response.body?.string().orEmpty())
            }
        }.getOrNull()
    }

    private fun postJsonOrThrow(baseUrl: String, path: String, body: okhttp3.RequestBody, auth: AppClientAuth): JSONObject {
        val request = authenticatedRequestBuilder(normalizeBaseUrl(baseUrl) + path, auth).post(body).build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $raw")
            return JSONObject(raw)
        }
    }


    private fun postMultipartOrThrow(baseUrl: String, path: String, body: okhttp3.RequestBody, auth: AppClientAuth): JSONObject {
        val request = authenticatedRequestBuilder(normalizeBaseUrl(baseUrl) + path, auth).post(body).build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $raw")
            return JSONObject(raw)
        }
    }

    private fun authenticatedRequestBuilder(url: String, auth: AppClientAuth): Request.Builder {
        val builder = Request.Builder().url(url)
        appAuthHeaders(auth).forEach { (name, value) -> builder.addHeader(name, value) }
        return builder
    }

    private fun toWebSocketUrl(baseUrl: String): String {
        val normalized = normalizeBaseUrl(baseUrl)
        val protocol = when {
            normalized.startsWith("https://") -> "wss://"
            else -> "wss://"
        }
        val withoutProtocol = normalized
            .removePrefix("https://")
            .removePrefix("http://")
        return protocol + withoutProtocol + "/ws"
    }

    companion object {
        fun normalizeBaseUrl(raw: String): String {
            var value = raw.trim().trimEnd('/')
            if (value.isBlank()) return ""
            if (!value.startsWith("http://") && !value.startsWith("https://")) {
                value = "https://$value"
            }
            return value
        }

        fun isSecureServerUrl(value: String): Boolean {
            return value.trim().lowercase().startsWith("https://")
        }

        fun resolveMediaUrl(baseUrl: String, mediaUrl: String?, appKey: String = ""): String? {
            if (mediaUrl.isNullOrBlank()) return null
            val raw = if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://") || mediaUrl.startsWith("content://")) {
                mediaUrl
            } else {
                val base = normalizeBaseUrl(baseUrl)
                if (mediaUrl.startsWith("/")) base + mediaUrl else "$base/$mediaUrl"
            }
            return appendQueryToken(raw, appKey)
        }

        fun appendQueryToken(url: String, appKey: String): String {
            if (appKey.isBlank() || url.startsWith("content://")) return url
            val separator = if (url.contains("?")) "&" else "?"
            val encoded = URLEncoder.encode(appKey, "UTF-8")
            return "$url${separator}key=$encoded"
        }
    }
}

private data class BootstrapData(
    val chats: List<ChatItem>,
    val messagesByChat: Map<String, List<MessageItem>>,
    val calls: List<CallItem>
)

private enum class HomeTab { Chats, Calls }
private enum class MessageDirection { In, Out }
private enum class MessageType { Text, Image, Video, Document, Audio, Sticker, Location, System }

private data class ChatItem(
    val id: String,
    val name: String,
    val lastMessage: String,
    val lastTimestamp: Long,
    val unreadCount: Int = 0,
    val isGroup: Boolean = false,
    val muted: Boolean = false,
    val pinned: Boolean = false,
    val online: Boolean = false,
    val profilePicUrl: String? = null
)

private data class MessageItem(
    val id: String,
    val chatId: String,
    val senderName: String?,
    val body: String,
    val direction: MessageDirection,
    val type: MessageType,
    val timestamp: Long,
    val status: String? = null,
    val mediaUrl: String? = null,
    val fileName: String? = null,
    val mimeType: String? = null,
    val fileSize: Long? = null
)

private data class MediaMeta(
    val type: String,
    val mimeType: String,
    val fileName: String?,
    val fileSize: Long?,
    val caption: String
)

private data class VoicePreview(
    val uri: Uri,
    val file: File,
    val chat: ChatItem,
    val durationMs: Long
)

private data class CallItem(
    val id: String,
    val chatId: String,
    val name: String,
    val direction: String,
    val missed: Boolean,
    val isVideo: Boolean,
    val timestamp: Long,
    val profilePicUrl: String? = null
)

@Composable
private fun OwnMessengerTheme(content: @Composable () -> Unit) {
    val scheme = darkColorScheme(
        primary = WaGreen,
        secondary = WaGreenDark,
        background = Bg,
        surface = Surface,
        onPrimary = Color.Black,
        onSecondary = Color.White,
        onBackground = TextPrimary,
        onSurface = TextPrimary
    )
    MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
}

@Composable
private fun ServerSetupScreen(initialValue: String, initialAppKey: String, onSave: (String, String) -> Unit) {
    var url by rememberSaveable { mutableStateOf(initialValue) }
    var key by rememberSaveable { mutableStateOf(initialAppKey) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackgroundBrush())
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(Surface.copy(alpha = 0.92f))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            CircleIcon(Icons.AutoMirrored.Filled.Chat, 72.dp, WaGreen)
            Spacer(Modifier.height(20.dp))
            Text("Eigener Messenger", fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text(
                "Verbinde die App verschlüsselt mit deinem Server. Nutze https://deine-domain und den App-Key aus APP_KEY.txt.",
                color = TextSecondary,
                modifier = Modifier.padding(top = 8.dp),
                lineHeight = 20.sp
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Server URL") },
                placeholder = { Text("https://chat.deinedomain.de") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onSave(url, key) }),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = key,
                onValueChange = { key = it.trim() },
                label = { Text("App-Key") },
                placeholder = { Text("aus START_SERVER_WINDOWS.bat") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                trailingIcon = { Icon(Icons.Filled.Lock, null) }
            )
            Text("Nur HTTPS/WSS ist erlaubt. Der Key bindet diese App an dieses eine Gerät.", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp).fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { onSave(url, key) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = WaGreen)
            ) {
                Text("Verbinden", color = Color.Black, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun HomeScreen(
    currentTab: HomeTab,
    connectionState: String,
    qrText: String?,
    chats: List<ChatItem>,
    calls: List<CallItem>,
    onTabChange: (HomeTab) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenChat: (ChatItem) -> Unit,
    onStartChat: (String, String) -> Unit
) {
    var showNewChat by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            if (currentTab == HomeTab.Chats) {
                FloatingActionButton(
                    onClick = { showNewChat = true },
                    containerColor = WaGreen,
                    contentColor = Color.White
                ) { Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null) }
            }
        },
        containerColor = Bg
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(AppBackgroundBrush())
                .padding(padding)
        ) {
            HomeTopBar(connectionState, onOpenSettings)
            HomeTabs(currentTab, onTabChange)
            QrBanner(qrText)
            when (currentTab) {
                HomeTab.Chats -> ChatList(chats, onOpenChat)
                HomeTab.Calls -> CallList(calls)
            }
            EncryptionFooter()
        }
    }

    if (showNewChat) {
        NewChatDialog(
            onDismiss = { showNewChat = false },
            onStart = { number, name ->
                showNewChat = false
                onStartChat(number, name)
            }
        )
    }
}

@Composable
private fun HomeTopBar(connectionState: String, onOpenSettings: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 18.dp, bottom = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Eigener Messenger", fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (connectionState == "live") Icons.Filled.Wifi else Icons.Filled.WifiOff,
                        null,
                        tint = if (connectionState == "live") WaGreen else TextSecondary,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(connectionState, color = if (connectionState == "live") WaGreen else TextSecondary, fontSize = 12.sp)
                }
            }
            IconButton(onClick = {}) { Icon(Icons.Filled.Search, null) }
            IconButton(onClick = onOpenSettings) { Icon(Icons.Filled.Settings, null) }
        }
    }
}

@Composable
private fun HomeTabs(selected: HomeTab, onSelected: (HomeTab) -> Unit) {
    Row(Modifier.fillMaxWidth().height(50.dp)) {
        TabItem("CHATS", HomeTab.Chats, selected, onSelected)
        TabItem("ANRUFE", HomeTab.Calls, selected, onSelected)
    }
    HorizontalDivider(color = Divider)
}

@Composable
private fun RowScope.TabItem(label: String, tab: HomeTab, selected: HomeTab, onSelected: (HomeTab) -> Unit) {
    val active = tab == selected
    Column(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .clickable { onSelected(tab) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Bottom
    ) {
        Text(label, color = if (active) WaGreen else TextSecondary, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(3.dp).background(if (active) WaGreen else Color.Transparent))
    }
}

@Composable
private fun QrBanner(qrText: String?) {
    AnimatedVisibility(qrText != null) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(16.dp)).background(Surface2).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.QrCode2, null, tint = WaGreen)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Server wartet auf QR/Login", fontWeight = FontWeight.Bold)
                Text("Öffne dein Server-Dashboard, um den QR-Code zu scannen.", color = TextSecondary, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun ChatList(chats: List<ChatItem>, onOpenChat: (ChatItem) -> Unit) {
    LazyColumn(Modifier.fillMaxSize()) {
        items(chats, key = { it.id }) { chat ->
            ChatRow(chat, onClick = { onOpenChat(chat) })
        }
    }
}

@Composable
private fun ChatRow(chat: ChatItem, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Avatar(name = chat.name, isGroup = chat.isGroup, size = 56.dp, imageUrl = chat.profilePicUrl)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(chat.name, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (chat.isGroup) {
                    Spacer(Modifier.width(6.dp))
                    AssistChip(
                        onClick = {},
                        label = { Text("Gruppe", fontSize = 11.sp) },
                        leadingIcon = { Icon(Icons.Filled.Groups, null, modifier = Modifier.size(14.dp)) },
                        colors = AssistChipDefaults.assistChipColors(containerColor = Surface2, labelColor = WaGreen, leadingIconContentColor = WaGreen),
                        modifier = Modifier.height(28.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                }
                Text(formatChatTime(chat.lastTimestamp), color = if (chat.unreadCount > 0) WaGreen else TextSecondary, fontSize = 12.sp)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (chat.pinned) {
                    Icon(Icons.Filled.PushPin, null, tint = WaGreen, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                }
                if (chat.muted) {
                    Icon(Icons.AutoMirrored.Filled.VolumeOff, null, tint = TextSecondary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                }
                Text(chat.lastMessage, color = TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (chat.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Badge(containerColor = WaGreen, contentColor = Color.Black) { Text(chat.unreadCount.toString()) }
                }
            }
        }
    }
    HorizontalDivider(color = Divider, modifier = Modifier.padding(start = 88.dp))
}

@Composable
private fun ChatScreen(
    chat: ChatItem,
    messages: List<MessageItem>,
    allChats: List<ChatItem>,
    qrText: String?,
    connectionState: String,
    serverUrl: String,
    auth: AppClientAuth,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    onForwardMessage: (ChatItem, MessageItem) -> Unit,
    onRenameContact: (String) -> Unit,
    chatBackgroundUri: String,
    isRecordingVoice: Boolean,
    voiceRecordingStartedAt: Long,
    voicePreviewUri: String?,
    voicePreviewDurationMs: Long?,
    onVoiceClick: () -> Unit,
    onVoicePreviewSend: () -> Unit,
    onVoicePreviewDiscard: () -> Unit,
    onPickImage: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickFile: () -> Unit
) {
    var input by rememberSaveable(chat.id) { mutableStateOf("") }
    var showEmojiPicker by remember { mutableStateOf(false) }
    var showImageMenu by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }
    var messageForActions by remember { mutableStateOf<MessageItem?>(null) }
    var messageForForward by remember { mutableStateOf<MessageItem?>(null) }
    fun submitTextMessage() {
        val clean = input.trim()
        if (clean.isBlank()) return
        input = ""
        onSend(clean)
    }
    Box(Modifier.fillMaxSize()) {
        if (chatBackgroundUri.isNotBlank()) {
            AsyncImage(
                model = chatBackgroundUri,
                contentDescription = "Chat-Hintergrund",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.38f)))
        } else {
            Box(Modifier.fillMaxSize().background(AppBackgroundBrush()))
        }
        Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().height(76.dp).background(Surface.copy(alpha = 0.92f)).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Zurück",
                    tint = HeaderNameColor
                )
            }
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { showProfileDialog = true }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Avatar(name = chat.name, isGroup = chat.isGroup, size = 48.dp, imageUrl = chat.profilePicUrl)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(chat.name, color = HeaderNameColor, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOfNotNull(if (chat.isGroup) "Gruppe" else null, if (chat.online) "online" else connectionState).joinToString(" · "),
                        color = if (chat.online) WaGreen else TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }
            IconButton(onClick = { showProfileDialog = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Profil öffnen", tint = HeaderNameColor) }
        }
        QrBanner(qrText)
        val listState = rememberLazyListState()
        LaunchedEffect(chat.id, messages.size) {
            if (messages.isNotEmpty()) {
                listState.scrollToItem(messages.lastIndex)
            }
        }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp),
            state = listState,
            reverseLayout = false,
            contentPadding = PaddingValues(vertical = 12.dp)
        ) {
            items(messages, key = { it.id }) { message ->
                MessageBubble(
                    message = message,
                    serverUrl = serverUrl,
                    auth = auth,
                    onLongPress = { messageForActions = message }
                )
            }
        }
        AnimatedVisibility(visible = isRecordingVoice) {
            var elapsed by remember(voiceRecordingStartedAt) { mutableStateOf(0L) }
            LaunchedEffect(isRecordingVoice, voiceRecordingStartedAt) {
                while (isRecordingVoice && voiceRecordingStartedAt > 0L) {
                    elapsed = System.currentTimeMillis() - voiceRecordingStartedAt
                    delay(250)
                }
            }
            Row(
                Modifier.fillMaxWidth().background(Danger.copy(alpha = 0.16f)).padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Mic, null, tint = Danger, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Aufnahme läuft: ${formatDuration(elapsed)} · Stopp drücken zum Anhören", color = TextPrimary, fontSize = 13.sp)
            }
        }
        AnimatedVisibility(visible = voicePreviewUri != null) {
            VoicePreviewBar(
                uri = voicePreviewUri.orEmpty(),
                durationMs = voicePreviewDurationMs ?: 0L,
                onSend = onVoicePreviewSend,
                onDiscard = onVoicePreviewDiscard
            )
        }
        Row(
            Modifier.fillMaxWidth().background(Surface.copy(alpha = 0.96f)).padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                Modifier.weight(1f).clip(RoundedCornerShape(28.dp)).background(Surface2).padding(start = 8.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { showEmojiPicker = !showEmojiPicker }) {
                    Icon(
                        Icons.Filled.InsertEmoticon,
                        contentDescription = "Emoji auswählen",
                        tint = if (showEmojiPicker) WaGreen else TextSecondary
                    )
                }
                TextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("Nachricht") },
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { submitTextMessage() })
                )
                IconButton(onClick = onPickFile) { Icon(Icons.Filled.AttachFile, null, tint = TextSecondary) }
                Box {
                    IconButton(onClick = { showImageMenu = true }) { Icon(Icons.Filled.CameraAlt, null, tint = TextSecondary) }
                    DropdownMenu(expanded = showImageMenu, onDismissRequest = { showImageMenu = false }) {
                        DropdownMenuItem(
                            text = { Text("Foto machen") },
                            leadingIcon = { Icon(Icons.Filled.AddAPhoto, null) },
                            onClick = {
                                showImageMenu = false
                                onTakePhoto()
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Bild auswählen") },
                            leadingIcon = { Icon(Icons.Filled.CameraAlt, null) },
                            onClick = {
                                showImageMenu = false
                                onPickImage()
                            }
                        )
                    }
                }
            }
            Spacer(Modifier.width(8.dp))
            FloatingActionButton(
                onClick = {
                    if (input.isNotBlank()) submitTextMessage() else onVoiceClick()
                },
                containerColor = if (isRecordingVoice) Danger else WaGreen,
                contentColor = Color.Black,
                modifier = Modifier.size(52.dp)
            ) {
                Icon(
                    if (input.isNotBlank()) Icons.AutoMirrored.Filled.Send else if (isRecordingVoice) Icons.Filled.Stop else Icons.Filled.Mic,
                    contentDescription = if (input.isNotBlank()) "Senden" else if (isRecordingVoice) "Aufnahme stoppen" else "Sprachnachricht aufnehmen"
                )
            }
        }
        AnimatedVisibility(visible = showEmojiPicker) {
            EmojiPanel(
                onEmoji = { emoji -> input += emoji },
                onClose = { showEmojiPicker = false }
            )
        }
    }
    }
    if (showProfileDialog) {
        ContactProfileDialog(
            chat = chat,
            onDismiss = { showProfileDialog = false },
            onSave = { name ->
                onRenameContact(name)
                showProfileDialog = false
            }
        )
    }
    messageForActions?.let { message ->
        MessageActionsDialog(
            message = message,
            chatName = chat.name,
            onDismiss = { messageForActions = null },
            onForward = {
                messageForActions = null
                messageForForward = message
            }
        )
    }
    messageForForward?.let { message ->
        ForwardMessageDialog(
            chats = allChats.filter { it.id != chat.id },
            onDismiss = { messageForForward = null },
            onSelect = { target ->
                onForwardMessage(target, message)
                messageForForward = null
            }
        )
    }
}


@Composable
private fun MessageActionsDialog(
    message: MessageItem,
    chatName: String,
    onDismiss: () -> Unit,
    onForward: () -> Unit
) {
    val context = LocalContext.current
    val text = message.forwardableText()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nachricht", color = TextPrimary) },
        text = {
            Column {
                Text(text.ifBlank { "Mediennachricht" }, color = TextSecondary, maxLines = 4, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(12.dp))
                SettingsDialogAction("Text kopieren") {
                    copyMessageToClipboard(context, text)
                    onDismiss()
                }
                SettingsDialogAction("Als Textdatei speichern") {
                    saveMessageToFile(context, chatName, message)
                    onDismiss()
                }
                SettingsDialogAction("Teilen") {
                    shareMessageText(context, text)
                    onDismiss()
                }
                SettingsDialogAction("An Chat weiterleiten") { onForward() }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Schließen") } },
        containerColor = Surface
    )
}

@Composable
private fun SettingsDialogAction(label: String, onClick: () -> Unit) {
    Text(
        label,
        color = TextPrimary,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 8.dp),
        fontSize = 16.sp
    )
}

@Composable
private fun ForwardMessageDialog(
    chats: List<ChatItem>,
    onDismiss: () -> Unit,
    onSelect: (ChatItem) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Weiterleiten an", color = TextPrimary) },
        text = {
            if (chats.isEmpty()) {
                Text("Kein anderer Chat vorhanden.", color = TextSecondary)
            } else {
                LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(chats, key = { it.id }) { chat ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .clickable { onSelect(chat) }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Avatar(chat.name, chat.isGroup, 42.dp, imageUrl = chat.profilePicUrl)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(chat.name, color = TextPrimary, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(chat.id, color = TextSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
        containerColor = Surface
    )
}

@Composable
private fun ContactProfileDialog(
    chat: ChatItem,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var name by rememberSaveable(chat.id) { mutableStateOf(chat.name.takeIf { it != chat.id }.orEmpty()) }
    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Surface),
            shape = RoundedCornerShape(28.dp)
        ) {
            Column(
                Modifier.padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Avatar(name = name.ifBlank { chat.id }, isGroup = chat.isGroup, size = 86.dp, ring = true, imageUrl = chat.profilePicUrl)
                Spacer(Modifier.height(12.dp))
                Text(
                    text = name.ifBlank { chat.id },
                    color = HeaderNameColor,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
                Text(if (chat.isGroup) "Gruppenprofil" else "Kurzes Profil", color = TextSecondary, fontSize = 13.sp)
                Spacer(Modifier.height(18.dp))

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name speichern") },
                    placeholder = { Text("z. B. Mama, Max, Arbeit") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onSave(name) }),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(Modifier.height(14.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(Surface2)
                        .padding(14.dp)
                ) {
                    Text("Nummer / Chat-ID", color = TextSecondary, fontSize = 12.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(chat.id, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(10.dp))
                    Text("Art", color = TextSecondary, fontSize = 12.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(if (chat.isGroup) "WhatsApp-Gruppe" else "Einzelchat", color = TextPrimary, fontSize = 15.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("Status", color = TextSecondary, fontSize = 12.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(if (chat.online) "online" else "offline / unbekannt", color = if (chat.online) WaGreen else TextPrimary, fontSize = 15.sp)
                }

                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Abbrechen") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { onSave(name) },
                        colors = ButtonDefaults.buttonColors(containerColor = WaGreen, contentColor = Color.Black)
                    ) {
                        Text("Speichern")
                    }
                }
            }
        }
    }
}

@Composable
private fun EmojiPanel(onEmoji: (String) -> Unit, onClose: () -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val normalizedSearch = search.trim().lowercase(Locale.getDefault())
    val filteredEmojis = remember(normalizedSearch) {
        if (normalizedSearch.isBlank()) {
            EmojiDatabase
        } else {
            EmojiDatabase.filter { item ->
                item.emoji.contains(normalizedSearch) ||
                    item.name.lowercase(Locale.getDefault()).contains(normalizedSearch) ||
                    item.category.lowercase(Locale.getDefault()).contains(normalizedSearch) ||
                    item.keywords.any { it.lowercase(Locale.getDefault()).contains(normalizedSearch) }
            }
        }
    }
    val groupedEmojis = filteredEmojis.groupBy { it.category }

    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 230.dp, max = 310.dp)
            .background(Surface.copy(alpha = 0.98f))
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Emoji suchen") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = {
                    if (search.isNotBlank()) {
                        IconButton(onClick = { search = "" }) { Icon(Icons.Filled.Close, null) }
                    }
                },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Surface2,
                    unfocusedContainerColor = Surface2,
                    focusedIndicatorColor = WaGreen,
                    unfocusedIndicatorColor = Color.Transparent
                ),
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(6.dp))
            IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Emoji-Menü schließen", tint = TextSecondary) }
        }
        Spacer(Modifier.height(8.dp))
        if (filteredEmojis.isEmpty()) {
            Text("Kein Emoji gefunden", color = TextSecondary, modifier = Modifier.padding(12.dp))
        } else {
            LazyColumn(Modifier.weight(1f)) {
                groupedEmojis.forEach { (category, items) ->
                    item(key = "title_$category") {
                        Text(
                            category,
                            color = WaGreen,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
                        )
                    }
                    item(key = "items_$category") {
                        Column {
                            items.chunked(8).forEach { row ->
                                Row(Modifier.fillMaxWidth()) {
                                    row.forEach { emojiItem ->
                                        Text(
                                            emojiItem.emoji,
                                            fontSize = 25.sp,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(10.dp))
                                                .clickable { onEmoji(emojiItem.emoji) }
                                                .padding(horizontal = 7.dp, vertical = 6.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(message: MessageItem, serverUrl: String, auth: AppClientAuth, onLongPress: () -> Unit = {}) {
    val outgoing = message.direction == MessageDirection.Out
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = if (outgoing) Arrangement.End else Arrangement.Start
    ) {
        Column(
            Modifier
                .widthIn(max = 310.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = if (outgoing) 18.dp else 4.dp,
                        topEnd = if (outgoing) 4.dp else 18.dp,
                        bottomStart = 18.dp,
                        bottomEnd = 18.dp
                    )
                )
                .background(if (outgoing) BubbleOut else BubbleIn)
                .combinedClickable(onClick = {}, onLongClick = onLongPress)
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            if (!outgoing && message.senderName != null) {
                Text(message.senderName, color = SenderNameColor, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                Spacer(Modifier.height(2.dp))
            }
            MediaPreview(message, serverUrl, auth)
            val showBody = message.body.isNotBlank() && !message.body.startsWith("[") && !shouldHideBodyForMedia(message)
            if (showBody) {
                if (message.mediaUrl != null) Spacer(Modifier.height(6.dp))
                Text(message.body, color = TextPrimary, fontSize = 16.sp, lineHeight = 21.sp)
            } else if (message.mediaUrl == null && !shouldHideBodyForMedia(message)) {
                Text(message.body, color = TextPrimary, fontSize = 16.sp, lineHeight = 21.sp)
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                Text(formatClock(message.timestamp), color = TextSecondary, fontSize = 11.sp)
                if (outgoing) {
                    Spacer(Modifier.width(5.dp))
                    val normalizedStatus = normalizeMessageStatus(message.status, null)
                    Text(messageStatusLabel(normalizedStatus), color = messageStatusColor(normalizedStatus), fontSize = 11.sp)
                    Spacer(Modifier.width(3.dp))
                    when (normalizedStatus) {
                        "read" -> Icon(Icons.Filled.DoneAll, null, tint = Color(0xFF72D7FF), modifier = Modifier.size(15.dp))
                        "delivered" -> Icon(Icons.Filled.DoneAll, null, tint = TextSecondary, modifier = Modifier.size(15.dp))
                        "sent" -> Icon(Icons.Filled.DoneAll, null, tint = TextSecondary, modifier = Modifier.size(15.dp))
                        "sending", "uploading", "pending" -> Icon(Icons.Filled.Check, null, tint = TextSecondary, modifier = Modifier.size(15.dp))
                        "failed" -> Text("!", color = Danger, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaPreview(message: MessageItem, serverUrl: String, auth: AppClientAuth) {
    val context = LocalContext.current
    val url = ServerApi.resolveMediaUrl(serverUrl, message.mediaUrl, auth.appKey)
    val headers = remember(auth) { appAuthHeaders(auth) }
    val imageRequest = remember(url, headers) {
        url?.let { target ->
            ImageRequest.Builder(context).data(target).apply { headers.forEach { (name, value) -> addHeader(name, value) } }.build()
        }
    }
    val decodedImage = remember(message.id, message.body, url) {
        decodeImageBitmapFromMessage(message, url)
    }
    var showFullImage by remember { mutableStateOf(false) }

    when {
        message.type == MessageType.Image && decodedImage != null -> {
            Image(
                bitmap = decodedImage,
                contentDescription = message.fileName ?: "Bild",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 140.dp, max = 260.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Surface2)
                    .clickable { showFullImage = true }
            )
            if (showFullImage) {
                FullscreenImageDialog(
                    onDismiss = { showFullImage = false },
                    image = { modifier ->
                        Image(
                            bitmap = decodedImage,
                            contentDescription = message.fileName ?: "Bild",
                            contentScale = ContentScale.Fit,
                            modifier = modifier
                        )
                    }
                )
            }
            ImageReactionBar(message.id)
        }

        message.type == MessageType.Image && url != null -> {
            AsyncImage(
                model = imageRequest ?: url,
                contentDescription = message.fileName ?: "Bild",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 140.dp, max = 260.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Surface2)
                    .clickable { showFullImage = true }
            )
            if (showFullImage) {
                FullscreenImageDialog(
                    onDismiss = { showFullImage = false },
                    image = { modifier ->
                        AsyncImage(
                            model = imageRequest ?: url,
                            contentDescription = message.fileName ?: "Bild",
                            contentScale = ContentScale.Fit,
                            modifier = modifier
                        )
                    }
                )
            }
            ImageReactionBar(message.id)
        }

        message.type == MessageType.Audio && url != null -> {
            AudioMessagePreview(url = url, fileName = message.fileName, auth = auth)
        }

        message.type == MessageType.Audio -> {
            AudioMessageBox(fileName = message.fileName)
        }

        message.mediaUrl != null -> {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Surface2)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.AttachFile, null, tint = WaGreen)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(message.fileName ?: message.body.ifBlank { "Datei" }, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(message.mimeType ?: message.type.name, color = TextSecondary, fontSize = 12.sp)
                }
            }
        }
    }
}


@Composable
private fun AudioMessagePreview(url: String, fileName: String?, auth: AppClientAuth) {
    val context = LocalContext.current
    var isPlaying by remember(url) { mutableStateOf(false) }
    var player by remember(url) { mutableStateOf<MediaPlayer?>(null) }

    DisposableEffect(url) {
        onDispose {
            runCatching { player?.release() }
            player = null
        }
    }

    AudioMessageBox(
        fileName = fileName,
        isPlaying = isPlaying,
        onPlayClick = {
            if (isPlaying) {
                runCatching { player?.stop() }
                runCatching { player?.release() }
                player = null
                isPlaying = false
            } else {
                runCatching { player?.release() }
                val newPlayer = MediaPlayer()
                newPlayer.setDataSource(context, Uri.parse(url), appAuthHeaders(auth))
                newPlayer.setOnPreparedListener { prepared ->
                    prepared.start()
                    isPlaying = true
                }
                newPlayer.setOnCompletionListener { completed ->
                    completed.release()
                    if (player === completed) player = null
                    isPlaying = false
                }
                newPlayer.setOnErrorListener { failedPlayer, _, _ ->
                    failedPlayer.release()
                    if (player === failedPlayer) player = null
                    isPlaying = false
                    true
                }
                player = newPlayer
                newPlayer.prepareAsync()
            }
        }
    )
}

@Composable
private fun AudioMessageBox(
    fileName: String?,
    isPlaying: Boolean = false,
    onPlayClick: (() -> Unit)? = null
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Surface2)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = { onPlayClick?.invoke() },
            enabled = onPlayClick != null,
            modifier = Modifier.size(42.dp).clip(CircleShape).background(WaGreen.copy(alpha = 0.18f))
        ) {
            Icon(
                if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Abspielen",
                tint = WaGreen
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Sprachnachricht", fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(fileName ?: "Audio", color = TextSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun VoicePreviewBar(
    uri: String,
    durationMs: Long,
    onSend: () -> Unit,
    onDiscard: () -> Unit
) {
    val context = LocalContext.current
    var isPlaying by remember(uri) { mutableStateOf(false) }
    var player by remember(uri) { mutableStateOf<MediaPlayer?>(null) }

    DisposableEffect(uri) {
        onDispose {
            runCatching { player?.release() }
            player = null
        }
    }

    Row(
        Modifier.fillMaxWidth().background(Surface.copy(alpha = 0.96f)).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = {
                if (isPlaying) {
                    runCatching { player?.stop() }
                    runCatching { player?.release() }
                    player = null
                    isPlaying = false
                } else {
                    runCatching { player?.release() }
                    val newPlayer = MediaPlayer()
                    runCatching {
                        newPlayer.setDataSource(context, Uri.parse(uri))
                        newPlayer.setOnPreparedListener { prepared ->
                            prepared.start()
                            isPlaying = true
                        }
                        newPlayer.setOnCompletionListener { completed ->
                            completed.release()
                            if (player === completed) player = null
                            isPlaying = false
                        }
                        newPlayer.setOnErrorListener { failedPlayer, _, _ ->
                            failedPlayer.release()
                            if (player === failedPlayer) player = null
                            isPlaying = false
                            true
                        }
                        player = newPlayer
                        newPlayer.prepareAsync()
                    }.onFailure {
                        runCatching { newPlayer.release() }
                        isPlaying = false
                    }
                }
            },
            modifier = Modifier.size(44.dp).clip(CircleShape).background(WaGreen.copy(alpha = 0.18f))
        ) {
            Icon(if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = "Aufnahme anhören", tint = WaGreen)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Aufnahme anhören", color = TextPrimary, fontWeight = FontWeight.Bold)
            Text(formatDuration(durationMs), color = TextSecondary, fontSize = 12.sp)
        }
        IconButton(onClick = onDiscard) { Icon(Icons.Filled.Delete, contentDescription = "Verwerfen", tint = Danger) }
        Button(onClick = onSend, colors = ButtonDefaults.buttonColors(containerColor = WaGreen)) {
            Text("Senden", color = Color.Black, fontWeight = FontWeight.Bold)
        }
    }
}


@Composable
private fun ImageReactionBar(messageId: String) {
    val reactions = listOf("❤️", "😂", "😮", "👍", "😢", "🔥")
    var selectedReaction by rememberSaveable(messageId) { mutableStateOf("") }
    var showPicker by rememberSaveable(messageId) { mutableStateOf(false) }

    Spacer(Modifier.height(6.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (selectedReaction.isNotBlank()) {
            Text(
                selectedReaction,
                fontSize = 22.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.Black.copy(alpha = 0.18f))
                    .clickable { showPicker = !showPicker }
                    .padding(horizontal = 9.dp, vertical = 3.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text("Reaktion ändern", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.clickable { showPicker = !showPicker })
        } else {
            Text("Reagieren", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.clickable { showPicker = true })
        }
    }
    AnimatedVisibility(visible = showPicker) {
        Row(
            Modifier
                .padding(top = 6.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Surface2)
                .padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            reactions.forEach { reaction ->
                Text(
                    reaction,
                    fontSize = 23.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable {
                            selectedReaction = reaction
                            showPicker = false
                        }
                        .padding(horizontal = 7.dp, vertical = 5.dp)
                )
            }
            if (selectedReaction.isNotBlank()) {
                Text(
                    "×",
                    color = TextSecondary,
                    fontSize = 20.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable {
                            selectedReaction = ""
                            showPicker = false
                        }
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun FullscreenImageDialog(onDismiss: () -> Unit, image: @Composable (Modifier) -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.96f))
        ) {
            image(
                Modifier
                    .fillMaxSize()
                    .padding(10.dp)
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(10.dp)
                    .clip(CircleShape)
                    .background(Surface.copy(alpha = 0.85f))
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Schließen", tint = TextPrimary)
            }
        }
    }
}

@Composable
private fun CallList(calls: List<CallItem>) {
    LazyColumn(Modifier.fillMaxSize()) {
        item { SectionLabel("Anrufereignisse") }
        if (calls.isEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Noch keine Anrufe", color = TextPrimary, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("Entgangene und ausgehende Anrufe erscheinen hier automatisch, sobald der Server Call-Log-Nachrichten oder Call-Events sendet.", color = TextSecondary, textAlign = TextAlign.Center)
                }
            }
        }
        items(calls, key = { it.id }) { call ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(call.name, false, 56.dp, imageUrl = call.profilePicUrl)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(call.name, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val icon = when {
                            call.missed -> Icons.AutoMirrored.Filled.CallMissed
                            call.direction == "out" -> Icons.AutoMirrored.Filled.CallMade
                            else -> Icons.AutoMirrored.Filled.CallReceived
                        }
                        Icon(icon, null, tint = if (call.missed) Danger else WaGreen, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            listOf(
                                callDisplayText(call),
                                formatChatTime(call.timestamp)
                            ).joinToString(" · "),
                            color = TextSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
            HorizontalDivider(color = Divider, modifier = Modifier.padding(start = 88.dp))
        }
    }
}

private enum class SettingsPage { Main, Chats, Storage, Security, Help, About }

@Composable
private fun SettingsScreen(
    serverUrl: String,
    appKey: String,
    deviceId: String,
    notificationsEnabled: Boolean,
    connectionState: String,
    errorText: String?,
    chatBackgroundUri: String,
    onBack: () -> Unit,
    onSaveServer: (String, String) -> Unit,
    onNotificationToggle: (Boolean) -> Unit,
    onReconnect: () -> Unit,
    onChatBackgroundSelected: (String) -> Unit,
    onClearChatBackground: () -> Unit
) {
    var url by rememberSaveable(serverUrl) { mutableStateOf(serverUrl) }
    var key by rememberSaveable(appKey) { mutableStateOf(appKey) }
    var page by rememberSaveable { mutableStateOf(SettingsPage.Main) }
    val context = LocalContext.current

    if (page != SettingsPage.Main) {
        SettingsDetailScreen(
            page = page,
            onBack = { page = SettingsPage.Main },
            deviceId = deviceId,
            serverUrl = url,
            appKey = key,
            context = context,
            chatBackgroundUri = chatBackgroundUri,
            onChatBackgroundSelected = onChatBackgroundSelected,
            onClearChatBackground = onClearChatBackground
        )
        return
    }

    LazyColumn(
        Modifier.fillMaxSize().background(AppBackgroundBrush()),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth().height(82.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück", tint = HeaderNameColor) }
                Text("Einstellungen", color = TextPrimary, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                IconButton(onClick = {}) { Icon(Icons.Filled.Search, null, tint = TextSecondary) }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar("Dein Name", false, 72.dp)
                Spacer(Modifier.width(18.dp))
                Column(Modifier.weight(1f)) {
                    Text("Dein Name", color = TextPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Server-Client", color = TextSecondary)
                }
                Icon(Icons.Filled.QrCode2, null, tint = WaGreen)
            }
            HorizontalDivider(color = Divider)
        }
        item {
            SettingsGroupTitle("Server")
            Column(Modifier.padding(horizontal = 18.dp)) {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Server URL ändern") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = { Icon(Icons.Filled.Link, null) }
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = key,
                    onValueChange = { key = it.trim() },
                    label = { Text("App-Key") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = { Icon(Icons.Filled.Lock, null) }
                )
                Text("Gerät: ${deviceId.take(8)}…  |  Nur dieses Gerät darf den Key nutzen.", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AssistChip(onClick = onReconnect, label = { Text("Neu verbinden") }, leadingIcon = { Icon(Icons.Filled.Wifi, null, modifier = Modifier.size(16.dp)) })
                    Spacer(Modifier.width(10.dp))
                    Text("Status: $connectionState", color = if (connectionState == "live") WaGreen else TextSecondary)
                }
                errorText?.let {
                    Text(it, color = Danger, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { onSaveServer(url, key) },
                    colors = ButtonDefaults.buttonColors(containerColor = WaGreen),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) { Text("Server speichern", color = Color.Black, fontWeight = FontWeight.Bold) }
            }
        }
        item {
            SettingsGroupTitle("App")
            SettingsSwitchRow(
                icon = Icons.Filled.Notifications,
                title = "Benachrichtigungen",
                subtitle = "Push-Banner auch im Hintergrund über WebSocket-Service",
                checked = notificationsEnabled,
                onCheckedChange = onNotificationToggle
            )
            SettingsRow(Icons.AutoMirrored.Filled.Chat, "Chats", "Design, Hintergründe, Chatverlauf") { page = SettingsPage.Chats }
            SettingsRow(Icons.Filled.Storage, "Speicher und Daten", "Medien, Cache, Download-Verhalten") { page = SettingsPage.Storage }
            SettingsRow(Icons.Filled.Lock, "Sicherheit", "HTTPS/WSS + App-Key + feste Geräte-ID") { page = SettingsPage.Security }
            SettingsRow(Icons.AutoMirrored.Filled.HelpOutline, "Hilfe", "API-Format und Fehlersuche") { page = SettingsPage.Help }
            SettingsRow(Icons.Filled.Info, "Über die App", "Version $APP_VERSION") { page = SettingsPage.About }
        }
    }
}

@Composable
private fun SettingsDetailScreen(
    page: SettingsPage,
    onBack: () -> Unit,
    deviceId: String,
    serverUrl: String,
    appKey: String,
    context: Context,
    chatBackgroundUri: String,
    onChatBackgroundSelected: (String) -> Unit,
    onClearChatBackground: () -> Unit
) {
    val backgroundPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            onChatBackgroundSelected(uri.toString())
            Toast.makeText(context, "Chat-Hintergrund gespeichert", Toast.LENGTH_SHORT).show()
        }
    }
    val title = when (page) {
        SettingsPage.Chats -> "Chats"
        SettingsPage.Storage -> "Speicher und Daten"
        SettingsPage.Security -> "Sicherheit"
        SettingsPage.Help -> "Hilfe"
        SettingsPage.About -> "Über die App"
        SettingsPage.Main -> "Einstellungen"
    }
    LazyColumn(
        Modifier.fillMaxSize().background(AppBackgroundBrush()),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth().height(76.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück", tint = HeaderNameColor) }
                Text(title, color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            }
        }
        when (page) {
            SettingsPage.Chats -> {
                item { SettingsInfoCard("Chatverlauf", "Nachrichten können im Chat per langem Druck kopiert, als Textdatei gespeichert, geteilt oder an einen anderen Chat weitergeleitet werden.") }
                item {
                    SettingsActionCard(
                        title = "Chat-Hintergrundbild",
                        subtitle = if (chatBackgroundUri.isBlank()) "Kein eigenes Hintergrundbild ausgewählt." else "Eigenes Hintergrundbild ist aktiv.",
                        buttonText = "Bild auswählen",
                        onClick = { backgroundPicker.launch(arrayOf("image/*")) }
                    )
                }
                if (chatBackgroundUri.isNotBlank()) {
                    item {
                        SettingsActionCard(
                            title = "Hintergrund zurücksetzen",
                            subtitle = "Wieder den dunklen Standard-Hintergrund verwenden.",
                            buttonText = "Zurücksetzen",
                            onClick = onClearChatBackground
                        )
                    }
                }
                item { SettingsInfoCard("Profilbilder", "WhatsApp-Profilbilder können über deinen whatsapp-web.js-Server mitgeschickt werden. Die App zeigt profilePicUrl, profile_pic_url, avatarUrl oder avatar_url pro Chat/Nachricht automatisch als Avatar an.") }
            }
            SettingsPage.Storage -> {
                item { SettingsInfoCard("Medien", "Bilder, Audios und Dateien werden über den Server geladen und mit deinem App-Key geschützt abgerufen.") }
                item {
                    SettingsActionCard(
                        title = "Cache leeren",
                        subtitle = "Temporäre Dateien der App entfernen.",
                        buttonText = "Cache leeren",
                        onClick = {
                            runCatching { context.cacheDir.deleteRecursively(); context.cacheDir.mkdirs() }
                            Toast.makeText(context, "Cache geleert", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            SettingsPage.Security -> {
                item { SettingsInfoCard("Verbindung", "Erlaubt sind nur HTTPS/WSS-Verbindungen. HTTP und unverschlüsselte IP-Verbindungen werden blockiert.") }
                item { SettingsInfoCard("Gerätebindung", "Geräte-ID: ${deviceId.take(8)}…\nApp-Key: ${if (appKey.isBlank()) "nicht gesetzt" else "gesetzt"}\nServer: ${serverUrl.ifBlank { "nicht gesetzt" }}") }
            }
            SettingsPage.Help -> {
                item { SettingsInfoCard("Nachrichten-Aktionen", "Im Chat eine Nachricht lange drücken: Kopieren, Speichern, Teilen oder Weiterleiten auswählen.") }
                item { SettingsInfoCard("Fehlersuche", "Wenn Status nicht live ist: Server-URL, App-Key und Gerätebindung prüfen, dann „Neu verbinden“ drücken.") }
            }
            SettingsPage.About -> {
                item { SettingsInfoCard("OwnMessenger Android", "Version $APP_VERSION\nServer-Client mit HTTPS/WSS, App-Key und fester Geräte-ID.") }
            }
            SettingsPage.Main -> Unit
        }
    }
}

@Composable
private fun SettingsInfoCard(title: String, text: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Surface.copy(alpha = 0.9f))
            .padding(16.dp)
    ) {
        Text(title, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Text(text, color = TextSecondary, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

@Composable
private fun SettingsActionCard(title: String, subtitle: String, buttonText: String, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Surface.copy(alpha = 0.9f))
            .padding(16.dp)
    ) {
        Text(title, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, color = TextSecondary, fontSize = 14.sp)
        Spacer(Modifier.height(12.dp))
        Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = WaGreen, contentColor = Color.Black)) { Text(buttonText, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun SettingsGroupTitle(title: String) {
    Text(title, color = WaGreen, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, top = 22.dp, bottom = 8.dp))
}

@Composable
private fun SettingsRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = TextSecondary, modifier = Modifier.width(42.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 18.sp)
            Text(subtitle, color = TextSecondary)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = WaGreen)
    }
}

@Composable
private fun SettingsSwitchRow(icon: ImageVector, title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = TextSecondary, modifier = Modifier.width(42.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 18.sp)
            Text(subtitle, color = TextSecondary)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun NewChatDialog(onDismiss: () -> Unit, onStart: (String, String) -> Unit) {
    var number by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Neuer Chat") },
        text = {
            Column {
                Text("Gruppen funktionieren, wenn die Gruppe schon in WhatsApp existiert oder du die Gruppen-ID mit @g.us nutzt.", color = TextSecondary, fontSize = 13.sp)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = number,
                    onValueChange = { number = it },
                    label = { Text("Nummer / Chat-ID") },
                    placeholder = { Text("491701234567 oder 123456789@g.us") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name optional") },
                    placeholder = { Text("z. B. Mama, Max, Arbeit") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onStart(number, name) }),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = { TextButton(onClick = { onStart(number, name) }) { Text("Starten") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } }
    )
}

@Composable
private fun Avatar(
    name: String,
    isGroup: Boolean,
    size: androidx.compose.ui.unit.Dp,
    ring: Boolean = false,
    imageUrl: String? = null
) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (ring) WaGreen else Surface2)
            .padding(if (ring) 3.dp else 0.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier.fillMaxSize().clip(CircleShape).background(avatarColor(name)),
            contentAlignment = Alignment.Center
        ) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = "Profilbild",
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else if (isGroup) {
                Icon(Icons.Filled.Groups, null, tint = Color.White, modifier = Modifier.size(size * 0.55f))
            } else {
                Text(initials(name), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value / 2.8).sp)
            }
        }
    }
}

@Composable
private fun CircleIcon(icon: ImageVector, size: androidx.compose.ui.unit.Dp, color: Color) {
    Box(Modifier.size(size).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(size * 0.55f))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = TextSecondary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 18.dp, top = 12.dp, bottom = 8.dp))
}

@Composable
private fun EncryptionFooter() {
    Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Lock, null, tint = WaGreen, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text("Kommunikation nur mit deinem Server", color = TextSecondary, fontSize = 12.sp)
    }
}

@Composable
private fun AppBackgroundBrush(): Brush = Brush.verticalGradient(listOf(Color(0xFF071013), Color(0xFF0B1B20), Color(0xFF061014)))

private fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    if (parts.isEmpty()) return "?"
    return parts.take(2).joinToString("") { it.first().uppercase() }
}

private fun avatarColor(name: String): Color {
    val colors = listOf(Color(0xFF0F8B8D), Color(0xFF2D6A4F), Color(0xFF5C677D), Color(0xFF7B2CBF), Color(0xFF006D77), Color(0xFF8D99AE))
    return colors[name.hashCode().absoluteValue % colors.size]
}

private fun nowSeconds(): Long = System.currentTimeMillis() / 1000

private fun formatDuration(ms: Long): String {
    val totalSeconds = (ms / 1000).coerceAtLeast(0)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(Locale.GERMANY, "%d:%02d", minutes, seconds)
}

private fun formatClock(seconds: Long): String = SimpleDateFormat("HH:mm", Locale.GERMANY).format(Date(normalizeTimestamp(seconds) * 1000))


private fun MessageItem.forwardableText(): String {
    return when {
        body.isNotBlank() && !body.startsWith("[") -> body
        fileName != null -> fileName
        mediaUrl != null -> body.ifBlank { mediaUrl }
        else -> body
    }.trim()
}

private fun copyMessageToClipboard(context: Context, text: String) {
    if (text.isBlank()) {
        Toast.makeText(context, "Kein Text zum Kopieren", Toast.LENGTH_SHORT).show()
        return
    }
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Nachricht", text))
    Toast.makeText(context, "Nachricht kopiert", Toast.LENGTH_SHORT).show()
}

private fun shareMessageText(context: Context, text: String) {
    if (text.isBlank()) {
        Toast.makeText(context, "Kein Text zum Teilen", Toast.LENGTH_SHORT).show()
        return
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Nachricht teilen"))
}

private fun saveMessageToFile(context: Context, chatName: String, message: MessageItem) {
    val dir = File(context.cacheDir, "saved_messages").apply { mkdirs() }
    val safeChat = chatName.replace(Regex("[^A-Za-z0-9._-]+"), "_").ifBlank { "chat" }
    val file = File(dir, "${safeChat}_${message.timestamp}_${message.id.takeLast(6)}.txt")
    val text = buildString {
        appendLine("Chat: $chatName")
        appendLine("Zeit: ${formatDateTime(message.timestamp)}")
        appendLine("Richtung: ${if (message.direction == MessageDirection.Out) "Ausgehend" else "Eingehend"}")
        appendLine("Typ: ${message.type}")
        appendLine()
        appendLine(message.forwardableText().ifBlank { message.body.ifBlank { "[Keine Textnachricht]" } })
        message.mediaUrl?.let { appendLine("Medien-URL: $it") }
        message.fileName?.let { appendLine("Datei: $it") }
    }
    file.writeText(text)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, text)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    Toast.makeText(context, "Textdatei vorbereitet", Toast.LENGTH_SHORT).show()
    context.startActivity(Intent.createChooser(intent, "Nachricht speichern/teilen"))
}

private fun formatDateTime(seconds: Long): String = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date(seconds * 1000))

private fun formatChatTime(seconds: Long): String {
    val now = nowSeconds()
    val diff = now - normalizeTimestamp(seconds)
    return when {
        diff < 24 * 3600 -> formatClock(seconds)
        diff < 48 * 3600 -> "Gestern"
        else -> SimpleDateFormat("dd.MM.yy", Locale.GERMANY).format(Date(normalizeTimestamp(seconds) * 1000))
    }
}

private fun normalizeTimestamp(value: Long): Long = if (value > 100_000_000_000L) value / 1000 else value

private fun shouldHideBodyForMedia(message: MessageItem): Boolean {
    if (message.type == MessageType.Audio) return true
    if (message.type != MessageType.Image && message.mediaUrl == null) return false
    val body = message.body.trim()
    return body.startsWith("data:image/", ignoreCase = true) ||
        looksLikeEncodedPayload(body) ||
        body == message.fileName
}

private fun decodeImageBitmapFromMessage(message: MessageItem, url: String?) = runCatching {
    val payload = when {
        url != null && url.startsWith("data:image/", ignoreCase = true) -> url.substringAfter("base64,", "")
        message.body.startsWith("data:image/", ignoreCase = true) -> message.body.substringAfter("base64,", "")
        looksLikeBase64Image(message.body) -> message.body
        else -> return@runCatching null
    }.replace("\\s".toRegex(), "")
    val bytes = Base64.decode(payload, Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
}.getOrNull()

private fun looksLikeEncodedPayload(value: String): Boolean {
    val clean = value.trim().replace("\\s".toRegex(), "")
    if (clean.length < 80) return false
    val mostlyEncoded = clean.count { it.isLetterOrDigit() || it == '+' || it == '/' || it == '=' || it == '_' || it == '-' } >= (clean.length * 0.95).toInt()
    return mostlyEncoded && clean.any { it.isDigit() } && clean.any { it == '/' || it == '+' || it == '_' || it == '-' }
}

private fun looksLikeBase64Image(value: String): Boolean {
    val clean = value.trim().replace("\\s".toRegex(), "")
    return clean.startsWith("/9j/") || clean.startsWith("iVBOR") || clean.startsWith("R0lGOD") || clean.startsWith("UklGR")
}

private fun previewTextForMessage(message: MessageItem): String = when (message.type) {
    MessageType.Image -> "[Bild]"
    MessageType.Video -> "[Video]"
    MessageType.Audio -> "[Audio]"
    MessageType.Sticker -> "[Sticker]"
    MessageType.Document -> message.fileName ?: "[Datei]"
    MessageType.System -> message.body
    else -> message.body
}


private fun firstArray(obj: JSONObject, vararg keys: String): JSONArray? {
    for (key in keys) {
        val array = obj.optJSONArray(key)
        if (array != null) return array
    }
    return null
}

private fun parseChats(array: JSONArray?): List<ChatItem>? {
    if (array == null) return null
    return buildList {
        for (i in 0 until array.length()) {
            array.optJSONObject(i)?.toChatOrNull()?.let { add(it) }
        }
    }.sortedWith(compareByDescending<ChatItem> { it.pinned }.thenByDescending { it.lastTimestamp })
}

private fun parseCalls(array: JSONArray?): List<CallItem>? {
    if (array == null) return null
    return buildList {
        for (i in 0 until array.length()) {
            array.optJSONObject(i)?.toCallOrNull()?.let { add(it) }
        }
    }.sortedByDescending { it.timestamp }
}

private fun parseMessagesMap(obj: JSONObject?): Map<String, List<MessageItem>>? {
    if (obj == null) return null
    val result = mutableMapOf<String, List<MessageItem>>()
    val keys = obj.keys()
    while (keys.hasNext()) {
        val chatId = keys.next()
        val array = obj.optJSONArray(chatId) ?: continue
        val list = buildList {
            for (i in 0 until array.length()) {
                array.optJSONObject(i)?.toMessageOrNull(chatId)?.let { add(it) }
            }
        }.sortedBy { it.timestamp }
        result[chatId] = list
    }
    return result
}

private fun JSONObject.toChatOrNull(): ChatItem? {
    val id = optStringOrNull("id") ?: optStringOrNull("chatId") ?: optStringOrNull("contact_wa_id") ?: optStringOrNull("wa_id") ?: return null
    val name = optStringOrNull("name") ?: optStringOrNull("title") ?: optStringOrNull("contact_name") ?: id
    return ChatItem(
        id = id,
        name = name,
        lastMessage = optStringOrNull("lastMessage") ?: optStringOrNull("last_message") ?: optStringOrNull("body") ?: "",
        lastTimestamp = normalizeTimestamp(optLong("lastTimestamp", optLong("timestamp", nowSeconds()))),
        unreadCount = optInt("unreadCount", optInt("unread", 0)),
        isGroup = optBoolean("isGroup", optBoolean("is_group", id.endsWith("@g.us"))),
        muted = optBoolean("muted", false),
        pinned = optBoolean("pinned", false),
        online = optBoolean("online", false),
        profilePicUrl = optStringOrNull("profilePicUrl")
            ?: optStringOrNull("profile_pic_url")
            ?: optStringOrNull("avatarUrl")
            ?: optStringOrNull("avatar_url")
            ?: optStringOrNull("picture")
            ?: optStringOrNull("image")
    )
}


private fun JSONObject.messagePeerChatId(direction: MessageDirection): String? {
    optStringOrNull("chatId")?.let { return it }
    optStringOrNull("peerJid")?.let { return it }
    optStringOrNull("peer_jid")?.let { return it }
    optStringOrNull("contact_wa_id")?.let { return it }
    return if (direction == MessageDirection.Out) {
        optStringOrNull("to") ?: optStringOrNull("recipient") ?: optStringOrNull("remote") ?: optStringOrNull("from")
    } else {
        optStringOrNull("from") ?: optStringOrNull("author") ?: optStringOrNull("sender") ?: optStringOrNull("to")
    }
}

private fun JSONObject.callPeerChatId(outgoing: Boolean): String? {
    optStringOrNull("chatId")?.let { return it }
    optStringOrNull("peerJid")?.let { return it }
    optStringOrNull("peer_jid")?.let { return it }
    optStringOrNull("contact_wa_id")?.let { return it }
    return if (outgoing) {
        optStringOrNull("to") ?: optStringOrNull("recipient") ?: optStringOrNull("remote") ?: optStringOrNull("from")
    } else {
        optStringOrNull("from") ?: optStringOrNull("author") ?: optStringOrNull("sender") ?: optStringOrNull("to")
    }
}

private fun JSONObject.toMessageOrNull(forcedChatId: String? = null): MessageItem? {
    val id = optStringOrNull("id") ?: optStringOrNull("messageId") ?: optStringOrNull("wa_message_id") ?: "msg_${UUID.randomUUID()}"
    val rawBody = optStringOrNull("body") ?: optStringOrNull("text") ?: optJSONObject("text")?.optStringOrNull("body") ?: optStringOrNull("caption") ?: ""
    val directionRaw = optStringOrNull("direction") ?: optStringOrNull("dir") ?: if (optBoolean("fromMe", false) || optBoolean("from_me", false)) "out" else "in"
    val direction = if (directionRaw.equals("out", true) || directionRaw.equals("outgoing", true)) MessageDirection.Out else MessageDirection.In
    val chatId = forcedChatId ?: messagePeerChatId(direction) ?: return null
    val typeRaw = optStringOrNull("type") ?: optStringOrNull("message_type") ?: "text"
    val mediaUrl = optStringOrNull("mediaUrl") ?: optStringOrNull("media_url") ?: optStringOrNull("url")
    val mimeType = optStringOrNull("mimeType") ?: optStringOrNull("mime_type") ?: optStringOrNull("mimetype")
    val senderName = optStringOrNull("senderName") ?: optStringOrNull("contact_name") ?: optStringOrNull("name")
    val isCallLog = typeRaw.contains("call", ignoreCase = true) || rawBody.equals("call log", true) || rawBody.equals("call_log", true)
    val body = if (isCallLog) callLogBodyText(senderName, direction, optBoolean("isVideo", optBoolean("is_video", false))) else rawBody
    val inferredType = when {
        isCallLog -> MessageType.System
        typeRaw.toMessageType() == MessageType.Text && (looksLikeBase64Image(body) || body.startsWith("data:image/", ignoreCase = true)) -> MessageType.Image
        typeRaw.toMessageType() == MessageType.Text && mimeType?.startsWith("image/") == true -> MessageType.Image
        else -> typeRaw.toMessageType()
    }
    return MessageItem(
        id = id,
        chatId = chatId,
        senderName = senderName,
        body = if (body.isNotBlank()) body else "[${typeRaw}]",
        direction = direction,
        type = inferredType,
        timestamp = normalizeTimestamp(optLong("timestamp", nowSeconds())),
        status = normalizeMessageStatus(optStringOrNull("status"), optStringOrNull("ack")),
        mediaUrl = mediaUrl,
        fileName = optStringOrNull("fileName") ?: optStringOrNull("file_name") ?: optStringOrNull("filename"),
        mimeType = mimeType,
        fileSize = if (has("fileSize") || has("file_size")) optLong("fileSize", optLong("file_size", 0L)) else null
    )
}

private fun JSONObject.toCallOrNull(): CallItem? {
    val rawId = optStringOrNull("id") ?: optStringOrNull("callId") ?: optStringOrNull("call_id")
    val id = rawId?.takeIf { it.isNotBlank() } ?: "call_${UUID.randomUUID()}"
    val directionRaw = optStringOrNull("direction") ?: optStringOrNull("dir")
    val outgoing = optBoolean("outgoing", directionRaw.equals("out", true) || directionRaw.equals("outgoing", true) || optBoolean("fromMe", false) || optBoolean("from_me", false))
    val chatId = callPeerChatId(outgoing) ?: id
    val name = if (outgoing) {
        optStringOrNull("toName") ?: optStringOrNull("to_name") ?: optStringOrNull("recipientName") ?: optStringOrNull("recipient_name")
    } else {
        optStringOrNull("fromName") ?: optStringOrNull("from_name") ?: optStringOrNull("senderName") ?: optStringOrNull("sender_name")
    } ?: optStringOrNull("name") ?: optStringOrNull("contact_name") ?: optStringOrNull("pushname") ?: chatId
    val missed = optBoolean("missed", optBoolean("missedCall", optBoolean("isMissed", !outgoing)))
    return CallItem(
        id = id,
        chatId = chatId,
        name = name,
        direction = if (outgoing) "out" else "in",
        missed = missed,
        isVideo = optBoolean("isVideo", optBoolean("is_video", optStringOrNull("type").equals("video", true))),
        timestamp = normalizeTimestamp(optLong("timestamp", optLong("time", nowSeconds()))),
        profilePicUrl = optStringOrNull("profilePicUrl")
            ?: optStringOrNull("profile_pic_url")
            ?: optStringOrNull("avatarUrl")
            ?: optStringOrNull("avatar_url")
            ?: optStringOrNull("picture")
            ?: optStringOrNull("image")
    )
}

private fun callDisplayText(call: CallItem): String {
    val kind = if (call.isVideo) "Videoanruf" else "Anruf"
    return when {
        call.direction == "out" && call.missed -> "Du hast versucht anzurufen"
        call.direction == "out" -> "Ausgehender $kind"
        call.missed -> "${call.name} hat versucht dich anzurufen"
        else -> "Eingehender $kind"
    }
}

private fun callLogBodyText(name: String?, direction: MessageDirection, isVideo: Boolean = false): String {
    val displayName = name?.takeIf { it.isNotBlank() } ?: "Der Kontakt"
    return if (direction == MessageDirection.Out) {
        if (isVideo) "Du hast einen Videoanruf gestartet" else "Du hast angerufen"
    } else {
        if (isVideo) "$displayName hat versucht dich per Video anzurufen" else "$displayName hat versucht dich anzurufen"
    }
}

private fun MessageItem.toCallItemFromLog(chats: List<ChatItem>): CallItem? {
    val text = body.lowercase(Locale.ROOT)
    val looksLikeCall = type == MessageType.System ||
        text.contains("anruf") ||
        text.contains("angerufen") ||
        text.contains("call log") ||
        text.contains("call_log") ||
        text.contains("missed call") ||
        text.contains("voice call") ||
        text.contains("video call")
    if (!looksLikeCall) return null
    val chat = chats.firstOrNull { it.id == chatId }
    val outgoing = direction == MessageDirection.Out || text.contains("du hast angerufen") || text.contains("ausgehender")
    val missed = !outgoing && (text.contains("versucht") || text.contains("missed") || text.contains("entgangen") || text.contains("entgangene") || text.contains("call"))
    return CallItem(
        id = "call_$id",
        chatId = chatId,
        name = senderName?.takeIf { it.isNotBlank() && it != "Ich" } ?: chat?.name ?: chatId,
        direction = if (outgoing) "out" else "in",
        missed = missed,
        isVideo = text.contains("video"),
        timestamp = timestamp,
        profilePicUrl = chat?.profilePicUrl
    )
}

private fun callLogsFromMessages(messagesByChat: Map<String, List<MessageItem>>, chats: List<ChatItem>): List<CallItem> =
    messagesByChat.values.flatten().mapNotNull { it.toCallItemFromLog(chats) }

private fun mergeCalls(primary: List<CallItem>, extra: List<CallItem>): List<CallItem> =
    (primary + extra).distinctBy { it.id }.sortedByDescending { it.timestamp }

private fun normalizeMessageStatus(status: String?, ack: String?): String? {
    val raw = status?.trim()?.lowercase(Locale.ROOT)
    if (!raw.isNullOrBlank()) {
        return when (raw) {
            "3", "read", "seen" -> "read"
            "2", "delivered", "received_by_phone" -> "delivered"
            "1", "sent", "server_ack" -> "sent"
            "0", "pending", "queued" -> "pending"
            "sending", "uploading", "failed", "received" -> raw
            else -> raw
        }
    }
    val n = ack?.trim()?.toIntOrNull() ?: return null
    return when {
        n >= 3 -> "read"
        n >= 2 -> "delivered"
        n >= 1 -> "sent"
        else -> "pending"
    }
}

private fun messageStatusLabel(status: String?): String = when (status) {
    "read" -> "gelesen"
    "delivered" -> "zugestellt"
    "sent" -> "gesendet"
    "sending" -> "sendet"
    "uploading" -> "lädt hoch"
    "pending" -> "wartet"
    "failed" -> "Fehler"
    else -> ""
}

private fun messageStatusColor(status: String?): Color = when (status) {
    "read" -> Color(0xFF72D7FF)
    "failed" -> Danger
    else -> TextSecondary
}

private fun CallItem.toChatItem(): ChatItem = ChatItem(
    id = chatId,
    name = name,
    lastMessage = callDisplayText(this),
    lastTimestamp = timestamp,
    unreadCount = if (missed && direction != "out") 1 else 0,
    isGroup = chatId.endsWith("@g.us"),
    profilePicUrl = profilePicUrl
)

private fun JSONObject.optStringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val value = optString(key, "").trim()
    return value.ifBlank { null }
}

private fun String.toMessageType(): MessageType = when (lowercase(Locale.ROOT)) {
    "image" -> MessageType.Image
    "video" -> MessageType.Video
    "document", "file" -> MessageType.Document
    "audio", "ptt", "voice" -> MessageType.Audio
    "sticker" -> MessageType.Sticker
    "location" -> MessageType.Location
    "system", "call", "call_log", "calllog", "call_log_message" -> MessageType.System
    else -> MessageType.Text
}

private fun chatFromMessage(data: JSONObject, message: MessageItem): ChatItem {
    val name = data.optStringOrNull("contact_name") ?: data.optStringOrNull("name") ?: data.optStringOrNull("senderName") ?: message.chatId
    return ChatItem(
        id = message.chatId,
        name = name,
        lastMessage = previewTextForMessage(message),
        lastTimestamp = message.timestamp,
        unreadCount = if (message.direction == MessageDirection.In) 1 else 0,
        isGroup = data.optBoolean("isGroup", message.chatId.endsWith("@g.us")),
        profilePicUrl = data.optStringOrNull("profilePicUrl")
            ?: data.optStringOrNull("profile_pic_url")
            ?: data.optStringOrNull("avatarUrl")
            ?: data.optStringOrNull("avatar_url")
    )
}

