// Mirrors the backend rules so users get instant feedback. The server remains the authority.
export const validateName = (v) => (v.trim().length >= 2 ? '' : 'Enter your full name');
export const validateEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter a valid email address';
export const validatePhone = (v) =>
  !v.trim() || /^\+?[0-9]{10,15}$/.test(v.trim())
    ? ''
    : 'Enter 10-15 digits, optionally starting with +';
export function validatePassword(v) {
  if (v.length < 10) return 'Use at least 10 characters';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Include both letters and numbers';
  if (v.length > 128) return 'Use at most 128 characters';
  return '';
}
export const passwordStrength = (v) => {
  let s = 0;
  if (v.length >= 10) s++;
  if (v.length >= 14) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
  return s; // 0..4
};
