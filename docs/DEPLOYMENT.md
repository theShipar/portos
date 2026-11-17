# Deployment

Production URL: **https://portos-shipar.vercel.app**

The requested `portos.vercel.app` address was unavailable (owned by another Vercel team); this project uses `portos-shipar.vercel.app`.

PORTOS is a static Vue/Vite application deployed on Vercel. There is no application backend or production database. Mobile support is not ready yet; the published preview is intended for desktop browsers.

## Build configuration

- Framework: Vite
- Install: `npm ci`
- Build: `npm run build` (includes `vue-tsc --noEmit`)
- Output: `dist`
- `vercel.json` provides SPA routing so direct links such as `/ops/port/PRT-SIN` work after a refresh.
- No secret or external API key is required for the demo. `.env.example` documents optional map configuration.
- `.vercel/`, local environment files, dependency folders, and build output are excluded from Git. `.vercelignore` also excludes documentation, screenshots, local caches from deployment uploads.

## Release a change

```bash
npm ci
npm run data:validate
npm test
npm run build
```

Use an authenticated Vercel CLI, link to the intended project, and inspect the link before deploying:

```bash
vercel link --project portos
vercel project inspect --non-interactive
vercel deploy --prod
```

Check the production homepage and direct region, port, vessel, and incident links. Open the cargo modal, select a compartment, and confirm that its annotation updates. Commit and push the tested source and documentation to GitHub. Do not commit credentials or `.vercel` files.

## Runtime boundaries

- The app reads generated fixture modules and local geographic assets.
- Optional 2D map tiles are fetched from OpenFreeMap.
- Workflow changes remain in the visitor's localStorage; resetting the demo clears local state.
- No server-side error monitoring or log drain is configured by this release. Browser verification and build checks do not establish production-service readiness.
