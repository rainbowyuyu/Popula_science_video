import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV04} from './physics2026/FilmV04';
import timeline from './physics2026/timeline-v07.json';
const Root=()=> <Composition id="NobelPhysics2026V04" component={PhysicsFilmV04} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);

