const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { INCOMING_DIR, sanitizeMediaFile } = require('../mediaSecurity');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const UPLOAD_DIR = path.resolve(PROJECT_ROOT, process.env.UPLOAD_DIR || './uploads');
const WWEBJS_MEDIA_DIR = path.join(UPLOAD_DIR, 'safe');
const WWEBJS_INCOMING_DIR = path.join(INCOMING_DIR, 'wwebjs');
fs.mkdirSync(WWEBJS_MEDIA_DIR, { recursive: true });
fs.mkdirSync(WWEBJS_INCOMING_DIR, { recursive: true });

class WWebJSProvider extends EventEmitter {
  constructor(options = {}) {
    super();
    this.accountId = options.accountId || 'main';
    this.accountName = options.accountName || this.accountId;
    this.name = 'wwebjs';
    this.logPrefix = `[wwebjs:${this.accountId}]`;
    this.authDataPath = options.authDataPath || path.join(PROJECT_ROOT, '.wwebjs_auth');
    this.ready = false;
    this.state = 'NOT_STARTED';
    this.lastSyncAt = 0;
    this.lastSyncError = null;
    this.syncRunning = false;
    this.periodicSyncTimer = null;
    this.readyRetryScheduled = false;
    this.syncedMessageIds = new Set();
    this.syncedMessageIdsOrder = [];
    this.maxRememberedMessageIds = Math.max(1000, Number(process.env.WWEBJS_SYNC_MEMORY_IDS || 5000));
    this.initializing = false;
    this.initializeAttempts = 0;
    this.startRequestedAt = 0;
    this.lastStateAt = 0;
    this.lastQrAt = 0;
    this.lastQrRaw = '';
    this.lastReadyAt = 0;
    this.connectedWid = '';
    this.connectedNumber = '';
    this.startupWatchdogTimer = null;
    this.webCacheModeIndex = 0;
    this.runtimeWebCacheModes = buildWebCacheModeList();
    this.clientId = options.clientId || process.env.WWEBJS_CLIENT_ID || 'own-messenger-main';
    this.lastError = null;
    this.lastPairingCode = '';
    this.lastPairingCodeAt = 0;
    this.lastPairingPhone = '';
    this.lastPairingError = null;
    this.client = this.createClient();
    this.attachEvents();
  }

  markState(state, extra = {}) {
    if (state) this.state = state;
    this.lastStateAt = nowSeconds();
    if (extra.error) this.lastError = String(extra.error);
  }

  clearStartupWatchdog() {
    if (this.startupWatchdogTimer) {
      clearTimeout(this.startupWatchdogTimer);
      this.startupWatchdogTimer = null;
    }
  }

  scheduleStartupWatchdog() {
    this.clearStartupWatchdog();
    const timeoutMs = Math.max(30000, Number(process.env.WWEBJS_INIT_TIMEOUT_MS || 75000));
    this.startupWatchdogTimer = setTimeout(() => {
      if (this.ready) return;
      const state = String(this.state || '').toUpperCase();
      if (state === 'STARTING' || state === 'RESTARTING' || state === 'RESETTING') {
        const seconds = Math.round(timeoutMs / 1000);
        const message = `WhatsApp-Web hat fuer Account ${this.accountId} nach ${seconds} Sekunden keinen QR-Code und kein Ready-Event geliefert. Bitte Provider neu starten oder Session loeschen.`;
        this.markState('ERROR', { error: message });
        console.error(`${this.logPrefix} ${message}`);
        this.emit('disconnected', { provider: this.name, reason: message, timestamp: nowSeconds() });
      }
    }, timeoutMs);
    if (this.startupWatchdogTimer.unref) this.startupWatchdogTimer.unref();
  }

  createClient(cacheModeOverride = null) {
    const clientOptions = {
      authStrategy: new LocalAuth({
        clientId: this.clientId,
        dataPath: this.authDataPath
      }),
      userAgent: process.env.WWEBJS_USER_AGENT || undefined,
      qrMaxRetries: Number(process.env.WWEBJS_QR_MAX_RETRIES || 0) || undefined,
      takeoverOnConflict: true,
      takeoverTimeoutMs: Number(process.env.WWEBJS_TAKEOVER_TIMEOUT_MS || 15000),
      puppeteer: {
        headless: String(process.env.WWEBJS_HEADLESS || '1') !== '0',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
          '--no-first-run',
          '--no-default-browser-check',
          '--window-size=1280,900'
        ]
      }
    };

    const cacheMode = String(cacheModeOverride || this.runtimeWebCacheModes[this.webCacheModeIndex] || 'none').trim().toLowerCase();
    const remotePath = String(
      process.env.WWEBJS_WEB_VERSION_REMOTE ||
      'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1039169958.html'
    ).trim();

    // WhatsApp Web aendert sich haeufig. Manche Versionen brechen beim Inject mit
    // "Execution context was destroyed". Deshalb kann der Provider automatisch
    // verschiedene Cache-Modi versuchen: local -> none -> remote.
    this.activeWebCacheMode = cacheMode;
    if (cacheMode === 'remote' && remotePath) {
      clientOptions.webVersionCache = { type: 'remote', remotePath };
      console.log(`${this.logPrefix} WhatsApp-Web-Version: remote cache.`);
    } else if (cacheMode === 'none') {
      clientOptions.webVersionCache = { type: 'none' };
      console.log(`${this.logPrefix} WhatsApp-Web-Version: ohne Cache.`);
    } else {
      console.log(`${this.logPrefix} WhatsApp-Web-Version: local/default cache.`);
    }

