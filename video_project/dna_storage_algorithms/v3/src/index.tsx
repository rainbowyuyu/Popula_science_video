import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {Film} from './Film';
const Root=()=> <Composition id="DNAStorageV3" component={Film} width={1920} height={1080} fps={30} durationInFrames={9000} defaultProps={{audio:false}}/>;
registerRoot(Root);
