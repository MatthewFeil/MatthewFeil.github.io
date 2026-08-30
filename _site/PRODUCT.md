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

Visitors browse public pages and posts on the web. Public tools include grade, interest, and investment calculators. A separately authenticated Personal Space dashboard links to private portfolio and lifting trackers and integrates Todoist and Google Calendar views.

## Capabilities and Constraints

The site is a Jekyll static website using `jekyll-feed` and `jekyll-seo-tag`. It includes standalone HTML tool pages, Markdown posts, shared Jekyll layouts and includes, and JavaScript-backed interactive tools. The Personal Space dashboard uses Supabase functions and requires authentication. The repository excludes backend service directories and local environment files from Jekyll builds.

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

The existing web implementation includes semantic form labels, status announcements, visible keyboard focus styling, responsive minimum widths, and light and dark color-scheme support.