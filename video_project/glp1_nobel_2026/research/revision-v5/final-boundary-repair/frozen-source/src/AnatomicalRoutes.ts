import * as T from 'three';

export type AnatomicalRouteType = 'blood' | 'nerve';
export type RoutePoint = [number, number, number];
export interface AnatomicalRoute {
 id: string;
 type: AnatomicalRouteType;
 label: string;
 provenanceKind: 'atlas-mesh-cross-section-centerline' | 'anatomically-constrained-reference-not-atlas-nerve';
 sourceIDs: string[];
 landmarkSourceIDs?: string[];
 meshAsset?: string;
 stage: string;
 points: RoutePoint[];
 arcLengthMeters: number;
 particleRadiusMeters?: number;
 radiusMeters?: number;
 direction: string;
 display: {renderNewTube: boolean; labelRequired?: string; [key: string]: unknown};
 validation: Record<string, unknown>;
 limitations: string[];
}
export interface AnatomicalRouteData {
 schemaVersion: number;
 coordinates: {units: string; sharedWorldCoordinates: boolean};
 atlasVagusMeshAvailable: false;
 routes: AnatomicalRoute[];
 references: Array<{id: string; doi: string; pmcid: string; url: string; title: string}>;
 circulation: {sequence: string[]; interSegmentPolicy: string; hormoneSurvival: string; forbiddenShortcut: string};
}
export interface AnatomicalRouteState {
 /** Macro visibility only: the caller should multiply by 1 - microWeight. */
 blood: number;
 nerve: number;
 /** Optional selection; an empty list hides every blood path. */
 bloodRouteIDs?: readonly string[];
 /** Optional section-local normalized circulation phase (0..1). */
 bloodProgress?: number;
 /** Optical markers indicate a signal, never molecule size or concentration. */
 showLumenMarkers?: boolean;
}
type RouteRuntime = {
 data: AnatomicalRoute; points: T.Vector3[]; lengths: number[]; length: number;
 root: T.Group; marker?: T.Mesh; material?: T.MeshStandardMaterial;
 highlights: Array<{mesh: T.Mesh; source: T.Mesh; material: T.ShaderMaterial}>;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Linear arc-length sampling preserves the validated intra-mesh polyline. */
export function sampleAnatomicalRoute(route: AnatomicalRoute, progress: number): T.Vector3 {
 const points = route.points.map(p => new T.Vector3(...p));
 const lengths = [0];
 for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
 return sample(points, lengths, progress);
}
function sample(points: T.Vector3[], lengths: number[], progress: number) {
 const total = lengths.at(-1)!;
 const at = clamp(progress) * total;
 let i = 1;
 while (i < lengths.length - 1 && lengths[i] < at) i++;
 const span = lengths[i] - lengths[i - 1];
 return points[i - 1].clone().lerp(points[i], span > 0 ? (at - lengths[i - 1]) / span : 0);
}
class PolylineCurve extends T.Curve<T.Vector3> {
 constructor(private points: T.Vector3[], private lengths: number[]) {super();}
 getPoint(t: number, target = new T.Vector3()) {return target.copy(sample(this.points, this.lengths, t));}
}

/**
 * Shared atlas metres; add root at identity under the same parent as organs.
 * Blood: source-surface light patches, no generated vessel geometry.
 * Nerves: 2 mm diameter authored references, explicitly not patient meshes.
 * GLBs are loaded by the caller from manifest; this class never duplicates them.
 */
export class AnatomicalRoutes {
 readonly root = new T.Group();
 readonly routes: readonly AnatomicalRoute[];
 readonly requiredNerveCaption = '迷走神经路径示意 · 非个体重建';
 private runtimes: RouteRuntime[] = [];
 private seen = new Set<string>();

 static async load(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Anatomical route data failed: ${response.status}`);
  return new AnatomicalRoutes(await response.json() as AnatomicalRouteData);
 }
 constructor(readonly data: AnatomicalRouteData) {
  if (data.coordinates.units !== 'meters' || !data.coordinates.sharedWorldCoordinates) {
   throw new Error('Anatomical routes require shared atlas metre coordinates.');
  }
  this.routes = data.routes;
  this.root.name = 'anatomical-routes';
  for (const route of data.routes) {
   if (route.points.length < 2 || route.points.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v)))) {
    throw new Error(`Invalid route: ${route.id}`);
   }
   const points = route.points.map(p => new T.Vector3(...p)), lengths = [0];
   for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1)! + points[i].distanceTo(points[i - 1]));
   const root = new T.Group(); root.name = route.id; root.visible = false;
   root.userData = {routeType: route.type, provenanceKind: route.provenanceKind, sourceIDs: route.sourceIDs};
   this.root.add(root);
   const runtime: RouteRuntime = {data: route, points, lengths, length: lengths.at(-1)!, root, highlights: []};
   if (route.type === 'nerve') {
    const radius = route.radiusMeters ?? .001;
    if (radius > .0025) throw new Error('Reference nerve radius must remain millimetre-scale.');
    const material = new T.MeshStandardMaterial({color: '#a3aa78', roughness: .8, transparent: true,
                                               opacity: 0, depthWrite: false});
    const geometry = new T.TubeGeometry(new PolylineCurve(points, lengths), points.length - 1, radius, 8, false);
    const nerve = new T.Mesh(geometry, material); nerve.name = `${route.id}-reference-only`;
    root.add(nerve); runtime.material = material;
    // A small brighter locus is electrical/functional signalling, not a
    // hormone particle transported inside a nerve or a measured conduction rate.
    const marker = new T.Mesh(new T.SphereGeometry(radius * 1.12, 10, 8),
      new T.MeshBasicMaterial({color: '#e0bd69', transparent: true, depthWrite: false}));
    root.add(marker); runtime.marker = marker;
   } else {
    if (route.display.renderNewTube) throw new Error('Blood routes cannot generate new vessel tubes.');
    const marker = new T.Mesh(new T.SphereGeometry(route.particleRadiusMeters ?? .0001, 8, 6),
      new T.MeshBasicMaterial({color: '#e5bb62', transparent: true, depthWrite: false}));
    root.add(marker); runtime.marker = marker;
   }
   this.runtimes.push(runtime);
  }
 }

 /** Call after the source GLBs load. Repeated calls are safe and idempotent.
  * The copied geometry remains exactly the source vessel surface. Only its
  * shader intensity changes; no bridge, ribbon or tube is introduced.
  */
 attachSurfaceHighlights(sourceRoot: T.Object3D) {
  sourceRoot.updateWorldMatrix(true, true);
  let attached = 0;
  sourceRoot.traverse(object => {
   if (!(object instanceof T.Mesh)) return;
   const sourceID = String(object.userData.sourceID ?? object.name.split('_')[0]);
   for (const runtime of this.runtimes) {
    if (runtime.data.type !== 'blood' || !runtime.data.sourceIDs.includes(sourceID)) continue;
    const key = `${object.uuid}:${runtime.data.id}`;
    if (this.seen.has(key)) continue;
    this.seen.add(key);
    const geometry = object.geometry.clone(), positions = geometry.getAttribute('position');
    const progress = new Float32Array(positions.count);
    const coverage = new Float32Array(positions.count);
    const p = new T.Vector3(), ab = new T.Vector3(), ap = new T.Vector3(), closest = new T.Vector3();
    for (let v = 0; v < positions.count; v++) {
     p.fromBufferAttribute(positions, v);
     let best = Infinity, bestT = 0;
     for (let i = 1; i < runtime.points.length; i++) {
      const a = runtime.points[i - 1], b = runtime.points[i];
      ab.subVectors(b, a); ap.subVectors(p, a);
      const t = clamp(ap.dot(ab) / ab.lengthSq());
      closest.copy(a).addScaledVector(ab, t);
      const distance = p.distanceToSquared(closest);
      if (distance < best) {best = distance; bestT = (runtime.lengths[i - 1] + t * ab.length()) / runtime.length;}
     }
     progress[v] = bestT;
     // Do not light an unsampled branch whose nearest point is a route end.
     coverage[v] = bestT > .005 && bestT < .995 ? 1 : 0;
    }
    geometry.setAttribute('routeProgress', new T.BufferAttribute(progress, 1));
    geometry.setAttribute('routeCoverage', new T.BufferAttribute(coverage, 1));
    const material = new T.ShaderMaterial({
     uniforms: {pulse: {value: 0}, opacity: {value: 0}, color: {value: new T.Color('#e3b65f')}},
     vertexShader: `attribute float routeProgress; attribute float routeCoverage;
      varying float vProgress; varying float vCoverage;
      void main(){vProgress=routeProgress;vCoverage=routeCoverage;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
     fragmentShader: `uniform float pulse; uniform float opacity; uniform vec3 color;
      varying float vProgress; varying float vCoverage;
      void main(){float d=(vProgress-pulse)/0.065;float a=opacity*exp(-d*d)*vCoverage;
       if(a<0.005)discard;gl_FragColor=vec4(color,a);}`,
     transparent: true, depthWrite: false, depthTest: true, side: T.DoubleSide,
     blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const highlight = new T.Mesh(geometry, material); highlight.name = `signal-on-${sourceID}`;
    highlight.matrixAutoUpdate = false; highlight.renderOrder = 5;
    runtime.root.add(highlight); runtime.highlights.push({mesh: highlight, source: object, material});
    attached++;
   }
  });
  return attached;
 }

 update(timeSeconds: number, state: AnatomicalRouteState) {
  const blood = clamp(state.blood), nerve = clamp(state.nerve);
  this.root.visible = blood > .0001 || nerve > .0001;
  this.root.updateWorldMatrix(true, true);
  // Include unresolved hepatic and cardiopulmonary steps as periods with no
  // travelling marker. There is never a straight interpolation across a gap.
  const sequence = this.data.circulation.sequence;
  const elapsed = state.bloodProgress === undefined
   ? ((timeSeconds / 1.35) % sequence.length + sequence.length) % sequence.length
   : clamp(state.bloodProgress) * (sequence.length - 1e-6);
  const activeID = sequence[Math.floor(elapsed)], local = elapsed % 1;
  for (const runtime of this.runtimes) {
   const isNerve = runtime.data.type === 'nerve';
   const selected = state.bloodRouteIDs === undefined || state.bloodRouteIDs.includes(runtime.data.id);
   const opacity = isNerve ? nerve : selected ? blood : 0;
   runtime.root.visible = opacity > .0001;
   if (!runtime.root.visible) continue;
   if (isNerve) {
    runtime.material!.opacity = opacity * .78;
    const marker = runtime.marker!;
    marker.position.copy(sample(runtime.points, runtime.lengths, 1 - ((timeSeconds / 4.8) % 1 + 1) % 1));
    (marker.material as T.MeshBasicMaterial).opacity = opacity;
   } else {
    const active = activeID === runtime.data.id && local >= .10 && local <= .90;
    const progress = clamp((local - .10) / .80);
    const marker = runtime.marker!;
    marker.visible = active && state.showLumenMarkers === true;
    marker.position.copy(sample(runtime.points, runtime.lengths, progress));
    (marker.material as T.MeshBasicMaterial).opacity = opacity;
    const inverse = runtime.root.matrixWorld.clone().invert();
    for (const highlight of runtime.highlights) {
     highlight.source.updateWorldMatrix(true, false);
     highlight.mesh.matrix.copy(inverse).multiply(highlight.source.matrixWorld);
     highlight.material.uniforms.pulse.value = progress;
     let sourceVisible = true;
     for (let ancestor: T.Object3D | null = highlight.source; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) {sourceVisible = false; break;}
     }
     highlight.material.uniforms.opacity.value = active && sourceVisible ? opacity * .85 : 0;
    }
   }
  }
 }

 getRoute(id: string) {return this.routes.find(route => route.id === id);}
 dispose() {
  this.root.traverse(object => {
   if (!(object instanceof T.Mesh)) return;
   object.geometry.dispose();
   for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  this.root.removeFromParent(); this.seen.clear();
 }
}
