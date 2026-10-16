import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Preview} from './Preview';
import timeline from '../timeline-preview.json';
const Root:React.FC=()=>React.createElement(Composition,{id:'MechanismPreview',component:Preview,durationInFrames:timeline.durationInFrames,fps:30,width:1920,height:1080});
registerRoot(Root);
