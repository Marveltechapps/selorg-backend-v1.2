/**
 * FCM notification delivery unit tests (mocked Firebase Admin).
 * Covers order / offer / wallet / promo / multicast / invalid-token cleanup.
 */
jest.mock('../../src/customer-backend/services/firebaseAdmin', () => {
  const send = jest.fn();
  const sendEachForMulticast = jest.fn();
  return {
    ensureFirebaseAdmin: jest.fn(() => true),
    getFirebaseInitError: jest.fn(() => null),
    getFirebaseMessaging: jest.fn(() => ({ send, sendEachForMulticast })),
    __mocks: { send, sendEachForMulticast },
  };
});

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const firebaseAdmin = require('../../src/customer-backend/services/firebaseAdmin');
const {
  sendFcmNotification,
  sendMulticastFcmNotification,
  handleInvalidFcmToken,
  buildFcmDataPayload,
  resolveNavigationMeta,
} = require('../../src/customer-backend/services/notifications/fcmNotificationService');
const { PushToken } = require('../../src/customer-backend/models/PushToken');
const { sendPushNotification } = require('../../src/customer-backend/services/notificationService');
const { CustomerUser } = require('../../src/customer-backend/models/CustomerUser');
const { Notification } = require('../../src/customer-backend/models/Notification');

jest.setTimeout(120000);

let mongod;
const { send, sendEachForMulticast } = firebaseAdmin.__mocks;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Notification.syncIndexes();
  await PushToken.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  send.mockReset();
  sendEachForMulticast.mockReset();
  send.mockResolvedValue('projects/selorg-app/messages/test-1');
  sendEachForMulticast.mockResolvedValue({
    successCount: 0,
    failureCount: 0,
    responses: [],
  });
  await Promise.all([
    PushToken.deleteMany({}),
    CustomerUser.deleteMany({}),
    Notification.deleteMany({}),
  ]);
});

describe('buildFcmDataPayload / navigation', () => {
  test('includes notificationId, type, orderId, screen, deepLink', () => {
    const payload = buildFcmDataPayload({
      notificationId: 'nid-1',
      type: 'ORDER_PLACED',
      category: 'order',
      orderId: 'oid-1',
      data: { orderNumber: 'SEL-1' },
    });
    expect(payload.notificationId).toBe('nid-1');
    expect(payload.type).toBe('ORDER_PLACED');
    expect(payload.orderId).toBe('oid-1');
    expect(payload.screen).toBe('OrderStatus');
    expect(payload.deepLink).toContain('oid-1');
  });

  test('maps wallet and offers navigation', () => {
    expect(resolveNavigationMeta('WALLET_CREDIT', 'wallet').screen).toBe('Wallet');
    expect(resolveNavigationMeta('NEW_OFFER', 'offers').screen).toBe('Home');
    expect(resolveNavigationMeta('PROMOTIONAL_CAMPAIGN', 'promotional').deepLink).toBe(
      'selorg://offers'
    );
  });
});

describe('sendFcmNotification', () => {
  test('sends order placed payload via Firebase Admin', async () => {
    const result = await sendFcmNotification({
      token: 'fcm-token-order',
      title: 'Order Placed',
      body: 'Order placed successfully.',
      type: 'ORDER_PLACED',
      category: 'order',
      notificationId: 'n1',
      orderId: 'o1',
      data: { orderNumber: 'SEL-100' },
    });

    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.token).toBe('fcm-token-order');
    expect(message.notification.title).toBe('Order Placed');
    expect(message.data.type).toBe('ORDER_PLACED');
    expect(message.data.orderId).toBe('o1');
    expect(message.data.screen).toBe('OrderStatus');
    expect(message.android.notification.channelId).toBe('orders');
  });

  test('cleans up invalid registration tokens without throwing', async () => {
    const userId = new mongoose.Types.ObjectId();
    await PushToken.create({
      userId,
      token: 'bad-fcm-token',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });

    send.mockRejectedValue({
      code: 'messaging/registration-token-not-registered',
      message: 'Requested entity was not found.',
    });

    const result = await sendFcmNotification({
      token: 'bad-fcm-token',
      title: 'Order Placed',
      body: 'test',
      type: 'ORDER_PLACED',
    });

    expect(result.sent).toBe(false);
    expect(result.invalidToken).toBe(true);
    const remaining = await PushToken.find({ token: 'bad-fcm-token' });
    expect(remaining).toHaveLength(0);
  });
});

describe('sendMulticastFcmNotification', () => {
  test('delivers to multiple devices', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [
        { success: true, messageId: 'm1' },
        { success: true, messageId: 'm2' },
      ],
    });

    const result = await sendMulticastFcmNotification({
      tokens: ['fcm-a', 'fcm-b'],
      title: 'Promotional Campaign',
      body: 'Weekend deals are live',
      type: 'PROMOTIONAL_CAMPAIGN',
      category: 'promotional',
    });

    expect(result.sent).toBe(true);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.tokens).toEqual(['fcm-a', 'fcm-b']);
    expect(msg.notification.title).toBe('Promotional Campaign');
  });

  test('removes only invalid tokens in a mixed batch', async () => {
    const userId = new mongoose.Types.ObjectId();
    const good = await PushToken.create({
      userId,
      token: 'good-token',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });
    const bad = await PushToken.create({
      userId,
      token: 'bad-token',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });

    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true, messageId: 'ok' },
        {
          success: false,
          error: {
            code: 'messaging/invalid-registration-token',
            message: 'invalid',
          },
        },
      ],
    });

    const result = await sendMulticastFcmNotification({
      tokens: [
        { token: 'good-token', _id: good._id, userId },
        { token: 'bad-token', _id: bad._id, userId },
      ],
      title: 'New Offer',
      body: '10% off',
      type: 'NEW_OFFER',
      category: 'offers',
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(await PushToken.findById(good._id)).not.toBeNull();
    expect(await PushToken.findById(bad._id)).toBeNull();
  });
});

