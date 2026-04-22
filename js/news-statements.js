/* ============================================================
   Ohio Pride PAC — News & Public Statements Dataset
   ------------------------------------------------------------
   One row per recorded public statement, press event, floor
   speech, or media quote that contributes to a legislator's
   N (news/statements) subscore. The JS scorecard pulls these
   into the "Public Statements" section on any card whose
   member has a non-zero n.

   Field conventions (mirror public.news_statements in
   Migration 7 — same names, same scale):

     id          stable slug, "<district>-<chamber_letter>-<nnn>"
     chamber     "house" | "senate"
     district    integer
     date        "YYYY-MM-DD" (approximate is fine, "YYYY-MM-01")
     sentiment   "pro" | "anti"
     points      signed integer impact (+1..+3 or -1..-3)
     headline    one-line summary of the statement
     context     longer quote or paraphrase
     sourceUrl   URL (optional, empty string if not sourced)
     notes       free text (optional)

   Scoring hint: |points| maps roughly to:
     1 = routine public stance (vote explanation, press comment)
     2 = amplified stance (named press conference, op-ed,
         floor speech, notable quote)
     3 = signature position (caucus leadership, repeated
         high-profile advocacy or documented bias incident)

   NOT the law, the editorial layer. Migration 7 will persist
   this table and the scoring views in public.news_statements
   so the SQL scoring function can read it without parsing JS.
   ============================================================ */

