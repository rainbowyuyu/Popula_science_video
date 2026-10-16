# V11 independent paper and scene audit

Audit performed against `timeline-v11.json`, `WorldV11.ts`, `EvidenceFigureV11.tsx`, the four local original-paper PDFs and extracted text, and `advanced.pdf.txt`. This is a read-only code audit; the findings refer to the source as inspected before final integration. No final render is certified by this document.

## Narration-to-scene routing

| Clip | Narrated topic | Required visual |
|---|---|---|
| 000 | A weakly interacting particle; deep Antarctic ice; blue light | Antarctic descent, fixed detector, interaction followed by visible light |
| 001 | Award and collaboration | Observatory / collaboration context |
| 002–003 | Proton bends; gamma attenuates; neutrino preserves direction | Three messengers from one source, not CC/NC or detector track/cascade |
| 004 | 1988 idea → AMANDA → IceCube | Detector concept and deployment |
| 005 | 86 strings × 60 DOMs; 1450–2450 m | Fixed detector geometry and depth cue |
| 006 | Neutral neutrino → interaction → charged particles → light recorded | Physical interaction; a νμ CC example is suitable if explicitly identified |
| 007 | v > c/n, Cherenkov threshold | Charged-particle direction, optical rays and speed relation |
| 008 | Long muon track; hit timing → direction | Fixed DOMs with time-ordered hits |
| 009 | Local cascade; deposited energy | Compact shower plus fixed DOM hit pattern |
| 010 | Atmospheric background and Earth shielding | Earth suppresses atmospheric muons; atmospheric neutrinos remain a background |
| 011 | 28 / 4.1σ → 37 candidates / 5.7σ; event 32 | Early→late transition at local 13.794 s, the start of the three-year sentence |
| 012 | TXS 0506+056 → NGC 1068 | TXS stage through local 14.181 s; NGC starts at 14.181 s |
| 013 | Drilling, cabling, calibration, data filtering | Engineering chain, not another TXS source diagram |
| 014 | Multiple messengers combine evidence | Light / cosmic rays / gravitational waves / neutrinos; not NGC likelihood again |
| 015 | Sample/background limitations; angular-resolution differences | Track/cascade direction comparison |
| 016 | Closing blue-light-to-cosmos connection | Detector and source context |

## Must-fix scientific representations

1. **CC is not synonymous with long track.** `advanced.pdf.txt` lines 208–258 defines CC as a same-flavour charged lepton plus a hadronic cascade, and NC as an outgoing neutrino plus hadronic cascade. Lines 364–403 distinguish νμ CC tracks from νe CC and most ντ CC cascades, with tau double-bang cases. Replace the blanket `CC：带电轻子留下长径迹` with a specific νμ CC example, or show CC lepton types separately. CC and NC are alternative interactions, not simultaneous branches from one event.

2. **Cherenkov axis must follow the charged particle.** The inspected cone expands horizontally while its particle travels along `(820,-165)`, about 11.4° away from the cone axis. Rotate the whole photon geometry with the particle direction. `cos θC=1/(βn)` is the forward photon-ray angle. If drawing the moving trailing wavefront envelope instead, its half-angle to the backward track uses the complementary geometry; do not treat these two cones as identical. A forward emission-ray cone at one emission point is a valid, simpler choice. `n≈1.31` yields roughly 40°, varies with wavelength, and is a useful illustrative optical value rather than a universal material constant.

3. **DOMs must stay fixed in the ice.** In the inspected `eventDisplayV11`, DOM positions use `length=940*p`, so the hardware stretches along the path as the animation unfolds. Fix sensor coordinates and vary hit intensity/time only. The neutral incoming neutrino should be a straight line in ice, not a bent spline.

4. **TXS confidence contours belong to the neutrino localization.** 2018 TXS original, Figure 2 (text lines 210–219): both 50% and 90% contours surround the same neutrino best-fit direction; the blazar lies inside. The inspected implementation puts separate circles around neutrino and source, with the source outside the larger circle. The paper quotes RA `77.43 +0.95/-0.65`, Dec `5.72 +0.50/-0.30`, at 90% containment; TXS is at RA 77.36, Dec 5.69 (lines 96–100). The paper rounds angular separation to 0.1°; the local official summary states 0.06°. The latter can be shown as a centre-direction separation, never as an uncertainty radius. Rounded coordinates alone do not reproduce exactly 0.06°.

5. **Do not invent observation curves.** The TXS single smooth Gaussian gamma flare is not original Figure 3 data. Figure 3 contains measured time-dependent multiwavelength observations, including error bars and upper limits. Use a real figure crop with animated focus, or a conceptual telescope-response sequence without implying a measured curve. The flare had started before the neutrino alert; do not imply the neutrino caused a later flare.

6. **NGC 1068 is fitted excess, not 79 individually confirmed events.** 2022 paper lines 262–271: best-fit mean signal count is 79, source lies inside the 68% localization contour, 0.11° from the hot spot; 4.2σ is global after the 110-source catalog trials correction (local 5.2σ). Lines 354–359 give `79 +22/-20` above atmospheric and diffuse-astrophysical background. Figure 2 shows 68% and 95% position confidence contours and angular-distance event distributions. Figure 3 shows flux-normalization/spectral-index likelihood, not an arbitrary one-dimensional Gaussian curve of count. A simple best-fit marker and uncertainty bar is a faithful reconstruction of the quoted count; any actual profile-likelihood drawing should come from the original figure.

