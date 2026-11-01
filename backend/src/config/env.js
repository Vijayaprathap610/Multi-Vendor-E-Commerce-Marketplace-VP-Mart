import 'dotenv/config';
import { z } from 'zod';

// default() must come BEFORE transform(); otherwise the default is the raw string 'false' (truthy).
const bool = (def) =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  CLIENT_ORIGIN: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool('false'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  STRICT_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  MAIL_TRANSPORT: z.enum(['smtp', 'outbox']).default('outbox'),
  MAIL_FROM: z.string().default('VP Mart <no-reply@example.invalid>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  PUBLIC_API_URL: z.string().url().default('http://localhost:5000'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  ELASTICSEARCH_URL: z.string().url().optional(),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ES_INDEX: z.string().default('vpmart_listings'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  TAX_MODE: z.enum(['inclusive', 'exclusive']).default('inclusive'),
  DELIVERY_HOLIDAYS: z.string().default(''),
  SOCIAL_FACEBOOK: z.string().url().optional(),
  SOCIAL_INSTAGRAM: z.string().url().optional(),
  SOCIAL_X: z.string().url().optional(),
  SOCIAL_YOUTUBE: z.string().url().optional(),
  COMMISSION_PERCENT: z.coerce.number().min(0).max(60).default(10),
  PENDING_PAYMENT_TTL_MIN: z.coerce.number().int().positive().default(30),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('VP Mart Admin'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

if (env.STORAGE_DRIVER === 's3' && !(env.S3_BUCKET && env.S3_REGION && env.S3_PUBLIC_BASE_URL)) {
  throw new Error(
    'S3_BUCKET, S3_REGION and S3_PUBLIC_BASE_URL are required when STORAGE_DRIVER=s3',
  );
}

if (env.NODE_ENV === 'production') {
  if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
  if (env.MAIL_TRANSPORT === 'smtp' && !(env.SMTP_HOST && env.SMTP_PORT)) {
    throw new Error('SMTP_HOST and SMTP_PORT are required when MAIL_TRANSPORT=smtp');
  }
}

export default Object.freeze(env);
