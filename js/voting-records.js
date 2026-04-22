/* ============================================================
   Ohio Pride PAC, Voting Records
   Last updated: 04/22/26

   Canonical per-roll-call data for the scorecard. Mirrors the
   public.roll_calls + public.legislator_vote_exceptions tables
   in Supabase (migration 20260424000000_scorecard.sql).

   HOW TO USE:
     resolveVote(legislator, rollCall) returns one of:
       "Y"   voted yes
       "N"   voted no
       "NV"  did not vote / absent
       "E"   excused
       "-"   not seated yet at vote_date

   HOW TO ADD A NEW ROLL CALL:
     1. Append an entry to ROLL_CALLS with a unique id
        (convention: "<billSlug>-<chamber-letter>-<stage>")
     2. If any member broke party line, add an EXCEPTIONS row
     3. Update LAST_UPDATED below
     4. Add a matching row in public.roll_calls via SQL

   DATA NOTES:
     - Historical (135th GA) vote tallies are sourced from
       public Ohio Legislature journals. Callers should treat
       these as canonical only after reconciliation against the
       journal of record. Unverified entries are flagged with
       verificationStatus: "provisional".
     - Party-line defaults are applied in resolveVote(): on an
       anti-equality bill, R defaults Y and D defaults N; on a
       pro-equality bill, R defaults N and D defaults Y. Members
       not seated at vote_date resolve to "-".
   ============================================================ */

const VOTING_RECORDS_UPDATED = { date: "04/22/26", time: "06:00 PM EDT" };

/* -------------------------------------------------------
   ROLL CALLS
   Fields:
     id                  unique slug (billSlug-chamberLetter-stage)
     billSlug            matches bill-data.js id
     billLabel           display label (e.g. "HB 249")
     chamber             "house" | "senate"
     stage               "committee" | "pass" | "concur" | "override" | "introduce"
     label               display label for the vote
     voteDate            ISO YYYY-MM-DD
     result              human-readable tally (e.g. "Passed 63-32")
     yeas / nays         integers (for computation)
     stance              "pro" | "anti" | "mixed" (bill stance, for default resolution)
     ga                  "135th" | "136th"
     sourceUrl           URL consulted
     verificationStatus  "verified" | "provisional" | "reconciled"
     notes               free-text
   ------------------------------------------------------- */
