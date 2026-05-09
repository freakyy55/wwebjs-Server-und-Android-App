'use strict';

console.log('OwnMessengerServer - wwebjs dependency check');
console.log('Node:', process.version);

try {
  const pkg = require('whatsapp-web.js/package.json');
  const wwebjs = require('whatsapp-web.js');
  require('qrcode-terminal');

  console.log('whatsapp-web.js:', pkg.version);
  console.log('qrcode-terminal: geladen');
  console.log('Exports:', Object.keys(wwebjs).sort().join(', '));
  console.log('OK: Dependencies sind installiert und koennen geladen werden.');
  console.log('Hinweis: Dieser Check startet keinen WhatsApp-Web-Login und initialisiert keinen echten Client.');
} catch (err) {
  console.error('FEHLER: wwebjs/qrcode-terminal konnte nicht geladen werden.');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
