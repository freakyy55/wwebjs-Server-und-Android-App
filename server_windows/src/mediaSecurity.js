const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const UPLOAD_ROOT = path.resolve(PROJECT_ROOT, process.env.UPLOAD_DIR || './uploads');
const INCOMING_DIR = path.join(UPLOAD_ROOT, '_incoming');
const SAFE_DIR = path.join(UPLOAD_ROOT, 'safe');
const QUARANTINE_DIR = path.join(UPLOAD_ROOT, 'quarantine');

for (const dir of [UPLOAD_ROOT, INCOMING_DIR, SAFE_DIR, QUARANTINE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.dll', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.hta', '.html', '.htm', '.svg', '.jar', '.apk', '.sh', '.php', '.py', '.rb', '.pl', '.lnk', '.reg'
]);

const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.txt', '.docx', '.xlsx', '.pptx', '.csv']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.m4a', '.mp3', '.ogg', '.opus', '.aac', '.wav', '.amr', '.3gp', '.3gpp', '.webm']);
const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.3gp', '.3gpp', '.webm', '.mov']);
const MAX_MEDIA_BYTES = Number(process.env.SECURE_MEDIA_MAX_MB || process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024;
const MAX_IMAGE_DIMENSION = Number(process.env.SECURE_MEDIA_MAX_IMAGE_DIMENSION || 4096);
const IMAGE_JPEG_QUALITY = Math.max(70, Math.min(100, Number(process.env.SECURE_MEDIA_IMAGE_JPEG_QUALITY || process.env.SECURE_MEDIA_IMAGE_QUALITY || 95)));
const IMAGE_WEBP_QUALITY = Math.max(70, Math.min(100, Number(process.env.SECURE_MEDIA_IMAGE_WEBP_QUALITY || process.env.SECURE_MEDIA_IMAGE_QUALITY || 95)));
const IMAGE_PNG_COMPRESSION = Math.max(0, Math.min(9, Number(process.env.SECURE_MEDIA_IMAGE_PNG_COMPRESSION || 6)));
const IMAGE_WITHOUT_CHROMA_SUBSAMPLING = String(process.env.SECURE_MEDIA_IMAGE_NO_CHROMA_SUBSAMPLING || '1').toLowerCase() !== '0';
const ALLOW_DOCUMENTS = String(process.env.SECURE_MEDIA_ALLOW_DOCUMENTS || '0').toLowerCase() === '1' || String(process.env.SECURE_MEDIA_ALLOW_DOCUMENTS || '').toLowerCase() === 'true';
const REQUIRE_REENCODE = String(process.env.SECURE_MEDIA_REQUIRE_REENCODE || '0').toLowerCase() === '1' || String(process.env.SECURE_MEDIA_REQUIRE_REENCODE || '').toLowerCase() === 'true';

function safeBaseName(name, fallback = 'file') {
  const cleaned = String(name || fallback)
    .replace(/[/\\?%*:|"<>\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  return cleaned || fallback;
}

function sniffMagic(filePath) {
  const buf = Buffer.alloc(128);
  const fd = fs.openSync(filePath, 'r');
  let len = 0;
  try {
    len = fs.readSync(fd, buf, 0, 128, 0);
  } finally {
    fs.closeSync(fd);
  }
  const b = buf.subarray(0, len);
  const ascii = b.toString('latin1');
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mimeType: 'image/jpeg', extension: '.jpg', kind: 'image' };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mimeType: 'image/png', extension: '.png', kind: 'image' };
  if (ascii.startsWith('RIFF') && ascii.includes('WEBP')) return { mimeType: 'image/webp', extension: '.webp', kind: 'image' };
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return { mimeType: 'image/gif', extension: '.gif', kind: 'image' };
  if (ascii.startsWith('ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mimeType: 'audio/mpeg', extension: '.mp3', kind: 'audio' };
  if (ascii.startsWith('OggS')) return { mimeType: 'audio/ogg', extension: '.ogg', kind: 'audio' };
  if (ascii.startsWith('RIFF') && ascii.includes('WAVE')) return { mimeType: 'audio/wav', extension: '.wav', kind: 'audio' };
  if (ascii.startsWith('#!AMR')) return { mimeType: 'audio/amr', extension: '.amr', kind: 'audio' };
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mimeType: 'video/webm', extension: '.webm', kind: 'video' };
  if (ascii.slice(4, 12).includes('ftyp')) return { mimeType: 'application/mp4', extension: '.mp4', kind: 'media' };
  if (ascii.startsWith('%PDF-')) return { mimeType: 'application/pdf', extension: '.pdf', kind: 'document' };
  if (ascii.startsWith('PK\x03\x04') || (b[0] === 0x50 && b[1] === 0x4b)) return { mimeType: 'application/zip', extension: '.zip', kind: 'archive' };
  if (ascii.trimStart().startsWith('{') || ascii.trimStart().startsWith('[')) return { mimeType: 'application/json', extension: '.json', kind: 'text' };
  return { mimeType: 'application/octet-stream', extension: '', kind: 'unknown' };
}

function cleanMime(mime) {
  return String(mime || '').toLowerCase().split(';')[0].trim();
}

function extensionFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/amr': '.amr',
    'audio/3gpp': '.3gp',
    'audio/webm': '.webm',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
  };
  return map[cleanMime(mime)] || '';
}

