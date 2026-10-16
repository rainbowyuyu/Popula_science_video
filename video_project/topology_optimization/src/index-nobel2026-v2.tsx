import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NobelFilmV2} from './nobel2026/FilmV2';
export const RemotionRoot=()=> <Composition id="NobelMedicine2026V2" component={NobelFilmV2} durationInFrames={9000} fps={30} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(RemotionRoot);
