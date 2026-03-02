const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

async function registerUser(payload) {
  const { email, password, name, role } = payload;
  // Normalize email to lowercase for case-insensitive lookup
  const normalizedEmail = email ? email.toLowerCase().trim() : email;
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new Error('User already exists');
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ email: normalizedEmail, password: hashed, name, role });
  const obj = user.toObject();
  delete obj.password;
  return obj;
}

async function authenticateUser(email, password, role) {
  // Normalize email to lowercase for case-insensitive lookup
  const normalizedEmail = email ? email.toLowerCase().trim() : email;
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return null;
  
  // If role is specified, verify it matches (case-insensitive)
  if (role && user.role && user.role.toLowerCase().trim() !== role.toLowerCase().trim()) return null;
  
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;
  
  const roleNormalized = (user.role && typeof user.role === 'string') ? user.role.toLowerCase().trim() : (user.role || '');
  const assignedStores = user.assignedStores || [];
  const primaryStoreId = user.primaryStoreId || (assignedStores.length > 0 ? assignedStores[0] : '');
  const token = jwt.sign(
    {
      id: user._id.toString(),
      userId: user._id.toString(),
      email: user.email,
      role: roleNormalized,
      name: user.name || '',
      assignedStores,
      primaryStoreId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  const obj = user.toObject();
  delete obj.password;
  return { token, user: obj };
}

module.exports = { registerUser, authenticateUser };
