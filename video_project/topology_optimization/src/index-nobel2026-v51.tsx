import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NobelFilmV51} from './nobel2026/FilmV51';
import timeline from './nobel2026/timeline-v51.json';

const FPS=30;
const RemotionRoot=()=> <Composition id="NobelMedicine2026V51" component={NobelFilmV51}
 durationInFrames={timeline.duration} fps={FPS} width={1920} height={1080}
 defaultProps={{audio:true}}/>;
registerRoot(RemotionRoot);



