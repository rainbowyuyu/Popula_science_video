import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilm,durationInFrames,fps} from './LaunchFilm';

const Root=()=> <Composition id="AIEngineerLaunchFilm" component={LaunchFilm} width={1920} height={1080} fps={fps} durationInFrames={durationInFrames} defaultProps={{audio:true,overlay:true}}/>;
registerRoot(Root);

