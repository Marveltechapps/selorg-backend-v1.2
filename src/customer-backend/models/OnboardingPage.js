const mongoose = require('mongoose');
const onboardingPageSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    ctaText: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number },
  },
  { timestamps: true }
);
onboardingPageSchema.index({ isActive: 1, pageNumber: 1 });
onboardingPageSchema.index({ isActive: 1, order: 1 });
const OnboardingPage = mongoose.models.CustomerOnboardingPage || mongoose.model('CustomerOnboardingPage', onboardingPageSchema, 'customer_onboarding_pages');
module.exports = { OnboardingPage };
