const { MockProvider } = require('./mockProvider');
const { BridgeProvider } = require('./bridgeProvider');
const { WWebJSDemoProvider } = require('./wwebjsDemoProvider');
const { WWebJSProvider } = require('./wwebjsProvider');

function createProvider(options = {}) {
  const providerName = (options.providerName || process.env.PROVIDER || 'mock').toLowerCase();

  if (providerName === 'mock') {
    return new MockProvider();
  }

  if (providerName === 'bridge') {
    return new BridgeProvider();
  }

  if (providerName === 'wwebjs-demo' || providerName === 'demo-wwebjs') {
    return new WWebJSDemoProvider();
  }

  if (providerName === 'wwebjs' || providerName === 'whatsapp-web' || providerName === 'whatsapp-web-js') {
    return new WWebJSProvider(options);
  }

  throw new Error(`Unknown PROVIDER=${providerName}. Supported: mock, bridge, wwebjs-demo, wwebjs.`);
}

module.exports = { createProvider };
