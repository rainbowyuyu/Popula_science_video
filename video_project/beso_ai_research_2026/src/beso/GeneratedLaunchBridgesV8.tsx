import React from 'react';
import manifestData from '../../research/generation/launch-v8-bridges.json';

/** Historical generation records remain intact. V12 rejects these clips after
 * visual review: inconsistent connections and duplicate platforms cannot be
 * repaired with low-opacity overlays. The native camera now owns continuity.
 * See research/qa/v12-bridge-audit/audit.md for actual sampled frames/hashes. */
export type LaunchBridgeV8={
 id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;sourceFps:number;
 role:string;selection:'selected'|'rejected'|'pending_review';overlapFrames?:number;
 sha256:string;firstAnchor:string;lastAnchor:string;labelColour?:'light'|'dark';
};
export type PreparedLaunchBridgeV8=LaunchBridgeV8&{durationFrames:number;toFrame:number;overlapFrames:number};
export const archivedLaunchBridgesV8=(manifestData.bridges as LaunchBridgeV8[]);
export const launchBridgesV8:PreparedLaunchBridgeV8[]=[];
export function launchBridgeCoverageV8(_frame:number){return 0;}
export function launchBridgeAtV8(_frame:number):PreparedLaunchBridgeV8|undefined{return undefined;}
export function GeneratedLaunchBridgesV8(){return null;}
