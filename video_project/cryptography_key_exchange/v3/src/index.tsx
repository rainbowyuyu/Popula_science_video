import React from 'react';import {Composition,registerRoot} from 'remotion';import {Film} from './Film';import {DURATION} from './Timeline';
const Root=()=> <Composition id="Cryptography" component={Film} durationInFrames={DURATION} fps={30} width={1920} height={1080}/>;
registerRoot(Root);
