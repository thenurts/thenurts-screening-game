// Trait catalogue (framework v0.2, claude/10-evaluation-framework.md). Module manifests reference these keys.
// scale: 'mib' = more is better (0–100, report radar) · 'style' = profile between two poles (report spectrum,
// ideal band depends on the role) · 'gate' = pass/flag, never shown to the candidate.
export const TRAITS = {
  organisation: { label: 'Organisation & reliability', host: 'liam', scale: 'mib' },
  learning: { label: 'Learning speed', host: 'zoey', scale: 'mib' },
  resilience: { label: 'Composure under pressure', host: 'noah', scale: 'mib' },
  judgement: { label: 'Judgement', host: 'zoey', scale: 'mib' },
  critical: { label: 'Critical thinking', host: 'zoey', scale: 'mib' },
  creative: { label: 'Creative problem solving', host: 'mia', scale: 'mib' },
  communication: { label: 'Effective communication', host: 'noah', scale: 'mib' },
  ethics: { label: 'Integrity', host: 'noah', scale: 'gate' },
  risk: { label: 'Risk appetite', host: 'mia', scale: 'style', poles: ['Cautious', 'Bold'] },
  test: { label: 'Warm-up', host: 'liam', scale: 'mib' },
};
