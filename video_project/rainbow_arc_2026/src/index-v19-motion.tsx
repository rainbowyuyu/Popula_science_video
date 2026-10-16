import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {V19MotionRainbowArcFilm} from './V19MotionRainbowArcFilm';
import timeline from './timeline.json';

const Root=()=> <Composition id="RainbowArcV19Motion" component={V19MotionRainbowArcFilm} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:true,clean:false,plate:false}}/>;
registerRoot(Root);
