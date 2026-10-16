import {createContext, useContext} from 'react';
import {Easing, interpolate} from 'remotion';

export const SceneMotion = createContext({duration: 600, overlap: 72, first: false, last: false});
const smooth = Easing.bezier(.4, 0, .2, 1);
const tween = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth,
});

// Only backgrounds overlap. Outgoing content is gone before incoming content appears.
export const contentMotion = (frame: number, duration: number, overlap: number, first: boolean, last: boolean) => {
  const entry = first ? 1 : tween(frame, 42, 94);
  const exit = last ? 0 : tween(frame, duration - overlap - 14, duration - overlap + 30);
  return {opacity: entry * (1 - exit), y: (1 - entry) * 24 - exit * 18, scale: 1 - (1 - entry) * .012 - exit * .009};
};
export const useSceneMotion = (frame: number) => {
  const {duration, overlap, first, last} = useContext(SceneMotion);
  return contentMotion(frame, duration, overlap, first, last);
};
