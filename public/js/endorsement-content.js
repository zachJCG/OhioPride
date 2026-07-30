/* =====================================================================
   Ohio Pride PAC — Endorsement content
   =====================================================================

   This file holds the *editorial* content for each endorsed candidate:
   their campaign photo, card blurb, and the PAC's full endorsement
   profile. Copy comes from the approved copy deck. Do not reflow or
   "fix" it here; edits go through comms review first.

   The factual record (name, office, district, party, election year,
   website) lives in Supabase and is published through the
   `public_endorsements` view. A candidate appears on /endorsements
   only after their application row reaches stage='endorsed'.

   ── HOW TO ADD AN ENDORSEMENT ──────────────────────────────────────
   1. Promote the candidate in the admin console (or via a seed
      migration) so their row is stage='endorsed' in Supabase.
   2. Drop their photo in /assets/endorsements/<slug>.jpg
      (lowercase first-last, ~1080px wide, face centered, portrait
      orientation preferred; see assets/endorsements/README.md).
   3. Add an entry below. `match` must equal the candidate_name in
      Supabase, lowercased. Everything else is plain text, no HTML.

   That's it. /endorsements picks the entry up automatically and the
   candidate gets a shareable profile at /endorsements/#<slug>.
   A candidate with no entry here still renders: they get an
   initial-letter avatar and their Supabase bio as the profile body.

   Field reference:
     slug        URL fragment for the profile view (#<slug>)
     match       candidate_name from Supabase, lowercased
     photo       path under /assets/endorsements/
     cardPhoto   optional square crop for the grid card; use when the
                 main photo is a wide or full-body shot that would
                 leave the face small in the card's 1:1 crop. The
                 profile view always uses `photo` uncropped.
     photoAlt    accessible alt text for the photo
     tagline     one line, shown under the name on the profile
     region      plain-language description of the district
     opponent    who they are running against (shown on the profile)
     endorsedDate ISO date the Board approved; omit until confirmed
     donate      campaign ActBlue URL; omit until confirmed
     cardBlurb   ~45 words shown on the grid card
     meta        <=155 char description swapped in for the profile view
     profile     [{ heading, paragraphs: [...], bullets: [...] }]
                 (bullets are optional; rendered as a list after the
                 section's paragraphs — used for record/receipts sections)
     cta         [{ label, href }] rendered as the profile CTA row
   ==================================================================== */

window.ENDORSEMENT_CONTENT = [
  {
    slug: 'jeff-givan',
    match: 'jeff givan',
    photo: '/assets/endorsements/jeff-givan.jpg',
    cardPhoto: '/assets/endorsements/jeff-givan-card.jpg',
    photoAlt: 'Jeff Givan smiling in downtown Lima, Ohio',
    tagline: 'Every community deserves a voice.',
    region: 'Lima, Allen County and part of Auglaize County',
    opponent: 'Speaker Matt Huffman (incumbent)',
    endorsedDate: '2026-05-22',
    donate: 'https://secure.actblue.com/donate/jeffgivan4ohio',
    cardBlurb:
      'Jeff Givan brought Pride to Lima before he ever ran for office. A co-founder of the Lima Pride Alliance, he is challenging the Speaker of the Ohio House to put District 78 first: public schools, affordable healthcare, and equal rights for every Ohioan.',
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
    endorsedDate: '2026-07-01',
    donate: 'https://secure.actblue.com/donate/caleb-price-1',
    cardBlurb:
      "Born and raised on Cincinnati's west side, Caleb Price is a Walnut Hills grad and IBEW union member running for District 30. He is fighting to write marriage equality into Ohio law, ban conversion therapy, and bring the first Pride to the west side.",
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
    tagline: '“My record is already on paper, and I intend to keep adding to it.”',
    region: 'The Cincinnati suburbs in Hamilton County',
    endorsedDate: '2026-07-01',
    cardBlurb:
      'In a single term, Rep. Karen Brownlee has assembled one of the strongest pro-equality records in the General Assembly, and she holds the top score on our legislative scorecard. The PRIDE Act and conversion therapy ban sponsor is running for re-election in House District 28.',
    meta:
      'Ohio Pride endorses Rep. Karen Brownlee for re-election in Ohio House District 28. The PRIDE Act sponsor holds the top score on our legislative scorecard.',
    profile: [
      {
        heading: 'Why we endorsed Karen',
        paragraphs: [
          'Ohio Pride proudly endorses Representative Karen Brownlee for re-election to Ohio House District 28.',
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
    tagline: '“I will use the office of State Treasurer to strongly advocate non-discrimination standards in state financial relationships.”',
    region: 'Statewide, all 88 Ohio counties',
    endorsedDate: '2026-07-01',
    cardBlurb:
      'A Cincinnati City Council member and a founding member of Ohio Pride, Seth Walsh has spent his public service proving that equality and responsible stewardship of public money are the same work. As Treasurer, he will hold state financial relationships to real non-discrimination standards.',
    meta:
      'Ohio Pride endorses Seth Walsh for Ohio State Treasurer. The Cincinnati councilmember will bring real non-discrimination standards to state finances.',
    profile: [
      {
        heading: 'Why we endorsed Seth',
        paragraphs: [
          'Ohio Pride proudly endorses Seth Walsh for Ohio State Treasurer.',
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
