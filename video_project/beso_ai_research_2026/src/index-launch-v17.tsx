import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV17,durationInFrames,fps} from './LaunchV17';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV17" component={LaunchFilmV17} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false,blueprint:false}}/>;
registerRoot(Root);
