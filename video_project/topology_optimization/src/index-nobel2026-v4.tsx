import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NobelFilmV4} from './nobel2026/FilmV4';
import timeline from './nobel2026/timeline-v4.json';

const FPS=30;
const RemotionRoot=()=> <Composition id="NobelMedicine2026V4" component={NobelFilmV4}
 durationInFrames={timeline.duration} fps={FPS} width={1920} height={1080}
 defaultProps={{audio:true}}/>;
registerRoot(RemotionRoot);
