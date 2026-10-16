import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV8,durationInFrames,fps} from './LaunchV8';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV8" component={LaunchFilmV8} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);
