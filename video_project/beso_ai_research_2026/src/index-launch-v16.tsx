import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV16,durationInFrames,fps} from './LaunchV16';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV16" component={LaunchFilmV16} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);
