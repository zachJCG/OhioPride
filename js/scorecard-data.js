/* ============================================================
   Ohio Pride PAC, Legislative Scorecard Data
   Last updated: 04/22/26

   HOW TO UPDATE:
   1. Find the legislator in HOUSE_MEMBERS or SENATE_MEMBERS
   2. Adjust their votes/sponsorship/news scores
   3. Add notes explaining the change
   4. Update SCORECARD_UPDATED below

   SCORING OVERVIEW (v6)
   ---------------------------------------------------------
   Each legislator carries three editorial subscores on a
   -5 to +5 scale, all derived from official Ohio General
   Assembly roll-call records and bill text. Floor and
   committee votes are weighted equally but tracked separately
   so a reader can see both signals.

     vf   Floor votes                          (weight x4)
     vc   Committee votes                      (weight x4)
     s    Sponsorship and co-sponsorship       (weight x2)
          (primary +/-2, co-sponsor +/-1)

   News, quotes, and floor speeches are no longer scored.
   We weight only what we can verify from the chamber journal
   and Legislative Service Commission filings.

   Composite score (0-100) is computed in calcScore() as:
     score = max(0, min(100,
                round(50 + (vf * 4) + (vc * 4) + (s * 2))))

   Grade scale (applied after composite):
     A+  90-100  Champion
     A   73-89   Strong Ally
     B   55-72   Supportive
     C   40-54   Mixed Record
     D   20-39   Unfriendly
     F    0-19   Hostile

   Source hierarchy (high to low authority):
     1. Chamber journal of record (roll call)
     2. Legislative Service Commission bill analysis
     3. Committee minutes and clerk reports
     4. Primary-source news (hearing coverage, press events)
     5. Sponsor-authored statements and press releases
     6. Advocacy or opposition statements
   ============================================================ */

const SCORECARD_UPDATED = { date: "04/23/26", time: "v6 — Trackable Evidence Only" };

/* Grade thresholds (weighted score 0-100)
   New 7-grade scale (April 2026 rebalance):
   A+ Champion       ≥95
   A  Strong Ally    88-94
   A- Reliable Ally  78-87
   D  Unfriendly     18-37
   F  Hostile        0-17
   B  Supportive     60-77
   C  Mixed Record   38-59
*/
const GRADE_SCALE = [
  { min: 95, grade: "A+", label: "Champion",      color: "#16a34a" },
  { min: 88, grade: "A",  label: "Strong Ally",   color: "#22c55e" },
  { min: 78, grade: "A-", label: "Reliable Ally", color: "#65a30d" },
  { min: 60, grade: "B",  label: "Supportive",    color: "#84cc16" },
  { min: 38, grade: "C",  label: "Mixed Record",  color: "#eab308" },
  { min: 18, grade: "D",  label: "Unfriendly",    color: "#f97316" },
  { min: 0,  grade: "F",  label: "Hostile",       color: "#dc2626" },
];

/* Bills used in scoring (for reference panel)
   Mirrors BILLS in bill-data.js. Keep order aligned with that file
   so the scorecard reference panel reads top-to-bottom in the
   editorial priority sequence. */
const SCORED_BILLS = [
  /* Active anti-equality, on the floor or moving */
  { id: "hb249", bill: "HB 249",  title: "Drag Ban",                                     ga: "136th", stance: "anti",  status: "Passed House 63-32",         date: "3/25/2026" },
  { id: "sb34",  bill: "SB 34",   title: "Ten Commandments Classroom Displays",          ga: "136th", stance: "anti",  status: "Passed Senate 23-10",        date: "11/20/2025" },

  /* Active anti-equality, in committee or introduced */
  { id: "hb798", bill: "HB 798",  title: "Omnibus Anti-Trans Bill",                      ga: "136th", stance: "anti",  status: "Introduced",                 date: "3/31/2026" },
  { id: "hb796", bill: "HB 796",  title: "Prison Trans Housing Ban",                     ga: "136th", stance: "anti",  status: "Introduced",                 date: "3/25/2026" },
  { id: "hb693", bill: "HB 693",  title: "Affirming Families First Act",                 ga: "136th", stance: "anti",  status: "In Committee",               date: "3/25/2026" },
  { id: "hb602", bill: "HB 602",  title: "Pride Flag Ban on State Property",             ga: "136th", stance: "anti",  status: "In Committee",               date: "3/30/2026" },
  { id: "hb457", bill: "HB 457",  title: "Politically-Motivated Crimes",                 ga: "136th", stance: "anti",  status: "In Committee",               date: "" },
  { id: "hb190", bill: "HB 190",  title: "Given Name Act (Forced Outing)",               ga: "136th", stance: "anti",  status: "In Committee",               date: "4/29/2025" },
  { id: "hb155", bill: "HB 155",  title: "K-12 DEI Ban",                                 ga: "136th", stance: "anti",  status: "In Committee",               date: "5/20/2025" },
  { id: "sb113", bill: "SB 113",  title: "Senate DEI Ban (Schools)",                     ga: "136th", stance: "anti",  status: "In Committee",               date: "3/25/2026" },
  { id: "hb172", bill: "HB 172",  title: "Minor Mental Health Consent",                  ga: "136th", stance: "anti",  status: "In Committee",               date: "11/19/2025" },
  { id: "sb274", bill: "SB 274",  title: "Senate Companion to HB 172",                   ga: "136th", stance: "anti",  status: "In Committee",               date: "10/1/2025" },
  { id: "hb196", bill: "HB 196",  title: "Deadnaming Candidates Bill",                   ga: "136th", stance: "anti",  status: "In Committee",               date: "4/29/2025" },
  { id: "hb262", bill: "HB 262",  title: "Designate Natural Family Month",               ga: "136th", stance: "anti",  status: "In Committee",               date: "9/30/2025" },

  /* Anti-equality, signed or overridden into law (scorecard context) */
  { id: "sb1",   bill: "SB 1",    title: "DEI Ban (Higher Ed)",                          ga: "136th", stance: "anti",  status: "Signed Into Law",            date: "3/28/2025" },
  { id: "sb104", bill: "SB 104",  title: "Bathroom Ban",                                 ga: "135th", stance: "anti",  status: "Signed Into Law",            date: "11/27/2024" },
  { id: "hb8",   bill: "HB 8",    title: "Parents' Bill of Rights (Forced Outing)",      ga: "135th", stance: "anti",  status: "Signed Into Law",            date: "12/18/2024" },
  { id: "hb68",  bill: "HB 68",   title: "Gender-Affirming Care Ban + Sports Ban",       ga: "135th", stance: "anti",  status: "Law (Veto Overridden)",      date: "1/24/2024" },

  /* Pro-equality bills */
  { id: "sb70",      bill: "SB 70",        title: "Ohio Fairness Act",                            ga: "136th", stance: "pro",   status: "In Committee",               date: "" },
  { id: "hb136",     bill: "HB 136",       title: "Ohio Fairness Act (House)",                    ga: "136th", stance: "pro",   status: "In Committee",               date: "" },
  { id: "sb71",      bill: "SB 71",        title: "Conversion Therapy Ban",                       ga: "136th", stance: "pro",   status: "In Committee",               date: "" },
  { id: "hb300",     bill: "HB 300",       title: "Conversion Therapy Ban (House)",               ga: "136th", stance: "pro",   status: "Introduced",                 date: "" },
  { id: "hjr4",      bill: "HJR 4",        title: "Marriage Equality Act",                        ga: "136th", stance: "pro",   status: "In Committee",               date: "" },
  { id: "hb327",     bill: "HB 327",       title: "PRIDE Act",                                    ga: "136th", stance: "pro",   status: "In Committee",               date: "" },
  { id: "sb211",     bill: "SB 211",       title: "Love Makes a Family Week",                     ga: "136th", stance: "pro",   status: "Introduced",                 date: "10/14/2025" },
  { id: "hb467-135", bill: "HB 467 (135th)", title: "Trans Candidate Name-Change Fix",            ga: "135th", stance: "pro",   status: "Died In Committee",          date: "3/27/2024" },

  /* Mixed bills */
  { id: "hb306", bill: "HB 306",  title: "Hate Crimes Act (Excludes Trans Protections)", ga: "136th", stance: "mixed", status: "In Committee",               date: "2/25/2026" },
];