    return new Client(clientOptions);
  }

  attachEvents() {
    this.client.on('qr', (qr) => {
      this.lastQrRaw = String(qr || '');
      this.markState('QR');
      this.lastQrAt = nowSeconds();
      this.clearStartupWatchdog();
      this.lastError = null;
      console.log('\n============================================================');
      console.log(' WhatsApp QR-Code scannen');
      console.log(' WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen');
      console.log('============================================================');
      qrcode.generate(qr, { small: true });
      console.log('============================================================\n');
      this.emit('qr', { provider: this.name, qr, timestamp: nowSeconds() });
    });

    this.client.on('code', (code) => {
      this.lastPairingCode = String(code || '').trim();
      this.lastPairingCodeAt = nowSeconds();
      this.lastPairingError = null;
      if (this.lastPairingCode) {
        console.log(`${this.logPrefix} WhatsApp Pairing-Code: ${this.lastPairingCode}`);
        this.emit('pairing_code', { provider: this.name, code: this.lastPairingCode, phone: this.lastPairingPhone, timestamp: this.lastPairingCodeAt });
      }
    });

    this.client.on('authenticated', () => {
      this.markState('AUTHENTICATED');
      this.clearStartupWatchdog();
      this.lastError = null;
      console.log(`${this.logPrefix} Authentifiziert.`);
      this.emit('authenticated', { provider: this.name, timestamp: nowSeconds() });
    });

    this.client.on('auth_failure', (message) => {
      this.ready = false;
      this.lastQrRaw = '';
      this.markState('AUTH_FAILURE', { error: String(message || 'Authentifizierung fehlgeschlagen') });
      this.clearStartupWatchdog();
      console.error(`${this.logPrefix} Auth-Fehler:`, message);
      this.emit('auth_failure', { provider: this.name, message, timestamp: nowSeconds() });
    });

    this.client.on('ready', async () => {
      this.ready = true;
      this.markState('CONNECTED');
      this.lastReadyAt = nowSeconds();
      this.lastQrRaw = '';
      this.clearStartupWatchdog();
      this.lastError = null;
      const webVersion = await this.client.getWWebVersion().catch(() => null);
      const state = await this.client.getState().catch(() => 'CONNECTED');
      this.connectedWid = this.client.info?.wid?._serialized || this.client.info?.wid?.user || this.client.info?.me?._serialized || '';
      this.connectedNumber = jidToNumber(this.connectedWid) || this.client.info?.wid?.user || '';
      console.log(`${this.logPrefix} Client ready. State=${state}${webVersion ? ` WAWeb=${webVersion}` : ''}${this.connectedNumber ? ` Nummer=${this.connectedNumber}` : ''}`);
      this.emit('ready', { provider: this.name, ready: true, state, webVersion, wid: this.connectedWid, number: this.connectedNumber, timestamp: nowSeconds() });

      if (String(process.env.WWEBJS_AUTO_SYNC || '1') !== '0') {
        this.scheduleSyncRetries();
        this.startPeriodicSync();
      }
    });

    this.client.on('change_state', (state) => {
      this.markState(state || this.state);
      this.emit('state', { provider: this.name, state: this.state, timestamp: nowSeconds() });
    });

    this.client.on('disconnected', (reason) => {
      this.ready = false;
      this.markState('DISCONNECTED');
      this.clearStartupWatchdog();
      console.log(`${this.logPrefix} Getrennt:`, reason);
      this.emit('disconnected', { provider: this.name, reason, timestamp: nowSeconds() });
    });

    // Incoming messages.
    this.client.on('message', async (message) => {
      try {
        const normalized = await this.normalizeMessage(message);
        this.rememberMessageId(normalized.id);
        this.emit('message', normalized);
      } catch (error) {
        console.error(`${this.logPrefix} message normalize failed:`, error.message);
      }
    });

    // Outgoing messages created by your phone, WhatsApp Web, or this server.
    this.client.on('message_create', async (message) => {
      try {
        if (!message.fromMe) return;
        const normalized = await this.normalizeMessage(message);
        this.rememberMessageId(normalized.id);
        this.emit('message', normalized);
      } catch (error) {
        console.error(`${this.logPrefix} message_create normalize failed:`, error.message);
      }
    });

    this.client.on('message_ack', async (message, ack) => {
      const id = message?.id?._serialized || message?.id?.id;
      if (!id) return;
      this.emit('message_ack', {
        id,
        messageId: id,
        providerMessageId: id,
        status: ackToStatus(ack),
        ack,
        timestamp: nowSeconds(),
        raw: { ack }
      });
    });

    this.client.on('incoming_call', (call) => {
      const peerJid = resolveCallPeerJid(call, this.client.info?.wid?._serialized);
      const outgoing = Boolean(call.outgoing || call.fromMe);
      this.emit('incoming_call', {
        id: String(call.id || call.callId || `call_${Date.now()}`),
        chatId: peerJid,
        peerJid,
        name: call.name || jidToNumber(peerJid) || peerJid,
        isVideo: Boolean(call.isVideo),
        isGroup: Boolean(call.isGroup),
        outgoing,
        missed: !outgoing,
        timestamp: normalizeTimestamp(call.timestamp || Date.now()),
        raw: safeCallInfo(call)
      });
    });

    this.client.on('chat_update', async (chat) => {
      try {
        const normalized = await this.serializeChat(chat);
        this.emit('chats', { provider: this.name, chats: [normalized], count: 1, timestamp: nowSeconds(), reason: 'chat_update' });
      } catch (error) {
        console.log(`${this.logPrefix} chat_update normalize failed:`, error.message);
      }
    });

    this.client.on('unread_count', async (chat) => {
      try {
        const normalized = await this.serializeChat(chat);
        this.emit('chats', { provider: this.name, chats: [normalized], count: 1, timestamp: nowSeconds(), reason: 'unread_count' });
      } catch (_) {}
    });
  }

  scheduleSyncRetries() {
    if (this.readyRetryScheduled) return;
    this.readyRetryScheduled = true;
    const delays = [0, 10000];
    for (const delay of delays) {
      setTimeout(() => {
        if (!this.ready) return;
        this.syncChatsAndMessages('ready_retry').catch((error) => this.reportSyncError(error));
      }, delay);
    }
  }

  startPeriodicSync() {
    if (this.periodicSyncTimer) return;
    const seconds = Math.max(0, Number(process.env.WWEBJS_PERIODIC_SYNC_SECONDS || 30));
    if (!seconds) return;
    this.periodicSyncTimer = setInterval(() => {
      if (!this.ready) return;
      this.syncChatsAndMessages('periodic').catch((error) => this.reportSyncError(error));
    }, seconds * 1000);
    if (this.periodicSyncTimer.unref) this.periodicSyncTimer.unref();
  }

  reportSyncError(error) {
    this.lastSyncError = error?.message || String(error || 'unknown sync error');
    console.error(`${this.logPrefix} Sync fehlgeschlagen:`, this.lastSyncError);
    this.emit('sync_error', { provider: this.name, error: this.lastSyncError, timestamp: nowSeconds() });
  }

  getSyncStatus() {
    return {
      provider: this.name,
      ready: this.ready,
      state: this.state,
      running: this.syncRunning,
      lastSyncAt: this.lastSyncAt,
      lastSyncError: this.lastSyncError,
      lastError: this.lastError,
      startRequestedAt: this.startRequestedAt,
      lastStateAt: this.lastStateAt,
      lastQrAt: this.lastQrAt,
      hasQr: Boolean(this.lastQrRaw),
      hasSession: this.hasSession(),
      lastPairingCode: this.lastPairingCode,
      lastPairingCodeAt: this.lastPairingCodeAt,
      lastPairingPhone: this.lastPairingPhone,
      lastPairingError: this.lastPairingError,
      lastReadyAt: this.lastReadyAt,
      connectedWid: this.connectedWid,
      connectedNumber: this.connectedNumber,
      initializeAttempts: this.initializeAttempts,
      clientId: this.clientId,
      authDataPath: this.authDataPath,
      periodicSeconds: Math.max(0, Number(process.env.WWEBJS_PERIODIC_SYNC_SECONDS || 30))
    };
  }

  sessionDirectory() {
    return path.join(this.authDataPath, `session-${this.clientId}`);
  }

  hasSession() {
    try {
      const sessionDir = this.sessionDirectory();
      if (fs.existsSync(sessionDir)) {
        const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
        if (entries.some((entry) => entry.name === 'Default' || entry.name === 'IndexedDB' || entry.name === 'Local Storage')) return true;
        if (entries.length > 2) return true;
      }
      if (fs.existsSync(this.authDataPath)) {
        return fs.readdirSync(this.authDataPath).some((name) => name.startsWith('session-') && name.includes(this.clientId));
      }
    } catch (_) {}
    return false;
  }

  setNotStarted(reason = '') {
    this.ready = false;
    this.lastQrRaw = '';
    this.markState('NOT_STARTED', reason ? { error: reason } : {});
  }

  waitForQrOrReady(timeoutMs = Number(process.env.WWEBJS_PAIRING_WAIT_MS || 45000)) {
    if (this.lastQrRaw) return Promise.resolve('qr');
    if (this.ready) return Promise.resolve('ready');
    return withTimeout(new Promise((resolve, reject) => {
      const cleanup = () => {
        this.client.off('qr', onQr);
        this.client.off('ready', onReady);
        this.client.off('authenticated', onAuthenticated);
        this.client.off('auth_failure', onAuthFailure);
        this.client.off('disconnected', onDisconnected);
      };
      const done = (value) => { cleanup(); resolve(value); };
      const fail = (value) => { cleanup(); reject(new Error(value)); };
      const onQr = () => done('qr');
      const onReady = () => done('ready');
      const onAuthenticated = () => done('authenticated');
      const onAuthFailure = (message) => fail(`Authentifizierung fehlgeschlagen: ${message || 'unbekannt'}`);
      const onDisconnected = (reason) => fail(`WhatsApp-Web getrennt: ${reason || 'unbekannt'}`);
      this.client.once('qr', onQr);
      this.client.once('ready', onReady);
      this.client.once('authenticated', onAuthenticated);
      this.client.once('auth_failure', onAuthFailure);
      this.client.once('disconnected', onDisconnected);
      if (this.lastQrRaw) done('qr');
      else if (this.ready) done('ready');
    }), timeoutMs, `Kein QR/Ready-Signal fuer Pairing-Code nach ${Math.round(timeoutMs / 1000)} Sekunden.`);
  }

  async requestPairingCode(phoneNumber) {
    const cleanPhone = String(phoneNumber || '').replace(/[^0-9]/g, '');
    if (!/^\d{8,15}$/.test(cleanPhone)) {
      throw new Error('Telefonnummer fuer Pairing-Code bitte international ohne + eingeben, z.B. 491701234567.');
    }
    if (this.ready) throw new Error('Dieser Account ist bereits verbunden. Fuer Neu-Kopplung zuerst Session loeschen.');
    if (typeof this.client.requestPairingCode !== 'function') {
      throw new Error('Diese whatsapp-web.js-Version unterstuetzt requestPairingCode nicht. Bitte npm install ueber die START_SERVER_WINDOWS.bat ausfuehren.');
    }

    this.lastPairingPhone = cleanPhone;
    this.lastPairingError = null;
    this.lastPairingCode = '';
    if (!this.initializing && !['STARTING','QR','RESTARTING','RESETTING'].includes(String(this.state || '').toUpperCase())) {
      await this.start();
    }
    await this.waitForQrOrReady();
    if (this.ready) throw new Error('Account wurde bereits verbunden, bevor ein Pairing-Code erzeugt wurde.');

    try {
      const intervalMs = Math.max(60000, Number(process.env.WWEBJS_PAIRING_INTERVAL_MS || 180000));
      const code = await this.client.requestPairingCode(cleanPhone, true, intervalMs);
      this.lastPairingCode = String(code || '').trim();
      this.lastPairingCodeAt = nowSeconds();
      this.lastPairingError = null;
      this.markState('PAIRING_CODE');
      this.emit('pairing_code', { provider: this.name, code: this.lastPairingCode, phone: cleanPhone, timestamp: this.lastPairingCodeAt });
      return this.lastPairingCode;
    } catch (error) {
      this.lastPairingError = error?.message || String(error);
      this.lastError = this.lastPairingError;
      throw error;
    }
  }

  async start() {
    if (this.ready) {
      this.markState('CONNECTED');
      return;
    }
    if (this.initializing) {
      console.log(`${this.logPrefix} Start laeuft bereits, ueberspringe doppelten Start.`);
      return;
    }
    console.log(`${this.logPrefix} Starte WhatsApp-Web-Provider ...`);
    this.startRequestedAt = nowSeconds();
    this.markState(this.ready ? 'CONNECTED' : 'STARTING');
    if (!this.ready) this.lastQrRaw = '';
    this.lastError = null;
    this.initializing = true;
    this.scheduleStartupWatchdog();
    // Start non-blocking so the REST/WebSocket server is reachable while QR is pending.
    this.initializeClientWithRetry().finally(() => {
      this.initializing = false;
    });
  }

  async initializeClientWithRetry() {
    const maxAttempts = Math.max(1, Number(process.env.WWEBJS_INIT_RETRIES || 5));
    const initTimeoutMs = Math.max(30000, Number(process.env.WWEBJS_INIT_TIMEOUT_MS || 75000));
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.initializeAttempts = attempt;
      try {
        // whatsapp-web.js/Puppeteer kann in seltenen Faellen ohne Fehler haengen bleiben.
        // Dann stand /qr.php dauerhaft auf STARTING. Der Timeout macht daraus einen
        // sichtbaren ERROR und erlaubt automatischen Retry/Restart.
        // initialize() kann bei whatsapp-web.js bis zum Login offen bleiben.
        // Fuer die QR-Seite reicht aber bereits das erste Startsignal.
        await withTimeout(
          Promise.race([this.client.initialize(), this.waitForStartupSignal()]),
          initTimeoutMs,
          `WhatsApp-Web-Initialisierung hat nach ${Math.round(initTimeoutMs / 1000)} Sekunden keinen QR/Ready/Error geliefert.`
        );
        return;
      } catch (error) {
        const message = error?.stack || error?.message || String(error);
        this.ready = false;
        this.markState('ERROR', { error: message });
        this.clearStartupWatchdog();
        console.error(`${this.logPrefix} initialize failed (Versuch ${attempt}/${maxAttempts}):`, error?.message || error);

        const recoverable = isRecoverableLaunchError(message);
        if (!recoverable || attempt >= maxAttempts) {
          this.emit('disconnected', { provider: this.name, reason: error?.message || String(error), timestamp: nowSeconds() });
          return;
        }

        await this.recoverBrowserState(message);
        await sleep(5000 * attempt);
        if (isInjectNavigationError(message) && this.webCacheModeIndex < this.runtimeWebCacheModes.length - 1) {
          this.webCacheModeIndex += 1;
          console.log(`${this.logPrefix} Wechsel WhatsApp-Web-Cache-Modus auf: ${this.runtimeWebCacheModes[this.webCacheModeIndex]}`);
        }
        this.client = this.createClient();
        this.attachEvents();
        this.markState('STARTING');
        this.scheduleStartupWatchdog();
      }
    }
  }

  waitForStartupSignal() {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.client.off('qr', onQr);
        this.client.off('ready', onReady);
        this.client.off('authenticated', onAuthenticated);
        this.client.off('auth_failure', onAuthFailure);
        this.client.off('disconnected', onDisconnected);
      };
      const done = (value) => { cleanup(); resolve(value); };
      const fail = (value) => { cleanup(); reject(new Error(value)); };
      const onQr = () => done('qr');
      const onReady = () => done('ready');
      const onAuthenticated = () => done('authenticated');
      const onAuthFailure = (message) => fail(`Authentifizierung fehlgeschlagen: ${message || 'unbekannt'}`);
      const onDisconnected = (reason) => fail(`WhatsApp-Web getrennt: ${reason || 'unbekannt'}`);
      this.client.once('qr', onQr);
      this.client.once('ready', onReady);
      this.client.once('authenticated', onAuthenticated);
      this.client.once('auth_failure', onAuthFailure);
      this.client.once('disconnected', onDisconnected);
    });
  }

  async recoverBrowserState(message = '') {
    console.log(`${this.logPrefix} Browser/Session wird bereinigt, weil WhatsApp-Web nicht sauber gestartet ist ...`);
    try { await this.client.destroy(); } catch (_) {}
    if (/already running|userDataDir|Singleton/i.test(message)) {
      await killProcessesUsingPath(this.authDataPath).catch(() => {});
    }
    removeChromeLockFiles(this.authDataPath);
    if (isInjectNavigationError(message)) {
      removeChromeVolatileCache(this.authDataPath);
    }
  }

  async restart() {
    console.log(`${this.logPrefix} WhatsApp-Web-Provider wird neu gestartet ...`);
    this.ready = false;
    this.markState('RESTARTING');
    this.lastQrRaw = '';
    this.lastPairingCode = '';
    this.connectedWid = '';
    this.connectedNumber = '';
    this.lastPairingError = null;
    this.lastError = null;
    this.clearStartupWatchdog();
    try { await this.client.destroy(); } catch (_) {}
    removeChromeLockFiles(this.authDataPath);
    this.client = this.createClient();
    this.attachEvents();
    await this.start();
  }

  async resetSession() {
    console.log(`${this.logPrefix} WhatsApp-Web-Session wird geloescht ...`);
    this.ready = false;
    this.markState('RESETTING');
    this.lastQrRaw = '';
    this.lastPairingCode = '';
    this.connectedWid = '';
    this.connectedNumber = '';
    this.lastPairingError = null;
    this.lastError = null;
    this.clearStartupWatchdog();
    try { await this.client.destroy(); } catch (_) {}
    await killProcessesUsingPath(this.authDataPath).catch(() => {});
    try { fs.rmSync(this.authDataPath, { recursive: true, force: true }); } catch (_) {}
    fs.mkdirSync(this.authDataPath, { recursive: true });
    this.client = this.createClient();
    this.attachEvents();
    await this.start();
  }

  async stop() {
    if (this.periodicSyncTimer) {
      clearInterval(this.periodicSyncTimer);
      this.periodicSyncTimer = null;
    }
    await this.client.destroy().catch(() => {});
    this.ready = false;
    this.lastQrRaw = '';
    this.lastPairingCode = '';
    this.connectedWid = '';
    this.connectedNumber = '';
    this.lastPairingError = null;
    this.markState('STOPPED');
    this.clearStartupWatchdog();
  }

  async waitUntilReady(timeoutMs = Number(process.env.WWEBJS_SEND_WAIT_MS || 60000)) {
    if (this.ready) return;
    const started = Date.now();
    while (!this.ready && Date.now() - started < timeoutMs) {
      await sleep(500);
    }
    if (!this.ready) {
      throw new Error('WhatsApp-Web-Provider ist noch nicht verbunden. Scanne den QR-Code im Serverfenster und warte auf ready.');
    }
  }

  normalizeTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;
    return `${raw.replace(/[^0-9]/g, '')}@c.us`;
  }

  async sendMessage({ to, chatId, text, raw }) {
    await this.waitUntilReady();
    const target = this.normalizeTarget(chatId || to);
    if (!target) throw new Error('Ziel-Chat fehlt.');

    let content = text || raw?.caption || raw?.body || '';
    const options = { ...(raw?.options || {}) };

    const mediaPath = raw?.mediaPath || raw?.filePath || raw?.upload?.path;
    if (mediaPath && fs.existsSync(mediaPath)) {
      const type = String(raw?.type || '').toLowerCase();
      const explicitMime = String(raw?.mimeType || raw?.mimetype || raw?.upload?.mimetype || '').toLowerCase();
      const fileName = String(raw?.fileName || raw?.upload?.filename || path.basename(mediaPath));
      const mime = explicitMime || mimeFromFileName(fileName) || mimeFromFileName(mediaPath) || 'application/octet-stream';

      // Nicht MessageMedia.fromFilePath verwenden: bei .m4a/.ogg wird sonst je nach
      // Windows/Mime-DB manchmal ein falscher MIME-Typ gesetzt. WhatsApp lehnt solche
      // Audios spaeter am Handy mit "Audio nicht verfuegbar" ab.
      const mediaData = fs.readFileSync(path.resolve(mediaPath)).toString('base64');
      content = new MessageMedia(mime, mediaData, fileName);

      const isAudio = type === 'audio' || type === 'ptt' || type === 'voice' || mime.startsWith('audio/');
      if (isAudio) {
        options.sendAudioAsVoice = raw?.asVoice === false || raw?.sendAudioAsVoice === false ? false : true;
        // Voice Notes haben bei WhatsApp keine Caption. Eine Caption kann dazu fuehren,
        // dass WhatsApp die Datei als ungueltiges Audio behandelt.
        delete options.caption;
      } else {
        const caption = raw?.caption || raw?.text || raw?.body || '';
        if (caption) options.caption = caption;
      }
      if (type === 'document' || (!mime.startsWith('image/') && !mime.startsWith('video/') && !mime.startsWith('audio/'))) {
        options.sendMediaAsDocument = true;
      }
    }

    const message = await this.client.sendMessage(target, content, options);
    const normalized = await this.normalizeMessage(message, target);
    return {
      id: normalized.id,
      providerMessageId: normalized.providerMessageId,
      chatId: normalized.chatId || target,
      to: target,
      text: normalized.body || text || '',
      status: normalized.status || 'sent',
      timestamp: normalized.timestamp || nowSeconds(),
      senderName: 'Ich',
      senderId: normalized.senderId,
      senderNumber: normalized.senderNumber,
      type: normalized.type,
      provider: this.name,
      accountId: this.accountId,
      accountName: this.accountName,
      clientId: this.clientId,
      connectedNumber: this.connectedNumber,
      connectedWid: this.connectedWid,
      raw: normalized.raw
    };
  }

  async syncChatsAndMessages(reason = 'manual') {
    await this.waitUntilReady(5000).catch(() => {});
    if (!this.ready) return { ok: false, reason: 'not_ready' };
    if (this.syncRunning) return { ok: false, reason: 'already_running' };
    if (!this.client || typeof this.client.getChats !== 'function') return { ok: false, reason: 'client_not_ready' };
    this.syncRunning = true;

    try {
      const chatLimit = Number(process.env.WWEBJS_CHAT_LIMIT || process.env.CHAT_LIMIT || 200);
      const messageLimit = Number(process.env.WWEBJS_MESSAGE_LIMIT_PER_CHAT || process.env.MESSAGE_LIMIT_PER_CHAT || 15);
      const messageChatLimit = Number(process.env.WWEBJS_MESSAGE_CHAT_LIMIT || process.env.MESSAGE_CHAT_LIMIT || 75);
      const fetchMessages = String(process.env.WWEBJS_FETCH_RECENT_MESSAGES || process.env.FETCH_RECENT_MESSAGES || '1') !== '0';
      const verbose = String(process.env.WWEBJS_SYNC_VERBOSE || '0') === '1' || reason === 'manual';

      if (verbose) console.log(`${this.logPrefix} Lade Chatliste (${reason}), Limit=${chatLimit} ...`);
      const rawChats = await this.client.getChats();
      const selected = rawChats
        .sort((a, b) => ((b.pinned || 0) - (a.pinned || 0)) || (normalizeTimestamp(b.timestamp || b.t || b._data?.t) - normalizeTimestamp(a.timestamp || a.t || a._data?.t)))
        .slice(0, chatLimit);

      const chats = await Promise.all(selected.map((chat) => this.serializeChat(chat)));
      this.emit('chats', { provider: this.name, chats, count: chats.length, timestamp: nowSeconds(), reason });

      if (!fetchMessages || messageLimit <= 0) {
        this.lastSyncAt = nowSeconds();
        this.lastSyncError = null;
        if (verbose) console.log(`${this.logPrefix} Sync ${reason}: ${chats.length} Chats, Nachrichten-Sync aus.`);
        return { ok: true, chats: chats.length, messages: 0, newMessages: 0, skippedMessages: 0, reason, timestamp: this.lastSyncAt };
      }

      const messageChats = selected.slice(0, Math.min(messageChatLimit, selected.length));
      const allMessages = [];
      let skippedMessages = 0;
      let checkedMessages = 0;
      let index = 0;
      for (const chat of messageChats) {
        index += 1;
        const chatId = chat.id?._serialized || String(chat.id || '');
        const chatName = chat.name || chat.formattedTitle || chatId;
        try {
          const recent = await chat.fetchMessages({ limit: messageLimit });
          const normalized = [];
          for (const message of recent) {
            checkedMessages += 1;
            const msgId = getMessageId(message);
            if (msgId && this.syncedMessageIds.has(msgId)) {
              skippedMessages += 1;
              continue;
            }
            const item = await this.normalizeMessage(message, chatId, chatName);
            this.rememberMessageId(item.id);
            normalized.push(item);
          }
          allMessages.push(...normalized);
          if (verbose || normalized.length > 0) {
            console.log(`${this.logPrefix} [${index}/${messageChats.length}] ${chatName}: ${normalized.length} neue Nachrichten`);
          }
        } catch (error) {
          console.log(`${this.logPrefix} [${index}/${messageChats.length}] ${chatName}: ${error.message}`);
        }
      }

      if (allMessages.length) {
        this.emit('messages', { provider: this.name, messages: allMessages, count: allMessages.length, timestamp: nowSeconds(), reason });
      }

      this.lastSyncAt = nowSeconds();
      this.lastSyncError = null;
      console.log(`${this.logPrefix} Sync ${reason}: ${chats.length} Chats, ${allMessages.length} neue Nachrichten${skippedMessages ? `, ${skippedMessages} schon bekannt` : ''}.`);
      return { ok: true, chats: chats.length, messages: checkedMessages, newMessages: allMessages.length, skippedMessages, reason, timestamp: this.lastSyncAt };
    } catch (error) {
      this.lastSyncError = error?.message || String(error || 'unknown sync error');
      this.emit('sync_error', { provider: this.name, error: this.lastSyncError, timestamp: nowSeconds() });
      throw error;
    } finally {
      this.syncRunning = false;
    }
  }

  rememberMessageId(id) {
    const value = String(id || '').trim();
    if (!value || this.syncedMessageIds.has(value)) return;
    this.syncedMessageIds.add(value);
    this.syncedMessageIdsOrder.push(value);
    while (this.syncedMessageIdsOrder.length > this.maxRememberedMessageIds) {
      const old = this.syncedMessageIdsOrder.shift();
      if (old) this.syncedMessageIds.delete(old);
    }
  }

  async serializeChat(chat) {
    const id = chat.id?._serialized || String(chat.id || '');
    let name = chat.name || chat.formattedTitle || id;
    try {
      if (!chat.isGroup) {
        const contact = await chat.getContact?.();
        name = contact?.pushname || contact?.name || contact?.shortName || name;
      }
    } catch (_) {}

    const last = chat.lastMessage || chat._data?.lastMessage || null;
    const lastMessage = last ? (last.body || last.caption || bodyPreviewForType(last.type || last._data?.type)) : '';
    return {
      id,
      chatId: id,
      name,
      isGroup: Boolean(chat.isGroup || id.endsWith('@g.us')),
      unreadCount: Number(chat.unreadCount || 0),
      timestamp: normalizeTimestamp(chat.timestamp || chat.t || chat._data?.t || Date.now()),
      lastTimestamp: normalizeTimestamp(chat.timestamp || chat.t || chat._data?.t || Date.now()),
      lastMessage,
      archived: Boolean(chat.archived || chat._data?.archive),
      pinned: Boolean(chat.pinned || chat._data?.pin),
      muted: Boolean(chat.isMuted || chat._data?.isMuted),
      avatarUrl: null,
      rawType: chat.constructor?.name || 'Chat'
    };
  }

  async normalizeMessage(message, fallbackChatId = '', fallbackChatName = '') {
    const id = message.id?._serialized || message.id?.id || message._data?.id?._serialized || `msg_${Date.now()}_${Math.random()}`;
    const fromMe = Boolean(message.fromMe || message._data?.id?.fromMe);
    const remote = message.id?.remote || message._data?.id?.remote || fallbackChatId || (fromMe ? message.to : message.from) || '';
    const chatId = remote || fallbackChatId || '';
    const type = String(message.type || message._data?.type || 'text').toLowerCase();

    let chatName = fallbackChatName || chatId;
    let senderId = fromMe ? (this.client.info?.wid?._serialized || 'me') : (message.author || message.from || chatId);
    let senderName = fromMe ? 'Ich' : (message._data?.notifyName || jidToNumber(senderId) || senderId);
    let senderNumber = jidToNumber(senderId);

    try {
      const chat = await message.getChat?.();
      if (chat) {
        chatName = chat.name || chat.formattedTitle || chatName;
      }
    } catch (_) {}

    try {
      const contact = await message.getContact?.();
      if (contact && !fromMe) {
        senderId = contact.id?._serialized || senderId;
        senderNumber = contact.number || jidToNumber(senderId);
        senderName = contact.pushname || contact.name || contact.shortName || senderNumber || senderName;
      }
    } catch (_) {}

    let media = null;
    if (message.hasMedia && String(process.env.WWEBJS_DOWNLOAD_MEDIA || '1') !== '0') {
      media = await this.saveIncomingMedia(message, id, type).catch((error) => {
        console.log(`${this.logPrefix} Medien-Download fehlgeschlagen (${id}): ${error.message}`);
        return null;
      });
    }

    const body = message.body || message.caption || message._data?.body || message._data?.caption || (media?.blocked ? '[blockierte Datei]' : (media ? fileBodyForMedia(type, media.fileName) : bodyPreviewForType(type))); 

    return {
      id,
      messageId: id,
      providerMessageId: id,
      waMessageId: id,
      chatId,
      chat_id: chatId,
      chatName,
      chat_name: chatName,
      from: message.from,
      to: message.to,
      author: message.author || null,
      senderId,
      sender_id: senderId,
      senderNumber,
      sender_number: senderNumber,
      name: senderName,
      senderName,
      sender_name: senderName,
      contact_name: senderName,
      fromMe,
      direction: fromMe ? 'out' : 'in',
      body: body || '',
      text: body || '',
      type,
      timestamp: normalizeTimestamp(message.timestamp || message._data?.t || Date.now()),
      status: fromMe ? ackToStatus(message.ack ?? 0) : 'received',
      ack: message.ack,
      hasMedia: Boolean(message.hasMedia),
      mediaUrl: media?.mediaUrl || null,
      media_url: media?.mediaUrl || null,
      fileName: media?.fileName || null,
      file_name: media?.fileName || null,
      mimeType: media?.mimeType || message._data?.mimetype || null,
      mime_type: media?.mimeType || message._data?.mimetype || null,
      fileSize: media?.fileSize || null,
      file_size: media?.fileSize || null,
      scanStatus: media?.scanStatus || null,
      scan_status: media?.scanStatus || null,
      scanResult: media?.scanResult || null,
      scan_result: media?.scanResult || null,
      originalFileName: media?.originalFileName || null,
      original_file_name: media?.originalFileName || null,
      originalMimeType: media?.originalMimeType || null,
      original_mime_type: media?.originalMimeType || null,
      raw: {
        id,
        from: message.from,
        to: message.to,
        author: message.author,
        fromMe,
        type,
        timestamp: message.timestamp,
        ack: message.ack,
        hasMedia: message.hasMedia
      }
    };
  }

  async saveIncomingMedia(message, messageId, type) {
    const media = await message.downloadMedia();
    if (!media || !media.data) return null;
    const ext = extensionFromMime(media.mimetype) || extensionFromType(type) || 'bin';
    const safeId = String(messageId).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90);
    const originalName = media.filename || `${safeId}.${ext}`;
    const rawName = `${Date.now()}_${safeId}.${ext}`;
    const rawPath = path.join(WWEBJS_INCOMING_DIR, rawName);
    const buffer = Buffer.from(media.data, 'base64');
    fs.writeFileSync(rawPath, buffer);

    const secure = await sanitizeMediaFile(rawPath, {
      source: 'wwebjs_incoming',
      originalName,
      claimedMime: media.mimetype
    });

    if (secure.blocked || !secure.ok) {
      return {
        mediaUrl: null,
        fileName: originalName,
        originalFileName: originalName,
        originalMimeType: media.mimetype,
        mimeType: media.mimetype,
        fileSize: buffer.length,
        scanStatus: secure.scanStatus || 'blocked',
        scanResult: secure.scanResult || 'blocked',
        blocked: true
      };
    }

    return {
      mediaUrl: secure.mediaUrl,
      fileName: originalName,
      originalFileName: originalName,
      originalMimeType: media.mimetype,
      mimeType: secure.mimeType,
      fileSize: secure.fileSize,
      scanStatus: secure.scanStatus,
      scanResult: secure.scanResult,
      metadataStripped: secure.metadataStripped,
      reencoded: secure.reencoded
    };
  }
}

