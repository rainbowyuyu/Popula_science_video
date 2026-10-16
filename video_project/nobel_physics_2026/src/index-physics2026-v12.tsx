import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {PhysicsFilmV12} from './physics2026/FilmV12';
import timeline from './physics2026/timeline-v12.json';

/**
 * Independent V12 composition. The measured narration clock is copied into
 * a versioned V12 manifest so later visual edits cannot silently drift from
 * the rendered clip boundaries.
 */
const Root = () => (
  <Composition
    id="NobelPhysics2026V12"
    component={PhysicsFilmV12}
    durationInFrames={timeline.duration}
    fps={timeline.fps}
    width={1920}
    height={1080}
    defaultProps={{audio: true}}
  />
);

registerRoot(Root);

