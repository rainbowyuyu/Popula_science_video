import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {PhysicsFilmV11} from './physics2026/FilmV11';
import timeline from './physics2026/timeline-v11.json';

/**
 * Independent V11 composition. The measured narration clock is copied into
 * a versioned V11 manifest so later visual edits cannot silently drift from
 * the rendered clip boundaries.
 */
const Root = () => (
  <Composition
    id="NobelPhysics2026V11"
    component={PhysicsFilmV11}
    durationInFrames={timeline.duration}
    fps={timeline.fps}
    width={1920}
    height={1080}
    defaultProps={{audio: true}}
  />
);

registerRoot(Root);
