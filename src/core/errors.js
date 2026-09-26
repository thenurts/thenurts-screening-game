// Player-facing messages for backend error codes. Always say what happened and what to do next.
const CONTACT = 'hello@thenurts.com';

const MESSAGES = {
  network: 'We couldn’t reach our server. Please check your internet connection and try again.',
  invalid_email: 'That email address doesn’t look right. Please check it and try again.',
  invalid_phone: 'Please enter your mobile number with + and the country code, digits only, e.g. +60129876543.',
  consent_required: 'Please tick the consent box to continue.',
  already_registered: 'That email or mobile number is already registered. Please continue as a returning candidate.',
  login_fail: 'We couldn’t find a registration with that email and mobile number. Please check both, or register as a new candidate.',
  auth_failed: 'Your session has expired. Please refresh the page and log in again.',
  setup_needed: `The game isn’t fully set up yet. Please try again later, or contact ${CONTACT}.`,
};

/** friendly(err) → text for a toast. Unknown errors get a reference code the team can look up in the Errors tab. */
export function friendly(err, action = 'do that') {
  const code = err?.code || 'server_error';
  if (MESSAGES[code]) return MESSAGES[code];
  const ref = err?.ref ? ` (ref ${err.ref})` : code !== 'server_error' ? ` (code ${code})` : '';
  return `Sorry, we couldn’t ${action} just now. Please try again in a minute. If it keeps happening, email ${CONTACT}${ref}.`;
}
