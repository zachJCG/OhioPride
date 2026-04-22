/* ============================================================
   Ohio Pride PAC — Legislative Scorecard Data
   Last updated: 04/21/26
   
   HOW TO UPDATE:
   1. Find the legislator in HOUSE_MEMBERS or SENATE_MEMBERS
   2. Adjust their votes/sponsorship/news scores
   3. Add notes explaining the change
   4. Update LAST_UPDATED below
   
   SCORING:
     votes:       +1 per pro-equality vote, -1 per anti-equality vote
     sponsorship: +3 primary sponsor pro bill, +2 co-sponsor pro bill
                  -3 primary sponsor anti bill, -2 co-sponsor anti bill
     news:        +1 to +3 for pro-LGBTQ+ advocacy/statements
                  -1 to -3 for anti-LGBTQ+ rhetoric/scandals
   ============================================================ */

const SCORECARD_UPDATED = { date: "04/21/26", time: "04:30 PM EDT" };

/* Grade thresholds (weighted score 0-100) */
const GRADE_SCALE = [
  { min: 90, grade: "A+", label: "Champion", color: "#16a34a" },
  { min: 73, grade: "A",  label: "Strong Ally", color: "#22c55e" },
  { min: 55, grade: "B",  label: "Supportive", color: "#84cc16" },
  { min: 40, grade: "C",  label: "Mixed Record", color: "#eab308" },
  { min: 20, grade: "D",  label: "Unfriendly", color: "#f97316" },
  { min: 0,  grade: "F",  label: "Hostile", color: "#dc2626" },
];

/* Bills used in scoring (for reference panel) */
const SCORED_BILLS = [
  { id: "hb249", bill: "HB 249", title: "Drag Ban", ga: "136th", stance: "anti", status: "Passed House 63-32", date: "3/25/2026" },
  { id: "sb1",   bill: "SB 1",   title: "DEI Ban (Higher Ed)", ga: "136th", stance: "anti", status: "Signed Into Law", date: "3/28/2026" },
  { id: "hb68",  bill: "HB 68",  title: "Gender-Affirming Care Ban + Sports Ban", ga: "135th", stance: "anti", status: "Law (Veto Overridden)", date: "1/24/2024" },
  { id: "hb8",   bill: "HB 8",   title: "Parents' Bill of Rights (Forced Outing)", ga: "135th", stance: "anti", status: "Signed Into Law", date: "12/18/2024" },
  { id: "sb104", bill: "SB 104", title: "Bathroom Ban", ga: "135th", stance: "anti", status: "Signed Into Law", date: "11/27/2024" },
  { id: "sb70",  bill: "SB 70",  title: "Ohio Fairness Act", ga: "136th", stance: "pro", status: "In Committee", date: "" },
  { id: "sb71",  bill: "SB 71",  title: "Conversion Therapy Ban", ga: "136th", stance: "pro", status: "In Committee", date: "" },
  { id: "hb136", bill: "HB 136", title: "Ohio Fairness Act (House)", ga: "136th", stance: "pro", status: "In Committee", date: "" },
  { id: "hb300", bill: "HB 300", title: "Conversion Therapy Ban (House)", ga: "136th", stance: "pro", status: "In Committee", date: "" },
  { id: "hb306", bill: "HB 306", title: "Hate Crimes Act", ga: "136th", stance: "pro", status: "In Committee", date: "" },
  { id: "hb327", bill: "HB 327", title: "PRIDE Act", ga: "136th", stance: "pro", status: "In Committee", date: "" },
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
   SCORE CALCULATION (used by scorecard.html)

   As of v2.1 the floor-vote component (member.v) is computed
   at runtime from voting-records.js (ROLL_CALLS +
   VOTE_EXCEPTIONS + party-line defaults) rather than
   hand-assigned, so the score basis matches exactly what
   the SQL layer (public.bills + public.roll_calls +
   public.legislator_vote_exceptions) produces. The static
   member.v field is kept as a fallback for when
   summarizeVotes is not available (module context, older
   cached scripts, etc.).
   ------------------------------------------------------- */

/* Map the signed voting-records net (unbounded) into the
   -5..+5 range the sponsorship (s) and news (n) components
   already use. A net of ±5 or more saturates. */
function computedVoteScore(member) {
  if (typeof summarizeVotes !== 'function') return null;
  try {
    var leg = {
      d: member.d,
      party: member.party,
      chamber: (member.chamber || '').toString().toLowerCase()
    };
    var totals = summarizeVotes(leg);
    if (!totals || typeof totals.net !== 'number') return null;
    var v = Math.round(totals.net);
    if (v > 5) v = 5;
    if (v < -5) v = -5;
    return v;
  } catch (e) {
    return null;
  }
}

function calcScore(member) {
  var v = computedVoteScore(member);
  if (v === null) v = member.v;           // fallback for module / stale-cache contexts
  var raw = v + member.s + member.n;
  return Math.max(0, Math.min(100, Math.round(50 + raw * 5)));
}

function calcGrade(score) {
  for (var i = 0; i < GRADE_SCALE.length; i++) {
    if (score >= GRADE_SCALE[i].min) return GRADE_SCALE[i];
  }
  return GRADE_SCALE[GRADE_SCALE.length - 1];
}
