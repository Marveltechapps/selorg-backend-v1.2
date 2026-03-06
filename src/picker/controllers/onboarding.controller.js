/**
 * Onboarding Controller
 * GET /onboarding-state – returns current onboarding step and completion flags (backend-only state).
 * Used by Picker app to drive routing; AsyncStorage only for auth token.
 */
const onboardingService = require('../services/onboarding.service');
const { success } = require('../utils/response.util');

const getOnboardingState = async (req, res, next) => {
  try {
    const data = await onboardingService.getOnboardingState(req.userId);
    success(res, data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getOnboardingState };
