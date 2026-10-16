import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {V20RainbowArcFilm} from './V20RainbowArcFilm';
import timeline from './timeline.json';
const Root=()=> <Composition id="RainbowArcV20" component={V20RainbowArcFilm} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:true,clean:false}}/>;
registerRoot(Root);
