import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV01} from './physics2026/FilmV01';
import timeline from './physics2026/timeline-v01.json';
const Root=()=> <Composition id="NobelPhysics2026V01" component={PhysicsFilmV01} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
