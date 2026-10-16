# Adjacent-frame change ranking

This is an anomaly ranking for manual review, not a continuity or aesthetics pass.

- Input: `D:\python_project\manim_extend_rainbow\video_project\shanghai_tower\tmp\segment-0-600-opening-v4.mp4`
- Analyzed: 601 frames; ROI: (112, 30, 320, 153)
- Minimum separation: 20 frames

| Rank | Frame pair | Approx. seconds | Mean difference | Review frames |
|---:|---:|---:|---:|---:|
| 1 | 130 → 131 | 4.367 | 7.1742 | 116–146 |
| 2 | 599 → 600 | 20.000 | 5.1621 | 585–600 |
| 3 | 579 → 580 | 19.333 | 1.3786 | 565–595 |
| 4 | 250 → 251 | 8.367 | 1.3291 | 236–266 |
| 5 | 196 → 197 | 6.567 | 1.3222 | 182–212 |
| 6 | 221 → 222 | 7.400 | 1.3000 | 207–237 |
| 7 | 337 → 338 | 11.267 | 1.1898 | 323–353 |
| 8 | 270 → 271 | 9.033 | 1.1733 | 256–286 |

All frames returned by the completed decoder were analyzed.
Review moving objects, occlusion and camera movement around each candidate; a high score alone is not an error.