const ROLL_CALLS = [

  /* ───────── 136th General Assembly ───────── */

  {
    id: "hb249-h-pass",
    billSlug: "hb249",
    billLabel: "HB 249",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2026-03-25",
    result: "Passed 63-32",
    yeas: 63,
    nays: 32,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/hb249/votes",
    verificationStatus: "verified",
    notes: "Drag performance ban. Rep. Jamie Callender (R-57) voted N, sole R crossover."
  },

  {
    id: "sb34-s-pass",
    billSlug: "sb34",
    billLabel: "SB 34",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2025-11-20",
    result: "Passed 23-10",
    yeas: 23,
    nays: 10,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb34/votes",
    verificationStatus: "verified",
    notes: "Ten Commandments display requirement. Party-line vote."
  },

  {
    id: "sb1-s-cmte",
    billSlug: "sb1",
    billLabel: "SB 1",
    chamber: "senate",
    stage: "committee",
    label: "Senate Higher Education Committee",
    voteDate: "2025-02-12",
    result: "Reported 5-2",
    yeas: 5,
    nays: 2,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Committee report clearing SB 1 to the Senate floor. Dem minority opposed."
  },

  {
    id: "sb1-s-pass",
    billSlug: "sb1",
    billLabel: "SB 1",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2025-02-12",
    result: "Passed 21-11",
    yeas: 21,
    nays: 11,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "DEI ban in higher education. Sen. Louis Blessing III (R-8) and Sen. Tom Patton (S-24) crossed to vote N. Reconcile both defectors against Senate Journal 2/12/25."
  },

  {
    id: "sb1-h-pass",
    billSlug: "sb1",
    billLabel: "SB 1",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2025-03-19",
    result: "Passed 59-34",
    yeas: 59,
    nays: 34,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "DEI ban in higher education, House passage. Reconcile tally against House Journal 3/19/25."
  },

  {
    id: "sb1-s-concur",
    billSlug: "sb1",
    billLabel: "SB 1",
    chamber: "senate",
    stage: "concur",
    label: "Senate Concurrence",
    voteDate: "2025-03-26",
    result: "Concurred 20-11",
    yeas: 20,
    nays: 11,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Senate concurrence sending SB 1 to the Governor. Sens. Blessing III (R-8) and Patton (R-24) crossed again to vote N."
  },

  /* ───────── 135th General Assembly (scorecard context) ───────── */

  {
    id: "hb68-h-pass",
    billSlug: "hb68",
    billLabel: "HB 68",
    chamber: "house",
    stage: "pass",
    label: "House Original Passage",
    voteDate: "2023-06-14",
    result: "Passed 64-27",
    yeas: 64,
    nays: 27,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "provisional",
    notes: "Original House passage of HB 68 before Senate amendments added the sports ban. Reconcile tally against House Journal 6/14/23."
  },

  {
    id: "hb68-s-pass",
    billSlug: "hb68",
    billLabel: "HB 68",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage (with Sports Ban amendment)",
    voteDate: "2023-12-13",
    result: "Passed 24-8",
    yeas: 24,
    nays: 8,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "provisional",
    notes: "Senate added the Save Women's Sports Act language and passed the combined bill. Sen. Nathan Manning (R-13) voted N. Reconcile tally against Senate Journal 12/13/23."
  },

  {
    id: "hb68-h-concur",
    billSlug: "hb68",
    billLabel: "HB 68",
    chamber: "house",
    stage: "concur",
    label: "House Concurrence",
    voteDate: "2023-12-13",
    result: "Concurred 62-27",
    yeas: 62,
    nays: 27,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "provisional",
    notes: "House concurred in Senate amendments, sending HB 68 to the Governor. Rep. Jamie Callender (R-57) voted N. Reconcile tally against House Journal 12/13/23."
  },

  {
    id: "hb68-s-override",
    billSlug: "hb68",
    billLabel: "HB 68",
    chamber: "senate",
    stage: "override",
    label: "Senate Veto Override",
    voteDate: "2024-01-24",
    result: "Override 24-8",
    yeas: 24,
    nays: 8,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "provisional",
    notes: "Gender-affirming care ban + sports ban. Sen. Nathan Manning (R-13) voted N, sole R crossover on override."
  },

  {
    id: "hb68-h-override",
    billSlug: "hb68",
    billLabel: "HB 68",
    chamber: "house",
    stage: "override",
    label: "House Veto Override",
    voteDate: "2024-01-10",
    result: "Override 65-28",
    yeas: 65,
    nays: 28,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "provisional",
    notes: "Rep. Jamie Callender (R-57) voted N on override. Verify tally against House Journal 1/10/24."
  },

  {
    id: "hb8-h-pass",
    billSlug: "hb8",
    billLabel: "HB 8",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2023-06-21",
    result: "Passed 65-28",
    yeas: 65,
    nays: 28,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "provisional",
    notes: "Parents' Bill of Rights / forced outing. Rep. Andrea White (R-36), Rep. Gayle Manning (R-52), Rep. Jamie Callender (R-57) voted N. Verify tally against House Journal 6/21/23."
  },

  {
    id: "hb8-s-concur",
    billSlug: "hb8",
    billLabel: "HB 8",
    chamber: "senate",
    stage: "concur",
    label: "Senate Passage",
    voteDate: "2024-12-11",
    result: "Passed 24-7",
    yeas: 24,
    nays: 7,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "provisional",
    notes: "Sen. Louis Blessing III (R-8) voted N. Verify tally against Senate Journal 12/11/24."
  },

  {
    id: "hb8-h-concur",
    billSlug: "hb8",
    billLabel: "HB 8",
    chamber: "house",
    stage: "concur",
    label: "House Concurrence",
    voteDate: "2024-12-18",
    result: "Concurred 64-25",
    yeas: 64,
    nays: 25,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "provisional",
    notes: "House concurred in Senate amendments, sending HB 8 to the Governor. Reconcile tally against House Journal 12/18/24 and confirm any R crossovers."
  },

  {
    id: "sb104-s-pass",
    billSlug: "sb104",
    billLabel: "SB 104",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage (with bathroom ban amendment)",
    voteDate: "2024-11-13",
    result: "Passed 24-7",
    yeas: 24,
    nays: 7,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "provisional",
    notes: "College Credit Plus vehicle amended to include K-12 and higher-ed bathroom/locker-room restrictions. Verify tally against Senate Journal 11/13/24."
  },

  {
    id: "sb104-h-concur",
    billSlug: "sb104",
    billLabel: "SB 104",
    chamber: "house",
    stage: "concur",
    label: "House Concurrence",
    voteDate: "2024-11-13",
    result: "Concurred 60-31",
    yeas: 60,
    nays: 31,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "provisional",
    notes: "Rep. Jamie Callender (R-57) voted N on concurrence. Verify tally against House Journal 11/13/24."
  }
];

/* -------------------------------------------------------
   VOTE EXCEPTIONS
   One row per legislator-roll_call pair where the member
   deviated from their party-line default. Party-line defaults
   are applied automatically by resolveVote(); only list the
   exceptions here.

   Fields:
     rollCallId   matches ROLL_CALLS.id
     chamber      "house" | "senate" (redundant, for lookup speed)
     district     integer district number
     vote         "Y" | "N" | "NV" | "E"
     notes        why this exception exists (optional)
   ------------------------------------------------------- */
