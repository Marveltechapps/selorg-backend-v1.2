// dotenv is loaded by root server.js

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/hhd-shared',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET_PICKER_DOCUMENTS || process.env.AWS_S3_BUCKET || 'selorg-picker-documents',
  AWS_S3_BUCKET_PICKER_DOCUMENTS: process.env.AWS_S3_BUCKET_PICKER_DOCUMENTS || 'selorg-picker-documents',
  AWS_S3_BUCKET_PICKER_PROFILE: process.env.AWS_S3_BUCKET_PICKER_PROFILE || 'selorg-picker-profile',
  AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
};

module.exports = env;
