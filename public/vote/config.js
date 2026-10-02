/* =============================================================================
 * public/vote/config.js
 * -----------------------------------------------------------------------------
 * The one place every date, hour, link and line of weekly copy for the
 * Drag Out The Vote Ohio pages lives. Both pages read from it:
 *
 *   /vote              public/vote/index.html            (voter resource page)
 *   /dragoutthevote    public/dragoutthevote/index.html  (performer guide)
 *
 * Two consumers, one file:
 *
 *   1. scripts/build-vote.mjs imports it in Node and writes every value into
 *      the two HTML files, so the pages are complete static documents that
 *      work with JavaScript off. Run `npm run vote:build` after any edit here.
 *      `npm run check:vote` fails when a page is stale.
 *   2. public/vote/vote.js imports it in the browser for the three things
 *      that need a script: the countdown, Copy, and Share.
 *
 * Nothing date-shaped belongs in the HTML. If you find yourself typing a date
 * into index.html, put it here instead and reference it with data-dotv.
 *
 * Sources: Ohio Secretary of State 2026 voting schedule and the Franklin
 * County Board of Elections ID requirements, both checked on the date in
 * SOURCE_LINE. Re-verify against ohiosos.gov before changing a date.
 *
 * Copy rules for every string below: always "absentee ballot" (never the
 * postal phrasings); no em dashes or en dashes; no candidate names, races,
 * parties, or issues; no disclaimer line (the site footer carries it).
 * tests/vote-pages.test.mjs enforces each of these.
 * ========================================================================== */

const CAMPAIGN_NAME = "Drag Out The Vote Ohio";
const HASHTAG = "#DragOutTheVote";
const COLLAB_HANDLE = "@ohiopridepac";
const VOTE_URL = "https://ohiopride.org/vote";
const GUIDE_URL = "https://ohiopride.org/dragoutthevote";

/* Hashtags ride on every post in this order: the campaign tag first, the
 * week's own tag in the middle, and #OhioPride last. The guide is not an Ohio
 * Pride promotion, so the PAC tag never leads. */
const tags = (weekTag) => [HASHTAG, "#OhioVotes", weekTag, "#OhioPride"];

