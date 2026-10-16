import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV4} from './FilmV4';
import {durationInFramesV4} from './TimelineV4';
const Root=()=> <Composition id="DNAStorageV4" component={FilmV4} width={1920} height={1080} fps={30} durationInFrames={durationInFramesV4} defaultProps={{audio:false}}/>;
registerRoot(Root);
