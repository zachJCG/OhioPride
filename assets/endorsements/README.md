# Endorsed candidate photos

Drop campaign photos here named by candidate slug:

- `jeff-givan.jpg` — Jeff Givan, OH House District 78 (2026). Approved
  campaign portrait: downtown Lima, black patterned shirt.
- `jeff-givan-card.jpg` — square crop of the above for the grid card
  (the full portrait leaves his face too small in a 1:1 crop).
- `caleb-price.jpg` — Caleb Price, OH House District 30 (2026). Approved
  headshot: tan zip polo, gray background.

File naming
- Use lowercase, hyphen-separated: `first-last.jpg`
- Prefer JPG, ~1080px wide, portrait orientation, face centered.
- The endorsements grid (`/endorsements`) crops cards to a square with
  `object-position: center 20%`, so keep the subject's face in the
  upper half. The profile view (`/endorsements/#<slug>`) shows the
  photo uncropped.

These paths are referenced from `js/endorsement-content.js` — see the
"HOW TO ADD AN ENDORSEMENT" walkthrough at the top of that file.