function messageTypeForMime(mime) {
  const m = cleanMime(mime);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}

function chooseFinalMime(magic, originalMimeType, ext) {
  const claimed = cleanMime(originalMimeType);
  if (magic.mimeType === 'application/mp4') {
    if (claimed.startsWith('audio/')) return claimed;
    if (claimed.startsWith('video/')) return claimed;
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext)) return 'audio/mp4';
    return 'video/mp4';
  }
  if (magic.mimeType === 'video/webm' && (claimed === 'audio/webm' || ALLOWED_AUDIO_EXTENSIONS.has(ext))) return 'audio/webm';
  if (magic.mimeType === 'audio/ogg' && claimed === 'audio/opus') return 'audio/ogg';
  if (claimed.startsWith('audio/') && (magic.kind === 'audio' || magic.kind === 'media' || magic.kind === 'unknown')) return claimed;
  if (claimed.startsWith('video/') && (magic.kind === 'video' || magic.kind === 'media' || magic.kind === 'unknown')) return claimed;
  return magic.mimeType;
}

function runTool(command, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code, message: err?.message || '', output: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}

async function runClamScan(filePath) {
  const enabled = String(process.env.SECURE_MEDIA_CLAMAV || 'auto').toLowerCase();
  if (enabled === '0' || enabled === 'false' || enabled === 'off') {
    return { available: false, status: 'skipped', result: 'disabled' };
  }
  const clamscan = process.env.CLAMSCAN_PATH || 'clamscan';
  const result = await runTool(clamscan, ['--no-summary', filePath], Number(process.env.SECURE_MEDIA_CLAMAV_TIMEOUT_MS || 20000));
  if (result.ok) return { available: true, status: 'clean', result: result.output || 'OK' };
  if (result.code === 1) return { available: true, status: 'infected', result: result.output || 'INFECTED' };
  if (enabled === '1' || enabled === 'true' || enabled === 'required') return { available: false, status: 'error', result: result.output || result.message };
  return { available: false, status: 'not_available', result: result.output || result.message };
}

function quarantine(filePath, reason, originalName) {
  const ext = path.extname(originalName || filePath) || '.bin';
  const name = `${Date.now()}_${randomUUID()}_${safeBaseName(path.basename(originalName || 'blocked'))}${ext}`;
  const dest = path.join(QUARANTINE_DIR, name);
  try {
    fs.renameSync(filePath, dest);
  } catch (_) {
    try { fs.copyFileSync(filePath, dest); fs.unlinkSync(filePath); } catch (_) {}
  }
  return { path: dest, fileName: name, reason };
}

async function reencodeImage(inputPath, outputBase, mimeType) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    if (String(process.env.SECURE_MEDIA_REQUIRE_IMAGE_REENCODE || '1') !== '0') throw error;
    return null;
  }

  const m = cleanMime(mimeType);
  let outExt = '.jpg';
  let pipeline = sharp(inputPath, { failOn: 'warning', animated: false })
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true });

  if (m === 'image/png') {
    outExt = '.png';
    pipeline = pipeline.png({ compressionLevel: IMAGE_PNG_COMPRESSION, adaptiveFiltering: true });
  } else if (m === 'image/webp') {
    outExt = '.webp';
    pipeline = pipeline.webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 });
  } else {
    outExt = '.jpg';
    pipeline = pipeline.jpeg({ quality: IMAGE_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: IMAGE_WITHOUT_CHROMA_SUBSAMPLING ? '4:4:4' : '4:2:0' });
  }

  const safeName = `${outputBase}${outExt}`;
  const safePath = path.join(SAFE_DIR, safeName);
  await pipeline.toFile(safePath); // sharp strips EXIF/GPS/metadata unless withMetadata() is used.
  return { safePath, safeName, mimeType: outExt === '.png' ? 'image/png' : outExt === '.webp' ? 'image/webp' : 'image/jpeg' };
}

