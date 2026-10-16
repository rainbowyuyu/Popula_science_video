import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NobelFilm} from './nobel2026/Film';
export const RemotionRoot=()=> <Composition id="NobelMedicine2026" component={NobelFilm} durationInFrames={9000} fps={30} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(RemotionRoot);