const NEWS_STATEMENTS = [

  /* ───── House (Democrats, pro) ───── */
  { id: "1-h-01",  chamber: "house",  district: 1,  date: "2025-06-01", sentiment: "pro",  points:  2,
    headline: "Primary sponsor of HB 306 (Hate Crimes Act)",
    context:  "Jarrells re-introduced the Hate Crimes Act, extending protected-class coverage to gender identity and sexual orientation.",
    sourceUrl: "" },
  { id: "8-h-01",  chamber: "house",  district: 8,  date: "2025-04-01", sentiment: "pro",  points:  1,
    headline: "Medical-professional testimony against HB 68 impact on pediatric care",
    context:  "Somani, a physician, publicly criticized the pediatric-care carve-out in HB 68 during hearings.",
    sourceUrl: "" },
  { id: "11-h-01", chamber: "house",  district: 11, date: "2025-05-01", sentiment: "pro",  points:  2,
    headline: "Primary sponsor HB 136 (Fairness Act) + co-sponsor HB 300 (conversion therapy ban)",
    context:  "Lett has been a sustained champion on both the Fairness Act and the conversion-therapy ban.",
    sourceUrl: "" },
  { id: "13-h-01", chamber: "house",  district: 13, date: "2025-06-01", sentiment: "pro",  points:  3,
    headline: "Hosts annual Pride press conference; vocal LGBTQ+ advocate",
    context:  "Rader has hosted multi-caucus Pride press events and spoken on the House floor in defense of trans youth.",
    sourceUrl: "" },
  { id: "21-h-01", chamber: "house",  district: 21, date: "2025-06-01", sentiment: "pro",  points:  1,
    headline: "Participated in Pride Month press conference",
    context:  "Synenberg joined the Democratic caucus Pride press event and voted against every tracked anti-LGBTQ+ bill.",
    sourceUrl: "" },
  { id: "22-h-01", chamber: "house",  district: 22, date: "2025-03-01", sentiment: "pro",  points:  1,
    headline: "Co-sponsor of HB 327 (PRIDE Act)",
    context:  "Brewer added his name to the PRIDE Act coalition and voted the bloc's line on anti-equality bills.",
    sourceUrl: "" },
  { id: "24-h-01", chamber: "house",  district: 24, date: "2023-12-01", sentiment: "pro",  points:  1,
    headline: "Vocal opponent of HB 68 in the 135th GA",
    context:  "Isaacsohn spoke repeatedly against HB 68 during floor debate in the 135th General Assembly.",
    sourceUrl: "" },
  { id: "28-h-01", chamber: "house",  district: 28, date: "2025-03-01", sentiment: "pro",  points:  2,
    headline: "Primary sponsor HB 300 (conversion therapy ban) and HB 327 (PRIDE Act)",
    context:  "Brownlee is primary on two of the caucus's most visible pro-equality bills this GA.",
    sourceUrl: "" },
  { id: "57-h-01", chamber: "house",  district: 57, date: "2024-01-10", sentiment: "pro",  points:  3,
    headline: "Only Republican to vote against HB 68, HB 6, HB 8, and HB 249",
    context:  "Callender on the floor: \"I am a Republican because I believe in empowering individuals and limiting government.\"",
    sourceUrl: "" },

  /* ───── House (Republicans, mixed/pro exceptions) ───── */
  { id: "36-h-01", chamber: "house",  district: 36, date: "2024-12-18", sentiment: "pro",  points:  1,
    headline: "Voted against HB 8 (forced outing) on floor passage",
    context:  "White broke with her caucus on HB 8 while otherwise voting party line on anti-LGBTQ+ bills.",
    sourceUrl: "" },
  { id: "52-h-01", chamber: "house",  district: 52, date: "2024-12-18", sentiment: "pro",  points:  1,
    headline: "Voted against HB 8 + original HB 6 sports ban in committee",
    context:  "G. Manning broke with caucus on HB 8 and the original HB 6 sports-ban language.",
    sourceUrl: "" },

  /* ───── House (Republicans, anti) ───── */
  { id: "12-h-01", chamber: "house",  district: 12, date: "2025-06-01", sentiment: "anti", points: -1,
    headline: "Primary sponsor Sub HB 96 (anti-LGBTQ+ budget provisions)",
    context:  "Stewart authored the substitute budget that folded in anti-equality provisions targeting schools.",
    sourceUrl: "" },
  { id: "37-h-01", chamber: "house",  district: 37, date: "2025-02-01", sentiment: "anti", points: -1,
    headline: "Co-sponsor of HB 6 (House companion to SB 1 DEI ban)",
    context:  "Young co-sponsored the House companion of the DEI ban that Cirino led in the Senate.",
    sourceUrl: "" },
  { id: "40-h-01", chamber: "house",  district: 40, date: "2025-05-01", sentiment: "anti", points: -3,
    headline: "Primary sponsor HB 196 (trans candidate disclosure); BCI documents re: minor",
    context:  "Creech authored HB 196 requiring trans candidates to self-disclose. Separately, BCI documents referenced a misconduct allegation involving a minor relative.",
    sourceUrl: "" },
  { id: "44-h-01", chamber: "house",  district: 44, date: "2025-06-01", sentiment: "anti", points: -3,
    headline: "Primary/co-sponsor of 8+ anti-LGBTQ+ bills (most prolific author of the 136th GA)",
    context:  "Williams's bills this GA include HB 249, 155, 190, 262, 693, 796, 798 — the largest single-member anti-LGBTQ+ slate.",
    sourceUrl: "" },
  { id: "61-h-01", chamber: "house",  district: 61, date: "2025-03-01", sentiment: "anti", points: -2,
    headline: "Primary sponsor HB 155 (DEI ban), HB 262 (Natural Family Month)",
    context:  "Lear has paired anti-DEI legislation with an explicitly anti-equality rhetorical frame (\"Natural Family Month\").",
    sourceUrl: "" },
  { id: "78-h-01", chamber: "house",  district: 78, date: "2025-01-01", sentiment: "anti", points: -1,
    headline: "Advanced anti-LGBTQ+ agenda as former Senate President",
    context:  "Huffman, now in the House, was Senate President during HB 68 and SB 104 passage and pushed them to the floor.",
    sourceUrl: "" },
  { id: "80-h-01", chamber: "house",  district: 80, date: "2025-04-01", sentiment: "anti", points: -2,
    headline: "Primary sponsor HB 190 (Given Names Act) + HB 172 (mental-health consent removal)",
    context:  "Newman authored two targeted bills; has documented ties to Center for Christian Virtue (SPLC-designated anti-LGBTQ group).",
    sourceUrl: "" },
  { id: "84-h-01", chamber: "house",  district: 84, date: "2026-03-25", sentiment: "anti", points: -2,
    headline: "Primary sponsor HB 249 (drag ban); vocal anti-LGBTQ+ advocate",
    context:  "King's HB 249 passed the House 63-32. She is a repeat co-sponsor of HB 196 and has framed anti-equality bills in Christian-nationalist terms on the floor.",
    sourceUrl: "" },
  { id: "88-h-01", chamber: "house",  district: 88, date: "2024-01-10", sentiment: "anti", points: -3,
    headline: "Compared trans people to \"Lucifer\"; primary sponsor HB 68",
    context:  "Click compared trans people to \"Lucifer\" during override debate; separately named in misconduct-related allegations involving minors.",
    sourceUrl: "" },
  { id: "94-h-01", chamber: "house",  district: 94, date: "2025-02-01", sentiment: "anti", points: -1,
    headline: "Primary sponsor HB 507 (School Chaplain Act)",
    context:  "Ritter authored the School Chaplain Act, a vehicle for religious-exemption rollbacks in public schools.",
    sourceUrl: "" },
  { id: "99-h-01", chamber: "house",  district: 99, date: "2025-01-01", sentiment: "anti", points: -1,
    headline: "Votes far-right position on every tracked anti-LGBTQ+ bill",
    context:  "Fowler Arthur is a reliable floor vote for anti-LGBTQ+ legislation and affiliated with far-right caucus positioning.",
    sourceUrl: "" },

  /* ───── Senate (Democrats, pro) ───── */
  { id: "9-s-01",  chamber: "senate", district: 9,  date: "2024-11-13", sentiment: "pro",  points:  1,
    headline: "Vocal opponent of SB 104 (bathroom ban) during concurrence debate",
    context:  "Ingram took the floor during SB 104 concurrence and voted N with the Democratic caucus.",
    sourceUrl: "" },
  { id: "11-s-01", chamber: "senate", district: 11, date: "2024-01-24", sentiment: "pro",  points:  1,
    headline: "Said \"Just let me live\" during HB 68 override debate",
    context:  "Hicks-Hudson: \"Just let me live.\" Quoted widely in coverage of the HB 68 override.",
    sourceUrl: "" },
  { id: "13-s-01", chamber: "senate", district: 13, date: "2024-01-24", sentiment: "pro",  points:  2,
    headline: "Only Senate Republican to vote against HB 68 override",
    context:  "N. Manning was the sole R to break on the Senate override of HB 68, the bill's highest-stakes vote.",
    sourceUrl: "" },
  { id: "16-s-01", chamber: "senate", district: 16, date: "2025-03-01", sentiment: "pro",  points:  1,
    headline: "Co-sponsor SB 71 (conversion therapy ban)",
    context:  "Liston joined the SB 71 coalition and votes the bloc line on anti-equality bills.",
    sourceUrl: "" },
  { id: "21-s-01", chamber: "senate", district: 21, date: "2024-01-24", sentiment: "pro",  points:  1,
    headline: "Criticized \"state-sponsored bullying of trans youth\" during HB 68 override",
    context:  "Smith on the Senate floor: \"This is state-sponsored bullying of trans youth.\"",
    sourceUrl: "" },
  { id: "23-s-01", chamber: "senate", district: 23, date: "2025-01-01", sentiment: "pro",  points:  3,
    headline: "Senate Minority Leader; primary sponsor SB 70, SB 71, SB 211",
    context:  "Antonio is Ohio's first openly LGBTQ+ legislator and the caucus's lead on SB 70 (Fairness Act, 12th introduction), SB 71, and SB 211.",
    sourceUrl: "" },
  { id: "25-s-01", chamber: "senate", district: 25, date: "2024-01-24", sentiment: "pro",  points:  1,
    headline: "Motioned to adjourn before HB 68 override vote",
    context:  "DeMora filed a procedural motion to adjourn on the override day, a visible protest of the vote's scheduling.",
    sourceUrl: "" },
  { id: "28-s-01", chamber: "senate", district: 28, date: "2025-06-01", sentiment: "pro",  points:  1,
    headline: "Reliable N vote on every tracked anti-LGBTQ+ bill in Senate",
    context:  "Weinstein has voted with the Democratic caucus against every tracked anti-LGBTQ+ bill of the 135th and 136th GAs.",
    sourceUrl: "" },
  { id: "8-s-01",  chamber: "senate", district: 8,  date: "2024-12-18", sentiment: "pro",  points:  1,
    headline: "Voted against HB 8 (forced outing) in Senate",
    context:  "Blessing III broke with caucus on HB 8 and SB 1 concurrence while otherwise voting party line.",
    sourceUrl: "" },

  /* ───── Senate (Republicans, anti) ───── */
  { id: "14-s-01", chamber: "senate", district: 14, date: "2025-11-19", sentiment: "anti", points: -1,
    headline: "Primary sponsor SB 34 (Ten Commandments in schools)",
    context:  "Johnson authored SB 34 requiring Ten Commandments displays in public-school classrooms.",
    sourceUrl: "" },
  { id: "18-s-01", chamber: "senate", district: 18, date: "2024-01-24", sentiment: "anti", points: -3,
    headline: "Primary sponsor SB 1 (DEI ban); religious arguments for HB 68 override",
    context:  "Cirino led the Senate DEI ban (SB 1) and delivered religious-framed arguments for the HB 68 override. Also co-sponsor SB 104 (bathroom ban) and SB 274.",
    sourceUrl: "" },
  { id: "19-s-01", chamber: "senate", district: 19, date: "2025-02-01", sentiment: "anti", points: -2,
    headline: "Called DEI \"institutional discrimination\"; primary sponsor SB 113, SB 274",
    context:  "Brenner framed DEI as \"institutional discrimination\" in floor remarks. Co-sponsor SB 104 (bathroom ban).",
    sourceUrl: "" },
  { id: "27-s-01", chamber: "senate", district: 27, date: "2024-01-24", sentiment: "anti", points: -2,
    headline: "Made anti-trans statements during HB 68 override debate",
    context:  "Roegner delivered anti-trans remarks during the override debate and voted Y to override.",
    sourceUrl: "" }
];

