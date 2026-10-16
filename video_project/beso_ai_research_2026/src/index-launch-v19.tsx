import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV19} from './LaunchV19';
import {fps,durationInFrames} from './launch-v19-direction';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV19" component={LaunchFilmV19} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false,blueprint:false}}/>;
registerRoot(Root);
