import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV05} from './physics2026/FilmV05';
import timeline from './physics2026/timeline-v09.json';
const Root=()=> <Composition id="NobelPhysics2026V05" component={PhysicsFilmV05} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);

