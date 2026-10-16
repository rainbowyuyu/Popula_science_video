import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV06} from './physics2026/FilmV06';
import timeline from './physics2026/timeline-v10.json';
const Root=()=> <Composition id="NobelPhysics2026V06" component={PhysicsFilmV06} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);


