import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {ChemistryFilmV03} from './chemistry2026v03/FilmV03';
import timeline from './chemistry2026v03/timeline-v03.json';
const Root=()=> <Composition id="NobelChemistry2026V03" component={ChemistryFilmV03} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
