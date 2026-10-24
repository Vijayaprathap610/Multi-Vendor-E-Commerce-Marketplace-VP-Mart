import multer from 'multer';
import { AppError, forbidden } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { MAX_UPLOAD_BYTES, saveUpload } from '../services/media.js';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 3 },
}).single('image');

const ADMIN_PURPOSES = new Set(['banner', 'category', 'brand']);

export async function uploadImage(req, res) {
  const purpose = req.query.purpose;
  if (!['listing', 'logo', 'banner', 'category', 'brand'].includes(purpose)) {
    throw new AppError(422, 'BAD_PURPOSE', 'Unknown upload purpose', { purpose: 'Invalid' });
  }
  if (ADMIN_PURPOSES.has(purpose) ? req.user.role !== 'admin' : req.user.role !== 'vendor')
    throw forbidden();
  // Product images need an approved vendor; logos may be uploaded while onboarding.
  if (purpose === 'listing' && req.user.status !== 'active')
    throw forbidden('Your account is awaiting approval', 'ACCOUNT_NOT_APPROVED');
  if (!req.file)
    throw new AppError(422, 'NO_FILE', 'Attach an image in the "image" field', {
      image: 'Required',
    });
  const asset = await saveUpload({ buffer: req.file.buffer, ownerId: req.user._id, purpose });
  await audit(req, 'media.upload', {
    target: { type: 'MediaAsset', id: asset._id },
    metadata: { purpose, bytes: asset.bytes },
  });
  res.status(201).json({ key: asset.key, url: asset.url, thumbUrl: asset.thumbUrl });
}
