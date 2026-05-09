const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');

const helper = require('./helper');
const Chat = require('../src/structures/Chat');
const Contact = require('../src/structures/Contact');
const Message = require('../src/structures/Message');
const MessageMedia = require('../src/structures/MessageMedia');
const Location = require('../src/structures/Location');
const { MessageTypes, DefaultOptions } = require('../src/util/Constants');

const expect = chai.expect;
chai.use(chaiAsPromised);

const remoteId = helper.remoteId;
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('wwebjs-demo Client compatibility and connection checks', function () {
  beforeEach(function () {
    helper.resetAndSeed();
  });

  describe('User Agent', function () {
    it('should set user agent on browser', async function () {
      const client = helper.createClient();
      await client.initialize();

      const browserUA = await client.pupBrowser.userAgent();
      expect(browserUA).to.equal(DefaultOptions.userAgent);

      const pageUA = await client.pupPage.evaluate(() => window.navigator.userAgent);
      expect(pageUA).to.equal(DefaultOptions.userAgent);

      await client.destroy();
    });

    it('should set custom user agent on browser', async function () {
      const customUA = DefaultOptions.userAgent.replace(/Chrome\/.* /, 'Chrome/99.9.9999.999 ');
      const client = helper.createClient({ options: { userAgent: customUA } });

      await client.initialize();

      const browserUA = await client.pupBrowser.userAgent();
      expect(browserUA).to.equal(customUA);
      expect(browserUA.includes('Chrome/99.9.9999.999')).to.equal(true);

      const pageUA = await client.pupPage.evaluate(() => window.navigator.userAgent);
      expect(pageUA).to.equal(customUA);

      await client.destroy();
    });

    it('should respect an existing user agent arg', async function () {
      const customUA = DefaultOptions.userAgent.replace(/Chrome\/.* /, 'Chrome/99.9.9999.999 ');
      const client = helper.createClient({ options: { puppeteer: { args: [`--user-agent=${customUA}`] } } });

      await client.initialize();

      const browserUA = await client.pupBrowser.userAgent();
      expect(browserUA).to.equal(customUA);
      expect(browserUA.includes('Chrome/99.9.9999.999')).to.equal(true);

      const pageUA = await client.pupPage.evaluate(() => window.navigator.userAgent);
      expect(pageUA).to.equal(DefaultOptions.userAgent);

      await client.destroy();
    });
  });

  describe('Authentication', function () {
    it('should emit demo QR code if not authenticated', async function () {
      const callback = sinon.spy();
      const client = helper.createClient();
      client.on('qr', callback);

      await client.initialize();
      await helper.sleep(20);

      expect(callback.called).to.equal(true);
      expect(callback.args[0][0]).to.have.length.greaterThanOrEqual(152);

      await client.destroy();
    });

    it('should disconnect after reaching max qr retries', async function () {
      const qrCallback = sinon.spy();
      const disconnectedCallback = sinon.spy();
      const client = helper.createClient({ options: { qrMaxRetries: 2 } });
      client.on('qr', qrCallback);
      client.on('disconnected', disconnectedCallback);

      await client.initialize();
      await helper.sleep(80);

      expect(qrCallback.callCount).to.be.greaterThanOrEqual(3);
      expect(disconnectedCallback.calledWith('Max qrcode retries reached')).to.equal(true);
    });

    it('should authenticate with existing demo session', async function () {
      const authenticatedCallback = sinon.spy();
      const qrCallback = sinon.spy();
      const readyCallback = sinon.spy();
      const client = helper.createClient({ authenticated: true });

      client.on('qr', qrCallback);
      client.on('authenticated', authenticatedCallback);
      client.on('ready', readyCallback);

      await client.initialize();

      expect(authenticatedCallback.called).to.equal(true);
      expect(readyCallback.called).to.equal(true);
      expect(qrCallback.called).to.equal(false);
      expect(await client.getState()).to.equal('CONNECTED');

      await client.destroy();
    });
  });

  describe('Authenticated', function () {
    let client;

    beforeEach(async function () {
      client = helper.createClient({ authenticated: true });
      await client.initialize();
    });

    afterEach(async function () {
      await client.destroy();
    });

    it('can get current WhatsApp Web demo version', async function () {
      const version = await client.getWWebVersion();
      expect(typeof version).to.equal('string');
      expect(version).to.include('demo');
    });

    describe('Send Messages', function () {
      it('can send a message', async function () {
        const msg = await client.sendMessage(remoteId, 'hello world');
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.TEXT);
        expect(msg.fromMe).to.equal(true);
        expect(msg.body).to.equal('hello world');
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a media message', async function () {
        const media = new MessageMedia('image/png', tinyPngBase64);
        const msg = await client.sendMessage(remoteId, media, { caption: "here's my media" });
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.IMAGE);
        expect(msg.fromMe).to.equal(true);
        expect(msg.hasMedia).to.equal(true);
        expect(msg.body).to.equal("here's my media");
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a media message from URL', async function () {
        const media = await MessageMedia.fromUrl('https://via.placeholder.com/350x150.png');
        const msg = await client.sendMessage(remoteId, media);
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.IMAGE);
        expect(msg.fromMe).to.equal(true);
        expect(msg.hasMedia).to.equal(true);
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a media message as a document', async function () {
        const media = new MessageMedia('image/png', tinyPngBase64, 'this is my filename.png');
        const msg = await client.sendMessage(remoteId, media, { sendMediaAsDocument: true });
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.DOCUMENT);
        expect(msg.fromMe).to.equal(true);
        expect(msg.hasMedia).to.equal(true);
        expect(msg.body).to.equal('this is my filename.png');
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a sticker message', async function () {
        const media = new MessageMedia('image/png', tinyPngBase64);
        const msg = await client.sendMessage(remoteId, media, { sendMediaAsSticker: true });
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.STICKER);
        expect(msg.fromMe).to.equal(true);
        expect(msg.hasMedia).to.equal(true);
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a sticker message with custom author and name', async function () {
        const media = new MessageMedia('image/png', tinyPngBase64);
        const msg = await client.sendMessage(remoteId, media, { sendMediaAsSticker: true, stickerAuthor: 'WWEBJS', stickerName: 'My Sticker' });
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.STICKER);
        expect(msg.fromMe).to.equal(true);
        expect(msg.hasMedia).to.equal(true);
        expect(msg.to).to.equal(remoteId);
      });

      it('can send a location message', async function () {
        const location = new Location(37.422, -122.084, 'Googleplex\nGoogle Headquarters');
        const msg = await client.sendMessage(remoteId, location);
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.LOCATION);
        expect(msg.fromMe).to.equal(true);
        expect(msg.to).to.equal(remoteId);
        expect(msg.location).to.be.instanceOf(Location);
        expect(msg.location.latitude).to.equal(37.422);
        expect(msg.location.longitude).to.equal(-122.084);
        expect(msg.location.description).to.equal('Googleplex\nGoogle Headquarters');
      });

      it('can send a vCard as a contact card message', async function () {
        const vCard = `BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=UTF-8:John Doe\nN;CHARSET=UTF-8:Doe;John;;;\nEMAIL;CHARSET=UTF-8;type=HOME,INTERNET:john@doe.com\nTEL;TYPE=HOME,VOICE:1234567890\nREV:2021-06-06T02:35:53.559Z\nEND:VCARD`;
        const msg = await client.sendMessage(remoteId, vCard);
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.CONTACT_CARD);
        expect(msg.fromMe).to.equal(true);
        expect(msg.to).to.equal(remoteId);
        expect(msg.body).to.equal(vCard);
        expect(msg.vCards).to.have.lengthOf(1);
        expect(msg.vCards[0]).to.equal(vCard);
      });

      it('can optionally turn off vCard parsing', async function () {
        const vCard = `BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=UTF-8:John Doe\nEND:VCARD`;
        const msg = await client.sendMessage(remoteId, vCard, { parseVCards: false });
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.TEXT);
        expect(msg.fromMe).to.equal(true);
        expect(msg.to).to.equal(remoteId);
        expect(msg.body).to.equal(vCard);
      });

      it('can send a Contact as a contact card message', async function () {
        const contact = await client.getContactById(remoteId);
        const msg = await client.sendMessage(remoteId, contact);
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.CONTACT_CARD);
        expect(msg.fromMe).to.equal(true);
        expect(msg.to).to.equal(remoteId);
        expect(msg.body).to.match(/BEGIN:VCARD/);
        expect(msg.vCards).to.have.lengthOf(1);
        expect(msg.vCards[0]).to.match(/BEGIN:VCARD/);
      });

      it('can send multiple Contacts as a contact card message', async function () {
        const contact1 = await client.getContactById(remoteId);
        const contact2 = await client.getContactById('5511942167462@c.us');
        const msg = await client.sendMessage(remoteId, [contact1, contact2]);
        expect(msg).to.be.instanceOf(Message);
        expect(msg.type).to.equal(MessageTypes.CONTACT_CARD_MULTI);
        expect(msg.fromMe).to.equal(true);
        expect(msg.to).to.equal(remoteId);
        expect(msg.vCards).to.have.lengthOf(2);
        expect(msg.vCards[0]).to.match(/BEGIN:VCARD/);
        expect(msg.vCards[1]).to.match(/BEGIN:VCARD/);
      });
    });

    describe('Get Chats', function () {
      it('can get a chat by its ID', async function () {
        const chat = await client.getChatById(remoteId);
        expect(chat).to.be.instanceOf(Chat);
        expect(chat.id._serialized).to.eql(remoteId);
        expect(chat.isGroup).to.eql(false);
      });

      it('can get all chats', async function () {
        const chats = await client.getChats();
        expect(chats.length).to.be.greaterThanOrEqual(1);
        const chat = chats.find((c) => c.id._serialized === remoteId);
        expect(chat).to.exist;
        expect(chat).to.be.instanceOf(Chat);
      });
    });

    describe('Get Contacts', function () {
      it('can get a contact by its ID', async function () {
        const contact = await client.getContactById(remoteId);
        expect(contact).to.be.instanceOf(Contact);
        expect(contact.id._serialized).to.eql(remoteId);
        expect(contact.number).to.eql(remoteId.split('@')[0]);
      });

      it('can get all contacts', async function () {
        const contacts = await client.getContacts();
        expect(contacts.length).to.be.greaterThanOrEqual(1);
        const contact = contacts.find((c) => c.id._serialized === remoteId);
        expect(contact).to.exist;
        expect(contact).to.be.instanceOf(Contact);
      });

      it('can block and unblock a contact', async function () {
        const contact = await client.getContactById(remoteId);
        await contact.block();
        const refreshedContact = await client.getContactById(remoteId);
        expect(refreshedContact.isBlocked).to.eql(true);
        const blockedContacts = await client.getBlockedContacts();
        expect(blockedContacts.find((c) => c.id._serialized === remoteId)).to.exist;
        await contact.unblock();
        const unblockedContact = await client.getContactById(remoteId);
        expect(unblockedContact.isBlocked).to.eql(false);
      });
    });

    describe('Numbers and Users', function () {
      it('can verify users and format numbers', async function () {
        expect(await client.isRegisteredUser(remoteId)).to.be.true;
        expect(await client.isRegisteredUser('9999999999@c.us')).to.be.false;
        const number = remoteId.split('@')[0];
        expect(await client.getNumberId(number)).to.eql({ server: 'c.us', user: number, _serialized: `${number}@c.us` });
        expect(await client.getNumberId('9999999999')).to.eql(null);
        expect(await client.getCountryCode('18092201111')).to.eql('1');
        expect(await client.getFormattedNumber('18092201111')).to.eql('+1 (809) 220-1111');
        expect(await client.getFormattedNumber('18092201111@c.us')).to.eql('+1 (809) 220-1111');
      });
    });

    describe('Search messages', function () {
      it('can search for messages', async function () {
        const m1 = await client.sendMessage(remoteId, "I'm searching for Super Mario Brothers");
        const m2 = await client.sendMessage(remoteId, 'This also contains Mario');
        const m3 = await client.sendMessage(remoteId, 'Nothing of interest here, just Luigi');
        await helper.sleep(10);
        const msgs = await client.searchMessages('Mario', { chatId: remoteId });
        expect(msgs.length).to.be.greaterThanOrEqual(2);
        const msgIds = msgs.map((m) => m.id._serialized);
        expect(msgIds).to.include.members([m1.id._serialized, m2.id._serialized]);
        expect(msgIds).to.not.include.members([m3.id._serialized]);
      });
    });

    describe('Status/About', function () {
      it('can set status text', async function () {
        const me = await client.getContactById(client.info.wid._serialized);
        const previousStatus = await me.getAbout();
        await client.setStatus('My shiny new status');
        expect(await me.getAbout()).to.eql('My shiny new status');
        await client.setStatus('Busy');
        expect(await me.getAbout()).to.eql('Busy');
        await client.setStatus(previousStatus);
      });
    });
  });
});
