import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {DNAFilm} from './Film';
import timeline from './timeline.json';
const Root=()=> <Composition id="DNAStorageAlgorithms" component={DNAFilm} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>;
registerRoot(Root);
