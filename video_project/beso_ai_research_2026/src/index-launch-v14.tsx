import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV14,durationInFrames,fps} from './LaunchV14';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV14" component={LaunchFilmV14} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);
