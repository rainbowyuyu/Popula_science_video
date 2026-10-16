import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {MetroCover,CoverRatio} from './metro/Cover';
const formats:Record<CoverRatio,[number,number]>={'16x9':[1920,1080],'4x3':[1920,1440],'3x4':[1440,1920],'9x16':[1080,1920]};
const Root=()=> <>{Object.entries(formats).map(([ratio,[width,height]])=><Composition key={ratio} id={'Cover-'+ratio} component={MetroCover} width={width} height={height} durationInFrames={1} fps={30} defaultProps={{ratio:ratio as CoverRatio}}/>)}</>;
registerRoot(Root);