async function reencodeAudio(inputPath, outputBase) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

  // WhatsApp-Sprachnachrichten sind am zuverlaessigsten als OGG/Opus.
  // M4A/AAC wird von WhatsApp Web zwar oft hochgeladen, erscheint auf dem Handy
  // aber manchmal als "Audio nicht verfuegbar". Deshalb erzeugen wir hier
  // direkt das native Voice-Note-Format und entfernen dabei Metadaten.
  const opusName = `${outputBase}.ogg`;
  const opusPath = path.join(SAFE_DIR, opusName);
  const opusResult = await runTool(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-map_metadata', '-1',
    '-vn',
    '-ac', '1',
    '-ar', '48000',
    '-c:a', 'libopus',
    '-b:a', '32k',
    '-application', 'voip',
    '-f', 'ogg',
    opusPath
  ], Number(process.env.SECURE_MEDIA_FFMPEG_TIMEOUT_MS || 60000));
  if (opusResult.ok) {
    return { ok: true, safePath: opusPath, safeName: opusName, mimeType: 'audio/ogg; codecs=opus' };
  }
  try { fs.unlinkSync(opusPath); } catch (_) {}

  // Fallback, falls ein altes/kleines ffmpeg ohne libopus verwendet wird.
  const aacName = `${outputBase}.m4a`;
  const aacPath = path.join(SAFE_DIR, aacName);
  const aacResult = await runTool(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-map_metadata', '-1',
    '-vn',
    '-c:a', 'aac',
    '-b:a', '96k',
    aacPath
  ], Number(process.env.SECURE_MEDIA_FFMPEG_TIMEOUT_MS || 60000));
  if (!aacResult.ok) {
    try { fs.unlinkSync(aacPath); } catch (_) {}
    return { ok: false, error: opusResult.output || opusResult.message || aacResult.output || aacResult.message || 'ffmpeg_audio_failed' };
  }
  return { ok: true, safePath: aacPath, safeName: aacName, mimeType: 'audio/mp4' };
}

async function reencodeVideo(inputPath, outputBase) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const safeName = `${outputBase}.mp4`;
  const safePath = path.join(SAFE_DIR, safeName);
  const result = await runTool(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    safePath
  ], Number(process.env.SECURE_MEDIA_FFMPEG_TIMEOUT_MS || 120000));
  if (!result.ok) {
    try { fs.unlinkSync(safePath); } catch (_) {}
    return { ok: false, error: result.output || result.message || 'ffmpeg_video_failed' };
  }
  return { ok: true, safePath, safeName, mimeType: 'video/mp4' };
}

