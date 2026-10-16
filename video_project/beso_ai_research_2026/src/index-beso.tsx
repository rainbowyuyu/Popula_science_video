import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {BesoFilm} from './beso/BesoFilm';
import story from './beso-story.json';

const Root = () => <Composition id="BesoAIResearchZH" component={BesoFilm} width={1920} height={1080} fps={story.fps} durationInFrames={story.duration} defaultProps={{audio:true, overlay:true}}/>;
registerRoot(Root);
