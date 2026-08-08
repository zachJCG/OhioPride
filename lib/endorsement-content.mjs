/* =====================================================================
   Ohio Pride PAC — Endorsement editorial content
   =====================================================================

   The *editorial* half of an endorsement: campaign photo, the one-breath
   summary that goes on the grid card, and the PAC's full endorsement
   statement. The factual half (name, office, district, election year,
   website, endorsement date) lives in Supabase and comes through the
   `public_endorsements` view. A candidate appears on /endorsements only
   once their application row is status='endorsed' AND is_published.

   This module is imported by the server components under
   app/(site)/endorsements, so nothing here ships to the browser except
   the strings that actually render.

   ── THE ONE RULE ────────────────────────────────────────────────────
   `summary` and `profile` are read by different pages, and neither may
   restate the other. The grid card shows `summary`; the profile page
   shows the header (name, office, district, "Endorsed by Ohio Pride
   PAC" badge) and then `profile`. So:

     - Do not open a profile with "Ohio Pride endorses X for Y." The
       page already says that, twice, above the first paragraph.
     - Do not write a summary by copying the profile's first sentences.
       A reader who taps the card then reads the same paragraph again is
       the bug this rule exists to prevent.

   `summary` is the hook that earns the click. `profile` is the case.

   ── HOW TO ADD AN ENDORSEMENT ───────────────────────────────────────
   1. In /admin/endorsements, open the candidate and set the status to
      Endorsed, then tick "Show on the public endorsements page".
   2. Drop their photo in /assets/endorsements/<slug>.jpg (lowercase
      first-last, ~1080px wide, face centered, portrait preferred; see
      public/assets/endorsements/README.md).
   3. Add an entry below. `match` must equal the candidate_name in
      Supabase, lowercased. Everything else is plain text, no HTML.

   /endorsements picks the entry up on the next revalidation and the
   candidate gets a shareable page at /endorsements/<slug>. A candidate
   with no entry here still renders: initial-letter avatar, and their
   Supabase bio as the profile body.

   Field reference:
     slug        the URL segment: /endorsements/<slug>
     match       candidate_name from Supabase, lowercased
     photo       path under /assets/endorsements/
     cardPhoto   optional square crop for the grid card; use when the
                 main photo is wide or full-body and would leave the
                 face small in the card's 1:1 crop. The profile always
                 uses `photo` uncropped.
     photoAlt    accessible alt text for the photo
     tagline     one line, shown under the name on the profile
     region      plain-language description of the district
     opponent    who they are running against (shown on the profile)
     donate      campaign ActBlue URL; omit until confirmed
     summary     ~40 words on the grid card. See THE ONE RULE.
     meta        <=155 char description for the profile's <meta>/OG tags
     profile     [{ heading, paragraphs: [...], bullets: [...] }]
                 (bullets optional; rendered after the section's
                 paragraphs — used for record/receipts sections)
     cta         [{ label, href }] rendered as the profile CTA row

   The endorsement date is NOT here. It comes from
   endorsement_applications.endorsed_at, stamped when the Board's
   decision is recorded.
   ==================================================================== */

