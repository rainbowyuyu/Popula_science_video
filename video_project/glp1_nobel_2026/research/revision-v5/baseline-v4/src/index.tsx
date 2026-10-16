import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {V4Film} from './V4Film';
import timeline from './timeline.json';
const Root=()=> <Composition id="GLP1" component={V4Film} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:true,clean:false}}/>;
registerRoot(Root);
