/* =============================================================================
 * Reading a candidate's questionnaire answers.
 * -----------------------------------------------------------------------------
 * Shared by the admin candidate page and the board packet PDF so the two can
 * never show a different set of answers for the same application — which they
 * did: the packet filtered responses to the catalog for the application's path
 * and rendered nothing for the two seeded candidates, whose responses are
 * keyed legacy_q1_… rather than state_….
 *
 * Answers arrive from three eras:
 *
 *   1. `responses` keyed to the path's question catalog. Every application
 *      since the path-aware form. Rendered in the order the candidate saw them.
 *   2. The legacy q1..q10 columns. The original questionnaire, before the
 *      catalog existed. Some of those rows also carry a `legacy_q*` mirror in
 *      `responses`, but the mirror is values only — the q*_explanation text
 *      lives in the columns, so the columns win and the mirror is suppressed.
 *   3. Anything left in `responses`: a key from a path the application was
 *      later moved off, or a mirror whose column is empty. Rendered last so
 *      nothing a candidate wrote silently disappears from the record.
 * ========================================================================== */

export const LEGACY_BOOL = [
  ['q1_nondiscrimination', 'q1_explanation', 'Supports comprehensive nondiscrimination protections'],
  ['q2_anti_lgbtq_legislation', 'q2_explanation', 'Will oppose anti-LGBTQ+ legislation'],
  ['q3_conversion_therapy', 'q3_explanation', 'Supports banning conversion therapy'],
  ['q4_inclusive_education', 'q4_explanation', 'Supports inclusive education'],
  ['q5_vote_against_rollbacks', 'q5_explanation', 'Will vote against rollbacks of existing protections'],
];

export const LEGACY_TEXT = [
  ['q6_priorities', 'Top priorities'],
  ['q7_legislation', 'Legislation they would champion'],
  ['q8_safety', 'Community safety'],
  ['q9_intersection', 'Intersectional equity'],
  ['q10_why_endorsement', 'Why they seek this endorsement'],
];

const present = (v) => v !== undefined && v !== null && v !== '';

/** Last-resort label for a response key with no question row behind it. */
function humanize(key) {
  const bare = key.replace(/^legacy_q\d+_/, '').replace(/^(state|fed|local|jud)_/, '').replace(/_/g, ' ');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * Every answer on an application, in reading order.
 *
 * @param app        an endorsement_applications row
 * @param questions  the endorsement_questions catalog (all paths, active or not)
 * @returns [{ key, prompt, value, isBool, boolValue, explanation }]
 */
export function answersFor(app, questions) {
  if (!app) return [];

  const out = [];
  const responses = app.responses || {};
  const byKey = Object.fromEntries((questions || []).map((q) => [q.question_key, q]));
  const pathQuestions = (questions || [])
    .filter((q) => q.path === app.endorsement_path)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  const seen = new Set();

  const pushResponse = (key, prompt, raw) => {
    if (!present(raw)) return;
    const answer = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
    if (!present(answer.value) && !present(answer.explanation)) return;
    const isBool =
      typeof answer.value === 'boolean' ||
      (byKey[key]?.response_type === 'boolean' && answer.value == null);
    out.push({
      key,
      prompt,
      value: isBool ? '' : String(answer.value ?? ''),
      isBool,
      boolValue: isBool ? answer.value : undefined,
      explanation: answer.explanation || '',
    });
  };

  // 1. This path's catalog, in the candidate's reading order.
  for (const q of pathQuestions) {
    if (!(q.question_key in responses)) continue;
    seen.add(q.question_key);
    pushResponse(q.question_key, q.prompt, responses[q.question_key]);
  }

  // 2. The legacy columns, which carry the explanations the mirror dropped.
  for (const [col, explCol, prompt] of LEGACY_BOOL) {
    if (!present(app[col])) continue;
    seen.add(`legacy_${col}`);
    out.push({
      key: col,
      prompt,
      value: '',
      isBool: true,
      boolValue: app[col],
      explanation: app[explCol] || '',
    });
  }
  for (const [col, prompt] of LEGACY_TEXT) {
    if (!present(app[col])) continue;
    seen.add(`legacy_${col}`);
    out.push({ key: col, prompt, value: '', isBool: false, explanation: app[col] });
  }

  // 3. Whatever is left in responses.
  for (const key of Object.keys(responses).sort()) {
    if (seen.has(key)) continue;
    pushResponse(key, byKey[key]?.prompt || humanize(key), responses[key]);
  }

  return out;
}