export const ENDORSEMENT_CONTENT = [
  {
    slug: 'jeff-givan',
    match: 'jeff givan',
    photo: '/assets/endorsements/jeff-givan.jpg',
    cardPhoto: '/assets/endorsements/jeff-givan-card.jpg',
    photoAlt: 'Jeff Givan smiling in downtown Lima, Ohio',
    tagline: 'Every community deserves a voice.',
    region: 'Lima, Allen County and part of Auglaize County',
    opponent: 'Speaker Matt Huffman (incumbent)',
    donate: 'https://secure.actblue.com/donate/jeffgivan4ohio',
    summary:
      'Our first endorsement. A co-founder of the Lima Pride Alliance taking on the Speaker of the Ohio House, with more than a decade of showing up for Allen County behind him.',
    meta:
      'Ohio Pride endorses Jeff Givan for Ohio House District 78. The Lima Pride Alliance co-founder is challenging the Speaker of the Ohio House.',
    profile: [
      {
        heading: 'Why we endorsed Jeff',
        paragraphs: [
          "Jeff Givan built community before he ever built a campaign. After losing his husband to cancer, Jeff stayed in Lima and went to work: helping organize the city's first Pride celebration, co-founding the Lima Pride Alliance, and building visibility in a part of Ohio where being out takes real courage.",
          'That is the record that earned our endorsement. Jeff has led as a volunteer executive, a mentor in local schools, and an advocate for youth agriculture and recovery programs across Allen County. He knows District 78 because he has spent more than a decade showing up for it.',
          'Now he is running for State Representative against the Speaker of the Ohio House. Jeff is campaigning to stop the voucher drain on public schools, restore funding for preventative healthcare, and protect the rights of every Ohioan, including marriage equality and trans youth.',
          'District 78 covers Allen County and part of Auglaize County. It is the kind of seat that decides whether the Statehouse keeps coming after our community.',
          'Jeff was our first endorsement, announced live at our launch at the North Plaza of the Ohio Statehouse on Harvey Milk Day. His campaign says it best: every community deserves a voice.',
        ],
      },
    ],
    cta: [
      { label: 'Learn more at jeffgivan4ohio.com', href: 'https://jeffgivan4ohio.com' },
      { label: 'Volunteer with Ohio Pride in District 78', href: '/volunteer' },
    ],
  },

  {
    slug: 'caleb-price',
    match: 'caleb price',
    photo: '/assets/endorsements/caleb-price.jpg',
    photoAlt: 'Caleb Price headshot, smiling in a tan collared shirt',
    tagline: "A fresh voice for Cincinnati's west side.",
    region: "Cincinnati's west side and Green Township, western Hamilton County",
    opponent: 'Rep. Mike Odioso (incumbent)',
    donate: 'https://secure.actblue.com/donate/caleb-price-1',
    summary:
      'An out candidate running in the neighborhoods that raised him, with a union card and a record of protest behind him. He wants Ohio to be a state his neighbors do not have to leave.',
    meta:
      'Ohio Pride endorses Caleb Price for Ohio House District 30. A born and raised Westsider running to protect equality and public schools.',
    profile: [
      {
        heading: 'Why we endorsed Caleb',
        paragraphs: [
          'Caleb Price is a born and raised Westsider. He graduated from Walnut Hills High School, earned his degree cum laude, and is finishing a Master of Public Administration. He has worked the jobs his neighbors work, from bussing tables at Skyline Chili to the sales floor at Home Depot, and he carries a union card with IBEW Local 1220.',
          "Caleb's courage is not new. As a student at a religious college, he led a campus protest against anti-LGBTQ+ policies. Now he is bringing that same conviction home, running as an out candidate in the neighborhoods that raised him.",
          "In Columbus, Caleb will fight to ban conversion therapy statewide, write marriage equality into Ohio law, protect access to gender-affirming care, and fully fund public schools. He also wants to bring the first Pride celebration to Cincinnati's west side, a part of town that has never had one.",
          "District 30 covers Green Township and Cincinnati's west side in western Hamilton County. For too long Columbus has forgotten the west side. Caleb has not.",
        ],
      },
    ],
    cta: [
      { label: 'Learn more at calebpriceforoh30.com', href: 'https://www.calebpriceforoh30.com' },
      { label: 'Volunteer with Ohio Pride in District 30', href: '/volunteer' },
    ],
  },

  {
    slug: 'karen-brownlee',
    match: 'karen brownlee',
    photo: '/assets/endorsements/karen-brownlee.jpg',
    photoAlt: 'Rep. Karen Brownlee headshot, wearing glasses, a blue top, and a black blazer',
    tagline: '"My record is already on paper, and I intend to keep adding to it."',
    region: 'The Cincinnati suburbs in Hamilton County',
    summary:
      'The top score on our legislative scorecard, earned in a single term. She put her name on the bills instead of asking voters to take a promise on faith.',
    meta:
      'Ohio Pride endorses Rep. Karen Brownlee for re-election in Ohio House District 28. The PRIDE Act sponsor holds the top score on our legislative scorecard.',
    profile: [
      {
        heading: 'Why we endorsed Karen',
        paragraphs: [
          'In a single term, Brownlee has assembled one of the strongest pro-equality records in the entire General Assembly, and she currently holds the top score on our legislative scorecard. She has not asked voters to take a promise on faith. She has put her name on the bills. She is the primary sponsor of the PRIDE Act and of legislation to ban conversion therapy for minors, and a cosponsor of the Ohio Fairness Act, the Hate Crime Act, the CROWN Act, and a constitutional amendment to protect the freedom to marry.',
          'A licensed clinical social worker from the Cincinnati suburbs, Brownlee treats equality as a question of health, safety, and economic stability, not an abstraction. She has been direct about the stakes for LGBTQ+ young people and about building a state where every family can put down roots without fear. Ohio Pride is honored to stand with her.',
        ],
      },
      {
        heading: 'Her record',
        bullets: [
          'Primary sponsor, PRIDE Act (H.B. 327)',
          'Primary sponsor, ban on conversion therapy for minors (H.B. 300)',
          'Cosponsor, Ohio Fairness Act (H.B. 136)',
          'Cosponsor, Hate Crime Act (H.B. 306)',
          'Cosponsor, marriage equality constitutional amendment (H.J.R. 4)',
          'Cosponsor, CROWN Act (H.B. 415)',
        ],
      },
    ],
    cta: [
      { label: 'Learn more at votekarenbrownlee.com', href: 'https://www.votekarenbrownlee.com' },
      { label: 'Volunteer with Ohio Pride in District 28', href: '/volunteer' },
    ],
  },

  {
    slug: 'seth-walsh',
    match: 'seth walsh',
    photo: '/assets/endorsements/seth-walsh.jpg',
    cardPhoto: '/assets/endorsements/seth-walsh-card.jpg',
    photoAlt: 'Seth Walsh smiling in a green quarter-zip outside a brick building',
    tagline:
      '"I will use the office of State Treasurer to strongly advocate non-discrimination standards in state financial relationships."',
    region: 'Statewide, all 88 Ohio counties',
    summary:
      "A founding member of Ohio Pride running for Treasurer on a specific promise: hold Ohio's banking, investment, and vendor relationships to real non-discrimination standards.",
    meta:
      'Ohio Pride endorses Seth Walsh for Ohio State Treasurer. The Cincinnati councilmember will bring real non-discrimination standards to state finances.',
    profile: [
      {
        heading: 'Why we endorsed Seth',
        paragraphs: [
          "A Cincinnati City Council member and a founding member of Ohio Pride, Walsh has spent his public service proving that equality and responsible stewardship of public money are the same work. On Council he strengthened the city's LGBTQIA+ Commission, expanded how the city engages LGBTQ+ residents, and consistently backed non-discrimination and equity in city government.",
          "The Treasurer does not vote on legislation, and Walsh has been specific about how he would use the office regardless. He has committed to hold Ohio's banking, investment, and vendor relationships to real non-discrimination standards, to promote inclusive procurement, and to treat fair, welcoming communities as a matter of the state's economic competitiveness. He would use the platform to speak out against any effort to roll back equality. Twice endorsed by Equality Cincinnati PAC, Walsh is ready to carry this fight statewide, and Ohio Pride is proud to stand with him.",
        ],
      },
      {
        heading: 'His record',
        bullets: [
          'Founding member of Ohio Pride',
          'Cincinnati City Council member',
          "Strengthened Cincinnati's LGBTQIA+ Commission",
          'Twice endorsed by Equality Cincinnati PAC',
          'Committed to non-discrimination standards in state banking, investment, and vendor relationships',
          'Committed to inclusive state procurement practices',
        ],
      },
    ],
    cta: [
      { label: 'Learn more at sethwalshforohio.com', href: 'https://sethwalshforohio.com' },
      { label: 'Volunteer with Ohio Pride', href: '/volunteer' },
    ],
  },
];

/** The editorial entry for a Supabase row, or null if nobody has written one. */
export function contentFor(row) {
  const key = String(row?.candidate_name || '').trim().toLowerCase();
  return ENDORSEMENT_CONTENT.find((c) => c.match === key) || null;
}
