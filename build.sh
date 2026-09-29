#!/bin/sh
# Builds the site at the repo root from src/ (GitHub Pages serves main, / root).
set -e
cd "$(dirname "$0")"
node -e "const fs=require('fs');const h=fs.readFileSync('src/app.html','utf8');const d=fs.readFileSync('src/dsp.js','utf8');fs.writeFileSync('index.html',h.replace('/*DSP*/',()=>d).replace('/*PREDICT*/',()=>fs.readFileSync('src/predict.js','utf8')));"
cp src/sw.js src/manifest.webmanifest src/icon-180.png src/icon-512.png .
