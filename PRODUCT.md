# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Friends, family, and the school community exploring Matthew Feil's projects, experiments, interests, and public tools.

## Product Purpose

Matthew Feil's personal website is a living record of projects, experiments, and interests. It gives visitors a place to discover published work, read updates, and use focused tools such as calculators.

## Positioning

The site combines a personal record of music, technology, and other interests with working projects and utility tools created and maintained by Matthew Feil.

## Operating Context

Visitors browse public pages and posts on the web. A public My Work gallery links to Transcribe, Chicago 'L' Live Art, the Finals Grade Calculator, the Stock Return Calculator, and the Interest Calculator. The homepage features Transcribe and links to Live Art and the Finals Grade Calculator, while the main navigation links directly to My Work. Transcribe processes user-selected audio locally. A separately authenticated Personal Space dashboard links to private portfolio and lifting trackers and integrates Todoist and Google Calendar views.

## Capabilities and Constraints

The site is a Jekyll static website using `jekyll-feed` and `jekyll-seo-tag`. It includes standalone HTML tool pages, Markdown posts, shared Jekyll layouts and includes, and JavaScript-backed interactive tools. The transcription workbench uses the browser's Web Audio API, Canvas, and a Web Worker for local waveform and frequency analysis; uploaded audio is not sent to a server. The Personal Space dashboard uses Supabase functions and requires authentication. The repository excludes backend service directories and local environment files from Jekyll builds.

## Brand Commitments

The confirmed public identity is Matthew Feil's personal website. The public introduction describes interests in music, technology, tennis, jazz piano, trombone, apps and websites, and audio and lighting equipment.

## Evidence on Hand

Public content and project entry points are present in the root pages and `_posts/` directory. Site configuration and stated description are in `_config.yml`. Interactive client assets are in `assets/js/`, and private dashboard integrations are represented by `personal.html` and Supabase function directories. No external testimonials, customer claims, or benchmark evidence are confirmed.

## Product Principles

- Make Matthew's current projects and interests easy for the personal community to discover.
- Let published work demonstrate capability through real, usable tools and experiments.
- Keep private tracking and personal data behind authenticated access.
- Preserve a site structure that can grow as new work and ideas are published.

## Accessibility & Inclusion

The existing web implementation includes semantic form labels, status announcements, opt-in keyboard navigation and focus styling, responsive minimum widths, and light and dark color-scheme support.

Keyboard navigation is off by default across matthewfeil.com. Users can enable Tab/Shift+Tab navigation and visible focus indicators with the Keyboard navigation toggle or Alt+Shift+K (Option+Shift+K on Mac). The preference persists across pages. App shortcuts and normal field editing work in both modes.

Transcribe uses percentage-based playback speed. Beat analysis, BPM speed mode, metronome/count-in, and the Timing sidebar group are removed. Measure and section markers remain; numbering and bulk measure deletion live in the measure navigation popover. Legacy configs may retain beat metadata, which is ignored on import.
