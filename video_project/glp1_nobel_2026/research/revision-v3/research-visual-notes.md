# V3 research overlays

Implementation: `src/Research.tsx`; import `Research` and render `<Research s={s}/>`.

- Reserved screen bounds: x 90–700, y 440–885. No background cards. The full overlay slides in and moves out of its clipped safe region before each clip boundary.
- Only embedded Rainbow Sans; font sizes 36, 46 and 56 px. Source attributions sit below the diagrams, outside any original paper page.
- g010: matched glycemia oral/IV comparison; no invented concentration curves or response bars. Source: Nauck et al., 1986, DOI 10.1210/jcem-63-2-492. Its original abstract was checked by the evidence agent.
- g014: separate synthetic 37- and 31-residue peptide comparisons in isolated rat pancreas at glucose 6.6 mM; actual 37/31 SVG nodes. No equal peptide-dose claim. No scissors or deletion animation conflating this experiment with later DPP-4 work. Mojsov et al., 1987, DOI 10.1172/JCI112855.
- g015: cultured rat cells, qualitative cAMP, insulin mRNA and secretion response. The diagram explicitly names the experimental context; it must accompany a separate 2017 label on the right-hand molecular structure. Drucker et al., 1987, DOI 10.1073/pnas.84.10.3434.
- g020: explicitly labelled rat brain experiment, separate from the anatomical human brain on the right. GLP-1 and receptor antagonist are depicted as conceptual symbols, with no quantitative invented food amount. Turton et al., 1996.
- g021: obese adults / 20-week appetite study. Plate is an icon of the actual measured meal, not fabricated data. Qualitative decreased hunger/food intake. Friedrichsen et al., 2021, DOI 10.1111/dom.14280; distinct from STEP 1.

Validation: `npm run check` passed after initial implementation. A Chromium raster review of all five overlays was opened; the appetite plate/utensil initially overlapped its label, and was scaled/repositioned. The updated contact image was opened again and is saved as `research-visual-review/contact.png`. This is overlay-level visual QA only; the final anatomy composition and motion still require the root agent's full-frame checks.

Integration conflicts: remove old `Discovery` at g014/g015; hide or reposition old `MechanismCaption` at g014/g015/g020/g021. It originally used y420 and would collide with the reserved area. The main title can remain above y390.
