import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {V11RainbowArcFilm} from './V11RainbowArcFilm';
import timeline from './timeline.json';

const Root = () => <Composition id="RainbowArc" component={V11RainbowArcFilm} fps={30} width={1920} height={1080} durationInFrames={timeline.duration} defaultProps={{audio:true,clean:false}}/>;
registerRoot(Root);
