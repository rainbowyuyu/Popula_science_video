import './index.css';
import {Composition} from 'remotion';
import {Explainer} from './Explainer';
import timeline from './timeline.json';
import {HeaderOverlay} from './HeaderOverlay';

export const RemotionRoot: React.FC = () => <>
  <Composition id="HallucinationDynamics" component={Explainer}
    durationInFrames={timeline.frames} fps={30} width={1920} height={1080}/>
  <Composition id="HeaderOverlay" component={HeaderOverlay} defaultProps={{chapterId:0}}
    durationInFrames={30} fps={30} width={1920} height={1080}/>
</>;
