// Candidate identity (spec §1, v1.4): no NRIC anywhere. Registered user id = "<email>|<phone>".
// Casual players carry no PII and are recorded as "Casual User".
export const CASUAL_ID = 'Casual User';

export const normEmail = (v) => String(v || '').trim().toLowerCase();
export const normPhone = (v) => String(v || '').trim();

// Strict but practical: one @, a dot in the domain, no spaces.
export const emailOk = (v) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normEmail(v)) && normEmail(v).length <= 120;
// E.164: + then country code and number, digits only, no spaces (e.g. +60129876543).
export const phoneOk = (v) => /^\+[1-9]\d{7,14}$/.test(normPhone(v));

export const userIdOf = (email, phone) => `${normEmail(email)}|${normPhone(phone)}`;
