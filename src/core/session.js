// In-memory identity for this page load (spec §3). Never holds the raw NRIC.
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

export const session = {
  sessionId: uuid(),
  candidateId: null,
  nricMasked: null,
  email: null,
  phone: null,
  name: null,
  runNo: null,
  completed: [], // module ids completed (real round) in the current run

  set(data) {
    Object.assign(this, {
      candidateId: data.identity.candidateId,
      nricMasked: data.identity.nricMasked,
      email: data.identity.email,
      phone: data.identity.phone,
      name: data.identity.name,
      runNo: data.runNo,
      completed: data.completed || [],
    });
  },
  get known() { return !!this.candidateId; },
  auth() { return this.candidateId ? { candidateId: this.candidateId, email: this.email } : null; },
  uuid,
};