/* -------------------------------------------------------
   LOOKUP HELPERS
   ------------------------------------------------------- */

/**
 * Returns news statements filtered to a single legislator.
 * legislator: { chamber: "house"|"senate"|"House"|"Senate", d: <int> }
 * Sorted newest first.
 */
function getNewsStatements(legislator) {
  if (!legislator) return [];
  var chamber = (legislator.chamber || "").toString().toLowerCase();
  var district = legislator.d;
  var out = [];
  for (var i = 0; i < NEWS_STATEMENTS.length; i++) {
    var s = NEWS_STATEMENTS[i];
    if (s.chamber === chamber && s.district === district) out.push(s);
  }
  out.sort(function (a, b) { return b.date.localeCompare(a.date); });
  return out;
}

/**
 * Totals object for a legislator's news statements.
 * { proItems, antiItems, proPoints, antiPoints, net }
 */
function summarizeNewsStatements(legislator) {
  var rows = getNewsStatements(legislator);
  var pro = 0, anti = 0, proPts = 0, antiPts = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.sentiment === "pro")  { pro++;  proPts  += r.points; }
    else if (r.sentiment === "anti") { anti++; antiPts += r.points; }
  }
  return {
    proItems: pro,
    antiItems: anti,
    proPoints: proPts,
    antiPoints: antiPts,
    net: proPts + antiPts
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    NEWS_STATEMENTS: NEWS_STATEMENTS,
    getNewsStatements: getNewsStatements,
    summarizeNewsStatements: summarizeNewsStatements
  };
}