function getMessageId(message) {
  return message?.id?._serialized || message?.id?.id || message?._data?.id?._serialized || '';
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timeout nach ${timeoutMs} ms`)), timeoutMs);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeTimestamp(value) {
  const n = Number(value || nowSeconds());
  return n > 100_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function ackToStatus(ack) {
  const n = Number(ack);
  if (n >= 3) return 'read';
  if (n >= 2) return 'delivered';
  if (n >= 1) return 'sent';
  return 'pending';
}

function jidToNumber(jid) {
  const raw = String(jid || '');
  const user = raw.split('@')[0];
  return user && /^\d+$/.test(user) ? user : user || null;
}

function bodyPreviewForType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'image') return '[Bild]';
  if (t === 'video') return '[Video]';
  if (t === 'audio' || t === 'ptt') return '[Audio]';
  if (t === 'document') return '[Dokument]';
  if (t === 'call_log' || t === 'call') return '[Anruf]';
  if (t === 'missed_call') return '[Verpasster Anruf]';
  if (t === 'sticker') return '[Sticker]';
  if (t === 'location') return '[Standort]';
  if (t) return `[${t}]`;
  return '';
}

function fileBodyForMedia(type, fileName) {
  if (type === 'image') return '[Bild]';
  if (type === 'video') return '[Video]';
  if (type === 'audio' || type === 'ptt') return '[Audio]';
  if (type === 'sticker') return '[Sticker]';
  return fileName ? `[Datei: ${fileName}]` : '[Datei]';
}

function extensionFromMime(mime) {
  const value = String(mime || '').toLowerCase().split(';')[0];
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/amr': 'amr',
    'audio/3gpp': '3gp',
    'audio/webm': 'webm',
    'application/pdf': 'pdf'
  };
  return map[value] || value.split('/')[1]?.replace(/[^a-z0-9]/g, '') || null;
}

function extensionFromType(type) {
  if (type === 'image') return 'jpg';
  if (type === 'video') return 'mp4';
  if (type === 'audio' || type === 'ptt') return 'ogg';
  if (type === 'sticker') return 'webp';
  return 'bin';
}


function buildWebCacheModeList() {
  const configured = String(process.env.WWEBJS_WEB_VERSION_CACHE || 'local').trim().toLowerCase();
  const modes = [];
  for (const mode of [configured, 'none', 'local', 'remote']) {
    const clean = mode === 'default' ? 'local' : mode;
    if (!['local', 'none', 'remote'].includes(clean)) continue;
    if (!modes.includes(clean)) modes.push(clean);
  }
  return modes.length ? modes : ['local', 'none', 'remote'];
}

function isInjectNavigationError(message) {
  return /Execution context was destroyed|Runtime\.callFunctionOn|Client\.inject|navigation/i.test(String(message || ''));
}

function isRecoverableLaunchError(message) {
  const text = String(message || '');
  return /already running|userDataDir|Execution context was destroyed|Protocol error|Target closed|Session closed|Navigation timeout|Initialisierung hat nach|Timeout|net::ERR/i.test(text);
}

function removeChromeLockFiles(authDataPath) {
  const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];
  const roots = [authDataPath];
  try {
    for (const entry of fs.readdirSync(authDataPath, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(authDataPath, entry.name));
    }
  } catch (_) {}
  for (const root of roots) {
    for (const name of names) {
      try { fs.rmSync(path.join(root, name), { force: true }); } catch (_) {}
    }
  }
}

function removeChromeVolatileCache(authDataPath) {
  const volatileNames = [
    'Cache', 'Code Cache', 'GPUCache', 'GrShaderCache', 'ShaderCache',
    'DawnCache', 'Service Worker', 'Session Storage', 'Crashpad',
    'blob_storage', 'BrowserMetrics'
  ];
  const roots = [authDataPath];
  try {
    for (const entry of fs.readdirSync(authDataPath, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(authDataPath, entry.name));
    }
  } catch (_) {}
  for (const root of roots) {
    for (const name of volatileNames) {
      try { fs.rmSync(path.join(root, name), { recursive: true, force: true }); } catch (_) {}
    }
  }
}

function killProcessesUsingPath(targetPath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    const needle = String(path.resolve(targetPath)).replace(/'/g, "''");
    const ps = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `$needle='${needle}'; ` +
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $needle + '*') } | ` +
      `ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }`
    ];
    execFile('powershell.exe', ps, { windowsHide: true, timeout: 10000 }, () => resolve());
  });
}

