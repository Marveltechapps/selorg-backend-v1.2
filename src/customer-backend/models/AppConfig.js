const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** Optional CMS-managed image URL (preferred over Lucide icon key when set). */
  imageUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const supportCategorySchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** Optional CMS-managed image URL (preferred over Lucide icon key when set). */
  imageUrl: { type: String, default: '' },
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
      cancelReasons: [{ type: String }],
      ratingTags: [{ type: String }],
      emptyCartTitle: { type: String, default: "Don't Risk Your Health" },
      emptyCartDescription: { type: String, default: 'Avoid poison on your plate. Choose clean, organic food for your family.' },
      emptyCartCta: { type: String, default: 'Browse healthy products' },
      paymentInfoText: { type: String, default: 'All payments are secure and encrypted' },
    },

    wallet: {
      topUpAmounts: [{ type: Number }],
      maxTopUpAmount: { type: Number, default: 10000 },
      /** Optional illustration for wallet screen / empty wallet. */
      imageUrl: { type: String, default: '' },
    },

    catalog: {
      defaultCollectionKey: { type: String, default: '' },
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

    support: {
      contactPhone: { type: String, default: '+919444183378' },
      contactEmail: { type: String, default: 'support@selorg.com' },
      /** Aliases exposed to mobile/web apps */
      supportPhone: { type: String, default: '+919444183378' },
      supportEmail: { type: String, default: 'support@selorg.com' },
      whatsappNumber: { type: String, default: '+919444183378' },
      workingHours: { type: String, default: 'Mon–Sat, 9:00 AM – 8:00 PM IST' },
      responseTime: { type: String, default: 'Typically within 2–4 hours on business days' },
      liveChatEnabled: { type: Boolean, default: true },
    },

    payment: {
      upiMerchantId: { type: String, default: 'merchant@upi' },
      upiMerchantName: { type: String, default: 'SelOrg' },
      upiApps: [{
        id: { type: String },
        name: { type: String },
        scheme: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
      }],
      showOtherUpiOption: { type: Boolean, default: true },
    },

    images: {
      placeholderUrl: { type: String, default: '' },
      outOfStockImageUrl: { type: String, default: '' },
      emptyCartImageUrl: { type: String, default: '' },
      emptyOrdersImageUrl: { type: String, default: '' },
      emptyNotificationsImageUrl: { type: String, default: '' },
      emptySearchImageUrl: { type: String, default: '' },
      emptyWishlistImageUrl: { type: String, default: '' },
      errorImageUrl: { type: String, default: '' },
      noProductsImageUrl: { type: String, default: '' },
    },

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
    cancelReasons: [
      'Ordered by mistake',
      'Delivery is taking too long',
      'Found a better price elsewhere',
      'Want to change items or address',
      'Other reason',
    ],
    ratingTags: [
      'Fast delivery',
      'Fair prices',
      'Friendly partner',
      'On-time delivery',
      'Poor support',
      'High prices',
    ],
    emptyCartTitle: "Don't Risk Your Health",
    emptyCartDescription: 'Avoid poison on your plate. Choose clean, organic food for your family.',
    emptyCartCta: 'Browse healthy products',
    paymentInfoText: 'All payments are secure and encrypted',
  },
  wallet: {
    topUpAmounts: [100, 250, 500],
    maxTopUpAmount: 10000,
    imageUrl: '',
  },
  catalog: {
    defaultCollectionKey: '',
  },
  paymentMethods: [
    { key: 'cash', label: 'Cash on Delivery', description: 'Pay when your order arrives', icon: 'cash', imageUrl: '', isActive: true, order: 0 },
    {
      key: 'digital',
      label: 'Digital Payment',
      description: 'Card, UPI, net banking, and wallets via Worldline',
      icon: 'card',
      imageUrl: '',
      isActive: true,
      order: 1,
    },
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
  support: {
    contactPhone: '+919444183378',
    contactEmail: 'support@selorg.com',
    supportPhone: '+919444183378',
    supportEmail: 'support@selorg.com',
    whatsappNumber: '+919444183378',
    workingHours: 'Mon–Sat, 9:00 AM – 8:00 PM IST',
    responseTime: 'Typically within 2–4 hours on business days',
    liveChatEnabled: true,
  },
  payment: {
    upiMerchantId: 'merchant@upi',
    upiMerchantName: 'SelOrg',
    upiApps: [
      { id: 'gpay', name: 'Google Pay', scheme: 'tez://upi/pay', isActive: true, order: 0 },
      { id: 'phonepe', name: 'PhonePe', scheme: 'phonepe://pay', isActive: true, order: 1 },
      { id: 'paytm', name: 'Paytm', scheme: 'paytmmp://pay', isActive: true, order: 2 },
      { id: 'bhim', name: 'BHIM', scheme: 'upi://pay', isActive: true, order: 3 },
      { id: 'other_upi', name: 'Other UPI Apps', scheme: 'upi://pay', isActive: true, order: 99 },
    ],
    showOtherUpiOption: true,
  },
  images: {
    placeholderUrl: '',
    outOfStockImageUrl: '',
    emptyCartImageUrl: '',
    emptyOrdersImageUrl: '',
    emptyNotificationsImageUrl: '',
    emptySearchImageUrl: '',
    emptyWishlistImageUrl: '',
    errorImageUrl: '',
    noProductsImageUrl: '',
  },
  supportCategories: [
    { key: 'contact_support', label: 'Contact Support', description: 'Get in touch with our team', icon: 'phone', imageUrl: '', isActive: true, order: 0 },
    { key: 'orders', label: 'Orders', description: 'Track, cancel, or change orders', icon: 'package', imageUrl: '', isActive: true, order: 1 },
    { key: 'payments', label: 'Payments', description: 'Payment methods and failed charges', icon: 'credit-card', imageUrl: '', isActive: true, order: 2 },
    { key: 'delivery', label: 'Delivery', description: 'Delivery slots and issues', icon: 'truck', imageUrl: '', isActive: true, order: 3 },
    { key: 'wallet', label: 'Wallet', description: 'Wallet balance and top-ups', icon: 'wallet', imageUrl: '', isActive: true, order: 4 },
    { key: 'refunds', label: 'Refunds', description: 'Refund status and eligibility', icon: 'refresh-cw', isActive: true, order: 5, imageUrl: '' },
    { key: 'account', label: 'Account', description: 'Profile, addresses, and settings', icon: 'settings', imageUrl: '', isActive: true, order: 6 },
    { key: 'offers', label: 'Offers', description: 'Coupons and promotional offers', icon: 'star', imageUrl: '', isActive: true, order: 7 },
    { key: 'technical_issues', label: 'Technical Issues', description: 'App or website problems', icon: 'alert-triangle', imageUrl: '', isActive: true, order: 8 },
    { key: 'feedback', label: 'Feedback', description: 'Share your feedback', icon: 'message-square', imageUrl: '', isActive: true, order: 9 },
    { key: 'app_issues', label: 'App Issues', description: 'Report bugs and crashes', icon: 'smartphone', imageUrl: '', isActive: true, order: 10 },
    { key: 'general_inquiry', label: 'General Inquiry', description: 'Ask us anything', icon: 'help-circle', imageUrl: '', isActive: true, order: 11 },
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
