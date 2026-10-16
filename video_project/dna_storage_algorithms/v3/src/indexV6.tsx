import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV6} from './FilmV6';
import {durationInFramesV6} from './TimelineV6';
const Root=()=> <Composition id="DNAStorageV6" component={FilmV6} width={1920} height={1080} fps={30} durationInFrames={durationInFramesV6} defaultProps={{audio:false}}/>;
registerRoot(Root);
