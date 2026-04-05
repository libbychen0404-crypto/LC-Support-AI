import { normalize } from './helpers';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{6,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string) {
  return PHONE_PATTERN.test(value.trim());
}

export function isValidIsoDateString(value: string) {
  if (!DATE_PATTERN.test(value.trim())) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function normalizePhone(value: string) {
  return value.trim();
}

export function validateProfileInput(profile: { email: string; phone: string }) {
  if (profile.email && !isValidEmail(profile.email)) {
    return 'Please enter a valid email address before loading the customer profile.';
  }

  if (profile.phone && !isValidPhone(profile.phone)) {
    return 'Please enter a valid phone number before loading the customer profile.';
  }

  return null;
}

export function isPositiveConfirmation(text: string) {
  return ['yes', 'y', 'confirm', 'confirmed', 'looks good'].includes(normalize(text));
}
