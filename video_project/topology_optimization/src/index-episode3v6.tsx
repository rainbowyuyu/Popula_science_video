import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {JoineryFilm} from './episode3v6/Film';
import timeline from './episode3v6/timeline.json';

const Root=()=> <Composition
  id="JoineryEpisode3V6"
  component={JoineryFilm}
  width={1920}
  height={1080}
  fps={30}
  durationInFrames={timeline.duration}
  defaultProps={{audio:true}}
/>;

registerRoot(Root);
