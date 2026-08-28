// --------------------------------------------------------------------------
// A single shared list of known job/role types, used in two places:
//   1. The admin search filter dropdown (routes/applicants.js reads this
//      indirectly via the frontend sending one of these values)
//   2. Kept here so it's ONE place to add a new job type later, rather than
//      hunting through multiple files that each hardcoded their own copy.
// This does NOT restrict what a batch's `role` field can literally contain
// (that stays free text, for flexibility) - it's used for filtering, via a
// partial match, so "Flatlock Machine Operator" still matches a search for
// "Flatlock".
// --------------------------------------------------------------------------

export const JOB_TYPES = [
  'Single needle',
  'Flatlock',
  'Overlock',
  'Top stitch',
  'Machine operator',
];
