import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {FilmV15} from './FilmV15';
import {FilmV15Vertical} from './FilmV15Vertical';
import {V15_MAIN_DURATION_FRAMES,V15_VERTICAL_DURATION_FRAMES} from './v15/v15Shots';
const Root=()=> <><Composition id="ShanghaiTowerV15" component={FilmV15} fps={30} width={1920} height={1080} durationInFrames={V15_MAIN_DURATION_FRAMES} defaultProps={{audio:true,clean:false,aspect:'16:9'}}/><Composition id="ShanghaiTowerV15Vertical" component={FilmV15Vertical} fps={30} width={1080} height={1920} durationInFrames={V15_VERTICAL_DURATION_FRAMES} defaultProps={{audio:true,clean:false,aspect:'9:16'}}/></>;
registerRoot(Root);