function resolveCallPeerJid(call, ownWid = '') {
  const own = String(ownWid || '').trim();
  const candidates = [
    call?.peerJid,
    call?.peerJID,
    call?.peer,
    call?.chatId,
    call?.chatid,
    call?.from,
    call?.to,
    call?.id?.remote,
    call?.id?._serialized,
    call?._data?.peerJid,
    call?._data?.from,
    call?._data?.to
  ];

  const participants = call?.participants || call?._data?.participants;
  if (participants && typeof participants === 'object') {
    for (const key of Object.keys(participants)) candidates.push(key);
  }

  for (const value of candidates) {
    const jid = String(value || '').trim();
    if (!jid || jid === own || jid.includes('status@broadcast')) continue;
    if (jid.includes('@')) return jid;
  }

  for (const value of candidates) {
    const jid = String(value || '').trim();
    if (jid && jid !== own) return jid;
  }

  return String(call?.peerJid || call?.from || call?.to || call?.id || 'unknown');
}

function safeCallInfo(call) {
  return {
    id: String(call?.id || ''),
    peerJid: resolveCallPeerJid(call),
    isVideo: Boolean(call?.isVideo),
    isGroup: Boolean(call?.isGroup),
    outgoing: Boolean(call?.outgoing),
    timestamp: nowSeconds()
  };
}

module.exports = { WWebJSProvider };
