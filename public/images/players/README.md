# Local player photo overrides

Drop a file here to override a player's photo. Named by the FPL element
**code**, not its id: `public/images/players/{code}.png`.

The code is stable across seasons; the id is not guaranteed to be, so a file
named by id could silently attach to a different player next August.

Resolution order for every player image:

1. this folder, if a file exists for that code
2. the FPL CDN, using the pattern in `src/lib/assets.ts`
3. the silhouette

`npm run fetch` prints every owned player with no usable photo, along with the
exact filename to save. That list also appears in the Action log.

Square images work best. They are rendered as circles at 28-64px in tables and
on the pitch, so anything with the face roughly centred will do.
