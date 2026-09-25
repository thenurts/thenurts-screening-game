// NRIC / MyKad helpers. The raw value must never be stored, logged or sent anywhere except the
// register/login request body (server hashes it immediately). Client validation is for UX only.

export function normaliseNric(v) {
  return String(v || '').toUpperCase().replace(/[\s-]/g, '');
}

// Singapore NRIC/FIN checksum (S/T/F/G/M series).
function sgValid(id) {
  if (!/^[STFGM]\d{7}[A-Z]$/.test(id)) return false;
  const w = [2, 7, 6, 5, 4, 3, 2];
  const p = id[0];
  let sum = [...id.slice(1, 8)].reduce((s, d, i) => s + Number(d) * w[i], 0);
  if (p === 'T' || p === 'G') sum += 4;
  if (p === 'M') sum += 3;
  const r = sum % 11;
  const ST = 'JZIHGFEDCBA', FG = 'XWUTRQPNMLK', M = 'KLJNPQRTUWX';
  const table = p === 'S' || p === 'T' ? ST : p === 'M' ? M : FG;
  return table[r] === id[8];
}

// Malaysian MyKad: 12 digits YYMMDD-PB-###G with a plausible date.
function myValid(id) {
  if (!/^\d{12}$/.test(id)) return false;
  const mm = Number(id.slice(2, 4)), dd = Number(id.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

export function validateNric(v) {
  const id = normaliseNric(v);
  if (sgValid(id)) return { ok: true, id, kind: 'SG' };
  if (myValid(id)) return { ok: true, id, kind: 'MY' };
  return { ok: false, id };
}

export function maskNric(id) {
  return id.length <= 5 ? '****' : id[0] + '****' + id.slice(-4);
}
