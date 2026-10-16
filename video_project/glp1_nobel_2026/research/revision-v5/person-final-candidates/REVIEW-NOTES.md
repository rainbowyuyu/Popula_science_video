# Person review and isolated candidates

These candidates are not installed. No GPU render was run by this reviewer.

## Person material and utensil

`V5Person.candidate.ts` changes the shared `alpha()` helper to keep `transparent=true` in all states. This avoids switching the same material between shader paths. Both wardrobe and dining props write depth only at opacity >= 0.998. The first preview showed that retaining wardrobe depth at F4280 (opacity 0.0143) cut a sharp shorts-shaped gap into the 0.9857-opacity thigh muscle. All fading person attachments now follow the same depth policy. The underlying skin prepass uses render order 100; the colour pass uses order 101 and EqualDepth. Since the organ colour is already drawn at order 0, the later colourless prepass cannot erase it; a low-alpha order-0 wardrobe depth writer is the relevant occluder. Do not remove the skin prepass as a shortcut: it resolves back-surface triangle blending. Inspect the actual candidate render before accepting this source-level diagnosis.

The candidate also retires the dining utensil over the first 6% of measurement handoff (`1 - smooth(measurementWeight / 0.06)`). This is an explicit prop sequence, not an attempt to fix a pose by render warm-up. The measurement writer moves the final hand after `V5Person` has computed its dining grip, so retaining an unbound utensil leaves it in front of the chest. An alternative is binding the utensil to the final hand. The minimal sequence should be reviewed over F23990–24096 to ensure retirement is graceful.

## Minimal muscle-detail return proposal for Camera/World owner

Current path, evaluated on CPU using the preserved model anchors:

| Frame | Lens distance | Result in current encoded video |
| --- | ---: | --- |
| 4260 | 0.363 m | Waist/hip fills most of the picture |
| 4300 | 1.597 m | Medium waist close-up still magnifies angular folds |
| 4340 | 3.350 m | Whole activity figure has a readable size |

The camera still focuses the real thigh anchor `[0.108727, 0.671017, 0.047672]` at F4260. Its existing lateral bridge begins at F4284.153, at only 0.898 m, then reaches the person activity anchor `[0, 0.88, 0.03]` around F4319.765. Enlarging the person or moving its origin is unnecessary.

Proposed local changes, restricted to the `muscle_cell -> muscle` return h015–h016:

1. World: multiply the external figure, wardrobe and activity chair by a distance gate `smooth(log(d / 1.20) / log(2.40 / 1.20))` throughout this return. Zero at 1.20 m and fully readable at 2.40 m. This yields gates 0 at F4260, about 0.339 at F4300, and 1 at F4340 on the existing route. Scope the gate to a smooth time window around h016 arrival so it does not suppress ordinary activity or later bowl close-ups.
2. Camera: for this one cross-scale return, raise the lateral bridge clearance from 0.898 m to at least 1.50 m before interpolating the thigh focus to the person-activity focus. Keep the destination distance 3.35 m, azimuth 0.20 and elevation 0.10. Recompute the existing optical timing allocation; keep the arrival and narration timing unchanged.
3. World: retain the original anatomical thigh as the explanatory parent while the person gate is zero. Do not just hide the person and leave a pale empty interval. A local context weight of `max(existingMuscleFamily, returnWindow * (1 - figureGate))`, with the existing physical thigh geometry, can support this. Retire the thigh complementarily as the exterior becomes readable. This uses the actual thigh anchor, not an independently scaled insert.
4. Inspect F4240–4340 densely, plus the reverse person-to-thigh entry F3460–3560. F4260 must show a registered thigh context, not a giant garment and not an empty shot. F4300 must read as a measured pullback. Review F4340 and F4380 to preserve the seated training pose and final framing.

Prefer fixing the confirmed material shader-state issue before deciding whether all three local changes remain necessary. The numerical gates above are proposals, not accepted render parameters.

## Organ retirement and low-information figures

At F21808, F23173, F23737 and F24894, `personWeight` is only 0.074–0.080. The body alpha is approximately 0.134–0.140, but `1 - 0.999 * smooth(visiblePerson / 0.06)` already suppresses organ opacity to 0.001. This algebra explains the low-information ghost figures without invoking a patch-boundary jump. F24880 has weight 0.0076 and organ multiplier 0.983; F24894 already loses the organs.

Tie organ retirement to a readable exterior and preserve registration during the handoff. Do not blindly whitelist all torso scenes as opaque people. `metabolic_links` (h003), `scale_context` (h004) and `adiposity_pressure` (h056) explicitly need anatomy. `weight_feedback` h082 and `resolve` h088 also narrate organ links; their mechanism should retain explanatory anatomical content. If an exterior whitelist is still useful after the common gate fix, `emergency` h077 and `appetite_compensation` h084 are the narrow candidates. Their brain/heart context can remain a deliberate secondary teaching layer. Do not change body size or organ coordinates.

## Validation boundary

The final review is hash-bound to MP4 `cd708646f4815878d84f422bd4e3bb2a072178d8ffc760d96c556b3902d7ee21`. It covers 24 opened contact sheets, 147 unique sampled frames and 11 originals. It does not certify full-duration motion or audio. The source candidate must be previewed, then any replacement video checked again, before acceptance.
