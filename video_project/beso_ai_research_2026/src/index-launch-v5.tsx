import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV5,durationInFrames,fps} from './LaunchV5';
const Root=()=> <Composition id="AIEngineerLaunchFilmV5" component={LaunchFilmV5} width={1920} height={1080} fps={fps} durationInFrames={durationInFrames} defaultProps={{audio:true,overlay:true}}/>;
registerRoot(Root);
