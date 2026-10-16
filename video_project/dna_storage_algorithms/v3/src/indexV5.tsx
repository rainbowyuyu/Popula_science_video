import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV5} from './FilmV5';
import {durationInFramesV5} from './TimelineV5';
const Root=()=> <Composition id="DNAStorageV5" component={FilmV5} width={1920} height={1080} fps={30} durationInFrames={durationInFramesV5} defaultProps={{audio:false}}/>;
registerRoot(Root);
