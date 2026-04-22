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

     voteImpact(legislator, rollCall) returns a { direction, points }
     object: direction is "pro" | "anti" | "neutral"; points is a
     signed number (positive = pro-equality credit, negative = anti-
     equality charge). Neutral is 0.

   HOW TO ADD A NEW ROLL CALL:
     1. Append an entry to ROLL_CALLS with a unique id
        (convention: "<billSlug>-<chamber-letter>-<stage>")
     2. If any member broke party line, add an EXCEPTIONS row
     3. Update LAST_UPDATED below
     4. Add a matching row in public.roll_calls via SQL

   DATA NOTES:
     - Historical (135th GA) vote tallies are sourced from the
       official legislature.ohio.gov vote pages cross-checked
       against chamber status histories. Entries marked
       verificationStatus: "verified" have matched the official
       yea/nay totals in that authoritative source. Entries
       marked "provisional" still need a chamber journal
       reconciliation before they are treated as canonical.
     - Party-line defaults are applied in resolveVote(): on an
       anti-equality bill, R defaults Y and D defaults N; on a
       pro-equality bill, R defaults N and D defaults Y. Members
       not seated at vote_date resolve to "-".
   ============================================================ */

const VOTING_RECORDS_UPDATED = { date: "04/22/26", time: "11:50 PM EDT" };

/* -------------------------------------------------------
   EVENT WEIGHTS
   Applied inside scoring when converting a resolved vote
   into a signed score impact. Tuned to match the weights
   documented in scorecard.html "Scoring Methodology".
   ------------------------------------------------------- */
const EVENT_WEIGHTS = {
  override:  1.25,
  concur:    1.00,
  pass:      1.00,
  committee: 0.75,
  amend:     0.50,
  introduce: 0.25
};

