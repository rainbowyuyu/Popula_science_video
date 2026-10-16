import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV7,durationInFrames,fps} from './LaunchV7';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV7" component={LaunchFilmV7} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);
