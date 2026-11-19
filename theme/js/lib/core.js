"use strict";
// Shared library for the theme's scripted panels: include this one file first.
//   tokens  colours, dp, fonts, helpers        text    tracked labels (cached), plain text
//   motion  clock, springs, scramble, roll      draw    rules, marks, boxes, icons, hit areas
//   bus     messages between panels, shared state and keys    skins   case skins (folders of renders)
//   grain   the noise texture over each panel                 settings  settings kept across layout imports
//   i18n    tr(): the interface language                     custom  the user's own colour scheme
//   wallpaper  the user's picture behind some views          rating  track ratings (where kept, read, set, drawn)
//   tag     the title tag: the song's title on a rendered tag (06 STYLE)
//   field   one-line text fields (the search, 06 STYLE's text size)
//   report  the error log and problem reports (MENU › Audio Archive › Report a problem)

// report first: it wraps the timers before any other file makes one (lib/report.js)
for (const f of ["report", "settings", "i18n", "custom", "tokens", "motion", "text", "draw", "bus", "rating", "favourite", "skins", "grain", "wallpaper", "tag", "field"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);