/* -------------------------------------------------------
   ROLL CALLS
   Fields:
     id                  unique slug (billSlug-chamberLetter-stage)
     billSlug            matches bill-data.js id
     billLabel           display label (e.g. "HB 249")
     billTitle           short human title
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

  /* ============================================================
     136th General Assembly
     ============================================================ */

  /* ───────── HB 249, drag performance ban ───────── */
  {
    id: "hb249-h-pass",
    billSlug: "hb249",
    billLabel: "HB 249",
    billTitle: "Drag Performance Ban",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2026-03-25",
    result: "Passed 63-32",
    yeas: 63, nays: 32,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/hb249/votes",
    verificationStatus: "verified",
    notes: "Rep. Jamie Callender (R-57) voted N, sole R crossover."
  },

  /* ───────── SB 1, higher-ed DEI ban ───────── */
  {
    id: "sb1-136-s-cmte",
    billSlug: "sb1",
    billLabel: "SB 1",
    billTitle: "Higher Ed DEI Ban",
    chamber: "senate",
    stage: "committee",
    label: "Senate Higher Education Committee",
    voteDate: "2025-02-12",
    result: "Reported 5-2",
    yeas: 5, nays: 2,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Committee report clearing SB 1 to the Senate floor."
  },
  {
    id: "sb1-136-s-pass",
    billSlug: "sb1",
    billLabel: "SB 1",
    billTitle: "Higher Ed DEI Ban",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2025-02-12",
    result: "Passed 21-11",
    yeas: 21, nays: 11,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Sen. Blessing III (R-8) and Sen. Patton (R-24) crossed to vote N."
  },
  {
    id: "sb1-136-h-cmte",
    billSlug: "sb1",
    billLabel: "SB 1",
    billTitle: "Higher Ed DEI Ban",
    chamber: "house",
    stage: "committee",
    label: "House Higher Education Committee",
    voteDate: "2025-03-19",
    result: "Reported 9-4",
    yeas: 9, nays: 4,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Committee report clearing SB 1 to the House floor."
  },
  {
    id: "sb1-136-h-pass",
    billSlug: "sb1",
    billLabel: "SB 1",
    billTitle: "Higher Ed DEI Ban",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2025-03-19",
    result: "Passed 59-34",
    yeas: 59, nays: 34,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "DEI ban cleared House on party line with limited R defections."
  },
  {
    id: "sb1-136-s-concur",
    billSlug: "sb1",
    billLabel: "SB 1",
    billTitle: "Higher Ed DEI Ban",
    chamber: "senate",
    stage: "concur",
    label: "Senate Concurrence",
    voteDate: "2025-03-26",
    result: "Concurred 20-11",
    yeas: 20, nays: 11,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb1/votes",
    verificationStatus: "verified",
    notes: "Senate concurrence sending SB 1 to the Governor. Blessing III and Patton crossed again to N."
  },

  /* ───────── SB 34 (136th), Ten Commandments ───────── */
  {
    id: "sb34-136-s-cmte",
    billSlug: "sb34",
    billLabel: "SB 34",
    billTitle: "Ten Commandments Classroom Displays",
    chamber: "senate",
    stage: "committee",
    label: "Senate Education Committee",
    voteDate: "2025-11-18",
    result: "Reported 4-2",
    yeas: 4, nays: 2,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb34/votes",
    verificationStatus: "verified",
    notes: "Committee reported substitute bill clearing to the Senate floor."
  },
  {
    id: "sb34-136-s-pass",
    billSlug: "sb34",
    billLabel: "SB 34",
    billTitle: "Ten Commandments Classroom Displays",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2025-11-19",
    result: "Passed 23-10",
    yeas: 23, nays: 10,
    stance: "anti",
    ga: "136th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/136/sb34/votes",
    verificationStatus: "verified",
    notes: "Ten Commandments display requirement, party-line Senate passage."
  },

  /* ============================================================
     135th General Assembly (scorecard context)
     ============================================================ */

  /* ───────── HB 68, gender-affirming care + sports ban ───────── */
  {
    id: "hb68-h-cmte",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "house",
    stage: "committee",
    label: "House Public Health Committee",
    voteDate: "2023-06-14",
    result: "Reported 7-6",
    yeas: 7, nays: 6,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "House committee reported substitute bill."
  },
  {
    id: "hb68-h-pass",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "house",
    stage: "pass",
    label: "House Original Passage",
    voteDate: "2023-06-21",
    result: "Passed 64-28",
    yeas: 64, nays: 28,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "Original House passage before Senate sports-ban amendment."
  },
  {
    id: "hb68-s-cmte",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "senate",
    stage: "committee",
    label: "Senate Government Oversight Committee",
    voteDate: "2023-12-13",
    result: "Reported 4-1",
    yeas: 4, nays: 1,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "Senate committee reported substitute bill adding sports-ban language."
  },
  {
    id: "hb68-s-pass",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage (with Sports Ban amendment)",
    voteDate: "2023-12-13",
    result: "Passed 24-8",
    yeas: 24, nays: 8,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "Sen. Nathan Manning (R-13) voted N, sole R crossover."
  },
  {
    id: "hb68-h-concur",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "house",
    stage: "concur",
    label: "House Concurrence",
    voteDate: "2023-12-13",
    result: "Concurred 62-27",
    yeas: 62, nays: 27,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "House concurred in Senate amendments, sending HB 68 to the Governor. Rep. Callender (R-57) voted N."
  },
  {
    id: "hb68-h-override",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "house",
    stage: "override",
    label: "House Veto Override",
    voteDate: "2024-01-10",
    result: "Override 65-28",
    yeas: 65, nays: 28,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "Rep. Jamie Callender (R-57) voted N on override."
  },
  {
    id: "hb68-s-override",
    billSlug: "hb68",
    billLabel: "HB 68",
    billTitle: "Gender-Affirming Care + Sports Ban",
    chamber: "senate",
    stage: "override",
    label: "Senate Veto Override",
    voteDate: "2024-01-24",
    result: "Override 24-8",
    yeas: 24, nays: 8,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb68/votes",
    verificationStatus: "verified",
    notes: "Sen. Nathan Manning (R-13) voted N, sole R crossover on override."
  },

  /* ───────── HB 8, Parents' Bill of Rights / forced outing ───────── */
  {
    id: "hb8-h-cmte",
    billSlug: "hb8",
    billLabel: "HB 8",
    billTitle: "Parents' Bill of Rights (Forced Outing)",
    chamber: "house",
    stage: "committee",
    label: "House Primary and Secondary Education Committee",
    voteDate: "2023-06-14",
    result: "Reported 10-5",
    yeas: 10, nays: 5,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "verified",
    notes: "House committee reported amended bill."
  },
  {
    id: "hb8-h-pass",
    billSlug: "hb8",
    billLabel: "HB 8",
    billTitle: "Parents' Bill of Rights (Forced Outing)",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2023-06-21",
    result: "Passed 65-29",
    yeas: 65, nays: 29,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "verified",
    notes: "Reps. Andrea White (R-36), Gayle Manning (R-52), Jamie Callender (R-57) voted N."
  },
  {
    id: "hb8-s-cmte",
    billSlug: "hb8",
    billLabel: "HB 8",
    billTitle: "Parents' Bill of Rights (Forced Outing)",
    chamber: "senate",
    stage: "committee",
    label: "Senate Education Committee",
    voteDate: "2024-12-18",
    result: "Reported 5-2",
    yeas: 5, nays: 2,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "verified",
    notes: "Senate committee reported substitute bill."
  },
  {
    id: "hb8-s-pass",
    billSlug: "hb8",
    billLabel: "HB 8",
    billTitle: "Parents' Bill of Rights (Forced Outing)",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2024-12-18",
    result: "Passed 24-7",
    yeas: 24, nays: 7,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "verified",
    notes: "Sen. Blessing III (R-8) voted N."
  },
  {
    id: "hb8-h-concur",
    billSlug: "hb8",
    billLabel: "HB 8",
    billTitle: "Parents' Bill of Rights (Forced Outing)",
    chamber: "house",
    stage: "concur",
    label: "House Concurrence",
    voteDate: "2024-12-18",
    result: "Concurred 57-31",
    yeas: 57, nays: 31,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb8/votes",
    verificationStatus: "verified",
    notes: "House concurred in Senate amendments, sending HB 8 to the Governor."
  },

  /* ───────── SB 104, bathroom ban amendment ───────── */
  {
    id: "sb104-s-cmte",
    billSlug: "sb104",
    billLabel: "SB 104",
    billTitle: "Bathroom Ban (on CCP vehicle)",
    chamber: "senate",
    stage: "committee",
    label: "Senate Education Committee",
    voteDate: "2024-02-28",
    result: "Reported 5-0",
    yeas: 5, nays: 0,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "verified",
    notes: "Committee reported substitute; bathroom-ban amendment added later."
  },
  {
    id: "sb104-s-pass",
    billSlug: "sb104",
    billLabel: "SB 104",
    billTitle: "Bathroom Ban (on CCP vehicle)",
    chamber: "senate",
    stage: "pass",
    label: "Senate Original Passage",
    voteDate: "2024-02-28",
    result: "Passed 32-0",
    yeas: 32, nays: 0,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "verified",
    notes: "Original Senate passage before House bathroom-ban amendment."
  },
  {
    id: "sb104-h-cmte",
    billSlug: "sb104",
    billLabel: "SB 104",
    billTitle: "Bathroom Ban (on CCP vehicle)",
    chamber: "house",
    stage: "committee",
    label: "House Higher Education Committee",
    voteDate: "2024-06-25",
    result: "Reported 13-0",
    yeas: 13, nays: 0,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "verified",
    notes: "Committee reported bill as amended."
  },
  {
    id: "sb104-h-pass",
    billSlug: "sb104",
    billLabel: "SB 104",
    billTitle: "Bathroom Ban (on CCP vehicle)",
    chamber: "house",
    stage: "pass",
    label: "House Passage (with bathroom-ban amendment)",
    voteDate: "2024-06-26",
    result: "Passed 60-31",
    yeas: 60, nays: 31,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "verified",
    notes: "House attached K-12 and higher-ed bathroom/locker-room restrictions."
  },
  {
    id: "sb104-s-concur",
    billSlug: "sb104",
    billLabel: "SB 104",
    billTitle: "Bathroom Ban (on CCP vehicle)",
    chamber: "senate",
    stage: "concur",
    label: "Senate Concurrence",
    voteDate: "2024-11-13",
    result: "Concurred 24-7",
    yeas: 24, nays: 7,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb104/votes",
    verificationStatus: "verified",
    notes: "Senate concurred in House amendments, sending SB 104 to the Governor."
  },

  /* ───────── SB 1 (135th), higher-ed DEI precursor ───────── */
  {
    id: "sb1-135-s-cmte",
    billSlug: "sb1-135",
    billLabel: "SB 1 (135th)",
    billTitle: "Higher Ed Reform (DEI precursor)",
    chamber: "senate",
    stage: "committee",
    label: "Senate Workforce and Higher Education Committee",
    voteDate: "2023-03-01",
    result: "Reported 5-2",
    yeas: 5, nays: 2,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb1/votes",
    verificationStatus: "verified",
    notes: "Committee reported substitute bill."
  },
  {
    id: "sb1-135-s-pass",
    billSlug: "sb1-135",
    billLabel: "SB 1 (135th)",
    billTitle: "Higher Ed Reform (DEI precursor)",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2023-03-01",
    result: "Passed 26-7",
    yeas: 26, nays: 7,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb1/votes",
    verificationStatus: "verified",
    notes: "Senate passage; did not clear House in 135th GA."
  },

  /* ───────── SB 34 (135th), Liquor Control and Beer Act ───────── */
  {
    id: "sb34-135-s-cmte",
    billSlug: "sb34-135",
    billLabel: "SB 34 (135th)",
    billTitle: "Liquor Control and Beer Act",
    chamber: "senate",
    stage: "committee",
    label: "Senate Small Business Committee",
    voteDate: "2023-03-22",
    result: "Reported 5-0",
    yeas: 5, nays: 0,
    stance: "pro",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb34/votes",
    verificationStatus: "verified",
    notes: "Non-LGBTQ+ bill included in dataset for roster completeness."
  },
  {
    id: "sb34-135-s-pass",
    billSlug: "sb34-135",
    billLabel: "SB 34 (135th)",
    billTitle: "Liquor Control and Beer Act",
    chamber: "senate",
    stage: "pass",
    label: "Senate Passage",
    voteDate: "2023-05-17",
    result: "Passed 31-0",
    yeas: 31, nays: 0,
    stance: "pro",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb34/votes",
    verificationStatus: "verified",
    notes: "Unanimous Senate passage."
  },
  {
    id: "sb34-135-h-cmte",
    billSlug: "sb34-135",
    billLabel: "SB 34 (135th)",
    billTitle: "Liquor Control and Beer Act",
    chamber: "house",
    stage: "committee",
    label: "House Commerce and Labor Committee",
    voteDate: "2023-10-12",
    result: "Reported 12-0",
    yeas: 12, nays: 0,
    stance: "pro",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb34/votes",
    verificationStatus: "verified",
    notes: "Unanimous House committee report."
  },
  {
    id: "sb34-135-h-pass",
    billSlug: "sb34-135",
    billLabel: "SB 34 (135th)",
    billTitle: "Liquor Control and Beer Act",
    chamber: "house",
    stage: "pass",
    label: "House Passage",
    voteDate: "2023-11-15",
    result: "Passed 93-1",
    yeas: 93, nays: 1,
    stance: "pro",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/sb34/votes",
    verificationStatus: "verified",
    notes: "Near-unanimous House passage."
  },

  /* ───────── HB 602 (135th), pride flag ban precursor ───────── */
  {
    id: "hb602-135-h-cmte",
    billSlug: "hb602-135",
    billLabel: "HB 602 (135th)",
    billTitle: "Pride Flag Ban Precursor",
    chamber: "house",
    stage: "committee",
    label: "House State and Local Government Committee",
    voteDate: "2024-11-26",
    result: "Reported 12-0",
    yeas: 12, nays: 0,
    stance: "anti",
    ga: "135th",
    sourceUrl: "https://www.legislature.ohio.gov/legislation/135/hb602/votes",
    verificationStatus: "verified",
    notes: "House committee report; no floor vote located in 135th GA."
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

  /* HB 68 (135th), gender-affirming care + sports ban */
  { rollCallId: "hb68-s-pass", chamber: "senate", district: 13, vote: "N",
    notes: "N. Manning, sole R against Senate passage with sports-ban." },
  { rollCallId: "hb68-h-concur", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 68 concurrence." },
  { rollCallId: "hb68-h-override", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 68 override." },
  { rollCallId: "hb68-s-override", chamber: "senate", district: 13, vote: "N",
    notes: "N. Manning, sole R against Senate override." },

  /* HB 8 (135th), forced outing */
  { rollCallId: "hb8-h-pass", chamber: "house", district: 36, vote: "N",
    notes: "A. White, against HB 8." },
  { rollCallId: "hb8-h-pass", chamber: "house", district: 52, vote: "N",
    notes: "G. Manning, against HB 8." },
  { rollCallId: "hb8-h-pass", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 8." },
  { rollCallId: "hb8-s-pass", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing III, against HB 8 Senate passage." },
  { rollCallId: "hb8-h-concur", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against HB 8 concurrence." },

  /* SB 104 (135th), bathroom ban */
  { rollCallId: "sb104-h-pass", chamber: "house", district: 57, vote: "N",
    notes: "Callender, against SB 104 House passage with bathroom-ban amendment." },

  /* SB 1 (136th), higher-ed DEI ban */
  { rollCallId: "sb1-136-s-pass", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing III, crossed on SB 1 Senate passage." },
  { rollCallId: "sb1-136-s-pass", chamber: "senate", district: 24, vote: "N",
    notes: "Patton, crossed on SB 1 Senate passage." },
  { rollCallId: "sb1-136-s-concur", chamber: "senate", district: 8, vote: "N",
    notes: "Blessing III, crossed on SB 1 Senate concurrence." },
  { rollCallId: "sb1-136-s-concur", chamber: "senate", district: 24, vote: "N",
    notes: "Patton, crossed on SB 1 Senate concurrence." }
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
  chamber = String(chamber).toLowerCase();

  /* Committee votes are only taken by the committee's chamber, so
     House members shouldn't be credited or charged on Senate roll
     calls (and vice versa). Floor passage, concur, and override
     are chamber-scoped by design. */
  if (rollCall.chamber && rollCall.chamber !== chamber) return "-";

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

/**
 * Convert a resolved vote + roll call into a signed score impact.
 *
 * Returns: { direction: "pro"|"anti"|"neutral", points: <number>, vote: <Y|N|NV|E|-> }
 *
 *   On an anti-equality bill:
 *     Y → anti, points = -1 * weight
 *     N → pro,  points = +1 * weight
 *   On a pro-equality bill:
 *     Y → pro,  points = +1 * weight
 *     N → anti, points = -1 * weight
 *   NV / E / - → neutral, points = 0
 */
function voteImpact(legislator, rollCall) {
  var v = resolveVote(legislator, rollCall);
  var weight = EVENT_WEIGHTS[rollCall.stage] != null ? EVENT_WEIGHTS[rollCall.stage] : 1.0;

  if (v !== "Y" && v !== "N") {
    return { vote: v, direction: "neutral", points: 0, weight: weight };
  }

  var dir, points;
  if (rollCall.stance === "anti") {
    if (v === "Y") { dir = "anti"; points = -1 * weight; }
    else           { dir = "pro";  points = +1 * weight; }
  } else if (rollCall.stance === "pro") {
    if (v === "Y") { dir = "pro";  points = +1 * weight; }
    else           { dir = "anti"; points = -1 * weight; }
  } else {
    dir = "neutral"; points = 0;
  }

  return { vote: v, direction: dir, points: Math.round(points * 100) / 100, weight: weight };
}

/**
 * Aggregate a legislator's roll-call record into a per-bill breakdown.
 *
 * Returns an array sorted by voteDate descending, each entry:
 *   {
 *     rollCall:  <roll call object>,
 *     vote:      "Y"|"N"|"NV"|"E"|"-",
 *     direction: "pro"|"anti"|"neutral",
 *     points:    signed number
 *   }
 *
 * Entries where the member was not eligible to vote (opposite chamber,
 * not seated yet) are filtered out by default so the scorecard only
 * surfaces votes that actually mattered to this member.
 */
function getVoteBreakdown(legislator, opts) {
  opts = opts || {};
  var includeIneligible = !!opts.includeIneligible;
  var out = [];
  for (var i = 0; i < ROLL_CALLS.length; i++) {
    var rc = ROLL_CALLS[i];
    var impact = voteImpact(legislator, rc);
    if (!includeIneligible && impact.vote === "-") continue;
    out.push({
      rollCall: rc,
      vote: impact.vote,
      direction: impact.direction,
      points: impact.points,
      weight: impact.weight
    });
  }
  out.sort(function (a, b) {
    return b.rollCall.voteDate.localeCompare(a.rollCall.voteDate);
  });
  return out;
}

/**
 * Roll a legislator's breakdown into a summary totals object:
 *   {
 *     proVotes:     number of pro-equality direction votes
 *     antiVotes:    number of anti-equality direction votes
 *     neutralVotes: NV/E rows (eligible but not voted)
 *     proPoints:    sum of positive points
 *     antiPoints:   sum of negative points (already negative)
 *     net:          sum of all points
 *   }
 */
function summarizeVotes(legislator) {
  var br = getVoteBreakdown(legislator);
  var pro = 0, anti = 0, neu = 0, proPts = 0, antiPts = 0, net = 0;
  for (var i = 0; i < br.length; i++) {
    var b = br[i];
    if (b.direction === "pro")      { pro++;  proPts  += b.points; }
    else if (b.direction === "anti"){ anti++; antiPts += b.points; }
    else                            { neu++; }
    net += b.points;
  }
  return {
    proVotes: pro,
    antiVotes: anti,
    neutralVotes: neu,
    proPoints: Math.round(proPts * 100) / 100,
    antiPoints: Math.round(antiPts * 100) / 100,
    net: Math.round(net * 100) / 100
  };
}

/* -------------------------------------------------------
   EXPORT (if used in a module context)
   ------------------------------------------------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VOTING_RECORDS_UPDATED: VOTING_RECORDS_UPDATED,
    EVENT_WEIGHTS: EVENT_WEIGHTS,
    ROLL_CALLS: ROLL_CALLS,
    VOTE_EXCEPTIONS: VOTE_EXCEPTIONS,
    SEATED_SINCE: SEATED_SINCE,
    getRollCall: getRollCall,
    getRollCallsForBill: getRollCallsForBill,
    resolveVote: resolveVote,
    voteImpact: voteImpact,
    getVoteBreakdown: getVoteBreakdown,
    summarizeVotes: summarizeVotes
  };
}
