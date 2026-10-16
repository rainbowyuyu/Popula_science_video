import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {RainbowFilm} from './episode2/Film';
import timeline from './episode2/timeline.json';
const Root=()=> <Composition id="RainbowArcEpisode2" component={RainbowFilm} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>;
registerRoot(Root);
