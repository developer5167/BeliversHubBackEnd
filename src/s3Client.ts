// src/s3Client.ts
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
dotenv.config();

const REGION = process.env.R2_REGION || "auto";

export const s3 = new S3Client({
  region: REGION,
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
  forcePathStyle: false,
});

export async function getPresignedUploadUrl(bucket: string, key: string, contentType: string, expiresInSec = 900) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const signedUrl = await getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
  return signedUrl;
}

export async function headObject(bucket: string, key: string) {
  const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
  return s3.send(cmd);
}

export async function getObject(bucket: string, key: string) {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return s3.send(cmd);
}
