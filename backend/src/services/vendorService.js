import VendorProfile from '../models/VendorProfile.js';
import Listing from '../models/Listing.js';
import { AppError, conflict } from '../utils/AppError.js';
import { slugify } from '../utils/text.js';
import { catalogChanged } from './cache.js';
import { claimImages, releaseImage } from './media.js';
import { markDirty } from './searchSync.js';

export const getProfile = (userId) => VendorProfile.findOne({ userId });

async function uniqueSlug(base, userId) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i++) {
    const taken = await VendorProfile.exists({ slug, userId: { $ne: userId } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${slugify(base)}-${Date.now().toString(36)}`;
}

export async function upsertProfile(user, input) {
  let profile = (await getProfile(user._id)) ?? new VendorProfile({ userId: user._id });
  const oldLogo = profile.logoKey;
  const { accountNumber, logoKey, ...rest } = input;

  for (const k of [
    'shopName',
    'description',
    'businessName',
    'gstin',
    'fssaiLicense',
    'drugLicense',
  ]) {
    if (rest[k] !== undefined) profile[k] = rest[k] || undefined;
  }
  if (rest.pickupAddress)
    profile.pickupAddress = {
      ...(profile.pickupAddress?.toObject?.() ?? {}),
      ...rest.pickupAddress,
    };
  if (rest.delivery) {
    const cur = profile.delivery?.toObject?.() ?? {};
    profile.delivery = {
      ...cur,
      ...rest.delivery,
      coverage: { ...(cur.coverage ?? {}), ...(rest.delivery.coverage ?? {}) },
    };
  }
  if (rest.payout || accountNumber) {
    const cur = profile.payout?.toObject?.() ?? {};
    profile.payout = {
      ...cur,
      ...(rest.payout ?? {}),
      // Only the last four digits are kept; the full number is discarded immediately.
      ...(accountNumber ? { accountLast4: accountNumber.slice(-4) } : {}),
    };
  }
  if (logoKey !== undefined) {
    if (logoKey) {
      const [asset] = await claimImages([logoKey], user._id, 'logo');
      profile.logoKey = asset.key;
      profile.logoUrl = asset.url;
    } else {
      profile.logoKey = undefined;
      profile.logoUrl = undefined;
    }
  }
  if (profile.shopName && (!profile.slug || rest.shopName))
    profile.slug = await uniqueSlug(profile.shopName, user._id);
  try {
    await profile.save();
  } catch (err) {
    if (err?.code === 11000) throw conflict('That shop name is already taken', 'SHOP_NAME_TAKEN');
    throw err;
  }
  if (oldLogo && oldLogo !== profile.logoKey) await releaseImage(oldLogo);
  if (rest.shopName || rest.delivery || rest.pickupAddress) {
    await Listing.updateMany(
      { vendorId: user._id },
      { $set: { vendorName: profile.shopName, vendorSlug: profile.slug } },
    );
    await markDirty({ vendorId: user._id });
    await catalogChanged();
  }
  return profile;
}

export function missingForSubmission(p) {
  const missing = [];
  if (!p) return ['shopName', 'businessName', 'pickupAddress', 'payout'];
  if (!p.shopName) missing.push('shopName');
  if (!p.businessName) missing.push('businessName');
  const a = p.pickupAddress ?? {};
  if (!(a.line1 && a.city && a.state && a.pincode)) missing.push('pickupAddress');
  if (!(p.payout?.ifsc && p.payout?.accountLast4 && p.payout?.accountHolder))
    missing.push('payout');
  return missing;
}

export async function submitProfile(user) {
  const profile = await getProfile(user._id);
  const missing = missingForSubmission(profile);
  if (missing.length) {
    throw new AppError(
      422,
      'PROFILE_INCOMPLETE',
      'Complete these sections before submitting',
      Object.fromEntries(missing.map((m) => [m, 'Required'])),
    );
  }
  profile.submittedAt = new Date();
  profile.reviewNote = undefined;
  await profile.save();
  return profile;
}

// Admin-facing view: bank details are masked, nothing sensitive beyond what review needs.
export const adminVendorView = (u, p) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phone: u.phone,
  status: u.status,
  createdAt: u.createdAt,
  profile: p
    ? {
        shopName: p.shopName,
        slug: p.slug,
        businessName: p.businessName,
        gstin: p.gstin,
        fssaiLicense: p.fssaiLicense,
        drugLicense: p.drugLicense,
        pickupAddress: p.pickupAddress,
        payout: p.payout
          ? {
              accountHolder: p.payout.accountHolder,
              accountMasked: p.payout.accountLast4 ? `••••${p.payout.accountLast4}` : null,
              ifsc: p.payout.ifsc,
            }
          : null,
        delivery: p.delivery,
        logoUrl: p.logoUrl,
        submittedAt: p.submittedAt,
        reviewNote: p.reviewNote,
        warnings: p.warnings,
      }
    : null,
});
