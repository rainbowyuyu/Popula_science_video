# Bracket narration timing revision

The final media review found that the upper crossed arm opened during bracket sentence 3, one sentence after “抬开这一层，看交叉的地方”. Only the bracket pose and its matching close-up camera were changed in `src/episode3v8/World.ts`.

- Sentence 2 starts assembled and follows the existing cap-then-upper-arm assembly path backward between `u=2.0` and `u=2.28`.
- The upper arm stops at `q=.620`, 0.603136 m above its seated position. This exposes the two mating notches together; the lower arm and bearing block remain seated.
- The camera turns toward the left/front and slightly above the crossing, then settles toward the lower bearing during sentence 3.
- Sentence 3 maintains the separation. Sentence 4 follows the original forward order, lowering the upper arm before the cap. Every bracket part is seated again by `u=4.72`.
- No other chapter, annotation cue, narration or audio asset was edited.

Verification: `npx tsc --noEmit --pretty false` passed. `audit-bracket-revision.mjs` rendered 15 samples using the actual Film timeline. Frame 3376 has 0.567344 m upper-arm lift; frame 3468 has 0.603136 m lift; frame 3860 has zero offset for all four inspected front-left bracket members. The reviewer used `view_image` to inspect frames 3328, 3376, 3468, 3590, 3780 and 3860 and found the crossing exposed and the entry/exit poses coherent. This is sampled model inspection, not human real-time viewing. The main task must re-render and verify the revised bracket chapter in the final video.
