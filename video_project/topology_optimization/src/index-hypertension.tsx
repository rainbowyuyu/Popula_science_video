import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {HypertensionFilm} from './hypertension/Film';
import timeline from './hypertension/timeline.json';
function Root(){return <Composition id='Hypertension' component={HypertensionFilm} width={1920} height={1080} fps={30} durationInFrames={timeline.duration} defaultProps={{audio:true}}/>}
registerRoot(Root);
