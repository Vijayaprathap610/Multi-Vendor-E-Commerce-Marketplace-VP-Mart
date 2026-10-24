import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number (10-15 digits)');

export const passwordRule = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    (v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v),
    'Password must contain letters and numbers',
  );

// Only these roles can self-register. "admin" is intentionally impossible here.
export const registerBody = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    email,
    phone: phone.optional(),
    password: passwordRule,
    role: z.enum(['buyer', 'vendor', 'delivery_agent']).default('buyer'),
  })
  .strict();

export const loginBody = z
  .object({ email, password: z.string().min(1, 'Password is required').max(128) })
  .strict();

export const forgotBody = z.object({ email }).strict();

export const resetBody = z
  .object({ token: z.string().length(64, 'Invalid reset token'), newPassword: passwordRule })
  .strict();

export const changePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordRule })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  });
