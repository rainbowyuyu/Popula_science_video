import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {EpisodeFilm} from './EpisodeFilm';
import {durationSeconds} from './timeline';
const Root=()=> <Composition id="MarineEnergyEpisode01" component={EpisodeFilm} width={1920} height={1080} fps={30} durationInFrames={durationSeconds*30} defaultProps={{audio:true}}/>;
registerRoot(Root);
