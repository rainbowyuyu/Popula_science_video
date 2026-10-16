import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV3} from './v3/Film';
import timeline from './v3/timeline.json';
const Root=()=> <Composition id="TopologyStoryV3" component={FilmV3} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>;
registerRoot(Root);
