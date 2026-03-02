"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = exports.isS3Configured = void 0;

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

let s3Client = null;
const bucketDocuments = process.env.AWS_BUCKET_RIDER_DOCUMENTS || "selorg-rider-documents";
const bucketProfile = process.env.AWS_BUCKET_RIDER_PROFILE || "selorg-rider-profile";
const region = process.env.AWS_REGION || "ap-south-1";

function getClient() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

const isS3Configured = () => !!getClient();

exports.isS3Configured = isS3Configured;

async function uploadToS3(buffer, key, contentType, options = {}) {
  const client = getClient();
  if (!client) {
    throw new Error("S3 is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }
  const bucket = options.bucket === "profile" ? bucketProfile : bucketDocuments;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
  });
  await client.send(command);
  const baseUrl = `https://${bucket}.s3.${region}.amazonaws.com`;
  return `${baseUrl}/${key}`;
}

exports.uploadToS3 = uploadToS3;
