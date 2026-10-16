import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV20} from './LaunchV20';
import {fps,durationInFrames} from './launch-v20-direction';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV20" component={LaunchFilmV20} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false,blueprint:false}}/>;
registerRoot(Root);
