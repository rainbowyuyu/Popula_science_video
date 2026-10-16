import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {JoineryFilm} from './episode3v8/Film';
import timeline from './episode3v8/timeline.json';
const Root=()=> <Composition id="JoineryEpisode3V8" component={JoineryFilm} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>;
registerRoot(Root);