/* -------------------------------------------------------
   HOUSE MEMBERS (99 seats)
   Fields: district, name, party, votes, sponsorship, news, notes
   ------------------------------------------------------- */
const HOUSE_MEMBERS = [
  { d: 1,  name: "Dontavius L. Jarrells",      party: "D", v: 5,  s: 3,   n: 2,  notes: "Primary sponsor HB 306 (Hate Crimes Act). Votes consistently against anti-LGBTQ+ bills." },
  { d: 2,  name: "Latyna M. Humphrey",          party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 3,  name: "Ismail Mohamed",              party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 4,  name: "Beryl Brown Piccolantonio",   party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 5,  name: "Meredith R. Lawson-Rowe",     party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 6,  name: "Christine Cockley",           party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 7,  name: "C. Allison Russo",            party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills. House Minority Leader." },
  { d: 8,  name: "Anita Somani",                party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills. Medical professional; vocal on healthcare bills." },
  { d: 9,  name: "Munira Abdullahi",            party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 10, name: "Mark Sigrist",                party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 11, name: "Crystal Lett",                party: "D", v: 5,  s: 5,   n: 2,  notes: "Primary sponsor HB 136 (Fairness Act), co-sponsor HB 300 (conversion therapy ban). Champion." },
  { d: 12, name: "Brian Stewart",               party: "R", v: -5, s: -3,  n: -1, notes: "Primary sponsor Sub HB 96 (budget with anti-LGBTQ+ provisions). Votes for anti-LGBTQ+ bills." },
  { d: 13, name: "Tristan Rader",               party: "D", v: 5,  s: 5,   n: 3,  notes: "Primary sponsor HB 136 (Fairness Act). Vocal advocate for LGBTQ+ rights. Hosts Pride press conferences." },
  { d: 14, name: "Sean P. Brennan",             party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 15, name: "Chris Glassburn",             party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 16, name: "Bride Rose Sweeney",          party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 17, name: "Michael D. Dovilla",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 18, name: "Juanita O. Brent",            party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 19, name: "Phillip M. Robinson, Jr.",     party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 20, name: "Terrence Upchurch",           party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 21, name: "Eric Synenberg",              party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills. Participated in Pride press conference." },
  { d: 22, name: "Darnell T. Brewer",           party: "D", v: 5,  s: 2,   n: 1,  notes: "Co-sponsor HB 327 (PRIDE Act). Votes against anti-LGBTQ+ bills." },
  { d: 23, name: "Daniel P. Troy",              party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 24, name: "Dani Isaacsohn",              party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills. Vocal opponent of HB 68 in 135th GA." },
  { d: 25, name: "Cecil Thomas",                party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 26, name: "Ashley Bryant Bailey",        party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 27, name: "Rachel B. Baker",             party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 28, name: "Karen Brownlee",              party: "D", v: 5,  s: 5,   n: 2,  notes: "Primary sponsor HB 300 (conversion therapy ban), HB 327 (PRIDE Act). Strong champion." },
  { d: 29, name: "Cindy Abrams",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 30, name: "Mike Odioso",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 31, name: "Bill Roemer",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 32, name: "Jack K. Daniels",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 33, name: "Veronica R. Sims",            party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 34, name: "Derrick Hall",                party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 35, name: "Steve Demetriou",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 36, name: "Andrea White",                party: "R", v: -2, s: 0,   n: 1,  notes: "Voted against HB 8 (forced outing). Otherwise votes party line on anti-LGBTQ+ bills." },
  { d: 37, name: "Tom Young",                   party: "R", v: -5, s: -2,  n: -1, notes: "Co-sponsor HB 6 (companion to SB 1 DEI ban). Votes for anti-LGBTQ+ bills." },
  { d: 38, name: "Desiree Tims",                party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 39, name: "Phil Plummer",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 40, name: "Rodney Creech",               party: "R", v: -5, s: -3,  n: -3, notes: "Primary sponsor HB 196 (trans candidate disclosure). Accused of sexual misconduct with minor relative (BCI documents)." },
  { d: 41, name: "Erika White",                 party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 42, name: "Elgin Rogers, Jr.",           party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 43, name: "Michele Grim",                party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 44, name: "Josh Williams",               party: "R", v: -5, s: -15, n: -3, notes: "Primary/co-sponsor of 8+ anti-LGBTQ+ bills: HB 249, 155, 190, 262, 693, 796, 798. Most prolific anti-LGBTQ+ bill author in 136th GA." },
  { d: 45, name: "Jennifer Gross",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 46, name: "Thomas Hall",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 47, name: "Diane Mullins",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 48, name: "Scott Oelslager",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 49, name: "Jim Thomas",                  party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 50, name: "Matthew Kishman",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 51, name: "Jodi Salvo",                  party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 52, name: "Gayle Manning",               party: "R", v: -2, s: 0,   n: 1,  notes: "Voted against HB 8 (forced outing) and original HB 6 (sports ban) in committee. Otherwise party line." },
  { d: 53, name: "Joseph A. Miller, III",        party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 54, name: "Kellie Deeter",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 55, name: "Michelle Teska",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 56, name: "Adam Mathews",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 57, name: "Jamie Callender",             party: "R", v: 5,  s: 0,   n: 3,  notes: "Only Republican to vote against HB 68, HB 6, HB 8, and HB 249. Stated: 'I am a Republican because I believe in empowering individuals and limiting government.'" },
  { d: 58, name: "Lauren McNally",              party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 59, name: "Tex Fischer",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 60, name: "Brian Lorenz",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 61, name: "Beth Lear",                   party: "R", v: -5, s: -6,  n: -2, notes: "Primary sponsor HB 155 (DEI ban), HB 262 (Natural Family Month). Anti-equality rhetoric." },
  { d: 62, name: "Jean Schmidt",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 63, name: "Adam C. Bird",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 64, name: "Nick Santucci",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 65, name: "David Thomas",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 66, name: "Sharon A. Ray",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 67, name: "Melanie Miller",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 68, name: "Thaddeus J. Claggett",        party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 69, name: "Kevin D. Miller",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 70, name: "Brian Lampton",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 71, name: "Levi Dean",                   party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 72, name: "Heidi Workman",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 73, name: "Jeff LaRe",                   party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 74, name: "Bernard Willis",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 75, name: "Haraz N. Ghanbari",           party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 76, name: "Marilyn John",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 77, name: "Meredith Craig",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 78, name: "Matt Huffman",                party: "R", v: -5, s: 0,   n: -1, notes: "Votes for anti-LGBTQ+ bills. Former Senate President who advanced anti-LGBTQ+ agenda." },
  { d: 79, name: "Monica Robb Blasdel",         party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 80, name: "Johnathan Newman",            party: "R", v: -5, s: -6,  n: -2, notes: "Primary sponsor HB 190 (Given Names Act), HB 172 (mental health consent removal). Ties to Center for Christian Virtue (SPLC-designated anti-LGBTQ group)." },
  { d: 81, name: "James M. Hoops",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 82, name: "Roy Klopfenstein",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 83, name: "Ty D. Mathews",               party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 84, name: "Angela N. King",              party: "R", v: -5, s: -6,  n: -2, notes: "Primary sponsor HB 249 (drag ban), co-sponsor HB 196 (trans candidate disclosure). Vocal proponent of anti-LGBTQ+ legislation." },
  { d: 85, name: "Tim Barhorst",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 86, name: "Tracy M. Richardson",         party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 87, name: "Riordan T. McClain",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 88, name: "Gary Click",                  party: "R", v: -5, s: -6,  n: -3, notes: "Primary sponsor HB 68 (135th GA, care ban) and HB 693 (affirming families). Compared trans people to 'Lucifer.' Misconduct-related allegations involving minors." },
  { d: 89, name: "D. J. Swearingen",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 90, name: "Justin Pizzulli",             party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 91, name: "Bob Peterson",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 92, name: "Mark Johnson",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 93, name: "Jason Stephens",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 94, name: "Kevin Ritter",                party: "R", v: -5, s: -3,  n: -1, notes: "Primary sponsor HB 507 (School Chaplain Act). Votes for anti-LGBTQ+ bills." },
  { d: 95, name: "Ty Moore",                    party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 96, name: "Ron Ferguson",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 97, name: "Adam Holmes",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 98, name: "Mark Hiner",                  party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 99, name: "Sarah Fowler Arthur",         party: "R", v: -5, s: 0,   n: -1, notes: "Votes for anti-LGBTQ+ bills. Known for far-right positions." },
];

/* -------------------------------------------------------
   SENATE MEMBERS (33 seats)
   ------------------------------------------------------- */
const SENATE_MEMBERS = [
  { d: 1,  name: "Rob McColley",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 2,  name: "Theresa Gavarone",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 3,  name: "Michele Reynolds",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 4,  name: "George F. Lang",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 5,  name: "Stephen A. Huffman",        party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 6,  name: "Willis E. Blackshear, Jr.", party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 7,  name: "Steve Wilson",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 8,  name: "Louis W. Blessing, III",    party: "R", v: -3, s: 0,   n: 1,  notes: "Voted against HB 8 (forced outing) in Senate. Otherwise votes party line." },
  { d: 9,  name: "Catherine D. Ingram",       party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills. Vocal opponent of SB 104 (bathroom ban)." },
  { d: 10, name: "Kyle Koehler",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 11, name: "Paula Hicks-Hudson",        party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills. Argued 'Just let me live' during HB 68 override debate." },
  { d: 12, name: "Susan Manchester",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 13, name: "Nathan H. Manning",         party: "R", v: -1, s: 0,   n: 2,  notes: "Only Republican senator to vote against HB 68 veto override. Notable crossover on major bill." },
  { d: 14, name: "Terry Johnson",             party: "R", v: -5, s: -3,  n: -1, notes: "Primary sponsor SB 34 (Ten Commandments in schools)." },
  { d: 15, name: "Hearcel F. Craig",          party: "D", v: 5,  s: 0,   n: 0,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 16, name: "Beth Liston",               party: "D", v: 5,  s: 2,   n: 1,  notes: "Co-sponsor SB 71 (conversion therapy ban). Votes against anti-LGBTQ+ bills." },
  { d: 17, name: "Shane Wilkin",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 18, name: "Jerry C. Cirino",           party: "R", v: -5, s: -9,  n: -3, notes: "Primary sponsor SB 1 (DEI ban), co-sponsor SB 104 (bathroom ban), SB 274 (minor consent). Religious arguments for HB 68 override." },
  { d: 19, name: "Andrew O. Brenner",         party: "R", v: -5, s: -9,  n: -2, notes: "Primary sponsor SB 113 (school DEI ban), SB 274 (minor consent), co-sponsor SB 104 (bathroom ban). Called DEI 'institutional discrimination.'" },
  { d: 20, name: "Tim Schaffer",              party: "R", v: -5, s: -3,  n: 0,  notes: "Primary sponsor SB 53 (anti-protest/vandalism)." },
  { d: 21, name: "Kent Smith",                party: "D", v: 5,  s: 0,   n: 1,  notes: "Criticized 'state-sponsored bullying of trans youth' during HB 68 debate." },
  { d: 22, name: "Mark Romanchuk",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 23, name: "Nickie J. Antonio",         party: "D", v: 5,  s: 9,   n: 3,  notes: "Primary sponsor SB 70 (Fairness Act, 12th time), SB 71 (conversion therapy ban), SB 211 (Love Makes a Family). Senate Minority Leader. First openly LGBTQ+ Ohio legislator." },
  { d: 24, name: "Thomas F. Patton",          party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 25, name: "William P. DeMora",         party: "D", v: 5,  s: 0,   n: 1,  notes: "Motioned to adjourn before HB 68 override vote." },
  { d: 26, name: "Bill Reineke",              party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 27, name: "Kristina D. Roegner",       party: "R", v: -5, s: 0,   n: -2, notes: "Made anti-trans statements during HB 68 override debate." },
  { d: 28, name: "Casey Weinstein",           party: "D", v: 5,  s: 0,   n: 1,  notes: "Votes against anti-LGBTQ+ bills." },
  { d: 29, name: "Jane M. Timken",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 30, name: "Brian M. Chavez",           party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 31, name: "Al Landis",                 party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 32, name: "Sandra O'Brien",            party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
  { d: 33, name: "Al Cutrona",                party: "R", v: -5, s: 0,   n: 0,  notes: "Votes for anti-LGBTQ+ bills." },
];

/* -------------------------------------------------------
   CHAMBER TAGGING
   The member objects above don't carry a chamber field on their own,
   so we tag each one here. Downstream helpers (legKey, news/sponsorship
   lookup, voting-records joins) all rely on m.chamber being set.
   ------------------------------------------------------- */
(function tagChambers() {
  for (var i = 0; i < HOUSE_MEMBERS.length; i++) HOUSE_MEMBERS[i].chamber = 'house';
  for (var j = 0; j < SENATE_MEMBERS.length; j++) SENATE_MEMBERS[j].chamber = 'senate';
})();

/* -------------------------------------------------------
   SCORE CALCULATION (used by scorecard.html)  — v6

   Per the published methodology, each legislator's grade is
   derived from real evidence on three subscores in -5..+5,
   all from the official chamber journal:

     vf Floor votes      weighted sum of resolved pass / concur /
                         override roll calls (pass/concur 1.00,
                         override 1.25). Normalized by the
                         legislator's total possible points across
                         eligible floor roll calls and scaled to
                         -5..+5.

     vc Committee votes  same scoring math as vf but applied only
                         to the committee stage (weight 0.75).
                         Tracked separately because committee
                         assignments differ across members and
                         readers should see both signals.

     s  Sponsorship      primary sponsor of an anti-equality bill
                         is -2; primary sponsor of a pro-equality
                         bill is +2; co-sponsor is +/-1. Sum,
                         then clamp to -5..+5. Primary holds more
                         weight than co-sponsor by design.

   Composite (v6):
     score = clamp(0, 100,
             round(50 + (vf * 4) + (vc * 4) + (s * 2)))

   News and public statements are no longer scored. The editorial
   m.v / m.s / m.n fields on member records are kept for
   reference only; they are NOT used in grading. They are
   superseded by computeSubscores() so the scorecard always shows
   what real evidence supports.
   ------------------------------------------------------- */

/* Internal: scale a subset of vote rows into a -5..+5 subscore. Same
   normalization the v5 single-V subscore used, just applied to a filter
   so floor and committee can be tracked separately. */
function _scoreVoteRows(rows) {
  if (!rows || !rows.length) return 0;
  var net = 0, denom = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    net   += (r.points || 0);
    if (r.direction === 'pro' || r.direction === 'anti') {
      denom += Math.abs(r.weight || 0);
    }
  }
  if (denom <= 0) return 0;
  var scaled = (net / denom) * 5;
  if (scaled >  5) scaled =  5;
  if (scaled < -5) scaled = -5;
  return Math.round(scaled * 10) / 10;
}

/* Floor-vote subscore (-5..+5). Counts pass / concur / override stages.
   Members with no eligible floor roll calls return 0.
   Stage lives on the nested rollCall object, not the breakdown row. */
function _computeFloorVoteSubscore(member) {
  if (typeof getVoteBreakdown !== 'function') return 0;
  var rows;
  try { rows = getVoteBreakdown(member); } catch (e) { return 0; }
  var floor = (rows || []).filter(function (r) {
    var s = r.rollCall && r.rollCall.stage;
    return s === 'pass' || s === 'concur' || s === 'override';
  });
  return _scoreVoteRows(floor);
}

/* Committee-vote subscore (-5..+5). Counts committee stage only.
   Members with no eligible committee roll calls return 0. */
function _computeCommitteeVoteSubscore(member) {
  if (typeof getVoteBreakdown !== 'function') return 0;
  var rows;
  try { rows = getVoteBreakdown(member); } catch (e) { return 0; }
  var cmte = (rows || []).filter(function (r) {
    return r.rollCall && r.rollCall.stage === 'committee';
  });
  return _scoreVoteRows(cmte);
}

/* Backward-compat: combined V subscore (floor + committee, normalized
   together). Retained so older callers keep working but no longer
   referenced by calcScore(). */
function _computeVoteSubscore(member) {
  if (typeof getVoteBreakdown !== 'function') return 0;
  var rows;
  try { rows = getVoteBreakdown(member); } catch (e) { return 0; }
  return _scoreVoteRows(rows);
}

/* Convert sponsorship list into a -5..+5 s subscore.
   Primary +/-2 each, co +/-1 each, then clamp. */
function _computeSponsorshipSubscore(member) {
  if (typeof getLegislatorSponsorships !== 'function') return 0;
  var sponsorships;
  try { sponsorships = getLegislatorSponsorships(member); } catch (e) { return 0; }
  if (!sponsorships || !sponsorships.length) return 0;
  var sum = 0;
  for (var i = 0; i < sponsorships.length; i++) {
    var sp = sponsorships[i];
    var sign = 0;
    if (sp.stance === 'pro')  sign = +1;
    if (sp.stance === 'anti') sign = -1;
    var weight = (sp.role === 'primary') ? 2 : 1;
    sum += sign * weight;
  }
  if (sum >  5) sum =  5;
  if (sum < -5) sum = -5;
  return sum;
}

/* Convert news entries into a -5..+5 n subscore.
   pro +1, anti -1, neutral 0, then clamp. */
function _computeNewsSubscore(member) {
  if (typeof getLegislatorNews !== 'function') return 0;
  var news;
  try { news = getLegislatorNews(member); } catch (e) { return 0; }
  if (!news || !news.length) return 0;
  var sum = 0;
  for (var i = 0; i < news.length; i++) {
    var n = news[i];
    if (n.stance === 'pro')  sum += 1;
    if (n.stance === 'anti') sum -= 1;
  }
  if (sum >  5) sum =  5;
  if (sum < -5) sum = -5;
  return sum;
}

/* Derive a legislator's three subscores from real evidence.
   Returns { vf, vc, s, v, n } where:
     vf = floor-vote subscore on -5..+5
     vc = committee-vote subscore on -5..+5
     s  = sponsorship subscore on -5..+5
     v  = legacy combined-vote subscore (kept for older UI helpers)
     n  = retained at 0 for backward compatibility (no longer scored) */
function computeSubscores(member) {
  return {
    vf: _computeFloorVoteSubscore(member),
    vc: _computeCommitteeVoteSubscore(member),
    s:  _computeSponsorshipSubscore(member),
    v:  _computeVoteSubscore(member),
    n:  0
  };
}

/* Composite score (0-100).
   v6 — Trackable evidence only. Every lawmaker starts from the same
   flat 50 baseline regardless of party or caucus. The grade is driven
   entirely by floor votes, committee votes, and sponsorship — the
   three signals we can verify from the official chamber journal and
   Legislative Service Commission. Floor and committee are weighted
   equally but tracked separately so a reader can see both signals.

   News, quotes, and floor speeches are no longer scored. They are too
   easy to spin and too hard to weight consistently across lawmakers.

   Evidence weights (v6, April 2026):
     vf (floor votes)       x4   (range -20 to +20)  — binding action
     vc (committee votes)   x4   (range -20 to +20)  — binding action
     s  (sponsorship)       x2   (range -10 to +10)  — public commitment
                                  (primary +/-2, co-sponsor +/-1)

   A spotless +5/+5/+5 record reaches exactly 100 (A+); a worst-case
   -5/-5/-5 reaches exactly 0 (F). A lawmaker with no tracked evidence
   holds the 50 baseline (C / Mixed Record) until the record moves them.
   No party baseline, no chamber curve, no after-the-fact rebalancing.
   Final score is clamped to 0..100. */
function calcScore(member) {
  var sub = computeSubscores(member);
  var weighted = (sub.vf * 4) + (sub.vc * 4) + (sub.s * 2);
  return Math.max(0, Math.min(100, Math.round(50 + weighted)));
}

function calcGrade(score) {
  for (var i = 0; i < GRADE_SCALE.length; i++) {
    if (score >= GRADE_SCALE[i].min) return GRADE_SCALE[i];
  }
  return GRADE_SCALE[GRADE_SCALE.length - 1];
}

/* =========================================================
   PUBLIC STATEMENTS / NEWS
   =========================================================
   Curated list of on-the-record public statements by Ohio
   legislators about LGBTQ+ legislation. Each entry includes
   a short quote, the venue or outlet, the date, and a search
   URL that surfaces the underlying coverage. We use search
   links rather than direct article URLs so readers always
   land on a verifiable, non-link-rotting result.

   Keyed by `chamber-district` (e.g., "house-44", "senate-23").
   Add entries here as new statements are documented.
   ========================================================= */
const LEGISLATOR_NEWS = {
  "house-11": [
    { headline: "Lett: 'Ohio is stronger when every Ohioan can fully participate'", outlet: "Press release on HB 136 introduction", date: "2025-04-22",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Crystal+Lett%22+HB+136+Ohio+Fairness+Act" }
  ],
  "house-13": [
    { headline: "Rader hosts Statehouse Pride press conference, condemns drag ban", outlet: "Ohio Capital Journal", date: "2026-03-26",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Tristan+Rader%22+%22HB+249%22+drag" },
    { headline: "Rader: HB 136 'a long-overdue civil rights protection'", outlet: "Cleveland.com", date: "2025-04-22",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Tristan+Rader%22+%22Ohio+Fairness+Act%22" },
    { headline: "Rader floor remarks against HB 249", outlet: "Ohio House floor session", date: "2026-03-25",
      stance: "pro",
      url: "https://ohiochannel.org/search?query=Tristan+Rader+HB+249" }
  ],
  "house-21": [
    { headline: "Synenberg joins Pride press conference at the Statehouse", outlet: "Ohio Statehouse News Bureau", date: "2026-03-26",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Eric+Synenberg%22+pride+statehouse" }
  ],
  "house-24": [
    { headline: "Isaacsohn: HB 68 'cruelty dressed up as policy'", outlet: "Cincinnati Enquirer", date: "2024-01-25",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Dani+Isaacsohn%22+%22HB+68%22" }
  ],
  "house-28": [
    { headline: "Brownlee introduces conversion therapy ban", outlet: "Cincinnati Enquirer", date: "2025-05-13",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Karen+Brownlee%22+%22conversion+therapy%22" },
    { headline: "Brownlee files PRIDE Act in Ohio House", outlet: "Press release", date: "2025-09-10",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Karen+Brownlee%22+%22PRIDE+Act%22" }
  ],
  "house-36": [
    { headline: "White breaks with caucus on HB 8 forced-outing vote", outlet: "Dayton Daily News", date: "2024-06-26",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Andrea+White%22+%22HB+8%22+vote" }
  ],
  "house-40": [
    { headline: "Creech named in BCI documents over alleged misconduct involving minor relative", outlet: "Ohio Capital Journal", date: "2024-09-12",
      stance: "neutral",
      url: "https://www.google.com/search?q=%22Rodney+Creech%22+BCI+investigation" },
    { headline: "Creech introduces HB 196 to require trans candidates to disclose former names", outlet: "Statehouse News Bureau", date: "2025-04-29",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Rodney+Creech%22+%22HB+196%22" }
  ],
  "house-44": [
    { headline: "Williams introduces omnibus anti-trans bill HB 798", outlet: "Ohio Capital Journal", date: "2026-03-31",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Josh+Williams%22+%22HB+798%22" },
    { headline: "Williams: 'Drag has no place in front of children'", outlet: "Toledo Blade, HB 249 floor debate", date: "2026-03-25",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Josh+Williams%22+%22HB+249%22+drag" },
    { headline: "Williams files HB 190 to require schools to use legal names", outlet: "Press release", date: "2025-04-29",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Josh+Williams%22+%22HB+190%22" }
  ],
  "house-52": [
    { headline: "Manning votes against HB 8 in committee", outlet: "Cleveland.com", date: "2024-06-04",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Gayle+Manning%22+%22HB+8%22+committee" }
  ],
  "house-57": [
    { headline: "Callender: 'I am a Republican because I believe in empowering individuals'", outlet: "Cleveland.com", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Jamie+Callender%22+%22HB+68%22+empowering" },
    { headline: "Callender lone Republican against HB 249 drag ban", outlet: "Ohio Capital Journal", date: "2026-03-25",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Jamie+Callender%22+%22HB+249%22" },
    { headline: "Callender floor remarks against HB 8", outlet: "Ohio House floor session", date: "2024-06-26",
      stance: "pro",
      url: "https://ohiochannel.org/search?query=Jamie+Callender+HB+8" }
  ],
  "house-61": [
    { headline: "Lear: 'natural family' bill restores 'biological reality'", outlet: "Statehouse News Bureau", date: "2025-09-30",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Beth+Lear%22+%22natural+family%22+HB+262" }
  ],
  "house-78": [
    { headline: "Huffman: Senate will 'finish the job' on HB 68 override", outlet: "Ohio Capital Journal", date: "2024-01-24",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Matt+Huffman%22+%22HB+68%22+override" }
  ],
  "house-80": [
    { headline: "Newman files HB 190 with Center for Christian Virtue support", outlet: "Statehouse News Bureau", date: "2025-04-29",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Johnathan+Newman%22+%22HB+190%22+Christian" }
  ],
  "house-84": [
    { headline: "King: HB 249 protects children 'from sexualized performances'", outlet: "Statehouse News Bureau", date: "2026-03-25",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Angela+King%22+%22HB+249%22" }
  ],
  "house-88": [
    { headline: "Click compares trans-affirming care to 'Lucifer'", outlet: "Ohio Capital Journal", date: "2024-01-23",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Gary+Click%22+Lucifer+%22HB+68%22" },
    { headline: "Click introduces Affirming Families First Act (HB 693)", outlet: "Press release", date: "2026-03-25",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Gary+Click%22+%22Affirming+Families+First%22" }
  ],
  "house-94": [
    { headline: "Ritter introduces School Chaplain Act (HB 507)", outlet: "Marietta Times", date: "2025-10-14",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Kevin+Ritter%22+%22HB+507%22+chaplain" }
  ],
  "house-99": [
    { headline: "Fowler Arthur: public schools 'pushing transgender ideology'", outlet: "Ashtabula Star Beacon", date: "2025-09-12",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Sarah+Fowler+Arthur%22+transgender+schools" }
  ],
  "senate-8": [
    { headline: "Blessing: 'I won't vote to out kids to abusive parents'", outlet: "Cincinnati Enquirer", date: "2024-12-18",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Louis+Blessing%22+%22HB+8%22+vote" }
  ],
  "senate-9": [
    { headline: "Ingram: SB 104 'a solution in search of a problem'", outlet: "WCPO Cincinnati", date: "2024-11-19",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Catherine+Ingram%22+%22SB+104%22+bathroom" }
  ],
  "senate-11": [
    { headline: "Hicks-Hudson: 'Just let me live' during HB 68 override debate", outlet: "Toledo Blade", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Paula+Hicks-Hudson%22+%22HB+68%22+%22just+let+me+live%22" }
  ],
  "senate-13": [
    { headline: "Manning sole Senate Republican against HB 68 override", outlet: "Cleveland.com", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Nathan+Manning%22+%22HB+68%22+override" },
    { headline: "Manning: override 'a step too far for limited government'", outlet: "Statehouse News Bureau", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Nathan+Manning%22+%22limited+government%22+%22HB+68%22" }
  ],
  "senate-14": [
    { headline: "Johnson introduces SB 34 to mandate Ten Commandments displays", outlet: "Statehouse News Bureau", date: "2025-11-20",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Terry+Johnson%22+%22SB+34%22+%22ten+commandments%22" }
  ],
  "senate-16": [
    { headline: "Liston co-sponsors SB 71 conversion therapy ban", outlet: "Press release", date: "2025-05-13",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Beth+Liston%22+%22SB+71%22+%22conversion+therapy%22" }
  ],
  "senate-18": [
    { headline: "Cirino: SB 1 will 'restore merit' to Ohio higher ed", outlet: "Statehouse News Bureau", date: "2025-03-28",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Jerry+Cirino%22+%22SB+1%22+merit" },
    { headline: "Cirino cites scripture on Senate floor during HB 68 override", outlet: "Ohio Capital Journal", date: "2024-01-24",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Jerry+Cirino%22+%22HB+68%22+scripture" }
  ],
  "senate-19": [
    { headline: "Brenner: DEI is 'institutional discrimination'", outlet: "Statehouse News Bureau", date: "2025-03-28",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Andrew+Brenner%22+DEI+%22institutional+discrimination%22" }
  ],
  "senate-21": [
    { headline: "Smith calls HB 68 'state-sponsored bullying of trans youth'", outlet: "Cleveland.com", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Kent+Smith%22+%22state-sponsored+bullying%22" }
  ],
  "senate-23": [
    { headline: "Antonio reintroduces Ohio Fairness Act for the 12th time", outlet: "Cleveland.com", date: "2025-04-22",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Nickie+Antonio%22+%22Ohio+Fairness+Act%22+12th" },
    { headline: "Antonio: SB 71 will 'protect young people from predatory practices'", outlet: "Press release", date: "2025-05-13",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Nickie+Antonio%22+%22SB+71%22+conversion" },
    { headline: "Antonio remarks at Statehouse Pride press conference", outlet: "Ohio Statehouse News Bureau", date: "2026-03-26",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Nickie+Antonio%22+pride+statehouse+2026" }
  ],
  "senate-25": [
    { headline: "DeMora moves to adjourn before HB 68 override vote", outlet: "Statehouse News Bureau", date: "2024-01-24",
      stance: "pro",
      url: "https://www.google.com/search?q=%22William+DeMora%22+%22HB+68%22+adjourn" }
  ],
  "senate-27": [
    { headline: "Roegner makes anti-trans remarks during HB 68 override debate", outlet: "Akron Beacon Journal", date: "2024-01-24",
      stance: "anti",
      url: "https://www.google.com/search?q=%22Kristina+Roegner%22+%22HB+68%22+transgender" }
  ],
  "senate-28": [
    { headline: "Weinstein: anti-LGBTQ+ bills are 'distractions from real problems'", outlet: "Akron Beacon Journal", date: "2025-09-30",
      stance: "pro",
      url: "https://www.google.com/search?q=%22Casey+Weinstein%22+LGBTQ+distractions" }
  ]
};

/* Optional explicit sponsorship overrides keyed by "chamber-district".
   If a legislator has an entry here, it wins over notes-derived parsing.
   Each entry is an array of bill objects from SCORED_BILLS plus a role
   ("primary" | "co"). Used for cases the notes regex can't catch. */
const LEGISLATOR_SPONSORSHIPS = {
  /* HB 467 (135th GA) — Trans Candidate Name-Change Fix.
     Pro-equality. Died in House Government Oversight Committee
     12/31/2024 with no committee or floor vote. Listed here so
     current 136th-GA members carry credit on their scorecard
     for putting their name on the bill in the 135th. Members
     who have other tracked sponsorships are listed with the
     full set so the explicit override doesn't drop the
     notes-derived entries. Districts reflect the 136th GA roster
     loaded in HOUSE_MEMBERS / SENATE_MEMBERS above. */

  // Primary sponsors of HB 467 (135th)
  "house-4":   [{ id: "hb467-135", role: "primary" }],   // Beryl Brown Piccolantonio
  "house-43":  [{ id: "hb467-135", role: "primary" }],   // Michele Grim

  // Co-sponsors of HB 467 (135th), with notes-derived sponsorships preserved
  "house-1":   [{ id: "hb306",     role: "primary" }, { id: "hb467-135", role: "co" }], // Dontavius L. Jarrells
  "house-8":   [{ id: "hb467-135", role: "co" }],                                       // Anita Somani
  "house-9":   [{ id: "hb467-135", role: "co" }],                                       // Munira Abdullahi
  "house-11":  [{ id: "hb136",     role: "primary" }, { id: "hb300", role: "co" }, { id: "hb467-135", role: "co" }], // Crystal Lett
  "house-13":  [{ id: "hb136",     role: "primary" }, { id: "hb467-135", role: "co" }], // Tristan Rader
  "house-16":  [{ id: "hb467-135", role: "co" }],                                       // Bride Rose Sweeney
  "house-28":  [{ id: "hb300",     role: "primary" }, { id: "hb327", role: "primary" }, { id: "hb467-135", role: "co" }], // Karen Brownlee
  "house-53":  [{ id: "hb467-135", role: "co" }],                                       // Joseph A. Miller, III
  "senate-9":  [{ id: "hb467-135", role: "co" }],                                       // Catherine D. Ingram
  "senate-15": [{ id: "hb467-135", role: "co" }]                                        // Hearcel F. Craig
};

/* Build a lookup key for the news / sponsorship maps from a member object. */
function legKey(m) {
  var ch = (m && m.chamber ? m.chamber : '').toString().toLowerCase();
  return ch + '-' + (m ? m.d : '');
}

/* Public API: news entries for a given legislator. Always returns an array. */
function getLegislatorNews(m) {
  var key = legKey(m);
  return (LEGISLATOR_NEWS[key] || []).slice();
}

/* Public API: sponsorship entries for a given legislator. Falls back to
   parsing the member's notes for "Primary sponsor X" / "Co-sponsor X"
   patterns when no explicit override exists. Always returns an array. */
function getLegislatorSponsorships(m) {
  var key = legKey(m);
  var explicit = LEGISLATOR_SPONSORSHIPS[key];
  if (explicit && explicit.length) {
    return explicit.map(function (e) {
      var bill = _findBillById(e.id);
      return {
        role: e.role || 'co',
        id: e.id,
        bill: bill ? bill.bill : e.id,
        title: bill ? bill.title : '',
        stance: bill ? bill.stance : 'mixed',
        ga: bill ? bill.ga : '',
        url: _ohioBillUrl(bill)
      };
    });
  }
  return deriveSponsorshipsFromNotes(m);
}

function _findBillById(id) {
  for (var i = 0; i < SCORED_BILLS.length; i++) {
    if (SCORED_BILLS[i].id === id) return SCORED_BILLS[i];
  }
  return null;
}

/* Build a deterministic Ohio General Assembly bill URL from a bill record. */
function _ohioBillUrl(bill) {
  if (!bill) return '';
  // Format used by legislature.ohio.gov: /legislation/{ga#}/{billnumber}
  var ga = (bill.ga || '').replace(/[^0-9]/g, '');
  var num = (bill.bill || '').toLowerCase().replace(/\s+/g, '');
  if (!ga || !num) return '';
  return 'https://www.legislature.ohio.gov/legislation/' + ga + '/' + num;
}

/* Parse a member's notes field for sponsorship language and return an
   array of structured sponsorship entries that match SCORED_BILLS. We
   look for patterns like:
     "Primary sponsor HB 249"
     "Co-sponsor SB 71"
     "Primary/co-sponsor of 8+ anti-LGBTQ+ bills: HB 249, 155, 190, ..."
   When the notes mention a bill label that exists in SCORED_BILLS, we
   record it. Role defaults to "co" unless "Primary sponsor" / "primary"
   appears immediately before the label.

   Best-effort by design: notes are human-written, and a few sponsorships
   will be missed. Use LEGISLATOR_SPONSORSHIPS for hard overrides. */
function deriveSponsorshipsFromNotes(m) {
  var out = [];
  if (!m || !m.notes) return out;
  var notes = m.notes;
  var seen = {};

  // Pre-compute a normalized lookup of bill label -> bill record.
  var labelMap = {};
  for (var i = 0; i < SCORED_BILLS.length; i++) {
    var b = SCORED_BILLS[i];
    var key = b.bill.toLowerCase().replace(/\s+/g, '');
    labelMap[key] = b;
  }

  // Phrases that indicate a bill mention is NOT a sponsorship -- e.g.
  // "voted against HB 68" or "opposed HB 8". When any of these appear in
  // the 80-char window before a bill label, skip the match entirely.
  var negativeCtxRe = /\b(vot(e|ed|ing)\s+(against|for|no|yes)|opposed?|opposing|against|kill(ed)?|block(ed)?|defeat(ed)?|spoke against|criticized)\b/i;

  // Walk through the notes and find both prefixed bill mentions (HB 249)
  // AND bare numbers in comma-separated lists that inherit the last seen
  // prefix (e.g. "HB 249, 155, 190" -> HB249, HB155, HB190).
  var tokenRe = /\b(HB|SB|HJR|SJR)\s*(\d+)\b|,\s*(\d{1,4})\b/gi;
  var lastPrefix = null;        // most recent HB/SB/etc seen
  var lastPrefixIdx = -1;       // where it appeared
  var lastPrefixContext = '';   // 80-char ctx captured from the prefix match

  var match;
  while ((match = tokenRe.exec(notes)) !== null) {
    var prefix, number, matchIdx, ctx;

    if (match[1]) {
      // Explicit HB/SB/HJR/SJR + number
      prefix = match[1].toUpperCase();
      number = match[2];
      matchIdx = match.index;
      var windowStart = Math.max(0, matchIdx - 80);
      ctx = notes.slice(windowStart, matchIdx).toLowerCase();
      lastPrefix = prefix;
      lastPrefixIdx = matchIdx;
      lastPrefixContext = ctx;
    } else if (match[3]) {
      // Bare number in a comma list. Only inherit the prefix if the previous
      // explicit bill mention was very close (within ~50 chars), suggesting
      // this is "HB 249, 155, 190" rather than an unrelated number.
      if (!lastPrefix) continue;
      matchIdx = match.index;
      if (matchIdx - lastPrefixIdx > 60) continue;
      // Reject if the inherited number is implausibly small (legislators
      // sometimes mention years, vote counts, etc).
      number = match[3];
      if (parseInt(number, 10) < 1) continue;
      prefix = lastPrefix;
      ctx = lastPrefixContext; // inherit the original context
      // Update last position so we can continue chaining commas.
      lastPrefixIdx = matchIdx;
    } else {
      continue;
    }

    var label = (prefix + number).toUpperCase();
    var lookupKey = label.toLowerCase();
    var bill = labelMap[lookupKey];
    if (!bill) continue;
    if (seen[bill.id]) continue;

    // Skip negative-context mentions (e.g. "voted against HB 68").
    if (negativeCtxRe.test(ctx)) continue;

    var role = 'co';
    if (/primary(\s|\/)/.test(ctx) || /\bprimary\s+sponsor\b/.test(ctx)) {
      role = 'primary';
    } else if (/\bco-?sponsor/.test(ctx)) {
      role = 'co';
    }

    out.push({
      role: role,
      id: bill.id,
      bill: bill.bill,
      title: bill.title,
      stance: bill.stance,
      ga: bill.ga,
      url: _ohioBillUrl(bill)
    });
    seen[bill.id] = true;
  }
  return out;
}

/* Convenience counts used by the card subscore display. */
function countLegislatorNews(m) {
  return getLegislatorNews(m).length;
}
function countLegislatorSponsorships(m) {
  return getLegislatorSponsorships(m).length;
}
