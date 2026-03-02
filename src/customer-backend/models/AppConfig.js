const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const supportCategorySchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const appConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },

    branding: {
      splashTitle: { type: String, default: 'Avoid poison on your plate' },
      splashSubtitle: { type: String, default: "India's first lab-tested organic grocery app" },
      splashLogoUrl: { type: String, default: '' },
      splashBgColor: { type: String, default: '#034703' },
      splashDurationMs: { type: Number, default: 1500 },
      loginBrandName: { type: String, default: 'Selorg Organic' },
      loginSubtitle: { type: String, default: 'Fresh organic groceries delivered' },
      loginSectionTitle: { type: String, default: 'Login or Sign Up' },
      loginSectionSubtitle: { type: String, default: 'Enter your mobile number to continue' },
      loginOtpNote: { type: String, default: "We'll send you an OTP to verify your number" },
      primaryColor: { type: String, default: '#034703' },
      countryCode: { type: String, default: '+91' },
      phoneMaxLength: { type: Number, default: 10 },
    },

    otp: {
      length: { type: Number, default: 4 },
      timerDurationSec: { type: Number, default: 50 },
      maxRetries: { type: Number, default: 3 },
      headerTitle: { type: String, default: 'Verify OTP' },
      heading: { type: String, default: 'Enter Verification Code' },
      description: { type: String, default: "We've sent a 4-digit code to" },
      buttonText: { type: String, default: 'Verify & Continue' },
      resendText: { type: String, default: 'Resend OTP' },
    },

    checkout: {
      handlingCharge: { type: Number, default: 5.0 },
      deliveryFee: { type: Number, default: 0 },
      freeDeliveryMinAmount: { type: Number, default: 0 },
      minOrderAmount: { type: Number, default: 0 },
      tipAmounts: [{ type: Number }],
      deliveryInstructions: [{ type: String }],
      emptyCartTitle: { type: String, default: "Don't Risk Your Health" },
      emptyCartDescription: { type: String, default: 'Avoid poison on your plate. Choose clean, organic food for your family.' },
      emptyCartCta: { type: String, default: 'Browse healthy products' },
      paymentInfoText: { type: String, default: 'All payments are secure and encrypted' },
    },

    paymentMethods: [paymentMethodSchema],

    featureFlags: {
      showSkipButtonOnLogin: { type: Boolean, default: true },
      enableReferral: { type: Boolean, default: true },
      enableWallet: { type: Boolean, default: true },
      enableChat: { type: Boolean, default: true },
      enableRatings: { type: Boolean, default: true },
      enableCoupons: { type: Boolean, default: true },
      enableNotifications: { type: Boolean, default: true },
      maxCartItems: { type: Number, default: 50 },
    },

    appVersion: {
      currentVersion: { type: String, default: '1.0.0' },
      minVersion: { type: String, default: '1.0.0' },
      forceUpdate: { type: Boolean, default: false },
      updateMessage: { type: String, default: 'A new version is available. Please update to continue.' },
      updateUrl: { type: String, default: '' },
    },

    maintenance: {
      isActive: { type: Boolean, default: false },
      message: { type: String, default: 'We are upgrading our systems. Please check back shortly.' },
      estimatedEndTime: { type: Date, default: null },
    },

    supportCategories: [supportCategorySchema],

    search: {
      placeholder: { type: String, default: 'Search products...' },
      popularSearches: [{ type: String }],
      emptyStateTitle: { type: String, default: 'Start typing to search for products' },
      emptyStateSubtitle: { type: String, default: 'Search by name, category, or keywords' },
    },

    notifications: {
      channelsAvailable: [{
        key: { type: String },
        label: { type: String },
        description: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
      }],
      dndStartHour: { type: Number, default: 22 },
      dndEndHour: { type: Number, default: 7 },
    },

    locationTags: [{ type: String }],
  },
  { timestamps: true }
);

appConfigSchema.index({ key: 1 }, { unique: true });

const AppConfig =
  mongoose.models.CustomerAppConfig ||
  mongoose.model('CustomerAppConfig', appConfigSchema, 'systemconfigs');

