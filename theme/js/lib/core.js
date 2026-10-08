"use strict";
// Shared library for the theme's scripted panels: include this one file first.
//   tokens  colours, dp, fonts, helpers        text    tracked labels (cached), plain text
//   motion  clock, springs, scramble, roll      draw    rules, marks, boxes, icons, hit areas
//   bus     messages between panels, shared state and keys    skins   case skins (folders of renders)
//   grain   the noise texture over each panel                 settings  settings kept across layout imports

for (const f of ["settings", "tokens", "motion", "text", "draw", "bus", "skins", "grain"]) include(fb.ProfilePath + `themes\\audio-archive\\js\\lib\\${f}.js`);
