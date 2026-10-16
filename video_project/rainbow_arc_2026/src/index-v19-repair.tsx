import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {V19RepairRainbowArcFilm} from './V19RepairRainbowArcFilm';
import timeline from './timeline.json';

const Root=()=> <Composition id="RainbowArcV19Repair" component={V19RepairRainbowArcFilm} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:true,clean:false,plate:false}}/>;
registerRoot(Root);
