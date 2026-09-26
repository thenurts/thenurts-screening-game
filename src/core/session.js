// In-memory identity for this page load (spec §3).
import { CASUAL_ID } from './identity.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

export const session = {
  sessionId: uuid(),
  userId: null, // "<email>|<phone>" or "Casual User"
  casual: false,
  email: null,
  phone: null,
  name: null,
  runNo: null,
  completed: [], // module ids completed (real round) in the current run

  set(data) {
    const id = data.identity;
    Object.assign(this, {
      userId: id.userId, casual: !!id.casual,
      email: id.email || null, phone: id.phone || null, name: id.name || null,
      runNo: data.runNo, completed: data.completed || [],
    });
  },
  get known() { return !!this.userId; },
  /** Routing key for queued log events: unique per registered user, or per casual session. */
  get key() { return !this.userId ? null : this.casual ? `casual:${this.sessionId}` : this.userId; },
  auth() {
    if (!this.userId) return null;
    return this.casual ? { casual: true, sessionId: this.sessionId } : { userId: this.userId, email: this.email, phone: this.phone };
  },
  uuid,
  CASUAL_ID,
};
