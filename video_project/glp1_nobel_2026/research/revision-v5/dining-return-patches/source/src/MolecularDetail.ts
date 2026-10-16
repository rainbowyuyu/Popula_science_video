import * as T from 'three';

type V3 = [number, number, number];
type Residue = {resid: number; position: V3; secondary: 'helix' | 'sheet' | 'coil'; secondaryId: string | null};
type Chain = {
  id: string; role: string; ca: Residue[];
  segments: {start: number; endExclusive: number}[];
};
type Structure = {
  pdbId: string; chains: Chain[];
  displayTransform: {originAngstrom: V3; rotationRowMajor: [V3, V3, V3]};
};

const SCALE = 0.0165;
const smooth = (a: number, b: number, x: number) => {
  const t = T.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A rigidly oriented 5VAI model. Animation is illustrative, never an MD trajectory.
 *
 * At progress >= .50 ligand and Gs retain the deposited relative pose exactly.
 * render() deliberately leaves the externally controlled root transform untouched.
 */
export class MolecularDetail {
  readonly root = new T.Group();
  readonly ready: Promise<void>;
  private readonly protein = new T.Group();
  private readonly receptor = new T.Group();
  private readonly ligand = new T.Group();
  private readonly gs = new T.Group();
  private readonly membrane = new T.Group();
  private ligandBound = new T.Vector3();
  private receptorMaterial = new T.MeshStandardMaterial({color: '#67c9b9', roughness: .4, metalness: .1, side: T.DoubleSide});
  private ligandMaterial = new T.MeshStandardMaterial({color: '#f4c56e', roughness: .33, metalness: .12, side: T.DoubleSide});
  private gsAlphaMaterial = new T.MeshStandardMaterial({color: '#ae8097', roughness: .46, metalness: .08, side: T.DoubleSide});
  private gsBetaMaterial = new T.MeshStandardMaterial({color: '#688aab', roughness: .47, metalness: .08, side: T.DoubleSide});
  private gsGammaMaterial = new T.MeshStandardMaterial({color: '#8d839f', roughness: .48, metalness: .08, side: T.DoubleSide});
  private pocketMarker?: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>;
  private pulseRings: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>[] = [];
  private disposed = false;

  constructor(base: string) {
    this.root.name = 'GLP1R_5VAI_experimental_structure';
    this.root.userData = {
      source: 'https://www.rcsb.org/structure/5VAI',
      caption: 'GLP-1R–Gs 实验结构 · PDB 5VAI｜结合过程与信号响应为示意，非分子动力学',
      scientificNote: 'Rabbit receptor; human GLP-1(7–37); mixed-species Gs. The membrane and ligand approach are illustrative.',
      originalAngstromToSceneScale: SCALE,
    };
    this.receptor.name = 'rabbit_GLP1R_R';
    this.ligand.name = 'human_GLP1_P';
    this.gs.name = 'Gs_ABG';
    this.membrane.name = 'schematic_lipid_bilayer_cutaway';
    this.protein.add(this.receptor, this.ligand, this.gs);
    this.root.add(this.protein, this.membrane);
    this.ready = fetch(base + 'molecules/glp1r.json').then(async response => {
      if (!response.ok) throw new Error(`5VAI structure request failed: ${response.status}`);
      const structure = await response.json() as Structure;
      if (this.disposed) return;
      this.buildStructure(structure);
      this.buildMembrane();
      this.render(0, 0);
      const bounds = new T.Box3().setFromObject(this.root);
      this.root.userData.initialBounds = {min: bounds.min.toArray(), max: bounds.max.toArray()};
    });
  }

  private buildStructure(structure: Structure) {
    const origin = new T.Vector3(...structure.displayTransform.originAngstrom);
    const rotation = new T.Matrix3().set(...structure.displayTransform.rotationRowMajor.flat() as [number, number, number, number, number, number, number, number, number]);
    const transform = (position: V3) => new T.Vector3(...position).sub(origin).applyMatrix3(rotation).multiplyScalar(SCALE);
    const ligandData = structure.chains.find(c => c.id === 'P');
    if (!ligandData) throw new Error('5VAI ligand chain P is absent');
    const ligandPoints = ligandData.ca.map(r => transform(r.position));
    this.ligandBound = ligandPoints.reduce((sum, p) => sum.add(p), new T.Vector3()).multiplyScalar(1 / ligandPoints.length);

    for (const chain of structure.chains) {
      if (chain.id === 'N') continue; // Nb35 is an experimental stabilizer, not a physiological signaling component.
      const parent = chain.id === 'R' ? this.receptor : chain.id === 'P' ? this.ligand : this.gs;
      const material = chain.id === 'R' ? this.receptorMaterial : chain.id === 'P' ? this.ligandMaterial
        : chain.id === 'A' ? this.gsAlphaMaterial : chain.id === 'B' ? this.gsBetaMaterial : this.gsGammaMaterial;
      const points = chain.ca.map(r => {
        const p = transform(r.position);
        return chain.id === 'P' ? p.sub(this.ligandBound) : p;
      });
      for (const segment of chain.segments) {
        // A fine continuous backbone keeps neighboring secondary-structure runs visually joined.
        // The explicit segment list prevents invented connections across unresolved residues.
        const segmentPoints = points.slice(segment.start, segment.endExclusive);
        if (segmentPoints.length < 2) continue;
        const backbone = new T.CatmullRomCurve3(segmentPoints, false, 'centripetal');
        const tube = new T.Mesh(new T.TubeGeometry(backbone, Math.max(16, segmentPoints.length * 5), .0055, 5, false), material);
        tube.name = `${chain.id}_resolved_backbone_${segment.start}`;
        parent.add(tube);
        let start = segment.start;
        while (start < segment.endExclusive) {
          const residue = chain.ca[start];
          let end = start + 1;
          while (end < segment.endExclusive && chain.ca[end].secondary === residue.secondary
            && chain.ca[end].secondaryId === residue.secondaryId) end++;
          if (residue.secondary !== 'coil' && end - start >= 3) {
            const ribbon = this.ribbon(points.slice(start, end), residue.secondary === 'sheet');
            const mesh = new T.Mesh(ribbon, material);
            mesh.name = `${chain.id}_${residue.secondary}_${chain.ca[start].resid}_${chain.ca[end - 1].resid}`;
            mesh.userData.originalResidueRange = [chain.ca[start].resid, chain.ca[end - 1].resid];
            parent.add(mesh);
          }
          start = end;
        }
      }
    }
    // A small transparent ring is a schematic signal cue, not a molecular surface.
    const markerMaterial = new T.MeshBasicMaterial({color: '#ffdaa0', transparent: true, opacity: 0, depthWrite: false});
    this.pocketMarker = new T.Mesh(new T.TorusGeometry(.108, .0018, 6, 72), markerMaterial);
    this.pocketMarker.rotation.x = Math.PI / 2;
    this.pocketMarker.position.copy(transform(ligandData.ca[0].position));
    this.root.add(this.pocketMarker);
    for (let i = 0; i < 3; i++) {
      const material = new T.MeshBasicMaterial({color: '#e7b9cf', transparent: true, opacity: 0, depthWrite: false});
      const ring = new T.Mesh(new T.TorusGeometry(.14, .0018, 5, 64), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-.08, -.56, .04);
      this.pulseRings.push(ring);
      this.root.add(ring);
    }
    this.ligand.position.copy(this.ligandBound);
    const bound = new T.Box3().setFromObject(this.protein);
    this.root.userData.boundProteinBounds = {min: bound.min.toArray(), max: bound.max.toArray(), size: bound.getSize(new T.Vector3()).toArray()};
    this.root.userData.ligandBoundCenter = this.ligandBound.toArray();
  }

  /** Flat elliptical ribbon swept through actual CA coordinates, with a sheet arrow tip.
   * Catmull–Rom interpolation changes representation only; it does not add molecular states.
   */
  private ribbon(points: T.Vector3[], sheet: boolean) {
    const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
    const count = Math.max(20, (points.length - 1) * 8);
    const frames = curve.computeFrenetFrames(count, false);
    const positions: number[] = [];
    const indices: number[] = [];
    const sides = 8;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = curve.getPointAt(t);
      const edgeTaper = Math.min(1, .3 + t * 12, .3 + (1 - t) * 12);
      let halfWidth = (sheet ? .029 : .025) * edgeTaper;
      if (sheet && t > .72) halfWidth = .042 * (1 - t) / .28 + .001;
      const halfThickness = sheet ? .0031 : .0037;
      for (let k = 0; k < sides; k++) {
        const angle = 2 * Math.PI * k / sides;
        const v = p.clone().addScaledVector(frames.normals[i], Math.cos(angle) * halfWidth)
          .addScaledVector(frames.binormals[i], Math.sin(angle) * halfThickness);
        positions.push(v.x, v.y, v.z);
        if (i < count) {
          const a = i * sides + k;
          const b = i * sides + (k + 1) % sides;
          const c = a + sides;
          const d = b + sides;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildMembrane() {
    const headPositions: T.Vector3[] = [];
    const tailSegments: [T.Vector3, T.Vector3][] = [];
    const spacing = .093;
    const halfThickness = 23.5 * SCALE; // 4.7 nm between head centres; about 5 nm including heads.
    // Hexagonally spaced molecules form two leaflets. The anterior wedge is removed
    // and the central exclusion leaves the actual seven-TM bundle unobstructed.
    for (let row = -12; row <= 12; row++) {
      for (let column = -13; column <= 13; column++) {
        const x = column * spacing + (Math.abs(row) % 2) * spacing * .5;
        const z = row * spacing * .866;
        const radius = Math.hypot(x, z);
        if (radius < .41 || radius > 1.04 || (z > .13 && Math.abs(x) < .52 + z * .44)) continue;
        const phase = Math.sin(row * 14.2 + column * 7.7);
        for (const sign of [-1, 1]) {
          const y = sign * (halfThickness + .009 * phase);
          headPositions.push(new T.Vector3(x, y, z));
          for (const branch of [-1, 1]) {
            const start = new T.Vector3(x + branch * .012, y - sign * .014, z);
            const kink = new T.Vector3(x + branch * .02 + .008 * phase, sign * .1, z + .012);
            const tip = new T.Vector3(x + branch * .018, sign * .017, z - .009);
            tailSegments.push([start, kink], [kink, tip]);
          }
        }
      }
    }
    const headMaterial = new T.MeshStandardMaterial({color: '#759daa', metalness: .12, roughness: .49,
      transparent: true, opacity: .62, depthWrite: false});
    const tailMaterial = new T.MeshStandardMaterial({color: '#536c72', metalness: 0, roughness: .67,
      transparent: true, opacity: .32, depthWrite: false});
    const heads = new T.InstancedMesh(new T.SphereGeometry(.024, 10, 7), headMaterial, headPositions.length);
    const tails = new T.InstancedMesh(new T.CylinderGeometry(.0047, .0047, 1, 5), tailMaterial, tailSegments.length);
    heads.name = 'phospholipid_polar_heads_schematic';
    tails.name = 'paired_hydrophobic_tails_schematic';
    const matrix = new T.Matrix4();
    const quaternion = new T.Quaternion();
    const up = new T.Vector3(0, 1, 0);
    const one = new T.Vector3(1, 1, 1);
    headPositions.forEach((position, i) => heads.setMatrixAt(i, matrix.compose(position, quaternion, one)));
    tailSegments.forEach(([start, end], i) => {
      const direction = end.clone().sub(start);
      const length = direction.length();
      quaternion.setFromUnitVectors(up, direction.normalize());
      tails.setMatrixAt(i, matrix.compose(start.clone().add(end).multiplyScalar(.5), quaternion, new T.Vector3(1, length, 1)));
    });
    heads.instanceMatrix.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
    this.membrane.add(heads, tails);
  }

  getLigandAnchor(){return this.ligand.position.clone();}
  render(time: number, progress: number): void {
    const p = T.MathUtils.clamp(progress, 0, 1);
    const docking = smooth(.08, .50, p);
    const separation = 1 - docking;
    this.ligand.position.copy(this.ligandBound).add(new T.Vector3(.34, .65, .17).multiplyScalar(separation));
    this.ligand.rotation.set(.20 * separation, -.36 * separation, -.23 * separation);
    this.ligandMaterial.emissive.set('#c58730');
    this.ligandMaterial.emissiveIntensity = .04 + .15 * docking;
    const signaling = smooth(.53, .66, p);
    const pulse = signaling * (.56 + .44 * Math.sin(time * 2.0));
    this.receptorMaterial.emissive.set('#246b60');
    this.receptorMaterial.emissiveIntensity = .06 + .16 * pulse;
    this.gsAlphaMaterial.emissive.set('#bd6f91');
    this.gsAlphaMaterial.emissiveIntensity = .04 + .26 * pulse;
    this.gsBetaMaterial.emissive.set('#416c98');
    this.gsBetaMaterial.emissiveIntensity = .035 + .12 * pulse;
    this.gsGammaMaterial.emissive.set('#735575');
    this.gsGammaMaterial.emissiveIntensity = .035 + .12 * pulse;
    if (this.pocketMarker) {
      this.pocketMarker.material.opacity = .5 * smooth(.36, .48, p) * (1 - smooth(.65, .8, p));
      const scale = 1 + .08 * Math.sin(time * 3);
      this.pocketMarker.scale.setScalar(scale);
    }
    for (let i = 0; i < this.pulseRings.length; i++) {
      const phase = ((time * .22 + i / 3) % 1 + 1) % 1;
      const ring = this.pulseRings[i];
      ring.scale.setScalar(1 + phase * 1.6);
      ring.position.y = -.56 - phase * .21;
      ring.material.opacity = signaling * .18 * Math.sin(Math.PI * phase);
    }
  }

  dispose(): void {
    this.disposed = true;
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>([this.receptorMaterial, this.ligandMaterial, this.gsAlphaMaterial, this.gsBetaMaterial, this.gsGammaMaterial]);
    this.root.traverse(object => {
      if (object instanceof T.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.root.clear();
  }
}
