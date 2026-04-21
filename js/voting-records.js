/* ============================================================
   Ohio Pride PAC — Voting Records
   Shared data + helpers for rendering per-member voting records
   against the bills tracked on /issues.

   Scope (current): only bills from the 22 tracked on /issues
   that have received a recorded floor vote. Everything else
   stays in committee and therefore produces no vote data.

   HOW TO ADD A ROLL CALL
   ----------------------
   1. Add an entry to ROLL_CALLS keyed by `<billId>-<chamber>-<stage>`.
   2. Fill in bill, chamber, label, date (YYYY-MM-DD), result,
      and the bill's stance ("anti" | "pro") as seen from the
      equality perspective.
   3. If the roll differs from party-line, add a `votes` map
      with only the exceptions, keyed by
      "<chamber><district>": "Y" | "N" | "A".
      Everyone else resolves to their party-line default.

   RESOLUTION ORDER (see resolveVote)
   ----------------------------------
   1. Explicit override in rc.votes
   2. null if member.seatedSince > rc.date (not seated yet)
   3. Party-line default:
        anti-equality bill → R = Y, D = N
        pro-equality bill  → R = N, D = Y

   Depends on HOUSE_MEMBERS / SENATE_MEMBERS from
   scorecard-data.js and BILLS from bill-data.js.
   ============================================================ */

const ROLL_CALLS = {
  /* HB 249 — House passage, 63-32 on 3/25/2026.
     The audit documents Rep. Jamie Callender (R-57) as the only
     confirmed Republican crossover on HB 249. Other defections or
     absences that brought the total to 63-32 (with 4 not voting)
     are not individually documented in the audit and default to
     party-line until the Journal is fetched. */
  "hb249-h-pass": {
    bill: "hb249",
    chamber: "house",
    label: "House Passage",
    date: "2026-03-25",
    result: "Passed 63–32",
    stance: "anti",
    votes: {
      H57: "N", // Callender (R) — documented crossover
    },
  },

  /* SB 34 — Senate passage, 23-10 on 11/20/2025.
     Party composition at the time was 24R / 9D.  The audit reports
     the tally but does not identify the single Republican crossover
     or absent member bringing the total to 23. Defaults to
     party-line pending Journal confirmation. */
  "sb34-s-pass": {
    bill: "sb34",
    chamber: "senate",
    label: "Senate Passage",
    date: "2025-11-20",
    result: "Passed 23–10",
    stance: "anti",
    votes: {},
  },
};

/* Members that joined partway through the relevant period.
   Used by resolveVote() to return null (not yet seated) instead
   of a party-line default. ISO dates.

   Every member listed here is marked in the audit research as
   a freshman (no dash-marker) for the 136th GA, which convened
   January 6, 2025. The only 136th roll call we currently track
   occurred AFTER that date, so in practice these entries are
   future-proofing for additional roll calls — not active. */
const SEATED_SINCE = {
  // Currently no active not-seated cases for HB 249 (2026) or SB 34 (2025)
  // since the 136th GA was already in session. Left intentionally empty.
};

function _memberKey(member, chamber) {
  return (chamber === "senate" ? "S" : "H") + member.d;
}

function resolveVote(member, rcId, chamber) {
  const rc = ROLL_CALLS[rcId];
  if (!rc) return null;
  if (chamber && rc.chamber !== chamber) return null;

  const key = _memberKey(member, rc.chamber);
  if (rc.votes && rc.votes[key]) return rc.votes[key];

  const seatedSince = member.seatedSince || SEATED_SINCE[key];
  if (seatedSince && seatedSince > rc.date) return null;

  // Party-line default
  if (rc.stance === "anti") {
    return member.party === "R" ? "Y" : "N";
  } else {
    return member.party === "R" ? "N" : "Y";
  }
}

/* Returns one entry per roll call the bill has, in date order.
   Each entry: { id, label, date, result, stance, chamber } */
function getBillRollCalls(billId) {
  const out = [];
  Object.keys(ROLL_CALLS).forEach(function (id) {
    const rc = ROLL_CALLS[id];
    if (rc.bill === billId) {
      out.push({
        id: id,
        label: rc.label,
        date: rc.date,
        result: rc.result,
        stance: rc.stance,
        chamber: rc.chamber,
      });
    }
  });
  out.sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  return out;
}

/* For a member, returns a list of { bill, rollCalls: [...] } grouped
   by bill, filtered to roll calls that applied to their chamber and
   for which the member has a resolved vote.

   rollCalls entries: { id, label, date, result, stance, vote }
   where vote is "Y" | "N" | "A" and the caller decides color. */
function getMemberVoteSummary(member, chamber) {
  // chamber: "House" | "Senate"
  const chamberKey = chamber === "Senate" ? "senate" : "house";
  const byBill = {};
  Object.keys(ROLL_CALLS).forEach(function (id) {
    const rc = ROLL_CALLS[id];
    if (rc.chamber !== chamberKey) return;
    const vote = resolveVote(member, id, chamberKey);
    if (vote == null) return;
    if (!byBill[rc.bill]) byBill[rc.bill] = [];
    byBill[rc.bill].push({
      id: id,
      label: rc.label,
      date: rc.date,
      result: rc.result,
      stance: rc.stance,
      vote: vote,
    });
  });
  // Flatten to list with bill metadata
  const out = [];
  Object.keys(byBill).forEach(function (billId) {
    const bill = typeof getBillById === "function" ? getBillById(billId) : null;
    out.push({
      billId: billId,
      bill: bill ? bill.bill : billId.toUpperCase(),
      title: bill ? bill.title : "",
      stance: bill ? bill.stance : "anti",
      url: bill ? bill.url : null,
      rollCalls: byBill[billId].sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      }),
    });
  });
  return out;
}

/* Classify a single vote against the bill's stance, returning the
   label we should show on the scorecard card:
     "for-equality"     — member voted with the equality position
     "against-equality" — member voted against the equality position
     "absent"           — member was not listed on either side
*/
function classifyVote(vote, stance) {
  if (vote === "A") return "absent";
  if (stance === "anti") {
    // Anti-equality bill: Y = against-equality, N = for-equality
    return vote === "Y" ? "against-equality" : "for-equality";
  } else {
    // Pro-equality bill: Y = for-equality, N = against-equality
    return vote === "Y" ? "for-equality" : "against-equality";
  }
}
