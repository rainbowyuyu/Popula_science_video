import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {LaunchFilm,durationInFrames,fps} from './LaunchV4';
const Root=()=> <Composition id="AIEngineerLaunchFilmV4" component={LaunchFilm} width={1920} height={1080} fps={fps} durationInFrames={durationInFrames} defaultProps={{audio:true,overlay:true}}/>;
registerRoot(Root);
