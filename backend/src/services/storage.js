import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import env from '../config/env.js';

// Driver interface: put(key, buffer, contentType), remove(key), urlFor(key).
// 'local' writes to UPLOAD_DIR and is served by Express at /uploads (development and tests).
// 's3' uses AWS S3 with credentials from the standard AWS environment/role (never the browser).
function localDriver() {
  const root = path.resolve(env.UPLOAD_DIR);
  const full = (key) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return p;
  };
  return {
    name: 'local',
    root,
    async put(key, buffer) {
      const p = full(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, buffer);
    },
    async remove(key) {
      await fs.rm(full(key), { force: true });
    },
    urlFor: (key) => `${env.PUBLIC_API_URL}/uploads/${key}`,
  };
}

function s3Driver(client = new S3Client({ region: env.S3_REGION }), cfg = env) {
  return {
    name: 's3',
    client,
    async put(key, buffer, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.S3_BUCKET, Key: key }));
    },
    urlFor: (key) => `${cfg.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`,
  };
}

let driver;
export const storage = () => (driver ??= env.STORAGE_DRIVER === 's3' ? s3Driver() : localDriver());
export const makeS3Driver = s3Driver; // exposed so tests can inject a client
export const resetStorageForTests = () => {
  driver = undefined;
};
