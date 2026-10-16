import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV16} from './FilmV16';
import {editTimeline} from './v16/timeline';
const Root=()=> <><Composition id="ShanghaiTowerV16" component={FilmV16} fps={30} width={1920} height={1080} durationInFrames={editTimeline('16:9').duration} defaultProps={{audio:true,clean:false,aspect:'16:9'}}/><Composition id="ShanghaiTowerV16Vertical" component={FilmV16} fps={30} width={1080} height={1920} durationInFrames={editTimeline('9:16').duration} defaultProps={{audio:true,clean:false,aspect:'9:16'}}/></>;
registerRoot(Root);
