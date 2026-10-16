import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {ChemistryFilmV02} from './chemistry2026v02/FilmV02';
import timeline from './chemistry2026v02/timeline-v02.json';
const Root=()=> <Composition id="NobelChemistry2026V02" component={ChemistryFilmV02} durationInFrames={timeline.duration} fps={timeline.fps} width={1920} height={1080} defaultProps={{audio:true}}/>;
registerRoot(Root);
