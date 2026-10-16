import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {DNAFilmV2} from './FilmV2';
import timeline from './timeline.json';

const Root = () => <Composition id="DNAStorageAlgorithmsV2" component={DNAFilmV2} width={1920} height={1080} fps={timeline.fps} durationInFrames={timeline.durationFrames} defaultProps={{audio: false}} />;
registerRoot(Root);
