import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PhysicsFilmV03} from './physics2026/FilmV03';
import timeline from './physics2026/timeline-v06.json';
const Root=()=> <Composition id="NobelPhysics2026V03" component={PhysicsFilmV03} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
