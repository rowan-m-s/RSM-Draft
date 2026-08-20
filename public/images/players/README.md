# Local player photo overrides

Drop a file here to override a player's photo. Named by the FPL element
**code**, not its id: `public/images/players/{code}.png`.

The code is stable across seasons; the id is not guaranteed to be, so a file
named by id could silently attach to a different player next August.

Resolution order for every player image:

1. this folder, if a file exists for that code
2. the current FPL CDN, using the pattern in `src/lib/assets.ts`
3. the legacy FPL CDN, which holds last season's photos
4. the silhouette

Tier 3 means a player who has just transferred appears in their previous
club's shirt rather than as a silhouette. That is deliberate and temporary:
FPL publishes a current photo within a few weeks of a transfer, at which point
tier 2 wins and tier 3 is never reached. Those players need no override.

`npm run fetch` prints every owned player with no usable photo, along with the
exact filename to save. That list also appears in the Action log.

## Matching the CDN images

The CDN serves **transparent PNG cut-outs**, not photos on a background, and
the app renders them as circles with the top of the image anchored.

- **219 x 280 px**, portrait, aspect 11:14. This matches the size the app
  actually uses in tables and on the pitch.
- **PNG with a transparent background.** A white or coloured rectangle will
  show as a visible box against the green pitch.
- **Subject fills the frame**: head near the top, cropped around chest level,
  shoulders reaching the left and right edges.

Do not pad a smaller image out to a square. The subject then occupies less of
the frame, and once cropped to a circle the head renders noticeably smaller
than everyone else's. 500 x 500 square also works, provided the subject still
fills it edge to edge.