const DEFAULT_APP_CONFIG = {
  key: 'default',
  branding: {
    splashTitle: 'Avoid poison on your plate',
    splashSubtitle: "India's first lab-tested organic grocery app",
    splashLogoUrl: '',
    splashBgColor: '#034703',
    splashDurationMs: 1500,
    loginBrandName: 'Selorg Organic',
    loginSubtitle: 'Fresh organic groceries delivered',
    loginSectionTitle: 'Login or Sign Up',
    loginSectionSubtitle: 'Enter your mobile number to continue',
    loginOtpNote: "We'll send you an OTP to verify your number",
    primaryColor: '#034703',
    countryCode: '+91',
    phoneMaxLength: 10,
  },
  otp: {
    length: 4,
    timerDurationSec: 50,
    maxRetries: 3,
    headerTitle: 'Verify OTP',
    heading: 'Enter Verification Code',
    description: "We've sent a 4-digit code to",
    buttonText: 'Verify & Continue',
    resendText: 'Resend OTP',
  },
  checkout: {
    handlingCharge: 5.0,
    deliveryFee: 0,
    freeDeliveryMinAmount: 0,
    minOrderAmount: 0,
    tipAmounts: [10, 20, 30],
    deliveryInstructions: ['No Contact Delivery', "Don't ring the bell", 'Pet at home'],
    emptyCartTitle: "Don't Risk Your Health",
    emptyCartDescription: 'Avoid poison on your plate. Choose clean, organic food for your family.',
    emptyCartCta: 'Browse healthy products',
    paymentInfoText: 'All payments are secure and encrypted',
  },
  paymentMethods: [
    { key: 'cash', label: 'Cash on Delivery', description: 'Pay when your order arrives', icon: 'cash', isActive: true, order: 0 },
    { key: 'card', label: 'Credit/Debit Card', description: 'Visa, Mastercard, Rupay', icon: 'card', isActive: true, order: 1 },
    { key: 'upi', label: 'UPI', description: 'Google Pay, PhonePe, Paytm', icon: 'upi', isActive: true, order: 2 },
  ],
  featureFlags: {
    showSkipButtonOnLogin: true,
    enableReferral: true,
    enableWallet: true,
    enableChat: true,
    enableRatings: true,
    enableCoupons: true,
    enableNotifications: true,
    maxCartItems: 50,
  },
  appVersion: {
    currentVersion: '1.0.0',
    minVersion: '1.0.0',
    forceUpdate: false,
    updateMessage: 'A new version is available. Please update to continue.',
    updateUrl: '',
  },
  maintenance: {
    isActive: false,
    message: 'We are upgrading our systems. Please check back shortly.',
    estimatedEndTime: null,
  },
  supportCategories: [
    { key: 'contact_support', label: 'Contact Support', description: 'Get in touch with our team', icon: 'phone', isActive: true, order: 0 },
    { key: 'general_inquiry', label: 'General Inquiry', description: 'Ask us anything', icon: 'help-circle', isActive: true, order: 1 },
    { key: 'order_issues', label: 'Order Issues', description: 'Issues with your order', icon: 'package', isActive: true, order: 2 },
    { key: 'payment_billing', label: 'Payment & Billing', description: 'Payment and billing questions', icon: 'credit-card', isActive: true, order: 3 },
    { key: 'refund_returns', label: 'Refund & Returns', description: 'Request refunds or returns', icon: 'refresh-cw', isActive: true, order: 4 },
    { key: 'delivery', label: 'Delivery', description: 'Delivery related queries', icon: 'truck', isActive: true, order: 5 },
    { key: 'account_settings', label: 'Account Settings', description: 'Manage your account', icon: 'settings', isActive: true, order: 6 },
    { key: 'feedback', label: 'Feedback', description: 'Share your feedback', icon: 'message-square', isActive: true, order: 7 },
    { key: 'app_issues', label: 'App Issues', description: 'Report technical problems', icon: 'alert-triangle', isActive: true, order: 8 },
  ],
  search: {
    placeholder: 'Search products...',
    popularSearches: ['Organic Rice', 'Fresh Vegetables', 'Ghee', 'Cold Pressed Oil'],
    emptyStateTitle: 'Start typing to search for products',
    emptyStateSubtitle: 'Search by name, category, or keywords',
  },
  notifications: {
    channelsAvailable: [
      { key: 'push', label: 'Push Notifications', description: 'Receive push notifications on your device', isActive: true },
      { key: 'sms', label: 'SMS', description: 'Receive SMS notifications', isActive: true },
      { key: 'whatsapp', label: 'WhatsApp', description: 'Get updates on WhatsApp', isActive: true },
      { key: 'email', label: 'Email', description: 'Receive email notifications', isActive: true },
    ],
    dndStartHour: 22,
    dndEndHour: 7,
  },
  locationTags: ['Home', 'Office', 'Other'],
};

module.exports = { AppConfig, DEFAULT_APP_CONFIG };
