# V11 first-half redraw review (static-frame scope)

- Video reviewed: `delivery/physics2026_v11/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v11_论文重绘_1080p.mp4`
- Reviewed artifact SHA-256: `25f804d5e44459e24bc7d2105d116933a8a8148d5e2c3b111278174def5d2148`
- QA source: `delivery/physics2026_v11/qa-final-redraw/qa-report.json`
- Review date: 2026-10-07
- Scope: static PNG contact sheets only; content pages 01–03 and seam pages 01–03.

## Files inspected

- `qa-final-redraw/contact-sheets/content-01.jpg`
- `qa-final-redraw/contact-sheets/content-02.jpg`
- `qa-final-redraw/contact-sheets/content-03.jpg`
- `qa-final-redraw/contact-sheets/seams-01.jpg`
- `qa-final-redraw/contact-sheets/seams-02.jpg`
- `qa-final-redraw/contact-sheets/seams-03.jpg`
- Representative full-size PNGs in `qa-final-redraw/frames/`, including samples for clips 000–009 and the formula scene.

## Observations

### Composition and cropping

- The brand mark, chapter title, cyan subtitle, and upper-right source/series labels remain inside the frame in the reviewed samples.
- The detector cube, Earth, source disk, cosmic messenger paths, airplane/Cherenkov diagram, and event-display paper cards remain inside their intended safe regions.
- The paper cards on the right retain their white figure area, dark caption strip, and visible source line. No reviewed card is clipped by the frame edge.
- The formula scene keeps the LaTeX threshold expression in its own right-side area; the equation and comparison rows remain readable in the sampled full-size frame.

### Content frames

- Clips 000–003 establish the Earth/source/detector relationship and three messenger paths without visible text crossing the main paths or Earth.
- Clips 004–005 keep the official IceCube geometry and DOM figures separated from the left-side explanatory detector drawing.
- Clip 006 keeps the interaction diagram and detector event drawing in separate columns; the right paper figure does not cover the detector cube.
- Clip 007 presents the Cherenkov construction and threshold formula without a visible overlap between the equation, angle annotation, or comparison rows.
- Clip 008 keeps the long-track event display and arrival-time strip below the detector drawing; the right paper card does not cover the time strip.
- The repeated source line is at the upper right and does not overlap the title or paper figure in the reviewed samples.

### Seam frames

- `seams-01.jpg` (000→001, 001→002, 002→003): the incoming title and primary visual replace the outgoing scene cleanly in the sampled −0.5 s, seam, and +0.5 s positions. No black frame, duplicated title, or visibly doubled caption is present.
- `seams-02.jpg` (003→004, 004→005, 005→006): the detector and paper-card handoffs retain a consistent dark-blue background. The paper card appears in its intended right column; no sampled frame shows a second card covering it.
- `seams-03.jpg` (006→007, 007→008, 008→009): the interaction-to-formula and formula-to-track changes remove the previous paper figure before the next visual settles. The track-to-cascade handoff keeps the event-display card aligned with the right column and leaves the left detector drawing visible.

## Findings

- No visible text overlap, paper-card collision, path crossing, or frame-edge crop was found in the inspected static samples.
- No sampled seam contains an obvious black flash or a duplicated outgoing/incoming title.
- The reviewed frames are consistent with the stated geometry rules: neutrino path straight, charged path bent, and gamma path terminating in the intervening field.

## Limits

This report is a static-image review. It does not certify continuous playback smoothness, motion cadence, frame-to-frame interpolation, subtitle timing, pronunciation, noise, music, or final listening quality. Those require video playback and audio review. The report also does not replace the automated full-decode checks in `qa-final-redraw/qa-report.json`.
