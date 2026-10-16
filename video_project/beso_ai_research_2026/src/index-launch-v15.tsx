import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV15,durationInFrames,fps} from './LaunchV15';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV15" component={LaunchFilmV15} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);

