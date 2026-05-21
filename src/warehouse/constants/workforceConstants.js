const STAFF_ROLES = [
  'Picker',
  'Packer',
  'Forklift Operator',
  'QC Inspector',
  'Supervisor',
  'Warehouse Manager',
];

const STAFF_SHIFTS = ['morning', 'afternoon', 'night'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeIndianPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) return null;

  return `+91-${local.slice(0, 5)}-${local.slice(5)}`;
}

function validateStaffPayload(data = {}) {
  const errors = [];

  const name = String(data.name || '').trim();
  if (!name) errors.push('Full name is required');
  else if (name.length < 2) errors.push('Full name must be at least 2 characters');

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) errors.push('Email is required');
  else if (!EMAIL_REGEX.test(email)) errors.push('Enter a valid email address');

  const phone = normalizeIndianPhone(data.phone);
  if (!String(data.phone || '').trim()) errors.push('Phone number is required');
  else if (!phone) errors.push('Enter a valid Indian mobile number (+91 followed by 10 digits starting with 6-9)');

  const role = String(data.role || '').trim();
  if (!role) errors.push('Role is required');
  else if (!STAFF_ROLES.includes(role)) errors.push(`Role must be one of: ${STAFF_ROLES.join(', ')}`);

  const shift = String(data.shift || '').trim();
  if (!shift) errors.push('Shift is required');
  else if (!STAFF_SHIFTS.includes(shift)) errors.push(`Shift must be one of: ${STAFF_SHIFTS.join(', ')}`);

  const hourlyRate = Number(data.hourlyRate);
  if (data.hourlyRate === undefined || data.hourlyRate === null || String(data.hourlyRate).trim() === '') {
    errors.push('Hourly rate is required');
  } else if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    errors.push('Hourly rate must be a positive number');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    payload: {
      name,
      email,
      phone,
      role,
      shift,
      hourlyRate,
    },
  };
}

module.exports = {
  STAFF_ROLES,
  STAFF_SHIFTS,
  EMAIL_REGEX,
  normalizeIndianPhone,
  validateStaffPayload,
};
