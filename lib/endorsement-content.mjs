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
    name        optional display name, when the legal name on the
                application is not the name the campaign runs under
                (a middle initial, a maiden name). Supabase stays the
                record of what was filed; this says how to print it.
     photo       path under /assets/endorsements/
     cardPhoto   optional square crop for the grid card; use when the
                 main photo is wide or full-body and would leave the
                 face small in the card's 1:1 crop. The profile always
                 uses `photo` uncropped.
     ogImage     optional 1200x630 link-preview card for this profile.
                 A portrait `photo` is the wrong shape for a social
                 card and gets center-cropped to a sliver of chin by
                 Facebook, iMessage, and Slack, so a candidate with a
                 tall photo should get a built card here. Falls back to
                 `photo`, then to the site's default OG image.
     photoAlt    accessible alt text for the photo
     tagline     one line, shown under the name on the profile
     office      optional display label for the office, when the raw
     district    application value is not what a reader should see.
                 The questionnaire stores whatever the candidate picked
                 from its dropdown, which is fine for "Ohio House of
                 Representatives" and "District 78" but reaches the page
                 as "County Auditor / Recorder / Treasurer / Clerk" or a
                 bare "6". Supabase stays the record of what was
                 applied for; these two say how to print it.
     region      plain-language description of the district
     opponent    who they are running against (shown on the profile)
     facts       optional [{ label, value }] rows added to the profile's
                 fact list, after "District covers" and before the
                 election rows. For standing facts the header does not
                 carry: current role, years of experience, recognition.
     pullQuote   { text, attribution } — the candidate in their own
                 words, set as a blockquote at the end of the statement.
                 `tagline` is ours; this is theirs, so it is attributed.
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
  {
    slug: 'cara-jacob',
    match: 'cara jacob',
    photo: '/assets/endorsements/cara-jacob.jpg',
    cardPhoto: '/assets/endorsements/cara-jacob-card.jpg',
    ogImage: '/assets/social/og-endorsement-cara-jacob.png',
    photoAlt:
      'Dr. Cara Jacob in a white coat, smiling on a garden path beside yellow flowers',
    tagline: '"At no point will I support a bill that harms the LGBTQ+ community."',
    region: 'All of Warren County and northeastern Hamilton County',
    opponent: 'Zac Haines (R), for an open seat',
    donate: 'https://secure.actblue.com/donate/cara-jacob-1',
    summary:
      'A University of Cincinnati neurologist who decided that if the Statehouse would not listen to doctors, a doctor should run for the Statehouse. She is the Democrat in an open seat that helps decide the Ohio Senate.',
    meta:
      'Ohio Pride endorses Dr. Cara Jacob for Ohio Senate District 7. A UC neurologist running for the open seat covering Warren and northeast Hamilton counties.',
    profile: [
      {
        heading: 'Why we endorsed Cara',
        paragraphs: [
          "Cara Jacob spends her days with Ohioans whose lives are being reorganized by Parkinson's disease, dementia, and other neurodegenerative conditions. She is a neurologist at the University of Cincinnati, a mom of two raising her family in the northern Cincinnati suburbs, and a first-time candidate who reached a straightforward conclusion: if the Statehouse would not listen to doctors, a doctor should run for the Statehouse.",
          'Her advocacy did not begin with this campaign, which is what moved our Screening Committee. Before she was a candidate she was a petition captain, twice over, for the Reproductive Freedom Amendment and for the SB 1 referendum. She has submitted written testimony against legislation moving through the General Assembly, including SB 113, the Senate DEI ban our tracker still lists as live in committee. That is a record of showing up for this fight in the chamber she is asking to join.',
          'In the Senate she would be a vote for the Ohio Fairness Act, so that no Ohioan can be fired or denied housing because of who they are, for writing marriage equality into Ohio law, and for protecting access to the medical care Ohioans need, including gender-affirming care. On conversion therapy she is direct in the way only a clinician can be: a practice that is neither medically nor psychologically safe has no business being legal in Ohio.',
          'She makes that case in the language this district actually speaks. Equality, she argues, is an economic issue. Ohio cannot afford to lose talented workers, entrepreneurs, and families because they do not feel welcome here, and protecting people from discrimination helps the state attract businesses and keep its workforce. She has knocked thousands of doors on that argument and says she has yet to meet a voter who turned away from her campaign because of it.',
          "The stakes are not abstract. Sen. Steve Wilson is term-limited, so District 7 is an open seat, and it is one of the races that decides which direction the Ohio Senate turns. Cara is offering her neighbors a doctor's judgment, a parent's stake in the future, and a simple promise: healthcare decisions belong to patients and their doctors, and dignity belongs to everyone.",
        ],
      },
      {
        heading: 'Her record',
        bullets: [
          'Petition captain, Reproductive Freedom Amendment',
          'Petition captain, SB 1 referendum',
          'Submitted written testimony opposing SB 113 and SB 1',
          'Says she would have voted no on SB 1, SB 104 (bathroom ban), and HB 8 (Parents Bill of Rights)',
          'Committed to the Ohio Fairness Act (SB 70) and to marriage equality in Ohio law',
          'Committed to a conversion therapy ban and to protecting gender-affirming care',
          'Neurologist, University of Cincinnati',
        ],
      },
    ],
    cta: [
      { label: 'Learn more at caraforohio.com', href: 'https://www.caraforohio.com' },
      { label: 'Volunteer with Ohio Pride in District 7', href: '/volunteer' },
    ],
  },
  {
    slug: 'christine-cockley',
    match: 'christine cockley',
    photo: '/assets/endorsements/christine-cockley.jpg',
    photoAlt:
      'Christine Cockley in a light blazer smiling in front of a painted mural wall',
    tagline: 'Our voice in the Ohio House.',
    office: 'Ohio House of Representatives',
    district: 'House District 6',
    region:
      'Columbus West Side, Franklin Township, Prairie Township, Valleyview, and parts of Norwich Township',
    facts: [{ label: 'Current role', value: 'State Representative, first elected 2024' }],
    summary:
      'The only out LGBTQ+ member of the Ohio House, running for reelection on the Columbus West Side with one of the strongest equality records in the legislature.',
    meta:
      'Ohio Pride endorses State Representative Christine Cockley, the only out LGBTQ+ member of the Ohio House, for reelection in House District 6.',
    profile: [
      {
        heading: 'Why we endorsed Christine',
        paragraphs: [
          'Christine Cockley is the only out LGBTQ+ member of the Ohio House of Representatives, and one of just two out members of the General Assembly. Since coming out publicly in 2025, she has carried that visibility into every committee room and every hearing where our community is under attack. When LGBTQ+ Ohioans traveled to the Statehouse this spring to testify against the drag ban in House Bill 249, Representative Cockley stood with them and reminded lawmakers that our lives and stories deserve respect in the policymaking process.',
          'Her record matches her voice. Cockley is the primary sponsor of legislation on missing persons cases, identification access for unhoused Ohioans, and accountability for chatbots that encourage suicide or violence. Each of these disproportionately affects LGBTQ+ people, and she wrote them with our community in mind. She has committed to sponsoring or cosponsoring the Ohio Fairness Act, the PRIDE Act, the conversion therapy ban, and the Marriage Equality Act, and she holds one of the strongest records on the Ohio Pride legislative scorecard.',
          "A Mansfield native and proud West Sider, Cockley earned her degrees from Ohio State's John Glenn College of Public Affairs and built her career in Columbus nonprofits before winning House District 6 with more than 60 percent of the vote in 2024. Representation matters. Reelecting Christine Cockley keeps an out voice at the table where decisions about our lives are made, and keeps a proven advocate fighting for every neighbor on the West Side.",
        ],
      },
    ],
    pullQuote: {
      text: 'LGBTQ+ Ohioans deserve elected officials who will not only speak up for equality, but also take action when their rights, safety, and dignity are under attack.',
      attribution: 'Rep. Christine Cockley, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at cockleyforohio.com', href: 'https://cockleyforohio.com' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
  {
    slug: 'stacie-baker',
    match: 'stacie baker',
    photo: '/assets/endorsements/stacie-baker.jpg',
    photoAlt:
      'Stacie Baker in a navy suit and patterned tie smiling in an official portrait',
    tagline: 'A proven public servant for Senate District 3.',
    office: 'Ohio Senate',
    district: 'Senate District 3',
    region: 'Parts of Franklin County plus all of Madison and Pickaway counties',
    facts: [
      {
        label: 'Current role',
        value: 'Reynoldsburg City Councilmember At-Large, Council President Pro Tempore',
      },
      {
        label: 'Experience',
        value: 'Three terms on council, 15 years serving Franklin County',
      },
    ],
    summary:
      'Three-term Reynoldsburg councilmember and Finance Committee chair running to flip Senate District 3 with a detailed pro-equality platform.',
    meta:
      'Ohio Pride endorses Reynoldsburg City Council President Pro Tem Stacie Baker for Ohio Senate District 3.',
    profile: [
      {
        heading: 'Why we endorsed Stacie',
        paragraphs: [
          'Stacie Baker has spent his career close to the people he serves. Fifteen years as a Franklin County employee. Three terms on Reynoldsburg City Council, elected At-Large by the whole city, now serving as Council President Pro Tempore and chair of the Finance Committee. He knows how to balance a budget, deliver services, and work across differences, and he has stood for pro-equality policies through all of it.',
          'His platform for the Ohio Senate is specific. Baker has committed to the Ohio Fairness Act, the conversion therapy ban, the PRIDE Act, and the Marriage Equality Act, and to opposing the drag ban in House Bill 249. He backs the Ohio Business Competes agenda so that no Ohio worker can be shut out of a job because of who they are or who they love. His priorities pair equality with everyday needs: fully funded public schools, expanded mental health and social services, and affordable housing with particular attention to trans Ohioans who face the steepest barriers.',
          'Senate District 3 stretches from eastern Franklin County into Madison and Pickaway counties, and it is winnable. The seat was decided by about five points in 2022, and the incumbent, Michele Reynolds, voted for House Bill 68 and sits at the bottom of the Ohio Pride legislative scorecard. Baker won his primary decisively and carries endorsements from labor and local leaders across the district. He offers these communities a senator who shows up for everyone.',
        ],
      },
    ],
    pullQuote: {
      text: 'It is not enough to just oppose bad legislation. Good leadership in the Ohio Legislature should also work to support legislation that expands or reinforces the rights and protections of LGBTQIA+ Ohioans.',
      attribution: 'Stacie Baker, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at staciebakerforohio.org', href: 'https://www.staciebakerforohio.org' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
  {
    slug: 'rose-lounsbury',
    match: 'rose lounsbury',
    photo: '/assets/endorsements/rose-lounsbury.jpg',
    photoAlt: 'Rose Lounsbury in a navy turtleneck standing on a tree-lined brick path',
    tagline: 'A teacher on a mission for Dayton and Kettering.',
    office: 'Ohio House of Representatives',
    district: 'House District 36',
    region: 'Kettering, Oakwood, Riverside, and parts of downtown and east Dayton',
    facts: [
      { label: 'Background', value: 'Former public school teacher and small business owner' },
    ],
    summary:
      "Former public school teacher and mom of triplets running a rematch in one of Ohio's most flippable House districts.",
    meta:
      'Ohio Pride endorses former public school teacher Rose Lounsbury for Ohio House District 36 in Montgomery County.',
    profile: [
      {
        heading: 'Why we endorsed Rose',
        paragraphs: [
          'Rose Lounsbury is a former public school teacher, the daughter of two retired teachers, and a mom of teenage triplets in public school. Her political journey began during the pandemic with the League of Women Voters, where she came to believe that voting rights are the foundation of a healthy democracy. In 2024 she came within five points of winning this seat in her first run for office. She is back in 2026, and this rematch is one of the most flippable House districts in Ohio.',
          'Her commitments to our community are clear. Lounsbury supports the Ohio Fairness Act because she believes our elected officials should fight discrimination wherever they find it. Her top equality priorities are protecting marriage equality in Ohio law, protecting employment and housing rights, and repealing the recent wave of anti-trans laws that restrict young people from participating alongside their friends. She has committed to always voting for bills that uplift and support LGBTQ+ Ohioans.',
          'Lounsbury also knows how to win the middle. Her campaign leads with the issues most Ohioans agree on: lower costs, better access to healthcare, funded public schools, and equal rights. That message is landing at Republican and independent doors across Kettering and Oakwood. The incumbent, Andrea White, has repeatedly supported bills that harm LGBTQ+ Ohioans and sits at the bottom of the Ohio Pride legislative scorecard. House District 36 deserves better, and Rose Lounsbury is ready to deliver it.',
        ],
      },
    ],
    pullQuote: {
      text: 'If I am elected, I can commit to always voting on bills that uplift and support LGBTQ+ Ohioans.',
      attribution: 'Rose Lounsbury, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at roseforohio.com', href: 'https://roseforohio.com' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
  {
    slug: 'karl-keith',
    match: 'karl keith',
    photo: '/assets/endorsements/karl-keith.jpg',
    photoAlt:
      'Karl Keith in a navy suit and red patterned tie smiling in an official portrait',
    tagline: 'A trusted watchdog for Montgomery County.',
    /* No `district`: the office line would read "Montgomery County Auditor,
       Montgomery County", and the countywide geography is already the first
       fact below it. */
    office: 'Montgomery County Auditor',
    region: 'Countywide, including Dayton, Kettering, and surrounding communities',
    facts: [
      { label: 'Current role', value: 'County Auditor since 2000, most recently reelected in 2022' },
      {
        label: 'Recognition',
        value: 'Fair Housing Award, GFOA excellence in financial reporting every year in office',
      },
    ],
    summary:
      "Montgomery County's longtime auditor, whose office sets the statewide standard for fair appraisals, clean audits, and public support for the LGBTQ+ community.",
    meta:
      'Ohio Pride endorses Montgomery County Auditor Karl Keith, whose office sets the standard for fairness, transparency, and inclusion.',
    profile: [
      {
        heading: 'Why we endorsed Karl',
        paragraphs: [
          "Karl Keith has led the Montgomery County Auditor's Office for 25 years, and he has used that office to prove that fairness is good government. His equal employment policy prohibits discrimination based on sexual orientation and gender identity. He invited the Miami Valley Fair Housing Center to conduct an in-depth review of his office's appraisal practices, the only county auditor in Ohio known to have requested one, and the review found his office values property fairly and without bias. The Dayton Realtors honored that work with their Fair Housing Award, which Keith calls one of the greatest honors of his career.",
          'His support for our community is public and personal. Keith marches in the Dayton Pride Parade every year alongside members of his staff, and his office has hosted a resource table at the festival for the past two years. He is vocal about his support for LGBTQ+ residents in public and online, he backs the Ohio Equal Rights Amendment, and he wants every LGBTQ+ resident to know they are welcome doing business with the county, whether transferring property, appealing a valuation, or filing a consumer complaint.',
          'Keith is also simply one of the most respected auditors in the state. His office has earned the Government Finance Officers Association Certificate of Achievement for Excellence in Financial Reporting every year he has served, and his consumer protection work on gas pump skimmers and misleading retail pricing has drawn statewide attention. Montgomery County voters will decide in November whether to keep that record of fair, transparent, and welcoming service. We believe the choice is clear.',
        ],
      },
    ],
    pullQuote: {
      text: 'I would proudly publicize my endorsement as a sign that my office is a safe place for our residents to work and do business.',
      attribution: 'Karl Keith, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at karlkeith.com', href: 'https://www.karlkeith.com' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
  {
    /* Judicial race: the statement stays descriptive, about fairness, dignity
       and access to justice. A judge does not campaign on how they will rule,
       so there are no policy commitments here and none should be added. */
    slug: 'job-perry',
    match: 'job esau perry',
    photo: '/assets/endorsements/job-perry.jpg',
    photoAlt:
      'Job Esau Perry in a blue suit standing before the carved wooden doors of the Summit County Courthouse',
    tagline: 'Fairness for every person in every courtroom.',
    office: 'Summit County Court of Common Pleas',
    district: 'General Division',
    region: 'Summit County, including Akron and surrounding communities',
    facts: [
      {
        label: 'Current role',
        value:
          'Summit County Probate Court Magistrate and Akron Public Schools Board of Education member',
      },
      { label: 'Experience', value: 'Trial attorney since 2005' },
    ],
    summary:
      'Probate court magistrate, school board member, and 20-year trial attorney running to bring proven fairness to the Summit County bench.',
    meta:
      'Ohio Pride endorses Magistrate Job Esau Perry for the Summit County Court of Common Pleas, General Division.',
    profile: [
      {
        heading: 'Why we endorsed Job',
        paragraphs: [
          'Job Esau Perry has spent more than two decades in Summit County courtrooms as a trial attorney, and since 2024 he has served as a magistrate in the Summit County Probate Court. He has issued opinions on hundreds of cases, many involving people in mental health crisis, and he has built a reputation across the Akron legal community as even keeled, respectful, and approachable. He also serves his community beyond the bench, as a member of the Akron Public Schools Board of Education and as a board member with the Community Health Center and Oriana House.',
          "His commitment to our community is concrete. Perry chairs the Akron Bar Association's Diversity Committee and has served on its Executive Board. He has attended and supported the Akron Pride Festival for years with his family, and this year he is marching in the parade with an event space at the festival. In his courtroom, he has committed to addressing every person by their correct pronouns, to making clear that the room is a safe space, and to expecting every member of his staff to treat everyone who enters with dignity and respect.",
          'Judicial races rarely get the attention they deserve, but the Court of Common Pleas is where Summit County residents actually meet the justice system. Who sits on that bench shapes whether people are treated fairly and with respect, no matter who they are. Perry has spent his career widening access to justice, including serving as standby counsel for more than a dozen people who represented themselves in felony trials. We are proud to support a candidate whose record shows that fairness is not a slogan. It is how he works.',
        ],
      },
    ],
    pullQuote: {
      text: 'In my courtroom, I will make it known that it is a safe space, and I will expect all my staff to show dignity and respect to anyone who enters.',
      attribution: 'Job Esau Perry, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at jobforjudge.com', href: 'https://jobforjudge.com' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
  {
    slug: 'paul-kurtz',
    match: 'paul kurtz',
    photo: '/assets/endorsements/paul-kurtz.jpg',
    ogImage: '/assets/social/og-endorsement-paul-kurtz.png',
    photoAlt:
      'Paul Kurtz smiling, wearing clear-framed glasses and a navy blazer over a cream tee, against a gray studio backdrop',
    tagline: '"It should not have to happen to you for it to matter to you."',
    office: 'Ohio House of Representatives',
    district: 'House District 55',
    region:
      'Northern, western, and southern Warren County, including Springboro, Franklin, Carlisle, and Waynesville',
    opponent: 'Rep. Michelle Teska (incumbent)',
    facts: [
      {
        label: 'Background',
        value: 'Senior leader at a publicly traded company; board member, Kids In Need Foundation',
      },
    ],
    donate: 'https://secure.actblue.com/donate/paul-kurtz-1',
    summary:
      'A business executive who made his name at rallies calling out attacks on trans Ohioans, now knocking thousands of doors in Warren County to replace an incumbent who scores 10 out of 100 on our scorecard.',
    meta:
      'Ohio Pride endorses Paul Kurtz for Ohio House District 55. A Warren County business leader running to replace an incumbent with a failing equality record.',
    profile: [
      {
        heading: 'Why we endorsed Paul',
        paragraphs: [
          "Paul Kurtz was born in Sandusky and grew up in a trailer park. His mother taught music and his father was a county police officer, and when his mother got sick the medical bills nearly bankrupted the family. After college he worked two jobs to cover rent and student loans. Over the next two decades he climbed to senior leadership at a publicly traded company, where he has negotiated multimillion-dollar deals and led teams through a recession, a pandemic, and trade wars. He serves on the board of the Kids In Need Foundation, the national nonprofit that puts free school supplies into the country's most underserved classrooms.",
          'He calls himself an accidental activist, and the record backs it up. As an organizer with 50501, he stood at the microphone at rallies and named the attacks on LGBTQ+ Ohioans, and on trans Ohioans in particular, out loud and on video. In his business role he built a partnership with the It Gets Better Project that put school supplies on the shelves of major retailers with a share of every sale going to an organization that exists to lift up LGBTQ+ youth. That is what moved our Screening Committee. He was showing up for this community before he was asking for its vote.',
          'In the House, Kurtz has committed to vote against every anti-LGBTQ+ bill, without exception. His three pro-equality priorities are the Ohio Fairness Act, so no Ohioan can be fired or denied housing because of who they are, restoring access to gender-affirming care, and protecting LGBTQ+ students by ending forced-outing policies and the censorship of LGBTQ+ books. He supports a statewide conversion therapy ban and puts it plainly: the legislature should be passing bills that support Ohioans, not bills that seek to harm them.',
          'He is running the campaign the way this district needs it run. Alongside Dr. Cara Jacob, our endorsed candidate for Ohio Senate District 7, he is knocking thousands of doors across suburban and rural Warren County with a message about working families, property taxes, and public schools. What he hears at those doors, from voters of every political stripe, is that the Statehouse\'s fixation on bullying marginalized people is a distraction from the problems that actually matter.',
          "The incumbent, Rep. Michelle Teska, voted for the drag ban in House Bill 249 and scores 10 out of 100 on the Ohio Pride legislative scorecard. Kurtz's faith leads him to a simple belief: dignity and safety belong to everyone, no matter who you are or where you come from. House District 55 deserves a representative who governs that way.",
        ],
      },
      {
        heading: 'His record',
        bullets: [
          'Committed to voting against every anti-LGBTQ+ bill, without exception',
          'Committed to the Ohio Fairness Act and a statewide conversion therapy ban',
          'Committed to restoring access to gender-affirming care',
          'Spoke out against attacks on LGBTQ+ and trans Ohioans as a 50501 rally organizer',
          'Led a corporate partnership with the It Gets Better Project',
          'Board member, Kids In Need Foundation',
          'Two decades in business, now in senior leadership at a publicly traded company',
        ],
      },
    ],
    pullQuote: {
      text: 'I will always vote against anti-LGBTQ+ legislation. There is nothing that could make me waver on this position.',
      attribution: 'Paul Kurtz, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at paulmichaelkurtz.com', href: 'https://www.paulmichaelkurtz.com' },
      { label: 'Volunteer with Ohio Pride in District 55', href: '/volunteer' },
    ],
  },
  {
    slug: 'jordan-haire',
    /* Supabase candidate_name was submitted as "Jordan E Haire"; the publish
       migration normalizes it to "Jordan Haire" so this match and the admin's
       "live at" slug agree. */
    match: 'jordan haire',
    photo: '/assets/endorsements/jordan-haire.jpg',
    ogImage: '/assets/social/og-endorsement-jordan-haire.png',
    photoAlt: 'Jordan Haire smiling with arms crossed, wearing glasses and an olive top, against a peach backdrop',
    tagline: '"I listen for a living."',
    office: 'Ohio House of Representatives',
    district: 'House District 47',
    region: 'Butler County from Hamilton to Oxford, including Fairfield, Reily, Milford, and Hanover townships',
    opponent: 'Rep. Diane Mullins (incumbent)',
    facts: [
      { label: 'Background', value: 'Mental health counselor, 13 years in practice, Medicaid provider' },
    ],
    donate: 'https://secure.actblue.com/donate/jordan4ohio',
    summary:
      "Hamilton's data center fight pulled a Badin grad and mental health counselor into politics. Now she is running to flip a Butler County seat held by an incumbent at the bottom of our scorecard.",
    meta:
      'Ohio Pride endorses Jordan Haire, a mental health counselor, for Ohio House District 47 in Butler County, from Hamilton to Oxford.',
    profile: [
      {
        heading: 'Why we endorsed Jordan',
        paragraphs: [
          'Jordan Haire has spent 13 years as a mental health counselor, and she is a Medicaid provider in a state where fewer and fewer clinicians will take it. She was raised in Fairfield and Ross, graduated from Badin High School in Hamilton, and is raising her own family in the same community. The values she learned in the Catholic Church and at home, the dignity of every human being and reverence for all creation, are the ones she says led her into counseling and now into politics. She got into this race the way a lot of good candidates do: a proposed data center in Hamilton pushed her to speak up, and within a week she had decided the only real answer was to run.',
          "Her case for equality is a clinician's case. She says it plainly in her questionnaire: in 2026 she still has clients who are afraid to live as themselves because of the hostile environment around them, and she has watched what that fear does to a person's health. She treats gender-affirming care as more than a set of medical procedures, and being able to exist in public without being legislated against as part of it. On conversion therapy she is blunt: she cannot understand how any therapist still practices that form of abuse. And she knows that supporting a young person's identity is a matter of health and safety, not politics.",
          'In the House her priorities start with access to care: protecting Medicaid so providers keep accepting it and patients can find affirming clinicians, fully funding public schools, and making sure teachers and parents understand what inequality does to a young person\'s mental health. She names the Ohio Fairness Act and the Marriage Equality Act as her top legislative priorities, has committed to vote against any rollback of LGBTQ+ rights, and wants to address the fallout from the drag ban if it is still causing harm when she takes office.',
          'She is running the campaign the way she runs her practice, listening more than speaking. Her platform leads with affordability, fully funded public schools, and accountability, the things she hears about at doors across Butler County, and she has pledged to listen to every voter in the district, including the ones who oppose her.',
          'House District 47 runs from Hamilton to Oxford, and the incumbent, Rep. Diane Mullins, scores 10 out of 100 on the Ohio Pride legislative scorecard. Haire is offering the district something different: a representative who understands that belonging is the foundation of a healthy life, and who will legislate like it.',
        ],
      },
      {
        heading: 'Her record',
        bullets: [
          'Mental health counselor, 13 years in practice, Medicaid provider',
          'Runs an inclusive, affirming counseling practice in Butler County',
          'Committed to the Ohio Fairness Act and the Marriage Equality Act',
          'Committed to a statewide conversion therapy ban and to protecting gender-affirming care',
          'Committed to voting against any rollback of LGBTQ+ rights',
          'Supports inclusive education that takes the mental health of LGBTQ+ youth seriously',
          'Raised in Fairfield and Ross, Badin High School graduate',
        ],
      },
    ],
    pullQuote: {
      text: 'Belonging is really the basic step to healthy attachments and thriving, and we absolutely need the inclusion in order to move forward in other areas.',
      attribution: 'Jordan Haire, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at jordan4ohio.com', href: 'https://www.jordan4ohio.com' },
      { label: 'Volunteer with Ohio Pride in District 47', href: '/volunteer' },
    ],
  },
  {
    slug: 'cassandra-rice',
    match: 'cassandra a rice',
    name: 'Cassandra Rice',
    photo: '/assets/endorsements/cassandra-rice.jpg',
    photoAlt:
      'Cassandra Rice in a navy blazer with arms crossed, smiling in a professional portrait',
    tagline: 'Every family deserves a fair court.',
    office: 'Montgomery County Probate Court',
    district: 'Judge',
    region: 'Montgomery County, including Dayton, Kettering, and Oakwood',
    facts: [
      {
        label: 'Experience',
        value: 'Nearly 14 years in practice, former Common Pleas staff attorney',
      },
      {
        label: 'Service',
        value:
          'Past President and Chair, Legal Aid of Western Ohio and Advocates for Basic Legal Equality',
      },
    ],
    summary:
      'Longtime legal aid leader and pro bono guardian running for the Montgomery County bench that decides marriages, adoptions, name changes, and chosen family.',
    meta:
      'Ohio Pride endorses attorney Cassandra Rice for Montgomery County Probate Judge, the court that decides how Ohioans build and protect chosen families.',
    profile: [
      {
        heading: 'Why we endorsed Cassandra',
        paragraphs: [
          'Probate court is where Ohioans build and protect their chosen families. It grants marriage licenses. It decides adoptions. It rules on name changes and gender marker changes. It determines whether the person you trust most can serve as your guardian. Cassandra Rice understands exactly what that means for LGBTQ+ people, and she named it in her application to us more plainly than any candidate this cycle: the wrong judge in these proceedings can let bias, overt or covert, stand between a person and their family.',
          "Rice has spent nearly 14 years in practice preparing for this bench. As a staff attorney in the Montgomery County Common Pleas Court, she helped build the Women's Therapeutic Court, now the RISE Docket, the county's first women-only drug treatment court, where she learned that how a judge treats a person determines whether they trust the process at all. She has served eight years on the boards of Legal Aid of Western Ohio and Advocates for Basic Legal Equality, leading both as President and Chair, and she serves as a pro bono guardian for underprivileged clients in the very court she seeks to lead.",
          'Her commitments to our community are specific. Neutral language in court documentation. Asking every person how they wish to be addressed. Interpreters and accommodations as a baseline, not a favor. Continuous training for herself and her staff so that every case gets the same fair process. She has counseled clients through name changes, her family founded a nonprofit that clothes people through gender transitions, and out members of the Dayton legal community, including Judge Mary Wiseman, are supporting her campaign. Montgomery County families deserve a probate judge who sees all of them. Cassandra Rice will.',
        ],
      },
    ],
    pullQuote: {
      text: 'The Probate Courts of Ohio control how we build and create our chosen families.',
      attribution: 'Cassandra Rice, Ohio Pride endorsement questionnaire',
    },
    cta: [
      { label: 'Learn more at votericeforjudge.com', href: 'https://votericeforjudge.com' },
      { label: 'Read all endorsements', href: '/endorsements' },
    ],
  },
];

/** The editorial entry for a Supabase row, or null if nobody has written one. */
export function contentFor(row) {
  const key = String(row?.candidate_name || '').trim().toLowerCase();
  return ENDORSEMENT_CONTENT.find((c) => c.match === key) || null;
}