async function sanitizeMediaFile(inputPath, options = {}) {
  const originalName = options.originalName || path.basename(inputPath);
  const originalMimeType = options.claimedMime || options.mimeType || 'application/octet-stream';
  const source = options.source || 'upload';
  const stat = fs.statSync(inputPath);
  const ext = path.extname(originalName).toLowerCase();
  const base = safeBaseName(path.basename(originalName, ext), 'media');
  const magic = sniffMagic(inputPath);
  const finalDetectedMime = chooseFinalMime(magic, originalMimeType, ext);

  const report = {
    ok: false,
    blocked: false,
    source,
    originalName,
    originalMimeType,
    detectedMimeType: finalDetectedMime,
    detectedExtension: magic.extension,
    size: stat.size,
    scanStatus: 'pending',
    scanResult: '',
    metadataStripped: false,
    reencoded: false,
    notes: []
  };

  if (stat.size > MAX_MEDIA_BYTES) {
    const q = quarantine(inputPath, 'file_too_large', originalName);
    return { ...report, blocked: true, scanStatus: 'blocked', scanResult: 'file_too_large', quarantinePath: q.path };
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    const q = quarantine(inputPath, `blocked_extension:${ext}`, originalName);
    return { ...report, blocked: true, scanStatus: 'blocked', scanResult: `blocked_extension:${ext}`, quarantinePath: q.path };
  }

  if (magic.mimeType === 'image/svg+xml' || ext === '.svg') {
    const q = quarantine(inputPath, 'svg_blocked', originalName);
    return { ...report, blocked: true, scanStatus: 'blocked', scanResult: 'svg_blocked', quarantinePath: q.path };
  }

  const isImage = ALLOWED_IMAGE_MIMES.has(finalDetectedMime);
  const isAudio = finalDetectedMime.startsWith('audio/') && (ALLOWED_AUDIO_EXTENSIONS.has(ext) || extensionFromMime(finalDetectedMime));
  const isVideo = finalDetectedMime.startsWith('video/') && (ALLOWED_VIDEO_EXTENSIONS.has(ext) || extensionFromMime(finalDetectedMime));
  const isAllowedDocument = ALLOWED_DOCUMENT_EXTENSIONS.has(ext);

  if (!isImage && !isAudio && !isVideo && !(ALLOW_DOCUMENTS && isAllowedDocument)) {
    const reason = isAllowedDocument && !ALLOW_DOCUMENTS ? 'documents_blocked_by_default' : `unsupported_file_type:${ext || finalDetectedMime}`;
    const q = quarantine(inputPath, reason, originalName);
    return { ...report, blocked: true, scanStatus: 'blocked', scanResult: reason, quarantinePath: q.path };
  }

  const clam = await runClamScan(inputPath);
  report.scanStatus = clam.status;
  report.scanResult = clam.result;
  if (clam.status === 'infected' || clam.status === 'error') {
    const q = quarantine(inputPath, `clamav:${clam.status}`, originalName);
    return { ...report, blocked: true, quarantinePath: q.path };
  }

  const outputBase = `${Date.now()}_${randomUUID()}_${base}`.slice(0, 180);
  let safePath = null;
  let safeName = null;
  let finalMime = finalDetectedMime;

  if (isImage) {
    try {
      const converted = await reencodeImage(inputPath, outputBase, finalDetectedMime);
      if (converted) {
        safePath = converted.safePath;
        safeName = converted.safeName;
        finalMime = converted.mimeType;
        report.reencoded = true;
        report.metadataStripped = true;
        try { fs.unlinkSync(inputPath); } catch (_) {}
      } else {
        throw new Error('image_reencode_not_available');
      }
    } catch (error) {
      const q = quarantine(inputPath, `image_reencode_failed:${error.message}`, originalName);
      return { ...report, blocked: true, scanStatus: 'blocked', scanResult: `image_reencode_failed:${error.message}`, quarantinePath: q.path };
    }
  } else if (isAudio) {
    const converted = await reencodeAudio(inputPath, outputBase);
    if (converted.ok) {
      safePath = converted.safePath;
      safeName = converted.safeName;
      finalMime = converted.mimeType;
      report.reencoded = true;
      report.metadataStripped = true;
      try { fs.unlinkSync(inputPath); } catch (_) {}
    } else if (REQUIRE_REENCODE) {
      const q = quarantine(inputPath, `audio_reencode_failed:${converted.error}`, originalName);
      return { ...report, blocked: true, scanStatus: 'blocked', scanResult: `audio_reencode_failed:${converted.error}`, quarantinePath: q.path };
    } else {
      const outExt = ext || extensionFromMime(finalMime) || magic.extension || '.m4a';
      safeName = `${outputBase}${outExt}`;
      safePath = path.join(SAFE_DIR, safeName);
      fs.copyFileSync(inputPath, safePath);
      try { fs.unlinkSync(inputPath); } catch (_) {}
      report.notes.push(`ffmpeg_not_available_audio_scanned_only:${converted.error}`);
    }
  } else if (isVideo) {
    const converted = await reencodeVideo(inputPath, outputBase);
    if (converted.ok) {
      safePath = converted.safePath;
      safeName = converted.safeName;
      finalMime = converted.mimeType;
      report.reencoded = true;
      report.metadataStripped = true;
      try { fs.unlinkSync(inputPath); } catch (_) {}
    } else if (REQUIRE_REENCODE) {
      const q = quarantine(inputPath, `video_reencode_failed:${converted.error}`, originalName);
      return { ...report, blocked: true, scanStatus: 'blocked', scanResult: `video_reencode_failed:${converted.error}`, quarantinePath: q.path };
    } else {
      const outExt = ext || extensionFromMime(finalMime) || magic.extension || '.mp4';
      safeName = `${outputBase}${outExt}`;
      safePath = path.join(SAFE_DIR, safeName);
      fs.copyFileSync(inputPath, safePath);
      try { fs.unlinkSync(inputPath); } catch (_) {}
      report.notes.push(`ffmpeg_not_available_video_scanned_only:${converted.error}`);
    }
  } else {
    // Documents are disabled by default. If SECURE_MEDIA_ALLOW_DOCUMENTS=1 is set, they are scanned/renamed only.
    const outExt = ext || extensionFromMime(finalMime) || magic.extension || '.bin';
    safeName = `${outputBase}${outExt}`;
    safePath = path.join(SAFE_DIR, safeName);
    fs.copyFileSync(inputPath, safePath);
    try { fs.unlinkSync(inputPath); } catch (_) {}
    report.notes.push('document_allowed_by_env_scanned_and_renamed_metadata_not_guaranteed');
  }

  const safeStat = fs.statSync(safePath);
  return {
    ...report,
    ok: true,
    blocked: false,
    scanStatus: report.scanStatus || 'clean',
    safePath,
    safeName,
    safeMediaUrl: `/uploads/safe/${safeName}`,
    mediaUrl: `/uploads/safe/${safeName}`,
    mimeType: finalMime,
    fileSize: safeStat.size,
    messageType: messageTypeForMime(finalMime)
  };
}

module.exports = {
  UPLOAD_ROOT,
  INCOMING_DIR,
  SAFE_DIR,
  QUARANTINE_DIR,
  sanitizeMediaFile,
  messageTypeForMime,
  safeBaseName
};
