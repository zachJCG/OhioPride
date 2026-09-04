# Endorsed candidate photos

Drop campaign photos here named by candidate slug:

- `jeff-givan.jpg` — Jeff Givan, OH House District 78 (2026). Approved
  campaign portrait: downtown Lima, black patterned shirt.
- `jeff-givan-card.jpg` — square crop of the above for the grid card
  (the full portrait leaves his face too small in a 1:1 crop).
- `caleb-price.jpg` — Caleb Price, OH House District 30 (2026). Approved
  headshot: tan zip polo, gray background.
- `karen-brownlee.jpg` — Rep. Karen Brownlee, OH House District 28 (2026).
  Approved headshot: glasses, blue top, black blazer, gray background.
- `seth-walsh.jpg` — Seth Walsh, State Treasurer (2026). Approved campaign
  photo: green quarter-zip, brick background. Landscape orientation.
- `seth-walsh-card.jpg` — square crop of the above for the grid card
  (the full photo is landscape, which would clip his face in a 1:1 crop).
- `cara-jacob.jpg` — Dr. Cara Jacob, OH Senate District 7 (2026). Approved
  campaign portrait from caraforohio.com: white coat, garden path, yellow
  blooms.
- `cara-jacob-card.jpg` — square crop of the above for the grid card. She
  stands left of the frame's centre and low in it, so the 1:1 crop of the
  full portrait put her small beneath a band of sky.
- `christine-cockley.jpg` — Rep. Christine Cockley, OH House District 6
  (2026). Approved campaign photo: light blazer, painted mural wall.
- `stacie-baker.jpg` — Stacie Baker, OH Senate District 3 (2026). Official
  portrait: navy suit, patterned tie, white background.
- `rose-lounsbury.jpg` — Rose Lounsbury, OH House District 36 (2026).
  Approved campaign photo: navy turtleneck, tree-lined brick path.
- `karl-keith.jpg` — Karl Keith, Montgomery County Auditor (2026). Official
  portrait: navy suit, striped shirt, red patterned tie, studio backdrop.
- `job-perry.jpg` — Job Esau Perry, Summit County Common Pleas (2026).
  Approved campaign photo: blue suit, carved doors of the county courthouse.
- `paul-kurtz-headshot.jpg`: Paul Kurtz, OH House District 55 (2026).
  Campaign headshot: clear-framed glasses, navy blazer over a cream tee, gray
  studio backdrop. Cropped to 4:5 from the 1024x1024 original and scaled to
  1080x1350. Replaced the profile cutout that shipped 2026-09-04 as
  `paul-kurtz.jpg`; the name changed rather than the bytes, see below.
- `jordan-haire.jpg`: Jordan Haire, OH House District 47 (2026). Campaign
  headshot: glasses, olive top, arms crossed, peach backdrop. Cropped to
  1080x1350 from the 2396x3600 original the campaign supplied to the Butler
  County Democratic Party.

## Replacing a photo that already shipped

`/assets/endorsements/*` and `/assets/social/*` are served with
`public, max-age=604800` (see `next.config.mjs`). Overwriting a file in place
therefore changes nothing for anyone who already loaded it, for up to a week,
and there is no way to purge their browser. **Ship a new filename instead** and
point `photo` / `ogImage` in `lib/endorsement-content.mjs` at it. The old file
can be deleted in the same commit; nothing else references it.

Also add the candidate to the hand-written slate in `public/index.html`. That
grid is static markup, not a Supabase read, so a new endorsement does not reach
the homepage on its own.

The August 22 slate above arrived square (1080x1080), which needs no
`cardPhoto`: a square photo is already the grid card's crop, and the profile
shows the same file uncropped.

Link-preview cards
- A tall portrait is the wrong shape for a 1.91:1 social card and gets
  center-cropped to a sliver, so a profile may also supply a built
  1200x630 card via the `ogImage` field. Cara's lives at
  `/assets/social/og-endorsement-cara-jacob.png`; Paul Kurtz and Jordan
  Haire have cards on the same template at
  `/assets/social/og-endorsement-<slug>.png`. Without `ogImage` the
  profile falls back to `photo`, then to the site's default OG image.

File naming
- Use lowercase, hyphen-separated: `first-last.jpg`
- Prefer JPG, ~1080px wide, portrait orientation, face centered.
- The endorsements grid (`/endorsements`) crops cards to a square with
  `object-position: center 20%`, so keep the subject's face in the
  upper half. The profile page (`/endorsements/<slug>`) shows the photo
  uncropped, and uses it as the link-preview image when the page is
  shared, so it is worth getting right.

These paths are referenced from `lib/endorsement-content.mjs` — see the
"HOW TO ADD AN ENDORSEMENT" walkthrough at the top of that file.
