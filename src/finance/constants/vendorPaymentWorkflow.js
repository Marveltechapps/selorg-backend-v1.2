/** Ordered workflow steps for each invoice in a vendor payment batch */
const WORKFLOW_STEPS = [
  'finance_verification',
  'approval',
  'payment_released',
  'settlement_confirmation',
];

const WORKFLOW_STEP_LABELS = {
  finance_verification: 'Finance Verification',
  approval: 'Approval',
  payment_released: 'Payment Released',
  settlement_confirmation: 'Settlement Confirmation',
};

function getStepIndex(step) {
  return WORKFLOW_STEPS.indexOf(step);
}

function getNextStep(step) {
  const idx = getStepIndex(step);
  if (idx < 0 || idx >= WORKFLOW_STEPS.length - 1) return null;
  return WORKFLOW_STEPS[idx + 1];
}

function isValidStep(step) {
  return WORKFLOW_STEPS.includes(step);
}

module.exports = {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  getStepIndex,
  getNextStep,
  isValidStep,
};
