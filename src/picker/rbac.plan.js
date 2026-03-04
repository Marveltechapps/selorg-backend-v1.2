/**
 * RBAC Plan for Picker Workforce + HHD Operations (Phase 1).
 * Do NOT implement these checks yet – document intended roles per endpoint area.
 *
 * Current picker routes are mobile-facing (picker app). Phase 1 will add dashboard
 * endpoints for Admin/Finance/Warehouse. Role checks will be applied there.
 *
 * Intended roles per area:
 *
 * ADMIN:
 *   - Picker onboarding: approve/reject pickers (status, approvedAt, approvedBy, rejectedReason)
 *   - Picker list/view: list all pickers, filter by status
 *   - SLA config: read/update picker_sla_config
 *   - Training: manage training videos/content
 *   - Support tickets: view/resolve picker tickets
 *   - FAQs: manage FAQ content
 *   - Notifications: send bulk notifications to pickers
 *
 * FINANCE:
 *   - Wallet withdrawals: approve/reject/process (WITHDRAWAL_STATUS)
 *   - Wallet balance/earnings: view all pickers' balances, earnings breakdown
 *   - Bank accounts: verify, view linked accounts
 *   - Transaction history: view withdrawals, payouts
 *
 * WAREHOUSE:
 *   - Shifts: manage shift definitions, view shift assignments
 *   - Attendance: view punch in/out, attendance reports, mark absent
 *   - Work locations: manage locations, geofences
 *   - Orders: assign orders to pickers, view queue, reassign
 *   - Performance: view picking SLA, accuracy, productivity
 *   - Documents: verify KYC/contract documents
 *
 * PICKER (mobile app, existing):
 *   - All current /api/v1/picker/* routes – authenticated by picker JWT only.
 *   - No dashboard role required.
 */

module.exports = {};
