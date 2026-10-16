import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NobelFilmV5} from './nobel2026/FilmV5';
import timeline from './nobel2026/timeline-v5.json';

const FPS=30;
const RemotionRoot=()=> <Composition id="NobelMedicine2026V5" component={NobelFilmV5}
 durationInFrames={timeline.duration} fps={FPS} width={1920} height={1080}
 defaultProps={{audio:true}}/>;
registerRoot(RemotionRoot);


