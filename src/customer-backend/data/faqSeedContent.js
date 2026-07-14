/**
 * Seed FAQ categories + sample questions for Help & Support.
 * Categories match the product brief:
 * Orders, Payments, Delivery, Wallet, Refunds, Account, Offers, Technical Issues
 */
const FAQ_SEED_ITEMS = [
  {
    category: 'Orders',
    order: 1,
    question: 'How do I track my order?',
    answer:
      'Go to My Account → Orders and open your order to see live tracking status and estimated delivery time.',
  },
  {
    category: 'Orders',
    order: 2,
    question: 'Can I cancel or modify an order?',
    answer:
      'Orders can usually be cancelled before picking starts. Open order details for available actions, or contact support for help.',
  },
  {
    category: 'Payments',
    order: 1,
    question: 'Which payment methods are accepted?',
    answer:
      'We support Cash on Delivery and digital payments including UPI, cards, and net banking via our secure payment partner.',
  },
  {
    category: 'Payments',
    order: 2,
    question: 'Why did my payment fail?',
    answer:
      'Payment failures are usually caused by insufficient balance, bank decline, or a network issue. Please retry or choose another method. If money was deducted, it is typically auto-refunded.',
  },
  {
    category: 'Delivery',
    order: 1,
    question: 'What are the delivery timings?',
    answer:
      'Available delivery slots depend on your location and store capacity. You can see options at checkout before placing the order.',
  },
  {
    category: 'Delivery',
    order: 2,
    question: 'What if I am not available for delivery?',
    answer:
      'Add delivery instructions during checkout (for example no-contact delivery). If delivery fails, our team will attempt to reach you and may reschedule.',
  },
  {
    category: 'Wallet',
    order: 1,
    question: 'How do I add money to my wallet?',
    answer: 'Go to My Account → Wallet and tap Add Money to top up securely.',
  },
  {
    category: 'Wallet',
    order: 2,
    question: 'Where can I see wallet transactions?',
    answer: 'Open My Account → Wallet to view your balance and recent transaction history.',
  },
  {
    category: 'Refunds',
    order: 1,
    question: 'How do refunds work?',
    answer:
      'Eligible refunds are reviewed by our team. Check My Account → Refunds for status. Approved amounts may return to wallet or the original payment method.',
  },
  {
    category: 'Refunds',
    order: 2,
    question: 'How long do refunds take?',
    answer:
      'Wallet refunds are usually instant after approval. Bank/UPI refunds can take 3–7 business days depending on your bank.',
  },
  {
    category: 'Account',
    order: 1,
    question: 'How do I update my profile or addresses?',
    answer:
      'Go to My Account → Profile to edit your details, or Addresses to manage delivery locations.',
  },
  {
    category: 'Account',
    order: 2,
    question: 'How do I change notification preferences?',
    answer: 'Open My Account → Notification Settings to enable or disable push, SMS, WhatsApp, and email alerts.',
  },
  {
    category: 'Offers',
    order: 1,
    question: 'How do I apply a coupon?',
    answer: 'Add items to cart, go to checkout, and enter or select an available coupon before payment.',
  },
  {
    category: 'Offers',
    order: 2,
    question: 'Why is my coupon not working?',
    answer:
      'Coupons may have minimum order value, product, or date restrictions. Check the coupon terms in the Offers section.',
  },
  {
    category: 'Technical Issues',
    order: 1,
    question: 'The app or website is crashing. What should I do?',
    answer:
      'Try refreshing, clearing cache, or updating to the latest version. If it continues, report it under App Issues with device details.',
  },
  {
    category: 'Technical Issues',
    order: 2,
    question: 'I am unable to log in. How can I fix it?',
    answer:
      'Confirm your mobile number and wait for the OTP. If you still cannot log in, contact support with your registered phone number.',
  },
];

const FAQ_CATEGORIES = [
  'Orders',
  'Payments',
  'Delivery',
  'Wallet',
  'Refunds',
  'Account',
  'Offers',
  'Technical Issues',
];

module.exports = { FAQ_SEED_ITEMS, FAQ_CATEGORIES };
