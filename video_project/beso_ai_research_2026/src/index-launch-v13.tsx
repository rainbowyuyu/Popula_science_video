import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilmV13,durationInFrames,fps} from './LaunchV13';
const Root:React.FC=()=> <Composition id="AIEngineerLaunchFilmV13" component={LaunchFilmV13} durationInFrames={durationInFrames} fps={fps} width={1920} height={1080} defaultProps={{audio:true,overlay:true,qa:false}}/>;
registerRoot(Root);
