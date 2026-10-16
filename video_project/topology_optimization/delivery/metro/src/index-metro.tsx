import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {MetroFilm} from './metro/Film';
import timeline from './metro/timeline.json';
const Root=()=> <Composition id="MetroSafety" component={MetroFilm} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>;
registerRoot(Root);
