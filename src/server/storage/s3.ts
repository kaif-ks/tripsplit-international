import { S3Client } from "@aws-sdk/client-s3";

function getStorageEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

export function getS3Client() {
  return new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: getStorageEnv("S3_ENDPOINT"),
    credentials: {
      accessKeyId: getStorageEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: getStorageEnv("S3_SECRET_ACCESS_KEY"),
    },
    // Neon Object Storage requires path-style addressing for signed URLs.
    forcePathStyle: true,
    // Keep presigned PUT uploads compatible with non-empty request bodies.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

export function getS3Bucket() {
  return getStorageEnv("S3_BUCKET");
}
