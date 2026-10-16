import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV18,durationInFrames,fps} from './LaunchV18';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV18" component={LaunchFilmV18} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false,blueprint:false}}/>;
registerRoot(Root);
