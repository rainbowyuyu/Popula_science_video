import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {NobelFilmV3} from './nobel2026/FilmV3';
import timeline from './nobel2026/timeline-v3.json';

const FPS = 30;

export const RemotionRoot = () => (
  <Composition
    id="NobelMedicine2026V3"
    component={NobelFilmV3}
    durationInFrames={timeline.fps === FPS ? timeline.duration : Math.ceil(timeline.seconds * FPS)}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{audio: true}}
  />
);

registerRoot(RemotionRoot);
