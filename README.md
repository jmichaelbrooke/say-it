# Say It: Craig's phrase translator

A web app for Craig's iPad. It has a typing box with word suggestions that learn from what he says (plus desert, RV and side-by-side vocabulary), and his recent sentences one tap away. For voice, he records his everyday phrases three times each; afterwards he taps the big button, says a phrase, and the iPad says it back clearly. Matching runs on the iPad (MFCC features + dynamic time warping in `src/dsp.js`), works offline once installed, and no audio leaves the device.

- `src/` source. `sh build.sh` rebuilds the site files at the repo root (index.html, sw.js, manifest, icons), which GitHub Pages serves.
- Live at https://jmichaelbrooke.github.io/say-it/ once Pages is set to main, / (root). The microphone needs HTTPS.
- Tested in Chromium with a simulated microphone and synthetic voices: 10 of 10 phrases recognised across different voices. Not yet tried on a real iPad or with Craig's voice.

## Installing on Craig's iPad
1. Open the link in Safari.
2. Tap Share, then "Add to Home Screen".
3. Open "Say It" from the home screen, tap Setup, and record the phrases. Allow the microphone when asked.
4. Use Setup > Voice and backup > "Save a backup" now and then.

## Known limits (v1)
- Phrases are edited on the iPad itself; no remote editing yet.
- Works best with 10 to 40 distinct phrases. Phrases that sound alike ("Yes"/"No" said the same way) can be confused; the app asks when it is unsure, and learns from each correction.
