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
     profile     [{ heading, paragraphs: [...] }]
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
];
