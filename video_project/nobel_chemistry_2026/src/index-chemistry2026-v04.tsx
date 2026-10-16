import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {ChemistryFilmV04} from './chemistry2026v04/FilmV04';
import timeline from './chemistry2026v04/timeline-v04.json';
const Root=()=> <Composition id="NobelChemistry2026V04" component={ChemistryFilmV04} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