const VOTE_EXCEPTIONS = [

  /* HB 249 (136th, 2026-03-25), drag ban passage */
  { rollCallId: "hb249-h-pass", chamber: "house", district: 57, vote: "N",
    notes: "Callender, sole R to vote against drag ban." },

  /* HB 68 (135th), gender-affirming care + sports ban overrides */
  { rollCallId: "hb68-s-override", chamber: "senate", district: 13, vote: "N",
    notes: "N. Manning, sole R to vote against Senate override." },
  { rollCallId: "hb68-h-override", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 68 override." },

  /* HB 8 (135th), forced outing passage */
  { rollCallId: "hb8-h-pass", chamber: "house", district: 36, vote: "N",
    notes: "A. White, against HB 8." },
  { rollCallId: "hb8-h-pass", chamber: "house", district: 52, vote: "N",
    notes: "G. Manning, against HB 8." },
  { rollCallId: "hb8-h-pass", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 8." },
  { rollCallId: "hb8-s-concur", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing, against HB 8 in Senate." },

  /* SB 104 (135th), bathroom ban concurrence */
  { rollCallId: "sb104-h-concur", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against SB 104 concurrence." },

  /* SB 1 (136th): Higher Ed DEI ban */
  { rollCallId: "sb1-s-pass", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing III: crossed on SB 1 Senate passage." },
  { rollCallId: "sb1-s-pass", chamber: "senate", district: 24, vote: "N",
    notes: "Patton: crossed on SB 1 Senate passage." },
  { rollCallId: "sb1-s-concur", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing III: crossed on SB 1 Senate concurrence." },
  { rollCallId: "sb1-s-concur", chamber: "senate", district: 24, vote: "N",
    notes: "Patton: crossed on SB 1 Senate concurrence." }
];

/* -------------------------------------------------------
   SEATING OVERRIDES
   If a legislator was not seated at the time of a vote (e.g.,
   won a special election mid-GA), add them here so their
   resolveVote() returns "-" instead of a party-line default.
   Leave empty if not applicable.

   Fields:
     chamber     "house" | "senate"
     district    integer
     seatedSince ISO YYYY-MM-DD (votes before this date resolve "-")
   ------------------------------------------------------- */
const SEATED_SINCE = [
  // { chamber: "house", district: 0, seatedSince: "2025-01-01" },
];

/* -------------------------------------------------------
   RESOLVERS
   ------------------------------------------------------- */
function getRollCall(rollCallId) {
  for (var i = 0; i < ROLL_CALLS.length; i++) {
    if (ROLL_CALLS[i].id === rollCallId) return ROLL_CALLS[i];
  }
  return null;
}

function getRollCallsForBill(billSlug) {
  return ROLL_CALLS.filter(function (rc) { return rc.billSlug === billSlug; });
}

function _findException(rollCallId, chamber, district) {
  for (var i = 0; i < VOTE_EXCEPTIONS.length; i++) {
    var e = VOTE_EXCEPTIONS[i];
    if (e.rollCallId === rollCallId && e.chamber === chamber && e.district === district) {
      return e;
    }
  }
  return null;
}

function _seatedAt(chamber, district, voteDate) {
  for (var i = 0; i < SEATED_SINCE.length; i++) {
    var s = SEATED_SINCE[i];
    if (s.chamber === chamber && s.district === district) {
      return s.seatedSince <= voteDate;
    }
  }
  return true;
}

/**
 * Resolve how a legislator voted on a given roll call.
 *
 * legislator: { chamber: "house"|"senate", d: <district>, party: "R"|"D"|"I" }
 * rollCall:   entry from ROLL_CALLS
 *
 * Order of resolution:
 *   1. Explicit exception row (hand-entered crossover / absence)
 *   2. Not seated at vote_date → "-"
 *   3. Party-line default:
 *        anti bill:  R→Y, D→N
 *        pro bill:   R→N, D→Y
 *        mixed bill: resolves to "NV" (flag for manual review)
 *   4. Independents default to "NV" unless an exception is set.
 */
function resolveVote(legislator, rollCall) {
  if (!legislator || !rollCall) return "-";

  var chamber = legislator.chamber;
  if (!chamber) {
    chamber = (typeof legislator.d === "number" && legislator.d <= 33 && legislator._senate)
      ? "senate" : (legislator.chamber || "house");
  }

  var exc = _findException(rollCall.id, chamber, legislator.d);
  if (exc) return exc.vote;

  if (!_seatedAt(chamber, legislator.d, rollCall.voteDate)) return "-";

  var party = legislator.party;
  var stance = rollCall.stance;

  if (stance === "anti") {
    if (party === "R") return "Y";
    if (party === "D") return "N";
    return "NV";
  }
  if (stance === "pro") {
    if (party === "R") return "N";
    if (party === "D") return "Y";
    return "NV";
  }
  return "NV";
}

/* -------------------------------------------------------
   EXPORT (if used in a module context)
   ------------------------------------------------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VOTING_RECORDS_UPDATED: VOTING_RECORDS_UPDATED,
    ROLL_CALLS: ROLL_CALLS,
    VOTE_EXCEPTIONS: VOTE_EXCEPTIONS,
    SEATED_SINCE: SEATED_SINCE,
    getRollCall: getRollCall,
    getRollCallsForBill: getRollCallsForBill,
    resolveVote: resolveVote
  };
}
