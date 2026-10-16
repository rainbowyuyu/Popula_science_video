import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {ChemistryFilmV01} from './chemistry2026/FilmV01';
import timeline from './chemistry2026/timeline-v01.json';
const Root=()=> <Composition id="NobelChemistry2026V01" component={ChemistryFilmV01} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
