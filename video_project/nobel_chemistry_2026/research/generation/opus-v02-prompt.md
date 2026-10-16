# Chemistry teaching animation · V02

Design and implement one excellent Canvas2D/TypeScript animation, `drawLigandAssemblyV02(ctx,t,progress)`, for a 1920×1080 Chinese science film. Reply with self-contained TypeScript and a short explanation. Do not run commands, read skills or edit files. We will integrate and audit it.

The topic is Henri B. Kagan's nonlinear effects in asymmetric catalysis. This is a simplified ML2 teaching model: the ligand pool is 75% R and 25% S. Independent random pairing yields RR 56.25%, RS 37.5%, SS 6.25%. In the example RR and SS are equally active with opposite selectivity; RS is inactive. Discarding the inactive fraction gives active RR:SS = 9:1, hence product 90:10 and ee 80% from ligand ee 50%. These are model numbers, not a universal reaction law. Do not invent precise molecular structures, chirality assignments, measured trajectories, or change these values.

The scene occupies x 110…1810, y 340…875. Header above and subtitles below are forbidden. Use #071822 dark navy, ivory #eef3ed, low-saturation gold #e7bb78 for R and cyan #74d6df for S. Keep text restrained, Chinese 28–35px and meaningful quantities 38–46px. Cylinders/balls must have physical shading, depth sorting, restrained perspective and continuous trajectories. No widget cards, dashboard borders or decorative random particle storms.

Narrative is approximately 27 seconds. Use progress as semantic phase (not t for phase):
0–.15: clearly show a pool with 12 consistently tracked ligand glyphs, 9 gold R and 3 cyan S. Glyphs should look like simplified two-lobed chiral ligands, explicitly abstract, not arbitrary pentagonal molecules.
.15–.52: pairs actually move from the pool into three metal centers on a shared arc, rotate into coordination, and retain identity. Assemble RR, RS, SS in sequence. Keep the exact three population proportions separately evident without pretending the six selected glyphs are the complete 12-ligand sample.
.52–.7: concentrate the light/camera on RS; its catalyst channel closes while RR and SS continue. Metal centers are visible and bonding endpoints follow them.
.7–1: RR and SS move continuously into a 9:1 quantitative output, nine gold objects and one cyan object; never simply erase the inactive scene or replace with an unrelated graph. End with a stable output for 2–3 seconds and slight meaningful motion.

All motion must be pure function of t and progress, stable identities and no random(), Date.now(), CSS, requestAnimationFrame or dependencies. Parent globalAlpha controls fades: every local opacity must multiply the inherited alpha under a balanced save/restore. Avoid alpha assignment to a fresh constant. Every drawing path/position must remain finite and inside the safe region; avoid molecule/label overlap. Array endpoints and moving signal tokens must use the same cubic Bezier evaluation.

Prioritize spatial storytelling, precise attachment geometry and graceful ease-in/ease-out. Return runnable complete code under 7000 tokens, no truncation. We will explicitly credit only actual adopted code or ideas, not claim you rendered the film.
