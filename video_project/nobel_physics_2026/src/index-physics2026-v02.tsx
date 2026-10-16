import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV02} from './physics2026/FilmV02';
import timeline from './physics2026/timeline-v02.json';
const Root=()=> <Composition id="NobelPhysics2026V02" component={PhysicsFilmV02} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);

