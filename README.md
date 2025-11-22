
Tesla-like Mobile HUD — Realistic Demo
=====================================

This demo uses TensorFlow.js coco-ssd for object detection and three.js for a 3D/2.5D HUD overlay.
It runs entirely in the browser and uses the phone camera (no server).

Files:
- index.html
- style.css
- script_realistic.js

How to run locally:
1. unzip the archive and run a local http server in the folder (required for camera access):
   python3 -m http.server 8000
2. Open the URL on your phone's browser (same network): http://<your-pc-ip>:8000
3. Press "Use Camera" and allow camera permission.

How to publish to GitHub Pages:
1. Create a new repo and upload the files to the repo root.
2. Enable GitHub Pages (branch main, folder /).
3. Open the provided GitHub Pages URL on your phone.

Notes:
- This is a demo and won't match Tesla's exact production visuals or model accuracy.
- For best results use modern browsers (Safari iOS 15+ / Chrome Android).
