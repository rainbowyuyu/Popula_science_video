from pathlib import Path

root = Path(__file__).resolve().parents[3]
s = (root / 'src/DrugDetail.ts').read_text(encoding='utf-8')
s = s.replace('  private readonly departingNative = new T.Group();\n  private nativeResidues: T.Mesh[] = [];\n  private nativeBonds: T.Mesh[] = [];\n', '')
s = s.replace("new T.Color('#579b99')", "new T.Color('#88c9c6')").replace("new T.Color('#b48c45')", "new T.Color('#e4bd73')")
s = s.replace('this.peptide, this.departingNative, this.enzyme', 'this.peptide, this.enzyme')
a = s.index('    // A separate, already-cleaved native molecule')
b = s.index('    this.buildDpp4();', a)
s = s[:a] + s[b:]
a = s.index('    // V5 has two spoken shots:')
b = s.index('    this.residues.forEach', a)
s = s[:a] + '''    // The cleaved native peptide leaves the field before a newly designed
    // molecule enters. Never reverse an irreversible DPP-4 cleavage on screen.
    const cut = p < .355 ? ease(.17, .29, p) : 0;
    this.peptide.position.copy(this.peptideOffset);
    this.peptide.position.x += p < .355 ? -5.6 * ease(.330,.355,p) : 5.6 * (1-ease(.355,.385,p));
    const engineering = ease(.34, .49, p);
    const sidechain = ease(.54, .64, p);
    const carrier = ease(.62, .74, p);
    const bind = ease(.66, .79, p);
''' + s[b:]
s = s.replace('this.enzyme.visible = p < .615;', 'this.enzyme.visible = p < .355;')
s = s.replace('ease(.10, .25, p) * .38', 'ease(.12, .20, p) * .38').replace('this.enzyme.position.x -= 9 * handoff;', 'this.enzyme.position.x -= 5.6 * ease(.330,.355,p);')
s = s.replace('ease(.82, .90, p)', 'ease(.75, .84, p)')
a = s.index("      label('native'")
b = s.index('    ].filter', a)
s = s[:a] + '''      label('native', '天然 GLP-1', '#53918f', fade(.30, .36)),
      label('dpp4', 'DPP-4', '#a1bacb', fade(.29, .34)),
      label('cleavage', '切去两个残基', '#728f99', appear(.13, .18) * fade(.29, .35)),
      label('aib8', 'Aib8 · 抗酶切', '#8f6fb4', appear(.435, .47)),
      label('arg34', 'Lys34 → Arg34', '#d0a4c1', appear(.40, .48) * fade(.70, .80)),
      label('lys26', 'Lys26 连接位点', '#f0ce91', appear(.45, .53)),
      label('c18', 'C18 侧链', '#ba9448', appear(.54, .64)),
      label('albumin', '白蛋白 · 示意', '#6f97a7', appear(.62, .74)),
      label('persistence', '可逆结合', '#689793', appear(.74, .83)),
''' + s[b:]
(root / 'research/revision-v5/patches/base-source/DrugDetail.ts').write_text(s, encoding='utf-8', newline='\r\n')