7. **Right-side evidence should match the topic.** The inspected `EvidenceFigureV11` uses `fig-messenger.jpg` for statistical discovery and candidate-source data. A messenger overview does not substantiate 28/37 counts or source localization. Prefer original 2013/2014 event-spectrum or event-display crops for 011, original 2018 Figure 2 and 2022 Figure 2 for 012. Official overview images can remain as context, but must not be labelled as the actual measured evidence.

## Further quality checks

- In 011, preserve the important distinction between 2013's 28 events/4.1σ and 2014's 37 candidates/5.7σ. Event 32 is a coincident atmospheric-muon pair and is excluded from relevant directional/energy analyses.
- Do not imply that Earth removes atmospheric neutrinos; it primarily suppresses through-going atmospheric muons in upgoing selections, while neutrino backgrounds require further analysis. At sufficiently high energies Earth also absorbs neutrinos.
- The detector's schematic reduction of 86×60 hardware is acceptable if stated as a cutaway or sampled view in documentation. Do not make on-screen sensor motion imply that physical modules move.
- A fixed source direction plus smooth camera motion conveys measurement more faithfully than continually retargeting lines or changing confidence-region sizes without a corresponding new observation.

## Local evidence pointers

- `research/nobelphysics2026/advanced.pdf.txt`: 208–258 (CC/NC and light), 339–415 (hardware and topology), 609–621 (TXS/NGC).
- `research/nobelphysics2026/originals/2018-txs-1807.08816.pdf.txt`: 96–100, 111, 210–219, 234–244, 342–351.
- `research/nobelphysics2026/originals/2022-ngc1068-2211.09972.pdf.txt`: 262–271, 304–315, 354–359, 408–411.

## Addendum: independent redraw modules

The subsequent `DetectorRedrawV11.ts`, `ResearchRedrawV11.ts` and revised `EvidenceFigureV11.tsx` were audited separately. They supersede the legacy functions discussed above when actually routed by `WorldV11.ts`. Source remained in active development at inspection time.

### Scientifically improved / verified

- Detector positions are now fixed: 86 deterministic teaching string positions × 60 DOMs. The footprint and DeepCore density are acknowledged simplifications, not a survey-coordinate reconstruction.
- `eventHit` computes the first direct optical arrival from a finite charged track using `a - b/sqrt(n²-1)` and optical speed `v/n`. Fixed module positions are retained while intensities change.
- The trailing wavefront uses `asin(1/n)`; emitted photon rays use `acos(1/n)`. Both share the charged-track axis. This corrects the earlier angle and direction confusion.
- The 2013/2014 change now starts at 13.794 s. 28/4.1σ and 37/5.7σ are kept separate. Event 32 is identified as atmospheric-muon overlap after its narration cue.
- The source change now starts at 14.181 s. The NGC interval is placed on an honest 0–120 number axis: centre 79, endpoints 59 and 101, corresponding exactly to −20/+22. `4.2σ` is labelled global.
- Actual screenshots reviewed visually: 2013 Figure 2 energy/declination scatter, 2014 Figure 2 deposited-energy distribution, TXS 2018 Figure 2A confidence region, NGC 2022 Figure 2 localization/event distribution and Figure 3 flux/spectral-index likelihood, plus the official Figure 2 interaction, Figure 3 geometry and Figure 4 track. Figure/caption topics match the local sources.

### Remaining must-fix items at this inspection

1. `ResearchRedrawV11.eventToken` currently colors event IDs 01/02 as the first two PeV events. The real 2013 Table I IDs are **14 (1041 TeV)** and **20 (1141 TeV)** (`2013-science-1311.5238.pdf.txt` lines 284–300). Because numbered event tokens are presented as IDs and later use real ID 32, the first two tokens must use 14/20. Suggested reveal order: `[14,20, all other IDs 1..28, 29..37]`; colors and background status should depend on actual IDs, not token position.

2. The compact cascade branches currently extend **30–92 world units** while 440 units corresponds to the labelled 1000 m detector depth. This produces shower branches 68–209 m long; that contradicts the stated compact deposit. Reduce particle-branch reach to roughly **2–5 world units**, use a restrained screen-space halo for visibility, and retain large propagating rings only as the optical wavefront. Alternatively use an explicitly separated local close-up with its own scale; do not expand the physical deposit across the fixed detector.

3. Change the source panel `2022 · 十年积累中的方向过量` to `2011–2020 · 九年积累中的方向过量` or simply `2022 · 长期观测中的方向过量`. The data run is May 2011–May 2020, about nine years.

4. Official Figure 4 says the track has **deposited energy** 2.6 PeV. Caption it `长径迹 · 沉积能量 2.6 PeV`, rather than an unqualified `2.6 PeV μ 子事件` that could be read as the muon's initial energy.

### Non-blocking observations

- The NGC Figure 2 crop slightly trims the rightmost border of the event-distribution panel; extend it to retain the complete plot frame.
- Calibration pulse trains are explanatory, unnumbered instrument-response sketches. Keep them free of invented measurement units or references implying a specific observed waveform.
- If the count-axis interval is shown alongside NGC's actual flux/spectral-index likelihood figure, preserve their separate labels so the audience does not mistake the latter as a count-profile plot.


