import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {BesoFilm} from './beso/BesoShortFilm';
import story from './beso-story-compact.json';

const Root=()=> <Composition id="BesoAIEngineerShortZH" component={BesoFilm} width={1920} height={1080} fps={story.fps} durationInFrames={story.duration} defaultProps={{audio:false,overlay:true}}/>;
registerRoot(Root);
