import captions from '../beso-captions.json';
import type {FilmState} from './World';

/** Compare cues follow measured narration, not equal thirds of a chapter. */
export function comparisonStarts(s:FilmState){
 const mooring=captions.find(c=>c.id==='compare-2-c0');
 const pitch=captions.find(c=>c.id==='compare-2-c1');
 return [0,(mooring?.startMs??(s.sceneStart+13.733)*1000)/1000-s.sceneStart,(pitch?.startMs??(s.sceneStart+18.013)*1000)/1000-s.sceneStart];
}
export function comparisonIndex(s:FilmState){const starts=comparisonStarts(s);return s.local>=starts[2]?2:s.local>=starts[1]?1:0;}
