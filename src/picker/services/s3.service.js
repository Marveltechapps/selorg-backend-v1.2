/**
 * S3 service – upload document buffers to AWS S3 and return object URL.
 * Credentials and bucket/region from env (config/env.js). No hardcoded keys.
 */
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../config/env');

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET || !AWS_REGION) {
    throw new Error(
      'S3 not configured: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, and AWS_REGION in .env'
    );
  }
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

/**
 * Upload a document buffer to S3 and return the public object URL.
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - e.g. 'image/jpeg', 'image/png'
 * @param {string} key - S3 object key (e.g. documents/{userId}/{docType}-{side}-{timestamp}.jpg)
 * @returns {Promise<string>} - URL https://<bucket>.s3.<region>.amazonaws.com/<key>
 */
async function uploadDocument(buffer, contentType, key) {
  const client = getS3Client();
  const bucket = env.AWS_S3_BUCKET;
  const region = env.AWS_REGION;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

module.exports = { uploadDocument, getS3Client };