describe('handleInvalidFcmToken', () => {
  test('deactivates and deletes matching token', async () => {
    const userId = new mongoose.Types.ObjectId();
    await PushToken.create({
      userId,
      token: 'to-remove',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });

    const out = await handleInvalidFcmToken({
      token: 'to-remove',
      userId,
      code: 'messaging/registration-token-not-registered',
    });

    expect(out.removed).toBe(true);
    expect(await PushToken.countDocuments({ token: 'to-remove' })).toBe(0);
  });
});

describe('unified sendPushNotification with FCM tokens', () => {
  async function seedUserWithFcm() {
    const user = await CustomerUser.create({
      phoneNumber: `9${Date.now().toString().slice(-9)}`,
      name: 'FCM Tester',
      notificationPreferences: {
        push: true,
        inApp: true,
        sms: false,
        whatsapp: false,
        email: false,
      },
    });
    await PushToken.create({
      userId: user._id,
      token: 'fcm-user-token',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });
    return user;
  }

  test('1. Order placed notification routes to FCM', async () => {
    const user = await seedUserWithFcm();
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: 'order-1' }],
    });

    const result = await sendPushNotification(user._id, 'ORDER_PLACED', {
      orderNumber: 'SEL-ORDER',
      orderId: String(new mongoose.Types.ObjectId()),
      message: 'Order placed successfully.',
    });

    expect(result.success).toBe(true);
    expect(sendEachForMulticast).toHaveBeenCalled();
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification.title).toBe('Order Placed');
    expect(msg.data.type).toBe('ORDER_PLACED');
  });

  test('2. Offer campaign notification routes to FCM', async () => {
    const user = await seedUserWithFcm();
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: 'offer-1' }],
    });

    const result = await sendPushNotification(
      user._id,
      'NEW_OFFER',
      { message: 'Fresh veggies 20% off today' },
      { category: 'offers' }
    );

    expect(result.success).toBe(true);
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification.title).toBe('New Offer');
    expect(msg.data.category).toBe('offers');
  });

  test('3. Wallet update notification routes to FCM', async () => {
    const user = await seedUserWithFcm();
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: 'wallet-1' }],
    });

    const result = await sendPushNotification(user._id, 'WALLET_CREDIT', {
      amount: '50',
      balance: '150',
    });

    expect(result.success).toBe(true);
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification.title).toBe('Wallet Update');
    expect(msg.data.screen).toBe('Wallet');
  });

  test('4. Promotional notification routes to FCM', async () => {
    const user = await seedUserWithFcm();
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: 'promo-1' }],
    });

    const result = await sendPushNotification(user._id, 'PROMOTIONAL_CAMPAIGN', {
      message: 'Festival sale is live',
    });

    expect(result.success).toBe(true);
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.notification.title).toBe('Promotional Campaign');
  });

  test('5. Multiple device notification', async () => {
    const user = await seedUserWithFcm();
    await PushToken.create({
      userId: user._id,
      token: 'fcm-user-token-2',
      platform: 'android',
      tokenType: 'fcm',
      active: true,
    });

    sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [
        { success: true, messageId: 'd1' },
        { success: true, messageId: 'd2' },
      ],
    });

    const result = await sendPushNotification(user._id, 'ORDER_CONFIRMED', {
      orderNumber: 'SEL-MULTI',
      orderId: String(new mongoose.Types.ObjectId()),
    });

    expect(result.success).toBe(true);
    const msg = sendEachForMulticast.mock.calls[0][0];
    expect(msg.tokens).toHaveLength(2);
    expect(msg.notification.title).toBe('Order Confirmed');
  });

  test('Expo tokens still use Expo path (not FCM multicast)', async () => {
    const user = await CustomerUser.create({
      phoneNumber: `8${Date.now().toString().slice(-9)}`,
      name: 'Expo Tester',
      notificationPreferences: {
        push: true,
        inApp: true,
        sms: false,
        whatsapp: false,
        email: false,
      },
    });
    await PushToken.create({
      userId: user._id,
      token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      platform: 'android',
      tokenType: 'expo',
      active: true,
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ data: [{ status: 'ok' }] }),
    });

    try {
      const result = await sendPushNotification(user._id, 'ORDER_DELIVERED', {
        orderNumber: 'SEL-EXPO',
        orderId: String(new mongoose.Types.ObjectId()),
      });
      expect(result.success).toBe(true);
      expect(sendEachForMulticast).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
      const url = global.fetch.mock.calls[0][0];
      expect(String(url)).toContain('exp.host');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
