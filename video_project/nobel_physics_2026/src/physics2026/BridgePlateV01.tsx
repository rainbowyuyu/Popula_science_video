import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, staticFile, interpolate, Easing} from 'remotion';

/**
 * Optional Qwen/Wan environment plate. Keep this layer muted and below the
 * deterministic PhysicsWorld canvas; it carries camera/light continuity only.
 * `start` and `end` are global composition frames and should be chosen at a
 * real clip seam, not by duplicating a final frame.
 */
export const BRIDGE_PLATES_V01 = {
  'bridge-01-cosmic-arrival': 'bridges-v01/bridge-01-cosmic-arrival.mp4',
  'bridge-02-ice-descent': 'bridges-v01/bridge-02-ice-descent.mp4',
  'bridge-03-cherenkov-volume': 'bridges-v01/bridge-03-cherenkov-volume.mp4',
  'bridge-04-source-return': 'bridges-v01/bridge-04-source-return.mp4',
  'bridge-05-night-coda': 'bridges-v01/bridge-05-night-coda.mp4',
} as const;

export type BridgePlateId = keyof typeof BRIDGE_PLATES_V01;

export function BridgePlateV01({
  id,
  frame,
  start,
  end,
  zIndex = 1,
  maxOpacity = 0.72,
}: {
  id: BridgePlateId;
  frame: number;
  start: number;
  end: number;
  zIndex?: number;
  maxOpacity?: number;
}) {
  const duration = Math.max(1, end - start);
  const local = frame - start;
  const fade = Math.min(12, Math.floor(duration / 4));
  const alpha = interpolate(
    local,
    [0, fade, Math.max(fade + 1, duration - fade), duration],
    [0, maxOpacity, maxOpacity, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)},
  );
  if (frame < start || frame >= end) return null;
  return (
    <Sequence from={start} durationInFrames={duration} premountFor={1}>
      <AbsoluteFill style={{zIndex, opacity: alpha, pointerEvents: 'none'}}>
        <OffthreadVideo
          src={staticFile(BRIDGE_PLATES_V01[id])}
          startFrom={0}
          muted
          volume={0}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </AbsoluteFill>
    </Sequence>
  );
}
