import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {WarmCreekDemo} from './WarmCreekDemo';

const Root = () => <Composition id="WarmCreekDemo" component={WarmCreekDemo} fps={30} width={1920} height={1080} durationInFrames={720} />;
registerRoot(Root);

