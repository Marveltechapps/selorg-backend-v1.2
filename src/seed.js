const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Import User model (shared across all dashboards)
const User = require('./vendor/models/User');
const logger = require('./core/utils/logger');

// Load environment variables
dotenv.config();

// Connect to database
const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selorg-admin-ops';
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('MongoDB Connected for seeding');
  } catch (err) {
    logger.error('Database connection error:', err.message);
    process.exit(1);
  }
};

// Seed function - Creates login users for all dashboards
const seed = async () => {
  try {
    await connectDB();
    
    // Default password for all users (change in production!)
    const defaultPassword = 'password123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    // Define users for each dashboard
    const dashboardUsers = [
      {
        email: 'darkstore@selorg.com',
        password: hashedPassword,
        name: 'Darkstore User',
        role: 'darkstore',
      },
      {
        email: 'production@selorg.com',
        password: hashedPassword,
        name: 'Production User',
        role: 'production',
      },
      {
        email: 'vendor@selorg.com',
        password: hashedPassword,
        name: 'Vendor User',
        role: 'vendor',
      },
      {
        email: 'warehouse@selorg.com',
        password: hashedPassword,
        name: 'Warehouse User',
        role: 'warehouse',
      },
      {
        email: 'finance@selorg.com',
        password: hashedPassword,
        name: 'Finance User',
        role: 'finance',
      },
      {
        email: 'rider@selorg.com',
        password: hashedPassword,
        name: 'Rider User',
        role: 'rider',
      },
      {
        email: 'admin@selorg.com',
        password: hashedPassword,
        name: 'Admin User',
        role: 'admin',
      },
      {
        email: 'merch@selorg.com',
        password: hashedPassword,
        name: 'Merch User',
        role: 'merch',
      },
    ];
    
    // Clear existing users (optional - comment out if you want to keep existing users)
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      logger.info(`Found ${existingCount} existing users. Clearing...`);
      await User.deleteMany({});
      logger.info('Existing users cleared');
    }
    
    // Insert users (skip if already exists)
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const userData of dashboardUsers) {
      try {
        const existing = await User.findOne({ email: userData.email });
        if (existing) {
          logger.warn(`User ${userData.email} already exists, skipping...`);
          skippedCount++;
        } else {
          await User.create(userData);
          logger.info(`✅ Created user: ${userData.email} (Role: ${userData.role})`);
          createdCount++;
        }
      } catch (err) {
        logger.error(`Error creating user ${userData.email}:`, err.message);
      }
    }
    
    logger.info(`\nSeed completed. Created ${createdCount} users.`);
    process.exit(0);
  } catch (err) {
    logger.error('Seed failed:', err.message);
    process.exit(1);
  }
};

// Run seed if called directly
if (require.main === module) {
  seed();
}

module.exports = seed;
