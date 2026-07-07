---
layout: post
title: "Chicago 'L' Live Art"
date: 2026-07-06 21:45:00 -05:00
tagline: "A live artwork made from real Chicago 'L' train positions."
---

## Try Chicago 'L' Live Art [here]({{ "/cta-l-live-art/" | relative_url }})!

Hi! I made Chicago 'L' Live Art using live Chicago 'L' train data. Instead of making a normal train tracker with a map, I wanted it to feel more like an abstract piece of art that happens to be powered by real live information. The page gets train positions from the CTA Train Tracker API, then turns each train's latitude and longitude into a position on a grid. From there, the website draws the trains as moving pixels on the screen.

Each colored square represents a train, and the color matches the CTA line it is on. When trains are moving, the page shows a blinking or pulsing effect to indicate the direction the train is moving. If multiple trains end up on the same grid square, the color can shift or blink between them.

The settings let you change the look without changing the live data behind it:

- Standard mode shows the normal moving live view
- Still mode makes the trains feel more like a static light grid
- Smooth mode blends movement more gradually between positions
- Pixel size changes how large or small the grid blocks are
- Normal, pastel, and monochrome color modes change the palette
- The line toggles let you choose which CTA lines appear

This project is meant to use live data for a new purpose to create a cool design; you might even call it a work of art. Hope you enjoy!