const CONFIG = {
  CAMPAIGN_NAME,
  HASHTAG,
  COLLAB_HANDLE,
  COLLAB_URL: "https://www.instagram.com/ohiopridepac/",
  VOTE_URL,
  GUIDE_URL,

  /* ----- The election ----------------------------------------------------- */
  ELECTION_DAY: "2026-11-03",
  POLLS: "6:30 am to 7:30 pm",
  /* The same two instants as POLLS, with the offset the countdown needs.
   * Ohio is on Eastern Standard Time by Election Day (clocks fall back on the
   * first Sunday of November), hence -05:00. */
  POLLS_OPEN_AT: "2026-11-03T06:30:00-05:00",
  POLLS_CLOSE_AT: "2026-11-03T19:30:00-05:00",
  EARLY_VOTING_OPENS: "2026-10-06",
  EARLY_VOTING_CLOSES: "2026-11-01",
  ABSENTEE_REQUEST_DEADLINE: "Tuesday Oct 27, 8:30 pm",
  ABSENTEE_RECEIVED_DEADLINE: "Tuesday Nov 3, 7:30 pm",
  ON_THE_BALLOT:
    "Every statewide office, a U.S. Senate seat, every U.S. House seat, two Ohio Supreme Court seats, all 99 Ohio House seats, and half the Ohio Senate.",

  /* Early in-person voting hours at every county board of elections. */
  EARLY_HOURS: [
    ["Oct 6 to 9", "8 am to 5 pm"],
    ["Oct 12 to 16", "8 am to 5 pm"],
    ["Oct 19 to 23", "8 am to 5 pm"],
    ["Sat Oct 24", "8 am to 4 pm"],
    ["Mon Oct 26", "7:30 am to 7:30 pm"],
    ["Tue Oct 27", "7:30 am to 8:30 pm"],
    ["Oct 28 to 30", "7:30 am to 7:30 pm"],
    ["Sat Oct 31", "8 am to 4 pm"],
    ["Sun Nov 1", "1 pm to 5 pm"],
    ["Mon Nov 2", "No early voting"],
  ],

  /* ----- Photo ID --------------------------------------------------------- */
  ID_ACCEPTED: [
    "Ohio driver's license or state ID (unexpired; an old address is fine if your current address is in the pollbook)",
    "BMV interim ID form",
    "U.S. passport or passport card",
    "U.S. military ID",
    "Ohio National Guard ID",
    "U.S. Department of Veterans Affairs ID",
  ],
  ID_NOT_ACCEPTED: [
    "Out-of-state license",
    "Student ID",
    "Utility bill or bank statement",
    "Digital ID on a phone",
  ],
  ID_NOTES: [
    "A free Ohio state ID is available at any BMV agency.",
    "The name on your ID must match the name on your registration.",
    "No photo ID is needed to vote absentee. The request form takes a license number or the last four of your Social Security number.",
  ],

  /* ----- Statewide tools -------------------------------------------------- */
  LINKS: {
    lookup: "https://voterlookup.ohiosos.gov/",
    absentee_request:
      "https://www.ohiosos.gov/elections/elections-administration/forms-and-petitions/absentee-ballot-application-html-to-pdf",
    county_boards: "https://www.ohiosos.gov/directories/county-boards-of-elections",
    voting_schedule: "https://www.ohiosos.gov/elections/voting-schedule-text-only",
    sos_phone: "877-767-6446",
  },

  SOURCE_LINE: "Dates and ID rules from the Ohio Secretary of State. Verified Oct 2, 2026.",

  /* The Share button's text. VOTE_URL and HASHTAG are appended by vote.js. */
  SHARE_TEXT: "Make your plan to vote. Early voting is open in Ohio.",

  /* ----- The five weeks --------------------------------------------------- *
   * One entry per week of the campaign. The guide renders the stage lines and
   * the post cards from this list, in order. `feed` and `story` are the
   * graphics design delivers; swap the files in place and the page follows.
   * Feed is 1080 by 1350, story is 1080 by 1920. */
  WEEKS: [
    {
      number: 1,
      label: "Week of Oct 5",
      dates: "Oct 5 to 11",
      theme: "Early voting is open",
      stage:
        "Before the next number. Early voting is open in Ohio. Make a plan tonight. When, where, how. Then go.",
      caption:
        "Early voting is open in Ohio 🗳️ Make your plan tonight. When, where, how. Then go. Your county board of elections has you weekdays 8 to 5.",
      hashtags: tags("#MakeAPlan"),
      feed: "/dragoutthevote/assets/week-1-feed.png",
      story: "/dragoutthevote/assets/week-1-story.png",
    },
    {
      number: 2,
      label: "Week of Oct 12",
      dates: "Oct 12 to 18",
      theme: "Bring your ID",
      stage:
        "Ohio wants a photo ID at the polls. Check your wallet now. Driver's license, state ID, passport, military ID. No ID? The BMV will give you one free.",
      caption:
        "Check your wallet before you check the box 💅 Ohio needs a photo ID to vote in person. Driver's license, state ID, passport, or military ID. A free state ID is waiting at any BMV.",
      hashtags: tags("#BringYourID"),
      feed: "/dragoutthevote/assets/week-2-feed.png",
      story: "/dragoutthevote/assets/week-2-story.png",
    },
    {
      number: 3,
      label: "Week of Oct 19",
      dates: "Oct 19 to 25",
      theme: "Absentee by Oct 27",
      stage:
        "Voting absentee? Your request has to be at the board of elections by 8:30 pm Tuesday the 27th. Not postmarked. There.",
      caption:
        "Voting absentee this year 💌 Your request has to be at your county board of elections by 8:30 pm Tuesday Oct 27. No photo ID needed for absentee. Do it this week.",
      hashtags: tags("#AbsenteeBallot"),
      feed: "/dragoutthevote/assets/week-3-feed.png",
      story: "/dragoutthevote/assets/week-3-story.png",
    },
    {
      number: 4,
      label: "Week of Oct 26",
      dates: "Oct 26 to Nov 1",
      theme: "Last weekend",
      stage:
        "This is the last weekend to vote early. Saturday 8 to 4. Sunday 1 to 5. Monday is closed. Go, and take someone.",
      caption:
        "Last call for early voting 🎤 Extended hours all week. Saturday Oct 31 8 to 4. Sunday Nov 1 1 to 5. Nothing on Monday. Go this weekend and bring someone.",
      hashtags: tags("#VoteEarly"),
      feed: "/dragoutthevote/assets/week-4-feed.png",
      story: "/dragoutthevote/assets/week-4-story.png",
    },
    {
      number: 5,
      label: "Nov 2 and 3",
      dates: "Nov 2 to 3",
      theme: "Election Day",
      stage:
        "Tuesday. Polls open 6:30 to 7:30. If you are in line at 7:30, you vote. Vote your conscience for the people who will show up for us.",
      caption:
        "It's Tuesday and it's time 🗳️ Polls are open 6:30 am to 7:30 pm. If you're in line at 7:30 you vote. Absentee ballots have to reach your board by 7:30 too.",
      hashtags: tags("#ElectionDay"),
      feed: "/dragoutthevote/assets/week-5-feed.png",
      story: "/dragoutthevote/assets/week-5-story.png",
    },
  ],
};

export default CONFIG;
