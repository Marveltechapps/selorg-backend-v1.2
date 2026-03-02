/**
 * S3 Upload Utility
 * Handles file uploads to AWS S3 for profile images and documents
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload base64 image to S3
 * @param {string} base64Data - Base64 encoded image data (with or without data URI prefix)
 * @param {string} bucket - S3 bucket name
 * @param {string} folder - Folder path in bucket (e.g., 'profiles/user123')
 * @param {string} fileName - Optional custom filename (default: UUID)
 * @returns {Promise<string>} - Public URL of uploaded image
 */
async function uploadBase64ImageToS3(base64Data, bucket, folder, fileName = null) {
  try {
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    let base64Image = base64Data;
    let contentType = 'image/jpeg'; // default
    
    if (base64Data.startsWith('data:')) {
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        contentType = matches[1];
        base64Image = matches[2];
      }
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Generate filename if not provided
    const fileExtension = contentType.split('/')[1] || 'jpg';
    const finalFileName = fileName || `${uuidv4()}.${fileExtension}`;
    const key = folder ? `${folder}/${finalFileName}` : finalFileName;

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      ACL: 'public-read', // Make the image publicly accessible
    });

    await s3Client.send(command);

    // Return the public URL
    const url = `https://${bucket}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
    return url;
  } catch (error) {
    console.error('[S3 Upload] Error uploading image:', error);
    throw new Error('Failed to upload image to S3');
  }
}

/**
 * Upload buffer to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} bucket - S3 bucket name
 * @param {string} folder - Folder path in bucket
 * @param {string} fileName - Filename
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadBufferToS3(buffer, bucket, folder, fileName, contentType) {
  try {
    const key = folder ? `${folder}/${fileName}` : fileName;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await s3Client.send(command);

    const url = `https://${bucket}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
    return url;
  } catch (error) {
    console.error('[S3 Upload] Error uploading buffer:', error);
    throw new Error('Failed to upload file to S3');
  }
}

/**
 * Upload picker profile image
 * @param {string} userId - User ID
 * @param {string} base64Data - Base64 encoded image
 * @returns {Promise<string>} - S3 URL
 */
async function uploadPickerProfileImage(userId, base64Data) {
  const bucket = process.env.AWS_S3_BUCKET_PICKER_PROFILE || 'selorg-picker-profile';
  const folder = `profiles/${userId}`;
  return uploadBase64ImageToS3(base64Data, bucket, folder);
}

/**
 * Upload rider profile image
 * @param {string} userId - User ID
 * @param {string} base64Data - Base64 encoded image
 * @returns {Promise<string>} - S3 URL
 */
async function uploadRiderProfileImage(userId, base64Data) {
  const bucket = process.env.AWS_S3_BUCKET_RIDER_PROFILE || 'selorg-rider-profile';
  const folder = `profiles/${userId}`;
  return uploadBase64ImageToS3(base64Data, bucket, folder);
}

/**
 * Upload product image (catalog)
 * @param {string} base64Data - Base64 encoded image (with or without data URI prefix)
 * @returns {Promise<string>} - S3 URL
 */
async function uploadProductImage(base64Data) {
  const bucket = process.env.AWS_S3_BUCKET_PRODUCT_IMAGES || 'selorg-product-images';
  const folder = 'products';
  return uploadBase64ImageToS3(base64Data, bucket, folder);
}

module.exports = {
  uploadBase64ImageToS3,
  uploadBufferToS3,
  uploadPickerProfileImage,
  uploadRiderProfileImage,
  uploadProductImage,
  s3Client,
};
