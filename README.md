# Most Armii (HAOS Runner)

Original hyper-casual crowd-runner for mobile browsers. Build a blue army, steer through math gates (+N / xN / -N), clash with red enemies, and defeat the boss.

Polish UI. Portrait PWA. Procedural canvas art. No proprietary assets.

Author: Adam (GitHub Haos1980)

## Play on Android phone

1. Open the game URL in Chrome (GitHub Pages link below, or your local server).
2. Tap the browser menu (three dots) and choose Add to Home screen / Install app.
3. Launch Most Armii from the home screen like a normal app (standalone, portrait).

### Local server (PC and phone on same Wi-Fi)

From this folder run:

    python3 serve.py

Or:

    python3 -m http.server 8080

On the phone open http://YOUR_PC_LAN_IP:8080 then Add to Home Screen.

On desktop open http://localhost:8080

## Controls

- Tap: start or restart
- Drag left / right: steer the army
- Goal: grow via gates, survive fights, beat the boss

## Gameplay v1

- Auto-run forward on a stone bridge over water
- Blue crowd with simple capsule units
- Gates that add, multiply, or subtract
- Fight segments vs red enemy blocks
- Boss with HP bar
- Win / lose screens and restart

## Project files

- index.html — shell and PWA meta
- style.css — full-screen canvas and HUD
- game.js — game loop, level, combat
- manifest.json — installable PWA
- sw.js — offline cache
- icon.svg, icon-192.png, icon-512.png — icons

## Android APK

v1 is PWA-only (no APK in this repo). Add to Home Screen on Android Chrome is the supported install path.

A later Capacitor or Cordova wrap can package the same web files into an APK if needed.

## GitHub Pages

If Pages is enabled (Settings, Pages, deploy from branch main, root):

https://haos1980.github.io/army-runner-android/

## License

MIT. Original game by Haos1980. Inspired by the hyper-casual crowd-runner genre, not a clone of any specific title IP or art.
