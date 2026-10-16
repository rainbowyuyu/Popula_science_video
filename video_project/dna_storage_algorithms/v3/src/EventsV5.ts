import captionsSource from './captions-v5.json';
import narrationSource from './narration-v5.json';
import {sceneTimeV5} from './TimelineV5';

/** Shared timing for narration labels and mechanism animations.
 * Caption frames are physical audio time. Three.js choreography uses scene
 * time. Convert each endpoint once; do not add a physical-second offset to a
 * scene-second cue. No text-fraction fallback is claimed to be word-level ASR.
 */
export type ErrorKindV5 = 'substitution' | 'insertion' | 'deletion';
export type EventTimingKindV5 =
  | 'caption-boundary'
  | 'caption-text-fraction'
  | 'cue-text-fraction'
  | 'cue-proportion-fallback';

export type CaptionTimingV5 = {
  id?: string;
  cueId?: string;
  text: string;
  startFrame: number;
  endFrame: number;
};
export type CueTimingV5 = {
  id: string;
  shotId?: string;
  text: string;
  spokenText?: string;
  startSec: number;
  endSec: number;
};
export type EventSpecV5 = {
  id: string;
  label: string;
  phrases: readonly string[];
  fallbackFraction: number;
};
export type NarrationEventV5 = {
  id: string;
  cueId: string;
  label: string;
  timingKind: EventTimingKindV5;
  captionId?: string;
  matchedPhrase?: string;
  wasOrderRepaired: boolean;
  /** Exclusive label interval: neighbouring event labels never overlap. */
  audioStartSec: number;
  audioEndSec: number;
  sceneStartSec: number;
  sceneEndSec: number;
  /** Start outside the image; arrive as the matching explanation begins. */
  motionAudioStartSec: number;
  motionAudioEndSec: number;
  motionSceneStartSec: number;
  motionSceneEndSec: number;
};
export type ResolveEventsOptionsV5 = {
  cue: CueTimingV5 | undefined;
  captions: readonly CaptionTimingV5[];
  specs: readonly EventSpecV5[];
  mapToScene: (audioSeconds: number) => number;
  fps?: number;
  motionDurationSec?: number;
  settleAfterPhraseSec?: number;
  earliestMotionAudioSec?: number;
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const normalized = (text: string) => text
  .replace(/[\s，。；：！？、,.!?;:…—“”‘’"'（）()【】\[\]]/g, '')
  .toLowerCase();

/** Resolver is exported for CPU QA with merged/missing caption fixtures. */
export function resolveNarrationEventsV5(options: ResolveEventsOptionsV5): NarrationEventV5[] {
  const {cue, specs, mapToScene} = options;
  const fps = options.fps ?? 30;
  if (!cue || !Number.isFinite(cue.startSec) || !Number.isFinite(cue.endSec)
      || cue.endSec <= cue.startSec || !specs.length || fps <= 0) return [];
  const span = cue.endSec - cue.startSec;
  const minGap = Math.min(0.4, span / (specs.length * 3));
  // Reject stale/out-of-cue rows while a new audio timeline is being rebuilt.
  const rows = options.captions.filter(row => {
    const start = row.startFrame / fps, end = row.endFrame / fps;
    return (row.cueId === cue.id || (!row.cueId && start >= cue.startSec - 1 / fps && end <= cue.endSec + 1 / fps))
      && Number.isFinite(start) && Number.isFinite(end) && end > start
      && start >= cue.startSec - 1 / fps && end <= cue.endSec + 1 / fps;
  }).sort((a, b) => a.startFrame - b.startFrame);
  const cueText = normalized(cue.spokenText ?? cue.text);

  const candidates = specs.map(spec => {
    // Prefer the explanatory phrase to the later technical noun.  The first
    // substitution sentence can contain an introductory clause before it.
    for (const phrase of spec.phrases) {
      const needle = normalized(phrase);
      for (const row of rows) {
        const haystack = normalized(row.text), index = haystack.indexOf(needle);
        if (index < 0) continue;
        const start = row.startFrame / fps, end = row.endFrame / fps;
        return {
          time: clamp(start + (end - start) * index / Math.max(1, haystack.length), cue.startSec, cue.endSec),
          timingKind: (index === 0 ? 'caption-boundary' : 'caption-text-fraction') as EventTimingKindV5,
          captionId: row.id,
          matchedPhrase: phrase,
        };
      }
    }
    for (const phrase of spec.phrases) {
      const index = cueText.indexOf(normalized(phrase));
      if (index >= 0) return {
        time: cue.startSec + span * index / Math.max(1, cueText.length),
        timingKind: 'cue-text-fraction' as EventTimingKindV5,
        matchedPhrase: phrase,
      };
    }
    return {
      time: cue.startSec + span * clamp(spec.fallbackFraction, 0, 1),
      timingKind: 'cue-proportion-fallback' as EventTimingKindV5,
    };
  });

  const starts: number[] = [];
  candidates.forEach((candidate, i) => {
    const low = i ? starts[i - 1] + minGap : cue.startSec;
    const high = cue.endSec - (specs.length - i) * minGap;
    starts.push(clamp(candidate.time, low, high));
  });
  const motionDuration = Math.max(0.25, options.motionDurationSec ?? 3.2);
  const earliest = Math.max(0, options.earliestMotionAudioSec ?? 0);
  return specs.map((spec, i) => {
    const audioStartSec = starts[i], audioEndSec = starts[i + 1] ?? cue.endSec;
    const settle = Math.min(options.settleAfterPhraseSec ?? 0.15, (audioEndSec - audioStartSec) * 0.25);
    const motionAudioEndSec = audioStartSec + settle;
    const motionAudioStartSec = Math.min(motionAudioEndSec - 1 / fps, Math.max(earliest, motionAudioEndSec - motionDuration));
    return {
      id: spec.id,
      cueId: cue.id,
      label: spec.label,
      timingKind: candidates[i].timingKind,
      captionId: candidates[i].captionId,
      matchedPhrase: candidates[i].matchedPhrase,
      wasOrderRepaired: Math.abs(audioStartSec - candidates[i].time) > 1e-6,
      audioStartSec,
      audioEndSec,
      sceneStartSec: mapToScene(audioStartSec),
      sceneEndSec: mapToScene(audioEndSec),
      motionAudioStartSec,
      motionAudioEndSec,
      motionSceneStartSec: mapToScene(motionAudioStartSec),
      motionSceneEndSec: mapToScene(motionAudioEndSec),
    };
  });
}

export const ERROR_EVENT_SPECS_V5: readonly EventSpecV5[] = [
  {id: 'substitution', label: '替换', phrases: ['换掉一个', '一个字母认成另一个', '认成另一个', '替换'], fallbackFraction: 0.10},
  {id: 'insertion', label: '插入', phrases: ['多塞一个', '多一个', '插入'], fallbackFraction: 0.53},
  {id: 'deletion', label: '缺失', phrases: ['少掉一个', '少一个', '缺失'], fallbackFraction: 0.75},
];
const errorCue = narrationSource.cues.find(cue => cue.id === 'n19');
const wetlabGroup = narrationSource.groups.find(group => group.id === 'wetlab');
export const ERROR_EVENTS_V5 = resolveNarrationEventsV5({
  cue: errorCue,
  captions: captionsSource,
  specs: ERROR_EVENT_SPECS_V5,
  mapToScene: sceneTimeV5,
  motionDurationSec: 3.2,
  earliestMotionAudioSec: wetlabGroup?.startSec ?? 0,
});
export const errorEventV5 = (kind: ErrorKindV5) => ERROR_EVENTS_V5.find(event => event.id === kind);

const eventsForCueV5 = (cueId: string, specs: readonly EventSpecV5[]) => resolveNarrationEventsV5({
  cue: narrationSource.cues.find(cue => cue.id === cueId),
  captions: captionsSource,
  specs,
  mapToScene: sceneTimeV5,
});

export const LOSS_EVENTS_V5 = eventsForCueV5('n10', [{id:'lose-whole-block',label:'整段缺失',phrases:['整段拿走','捣乱'],fallbackFraction:.15}]);

export const FOUNTAIN_EVENTS_V5 = eventsForCueV5('n14', [
  {id: 'recover-b', label: '找回乙', phrases: ['找到甲', '得到乙', '解出乙'], fallbackFraction: 0},
  {id: 'recover-c', label: '找回丙', phrases: ['再拿乙', '丙也出来', '解出丙'], fallbackFraction: 0.52},
]);
export const MATRIX_EVENTS_V5 = eventsForCueV5('n25', [
  {id: 'backtrace', label: '沿高分路径回溯', phrases: ['从最高分格往回找', '往回找', '往回走'], fallbackFraction: 0.43},
]);
export const CONSTRAINT_EVENTS_V5 = eventsForCueV5('n08', [
  {id: 'reject-repeat', label: '退回重编', phrases: ['就换个组合', '没通过', '换个组合重来', '退回'], fallbackFraction: 0.60},
]);
export const DROPOUT_EVENTS_V5 = eventsForCueV5('n19', [
  {id: 'read-dropout', label: '整条没读到', phrases: ['再扔掉一整条读段', '再扔掉整条', '整条读段', '整条没读到'], fallbackFraction: 0.81},
]);

/** Semantic action begins at its spoken phrase, unlike a UI entrance that
 * anticipates it. Omit durationAudioSec to finish during that phrase's window.
 * Explicit durations remain physical audio seconds after chapter retiming. */
export function eventActionProgressV5(
  event: NarrationEventV5 | undefined,
  sceneSeconds: number,
  durationAudioSec?: number,
): number {
  if (!event) return 0;
  const end = durationAudioSec === undefined
    ? event.sceneEndSec
    : sceneTimeV5(event.audioStartSec + Math.max(0.25, durationAudioSec));
  const span = end - event.sceneStartSec;
  if (!(span > 0)) return sceneSeconds >= end ? 1 : 0;
  const u = clamp((sceneSeconds - event.sceneStartSec) / span, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/** Pass global scene time, e.g. local Wetlab time + 118. */
export function eventMotionProgressV5(event: NarrationEventV5 | undefined, sceneSeconds: number): number {
  if (!event) return 0;
  const span = event.motionSceneEndSec - event.motionSceneStartSec;
  if (!(span > 0)) return sceneSeconds >= event.motionSceneEndSec ? 1 : 0;
  const u = clamp((sceneSeconds - event.motionSceneStartSec) / span, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

export const isEventLabelVisibleV5 = (event: NarrationEventV5, sceneSeconds: number) =>
  sceneSeconds >= event.sceneStartSec && sceneSeconds < event.sceneEndSec;

