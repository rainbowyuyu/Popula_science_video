import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {Film} from './Film';
import {timeline} from './Timeline';
registerRoot(()=> <Composition id="Roadster" component={Film} durationInFrames={timeline.durationFrames} fps={30} width={1920} height={1080}/>);
