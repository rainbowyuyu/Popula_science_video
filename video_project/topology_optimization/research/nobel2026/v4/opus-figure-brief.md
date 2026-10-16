Design a concrete, high-quality dynamic visual system for a 4–5-minute Chinese optogenetics documentary. Work as a motion designer and scientific animator, not as a copywriter. Return a complete TSX component named `EvidenceFigureV4` plus a compact integration note. Do not claim you rendered or saw the current film; this is a code/design proposal to be reviewed and tested by another editor.

Project: Remotion 30 fps / 1920x1080, Three.js stage behind an editorial layer. The user's current complaint: static scientific reference cards are tiny, transitions feel like slide changes, and the original research figures are not unpacked step by step. A moving model should explain the causal chain. Use frame-driven transforms only, no CSS animation, no random values, no key remount. Never place a dense paragraph onscreen. Protect bottom 150 px for captions and top 135 px for brand/title. If any figure is magnified, do not magnify text into unreadable mush.

Official NobelPrize.org popular-information figure files are already local in Remotion publicDir:
`nobel2026/POP_Fig_2.jpg` 2500x964: left third = Chlamydomonas cell and orange eye spot; middle = phototaxis petri dish; right = light.
`nobel2026/POP_Fig_3_ENG_01.jpg` 2500x1100: left quarter = algal gene put into frog oocyte; center = closed channel; right = blue light, opened channel and cation flow.
`nobel2026/POP_Fig_4_ENG_01.jpg` 2500x996: left half = ChR2 gene + neuronal dish; right = light, cation flow and action-potential trace.
`nobel2026/POP_Fig_5_ENG_01.jpg` 2500x1027: left = mouse with gene expression; center = optical fiber into head; upper right = nerve signal and whiskers.
These figures are evidence from the official popular explainer, not primary-paper micrographs. Do not relabel them as experimental measurements. The 3D render remains a teaching reconstruction.

State contract:
```
type NobelState={scene:string;progress:number;line:number;lineProgress:number;time:number;previous?:string;elapsed?:number};
```
Scene line ranges: algae 0..3; channel 0..3; neuron 0..3; brain 0..2. Each `line` is a conceptual narration beat, and `lineProgress` is 0..1 within it. `scene` changes on a measured narration boundary. Desired figure behavior:
- algae: line0 reveal full figure then push into left cell/eyespot; line1 track toward the dish phototaxis; by line2 figure exits to let 3D response and current dominate.
- channel: line0 follow gene into egg; line1 push from the closed pore to illuminated open pore, stop on positive ions; by line2 pass visual emphasis back to the 3D pore/ion animation.
- neuron: line0 center on gene/dish; line1 push to blue beam and nerve-signal trace, then clear room for the animated 3D waveform.
- brain: line0 follow fiber and mouse, push to stimulated cortical region; line1 figure yields to dynamic behavioral example.
The figure's panels must maintain accurate spatial mapping; do not draw connecting arrows that point to the wrong object. Build a calm spatial camera move with at most two focus changes per beat. Show original figure at true aspect in a cream gallery surface, tasteful soft shadow, subtle blue/gold focus bracket or spotlight; no generic HUD. Avoid clipping the dog/mouse/text or covering narrator subtitles. Transition out by sharing the highlighted feature position with the corresponding 3D demonstration, not a repeated fade-to-white.

Please output a complete typed React TSX file with an exported `EvidenceFigureV4({state}:{state:NobelState})`. Import from `remotion` where appropriate. Use deterministic `smooth`/clamp. The component should render only for algae/channel/neuron/brain, and it must be safe when `state.previous` differs. Keep code self-contained. After code, provide a small table of crop coordinates in source pixels and describe how each camera focus aligns with the official diagram. Identify any risks that require actual rendered-frame review. No network, no tools, no edits to user project.
