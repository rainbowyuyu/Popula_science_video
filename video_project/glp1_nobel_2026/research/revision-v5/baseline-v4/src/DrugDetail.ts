import * as T from 'three';

export type DrugDetailLabel = {
  id: string; text: string; position: [number, number, number]; color: string; opacity: number;
};

const ease = (a: number, b: number, p: number) => {
  const x = T.MathUtils.clamp((p - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/** Numbered GLP-1 peptide engineering diagram; shapes and motions are schematic.
 * The modeled chemistry follows Lau et al. J Med Chem (2015), DOI 10.1021/acs.jmedchem.5b00726.
 * Albumin is an explicitly schematic translucent carrier, not a measured protein surface.
 */
export class DrugDetail {
  readonly root = new T.Group();
  readonly ready: Promise<void>;
  readonly anchors: Record<string, T.Vector3> = {};
  private residues: T.Mesh<T.SphereGeometry, T.MeshStandardMaterial>[] = [];
  private bonds: T.Mesh<T.TubeGeometry, T.MeshStandardMaterial>[] = [];
  private positions: T.Vector3[] = [];
  private readonly peptide = new T.Group();
  private readonly enzyme = new T.Group();
  private readonly lipid = new T.Group();
  private readonly linker = new T.Group();
  private readonly albumin = new T.Group();
  private readonly aibBranches = new T.Group();
  private readonly markerAib = new T.Group();
  private readonly markerLys = new T.Group();
  private readonly markerArg = new T.Group();
  private readonly halo = new T.Group();
  private readonly albuminMaterials: T.MeshPhysicalMaterial[] = [];
  private readonly enzymeMaterials: T.MeshStandardMaterial[] = [];
  private readonly pulseMaterials: T.MeshBasicMaterial[] = [];
  private readonly nativeColor = new T.Color('#88c9c6');
  private readonly drugColor = new T.Color('#e4bd73');
  private currentProgress = 0;
  private readonly peptideOffset = new T.Vector3(-.53, 0, 0);

  constructor(_base = '') {
    this.root.name = 'GLP1_semaglutide_engineering_schematic';
    this.root.userData = {
      caption: '肽链、酶切与白蛋白结合示意；非原子级结构或动力学模拟',
      source: 'https://doi.org/10.1021/acs.jmedchem.5b00726',
      chemistry: 'GLP-1 numbering 7–37. DPP-4 removes His7–Ala8. Semaglutide substitutes Aib8 and Arg34; Lys26 carries a C18 fatty diacid via a gamma-Glu and two OEG spacer linker.',
      albuminRepresentation: 'Three translucent abstract lobes, not an experimental surface. Reversible carrier association is a schematic animation.',
    };
    this.peptide.position.copy(this.peptideOffset);
    this.peptide.name = 'numbered_GLP1_7_to_37_schematic';
    this.root.add(this.peptide, this.enzyme, this.lipid, this.linker, this.albumin, this.halo);
    this.buildPeptide();
    this.buildDpp4();
    this.buildSidechain();
    this.buildAlbumin();
    this.buildSignalHalo();
    this.anchors = {
      native: new T.Vector3(-.85, .26, .08),
      cleavage: new T.Vector3(-.38, .94, .16),
      dpp4: new T.Vector3(-.34, .90, .09),
      aib8: this.positions[1].clone().add(this.peptideOffset).add(new T.Vector3(-.08, .06, .05)),
      lys26: this.positions[19].clone().add(this.peptideOffset).add(new T.Vector3(-.07, -.04, .06)),
      arg34: this.positions[27].clone().add(this.peptideOffset).add(new T.Vector3(-.08, -.05, .05)),
      c18: new T.Vector3(.16, -.16, .18),
      albumin: new T.Vector3(.78, -.87, .16),
      persistence: new T.Vector3(.68, .71, .10),
    };
    this.render(0, 0);
    this.ready = Promise.resolve();
  }

  private tube(points: T.Vector3[], material: T.MeshStandardMaterial, radius = .013) {
    const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
    return new T.Mesh(new T.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 8, false), material);
  }

  private buildPeptide() {
    const sequence = ['H', 'A', 'E', 'G', 'T', 'F', 'T', 'S', 'D', 'V', 'S', 'S', 'Y', 'L', 'E', 'G', 'Q', 'A', 'A', 'K', 'E', 'F', 'I', 'A', 'W', 'L', 'V', 'K', 'G', 'R', 'G'];
    const points = sequence.map((_, i) => new T.Vector3(Math.cos(i * 1.72) * .135, 1.015 - i * .067, Math.sin(i * 1.72) * .135));
    this.positions = points;
    points.forEach((point, i) => {
      const material = new T.MeshStandardMaterial({color: this.nativeColor, metalness: .11, roughness: .37});
      const sphere = new T.Mesh(new T.SphereGeometry(i < 2 ? .037 : .029, 14, 10), material);
      sphere.position.copy(point);
      sphere.name = `${sequence[i]}${i + 7}_residue_symbol`;
      sphere.userData = {glp1Number: i + 7, nativeResidue: sequence[i], representation: 'one sphere per residue, not an atom'};
      this.residues.push(sphere);
      this.peptide.add(sphere);
      if (i < points.length - 1) {
        // Each short curved connection can be hidden at the actual DPP-4 cleavage site after Ala8.
        const next = points[i + 1];
        const midAngle = (i + .5) * 1.72;
        const mid = new T.Vector3(Math.cos(midAngle) * .135, (point.y + next.y) / 2, Math.sin(midAngle) * .135);
        const bondMaterial = new T.MeshStandardMaterial({color: this.nativeColor, metalness: .10, roughness: .42});
        const tube = this.tube([point, mid, next], bondMaterial, .0115);
        tube.name = `peptide_bond_after_${i + 7}`;
        this.bonds.push(tube);
        this.peptide.add(tube);
      }
    });
    const branchMaterial = new T.MeshStandardMaterial({color: '#b99fd9', metalness: .12, roughness: .34});
    for (const sign of [-1, 1]) {
      const end = points[1].clone().add(new T.Vector3(sign * .077, .025, .04));
      this.aibBranches.add(this.tube([points[1], end], branchMaterial, .010));
      const branch = new T.Mesh(new T.SphereGeometry(.021, 12, 8), branchMaterial);
      branch.position.copy(end);
      this.aibBranches.add(branch);
    }
    this.aibBranches.name = 'Aib8_extra_methyl_groups_symbol';
    this.peptide.add(this.aibBranches);
    for (const [group, index, color] of [[this.markerAib, 1, '#bda8e4'], [this.markerLys, 19, '#f1cc85'], [this.markerArg, 27, '#c997bd']] as const) {
      const material = new T.MeshBasicMaterial({color, transparent: true, opacity: .75, depthWrite: false});
      const ring = new T.Mesh(new T.TorusGeometry(.071, .003, 6, 48), material);
      group.add(ring);
      group.position.copy(points[index]);
      this.peptide.add(group);
    }
  }

  private buildDpp4() {
    this.enzyme.name = 'DPP4_enzyme_symbol_not_measured_surface';
    for (const sign of [-1, 1]) {
      const material = new T.MeshStandardMaterial({color: '#698ba5', metalness: .1, roughness: .4});
      const lobe = new T.Mesh(new T.SphereGeometry(.125, 24, 16), material);
      lobe.scale.set(.8, .58, 1);
      lobe.position.y = sign * .081;
      this.enzymeMaterials.push(material);
      this.enzyme.add(lobe);
    }
    const material = new T.MeshStandardMaterial({color: '#a9c2ce', metalness: .15, roughness: .3});
    const clasp = new T.Mesh(new T.TorusGeometry(.074, .012, 8, 36, Math.PI), material);
    clasp.rotation.y = Math.PI / 2;
    clasp.position.x = .055;
    this.enzyme.add(clasp);
  }

  private buildSidechain() {
    const lysine = this.positions[19].clone().add(this.peptideOffset);
    const gold = new T.MeshStandardMaterial({color: '#c3a672', metalness: .2, roughness: .38});
    const linkerPoints = [lysine];
    for (let i = 1; i <= 6; i++) linkerPoints.push(lysine.clone().add(new T.Vector3(i * .046, .022 * Math.sin(i * 2), .032)));
    this.linker.add(this.tube(linkerPoints, gold, .008));
    linkerPoints.slice(1).forEach((point, index) => {
      const material = new T.MeshStandardMaterial({color: index % 2 ? '#ddbd8c' : '#91b7c4', roughness: .35, metalness: .12});
      const bead = new T.Mesh(new T.SphereGeometry(.016, 10, 8), material);
      bead.position.copy(point);
      this.linker.add(bead);
    });
    this.linker.name = 'gamma_Glu_two_OEG_spacer_schematic_not_atom_count';
    const start = linkerPoints[linkerPoints.length - 1];
    const carbonPoints: T.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      carbonPoints.push(start.clone().add(new T.Vector3(t * .65, Math.sin(t * Math.PI) * .18 - .035 * t, .022 * Math.sin(i * Math.PI / 2))));
    }
    const carbonMaterial = new T.MeshStandardMaterial({color: '#f0c779', roughness: .31, metalness: .16});
    this.lipid.add(this.tube(carbonPoints, carbonMaterial, .008));
    carbonPoints.forEach((position, i) => {
      const bead = new T.Mesh(new T.SphereGeometry(.015, 10, 8), carbonMaterial);
      bead.position.copy(position);
      bead.name = `C18_fatty_diacid_carbon_${i + 1}`;
      this.lipid.add(bead);
    });
    const terminal = carbonPoints[17];
    const oxygen = new T.MeshStandardMaterial({color: '#cd8f83', roughness: .37, metalness: .08});
    for (const sign of [-1, 1]) {
      const point = terminal.clone().add(new T.Vector3(.026, sign * .027, 0));
      this.lipid.add(this.tube([terminal, point], oxygen, .007));
      const sphere = new T.Mesh(new T.SphereGeometry(.017, 10, 8), oxygen);
      sphere.position.copy(point);
      this.lipid.add(sphere);
    }
    this.lipid.name = 'Lys26_linked_C18_fatty_diacid_18_carbon_symbols';
  }

  private buildAlbumin() {
    this.albumin.name = 'albumin_abstract_carrier_NOT_experimental_surface';
    const lobes = [
      {position: [-.14, .18, -.12], scale: [.35, .31, .20]},
      {position: [.16, .02, -.12], scale: [.34, .35, .24]},
      {position: [-.01, -.24, -.12], scale: [.34, .27, .21]},
    ];
    for (const lobe of lobes) {
      const material = new T.MeshPhysicalMaterial({color: '#6f9eb3', roughness: .32, metalness: .06,
        transparent: true, opacity: .0, depthWrite: false, clearcoat: .45});
      const mesh = new T.Mesh(new T.SphereGeometry(1, 32, 20), material);
      mesh.position.fromArray(lobe.position);
      mesh.scale.fromArray(lobe.scale);
      this.albuminMaterials.push(material);
      this.albumin.add(mesh);
      const contourMaterial = new T.MeshBasicMaterial({color: '#a1c5d4', transparent: true, opacity: 0, depthWrite: false});
      for (const latitude of [-.52, 0, .52]) {
        const radius = Math.sqrt(1 - latitude * latitude);
        const ring = new T.Mesh(new T.TorusGeometry(radius, .009, 4, 72), contourMaterial);
        ring.position.copy(mesh.position).add(new T.Vector3(0, latitude * lobe.scale[1], .007));
        ring.rotation.x = Math.PI / 2;
        ring.scale.set(lobe.scale[0], lobe.scale[2], lobe.scale[1]);
        this.albumin.add(ring);
      }
      this.pulseMaterials.push(contourMaterial);
    }
  }

  private buildSignalHalo() {
    for (let i = 0; i < 3; i++) {
      const material = new T.MeshBasicMaterial({color: '#93b9be', transparent: true, opacity: 0, depthWrite: false});
      const ring = new T.Mesh(new T.TorusGeometry(.52 + i * .08, .002, 5, 96), material);
      ring.position.set(.73, -.26, -.1);
      ring.scale.y = 1.05;
      this.halo.add(ring);
    }
  }

  render(time: number, progress: number): void {
    const p = T.MathUtils.clamp(progress, 0, 1);
    this.currentProgress = p;
    // The cleaved native peptide leaves the field before a newly designed
    // molecule enters. Never reverse an irreversible DPP-4 cleavage on screen.
    const cut = p < .355 ? ease(.17, .29, p) : 0;
    this.peptide.position.copy(this.peptideOffset);
    this.peptide.position.x += p < .355 ? -5.6 * ease(.330,.355,p) : 5.6 * (1-ease(.355,.385,p));
    const engineering = ease(.34, .49, p);
    const sidechain = ease(.54, .64, p);
    const carrier = ease(.62, .74, p);
    const bind = ease(.66, .79, p);
    this.residues.forEach((residue, i) => {
      residue.position.copy(this.positions[i]);
      if (i < 2) residue.position.add(new T.Vector3(-.31 * cut, .15 * cut, .11 * cut));
      residue.material.color.copy(this.nativeColor).lerp(this.drugColor, engineering);
      residue.material.emissive.set('#6e5028');
      residue.material.emissiveIntensity = .04 * engineering;
    });
    this.residues[1].material.color.lerp(new T.Color('#bba0d9'), engineering);
    this.residues[27].material.color.lerp(new T.Color('#c893b8'), engineering);
    this.residues[19].material.emissiveIntensity = .25 * sidechain;
    this.bonds.forEach((bond, i) => {
      bond.visible = i !== 1 || cut < .1;
      bond.position.set(i === 0 ? -.31 * cut : 0, i === 0 ? .15 * cut : 0, i === 0 ? .11 * cut : 0);
      bond.material.color.copy(this.nativeColor).lerp(this.drugColor, engineering);
    });
    this.enzyme.visible = p < .355;
    this.enzyme.position.set(.04 - ease(.12, .20, p) * .38, .90, .09);
    this.enzyme.position.x -= 5.6 * ease(.330,.355,p);
    this.anchors.dpp4.copy(this.enzyme.position);
    this.enzyme.rotation.z = -.10;
    const enzymeScale = .82 + .08 * Math.sin(time * 1.5) * (1 - engineering);
    this.enzyme.scale.setScalar(enzymeScale);
    this.aibBranches.visible = engineering > .01;
    this.aibBranches.scale.setScalar(Math.max(.001, engineering));
    this.markerAib.visible = engineering > .01;
    this.markerArg.visible = engineering > .5;
    this.markerLys.visible = sidechain > .01;
    this.markerAib.scale.setScalar(.9 + .09 * Math.sin(time * 1.9));
    this.markerArg.scale.setScalar(.88);
    this.markerLys.scale.setScalar(.90 + .05 * Math.sin(time * 1.8));
    this.linker.visible = sidechain > .01;
    this.lipid.visible = sidechain > .15;
    // Geometry is revealed rather than grown as a real synthetic reaction.
    for(const part of [this.linker,this.lipid])part.traverse(object => {if(object instanceof T.Mesh){object.scale.setScalar(1);for(const material of Array.isArray(object.material)?object.material:[object.material]){material.opacity=sidechain;material.transparent=true;}}});
    this.albumin.visible = carrier > .005;
    this.albumin.position.set(.75 + .27 * (1 - bind), -.29, -.03);
    this.anchors.albumin.copy(this.albumin.position);
    this.albumin.rotation.z = -.12 + .06 * (1 - bind);
    this.albuminMaterials.forEach(material => {material.opacity = .2 * carrier;});
    this.pulseMaterials.forEach(material => {material.opacity = .13 * carrier;});
    this.halo.children.forEach((child, i) => {
      const mesh = child as T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>;
      const pulse = ((time * .10 + i * .27) % 1 + 1) % 1;
      mesh.material.opacity = ease(.75, .84, p) * Math.sin(pulse * Math.PI) * .10;
      mesh.scale.set(1 + pulse * .16, 1.05 + pulse * .16, 1);
    });
  }

  getLabels(): DrugDetailLabel[] {
    const p = this.currentProgress;
    const appear = (a: number, b: number) => ease(a, b, p);
    const fade = (a: number, b: number) => 1 - ease(a, b, p);
    const label = (id: string, text: string, color: string, opacity: number): DrugDetailLabel => {
      const point=this.anchors[id].clone();if(['native','cleavage','aib8','arg34','lys26'].includes(id))point.add(this.peptide.position.clone().sub(this.peptideOffset));
      return {id,text,position:point.toArray() as [number,number,number],color,opacity};
    };
    return [
      label('native', '天然 GLP-1', '#53918f', fade(.30, .36)),
      label('dpp4', 'DPP-4', '#a1bacb', fade(.29, .34)),
      label('cleavage', '切去两个残基', '#728f99', appear(.13, .18) * fade(.29, .35)),
      label('aib8', 'Aib8 · 抗酶切', '#8f6fb4', appear(.435, .47)),
      label('arg34', 'Lys34 → Arg34', '#d0a4c1', appear(.40, .48) * fade(.70, .80)),
      label('lys26', 'Lys26 连接位点', '#f0ce91', appear(.45, .53)),
      label('c18', 'C18 侧链', '#ba9448', appear(.54, .64)),
      label('albumin', '白蛋白 · 示意', '#6f97a7', appear(.62, .74)),
      label('persistence', '可逆结合', '#689793', appear(.74, .83)),
    ].filter(item => item.opacity > .01);
  }

  dispose(): void {
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
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
