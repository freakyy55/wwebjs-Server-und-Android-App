const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SECURITY_DIR = path.join(PROJECT_ROOT, 'data', 'security');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOCK_FILE = path.join(SECURITY_DIR, 'device-lock.json');
const AUDIT_FILE = path.join(LOG_DIR, 'access-audit.log');

fs.mkdirSync(SECURITY_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

function enabled(name, fallback = true) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return !['0', 'false', 'no', 'off', 'aus'].includes(value);
}

const SINGLE_DEVICE = enabled('APP_KEY_SINGLE_DEVICE', true);
const AUDIT_ENABLED = enabled('SECURITY_AUDIT_LOG', true);


function lockFileForScope(scopeId = 'main') {
  const safe = String(scopeId || 'main').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(SECURITY_DIR, `device-lock-${safe}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeJsonRead(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function safeJsonWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function clientIp(req) {
  const trustProxy = enabled('TRUST_PROXY', false);
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = trustProxy && forwarded ? forwarded : (req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
  return String(raw || 'unknown').replace(/^::ffff:/, '');
}

function shortHeader(req, name, max = 180) {
  return String(req.headers[name] || '').trim().slice(0, max);
}

function deviceFromRequest(req) {
  const ip = clientIp(req);
  const userAgent = shortHeader(req, 'user-agent', 260);
  const deviceId = shortHeader(req, 'x-device-id', 160) || shortHeader(req, 'x-android-id', 160);
  const deviceName = shortHeader(req, 'x-device-name', 160);
  const deviceModel = shortHeader(req, 'x-device-model', 160);
  const platform = shortHeader(req, 'sec-ch-ua-platform', 80);
  const appVersion = shortHeader(req, 'x-app-version', 80);

  // Beste Bindung: explizite Device-ID der App. Fallback: IP + User-Agent.
  // So bleibt der alte Android-Client kompatibel, bis er Device-Header sendet.
  const fingerprintSource = deviceId
    ? `device:${deviceId}`
    : `fallback:${ip}|${userAgent}`;

  return {
    ip,
    userAgent,
    deviceIdPresent: Boolean(deviceId),
    deviceIdHash: deviceId ? hash(deviceId) : null,
    deviceName: deviceName || null,
    deviceModel: deviceModel || null,
    platform: platform || null,
    appVersion: appVersion || null,
    fingerprintHash: hash(fingerprintSource)
  };
}

function audit(event, req, extra = {}) {
  if (!AUDIT_ENABLED) return;
  const device = req ? deviceFromRequest(req) : null;
  const row = {
    time: nowIso(),
    event,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
    ip: device?.ip || extra.ip || null,
    userAgent: device?.userAgent || null,
    deviceName: device?.deviceName || null,
    deviceModel: device?.deviceModel || null,
    platform: device?.platform || null,
    appVersion: device?.appVersion || null,
    ...extra
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(row) + '\n');
  } catch (_) {}
}

function verifySingleDevice(req, scopeId = 'main') {
  if (!SINGLE_DEVICE) return { ok: true, disabled: true };

  const current = deviceFromRequest(req);
  const scopeLockFile = lockFileForScope(scopeId);
  const state = safeJsonRead(scopeLockFile);

  if (state?.compromised) {
    audit('blocked_lockdown_active', req, { reason: state.reason || 'compromised', lockedAt: state.lockedAt });
    return { ok: false, status: 423, code: 'SECURITY_LOCKDOWN', message: 'Sicherheits-Sperre aktiv. App-Key wurde auf einem fremden Geraet benutzt. WhatsApp wurde getrennt. Erzeuge einen neuen App-Key oder loesche data/security/device-lock.json bewusst.', state };
  }

  if (!state?.fingerprintHash) {
    const newState = {
      version: 1,
      createdAt: nowIso(),
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
      fingerprintHash: current.fingerprintHash,
      deviceIdPresent: current.deviceIdPresent,
      deviceIdHash: current.deviceIdHash,
      ip: current.ip,
      userAgent: current.userAgent,
      deviceName: current.deviceName,
      deviceModel: current.deviceModel,
      platform: current.platform,
      appVersion: current.appVersion,
      compromised: false
    };
    safeJsonWrite(scopeLockFile, newState);
    audit('device_bound_first_use', req, { lockFile: scopeLockFile, accountId: scopeId });
    return { ok: true, firstUse: true, state: newState };
  }

  if (state.fingerprintHash === current.fingerprintHash) {
    const updated = { ...state, lastSeenAt: nowIso(), ip: current.ip, userAgent: current.userAgent, deviceName: current.deviceName || state.deviceName, deviceModel: current.deviceModel || state.deviceModel, platform: current.platform || state.platform, appVersion: current.appVersion || state.appVersion };
    safeJsonWrite(scopeLockFile, updated);
    return { ok: true, state: updated };
  }

  const locked = {
    ...state,
    compromised: true,
    lockedAt: nowIso(),
    reason: 'second_device_used_app_key',
    attacker: {
      ip: current.ip,
      userAgent: current.userAgent,
      deviceIdPresent: current.deviceIdPresent,
      deviceIdHash: current.deviceIdHash,
      deviceName: current.deviceName,
      deviceModel: current.deviceModel,
      platform: current.platform,
      appVersion: current.appVersion,
      fingerprintHash: current.fingerprintHash
    }
  };
  safeJsonWrite(scopeLockFile, locked);
  audit('second_device_detected_lockdown', req, { firstIp: state.ip, attackerIp: current.ip, lockFile: scopeLockFile, accountId: scopeId });
  return { ok: false, status: 423, code: 'SECOND_DEVICE_DETECTED', message: 'App-Key wurde auf einem zweiten Geraet benutzt. Aus Sicherheitsgruenden wurde WhatsApp getrennt und der Server gesperrt.', state: locked, secondDevice: current };
}

function getStatus() {
  const scopeLockFile = lockFileForScope(scopeId);
  const state = safeJsonRead(scopeLockFile);
  return {
    singleDevice: SINGLE_DEVICE,
    auditLog: AUDIT_ENABLED ? AUDIT_FILE : null,
    lockFile: scopeLockFile,
    bound: Boolean(state?.fingerprintHash),
    compromised: Boolean(state?.compromised),
    firstSeenAt: state?.firstSeenAt || null,
    lastSeenAt: state?.lastSeenAt || null,
    ip: state?.ip || null,
    deviceName: state?.deviceName || null,
    deviceModel: state?.deviceModel || null,
    appVersion: state?.appVersion || null,
    lockedAt: state?.lockedAt || null,
    reason: state?.reason || null
  };
}

module.exports = {
  LOCK_FILE,
  lockFileForScope,
  AUDIT_FILE,
  audit,
  verifySingleDevice,
  getStatus,
  deviceFromRequest
};
