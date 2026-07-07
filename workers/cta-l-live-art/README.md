# Chicago 'L' Live Art Worker

Cloudflare Worker proxy for the CTA Train Tracker API. The browser page should
call this Worker instead of calling CTA directly, so the CTA API key stays out
of GitHub Pages.

## Local Secret

Copy `.dev.vars.example` to `.dev.vars` and fill in the key when you have it:

```sh
CTA_TRAIN_TRACKER_API_KEY=your_key_here
```

## Commands

Run these from `workers/cta-l-live-art`:

```sh
npx wrangler dev
npx wrangler secret put CTA_TRAIN_TRACKER_API_KEY
npx wrangler deploy
```

The current deployed endpoint is:

```text
https://cta-l-live-art.matthewfeil.workers.dev/api/trains
```
