import datetime, json, pathlib

BASE=pathlib.Path(__file__).parent
PROJECT=BASE.parent.parent
story=json.loads((PROJECT/'docs/story.json').read_text(encoding='utf-8'))
log=json.loads((BASE/'research-log.json').read_text(encoding='utf-8'))
legacy=json.loads((PROJECT/'research/revision-v3/evidence.json').read_text(encoding='utf-8'))
sources=[]
for source in log['retrievals']:
    if source['status']!='retrieved': continue
    sources.append({'id':source['id'],'title':source.get('title',''),'url':source['finalUrl'],'verification':'public-page-full-text-retrieved-and-relevant-passages-read-v4','localText':source['localText'],'retrievedUTC':source['retrievedUTC'],'sha256Text':source['sha256Text']})

old_ids=['cabrera2006','eec2022','huang2018','rorsman2018','receptor2017','muller2019','mojsov1987','drucker1987','nauck1986','knudsen2019','wegovy_pi']
for source in legacy['sources']:
    if source['id'] not in old_ids: continue
    sources.append({'id':source['id'],'title':source.get('title',''),'url':source.get('url',''),'doi':source.get('doi'),'verification':'inherited-v3-evidence-record-not-newly-refetched-or-full-reread-v4','originalRecord':'research/revision-v3/evidence.json','originalEvidenceFiles':source.get('localEvidenceFiles',[]),'readScopeNote':'V3 evidence had scoped full text/abstract verification. This V4 pass reviewed metadata and carried it forward; do not call all these papers newly read in V4.'})

sources.append({'id':'endotext_lipoprotein','title':'Introduction to Lipids and Lipoproteins','author':'Kenneth R Feingold','url':'https://www.endotext.org/wp-content/uploads/pdfs/introduction-to-lipids-and-lipoproteins.pdf','verification':'inherited-original-publisher-pdf-pages-4-7-14-15-actually-read-v4','localText':'endotext_lipoprotein-selected-pages.txt','localPdf':str((PROJECT/'../topology_optimization/research/hypertension/lipid-metabolism-Endotext.pdf').resolve()),'scope':'VLDL synthesis, fatty acid sources, triglyceride unloading, IDL hepatic uptake branch, LDL formation and hepatic receptor clearance; p4 also describes arterial retention and macrophage uptake. This is not a separately verified document titled Endotext atherogenesis.'})
sources.append({'id':'maaliki2022','title':'Pathophysiology and genetics of salt-sensitive hypertension','authors':'Maaliki D, Itani MM, Itani HA','year':2022,'doi':'10.3389/fphys.2022.1001434','url':'https://doi.org/10.3389/fphys.2022.1001434','verification':'inherited-original-pdf-pages-extracted-and-relevant-RAAS-SNS-paragraphs-read-v4','localText':'maaliki2022-selected-pages.txt','scope':'Salt sensitivity is multifactorial. Normally high salt suppresses circulating RAAS; renal SNS can increase renin, reduce renal perfusion and increase sodium reabsorption. Not a claim that every patient follows the same path.'})

aliases={
 'niddk_ir':['niddk_resistance'],
 'who_sodium':['who_healthy_diet','niddk_ckd'],
 'osinski2022':['eec2022'],
 'zhang2017':['receptor2017'],
 'aha_atherosclerosis':['nhlbi_atherosclerosis','nhlbi_atherosclerosis_causes'],
 'aha_stroke':['nhsa_stroke','nhlbi_stroke'],
 'aha_heartattack':['nhlbi_heart_attack'],
 'aha_home_bp':['nhlbi_bp_diagnosis'],
 'espen_geriatric':['niddk_older','who_activity_amount'],
 'endotext_atherogenesis':['endotext_lipoprotein','nhlbi_atherosclerosis_causes'],
}
substitution_notes={
 'aha_atherosclerosis':'AHA attempted and returned403. NHLBI official text read; do not publish attribution as AHA.',
 'aha_stroke':'AHA general heart/stroke page403. Used NHLBI symptoms plus Chinese National Healthcare Security Administration for local120.',
 'aha_heartattack':'AHA general heart/stroke page403. Used NHLBI original full text, emergency number localized to China120.',
 'aha_home_bp':'Exact AHA page not retrieved in this V4 pass; read NHLBI diagnosis page. Keep attribution NHLBI.',
 'espen_geriatric':'No exact ESPEN guideline was located/read in this pass; claims supported by NIDDK older-adult advice and WHO physical activity amount page. Do not list an ESPEN paper as verified.',
 'endotext_atherogenesis':'No separately identified Endotext atherogenesis chapter read. Use actually read Feingold lipoprotein PDF and NHLBI atherosclerosis causes.',
}
extras={
 'g038':['niddk_ckd','nhlbi_bp'],
 'g039':['maaliki2022'],
 'g040':['maaliki2022'],
 'g041':['maaliki2022'],
 'g054':['who_healthy_diet'],
 'g055':['niddk_ckd','who_lsss'],
 'g056':['niddk_older'],
 'g057':['niddk_older'],
 'g058':['who_activity_amount','niddk_older'],
 'g059':['nhlbi_sleepapnea'],
 'g062':['nhlbi_cholesterol'],
 'g063':['niddk_low_glucose'],
 'g065':['nhlbi_cholesterol'],
 'g067':['knudsen2019'],
 'g068':['wegovy_pi','niddk_older'],
 'g070':['nhsa_stroke','nhlbi_heart_attack'],
}

shots=[]
for shot in story['shots']:
    original=shot.get('sourceIds',[])
    resolved=[]
    for sid in original:
        resolved+=aliases.get(sid,[sid])
    resolved+=extras.get(shot['id'],[])
    resolved=list(dict.fromkeys(resolved))
    shots.append({'id':shot['id'],'originalSourceIds':original,'resolvedSourceIds':resolved})

known={s['id'] for s in sources}
missing=sorted({s for shot in shots for s in shot['resolvedSourceIds'] if s not in known})
out={'revision':'V4','createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'storyTitle':story['title'],'scope':'Source resolution for72-shot V4 script. Original aliases are not evidence citations unless resolved. New authoritative pages, old locally read PDF, and inherited prior V3 verification are explicitly distinguished.','sources':sources,'aliasResolution':aliases,'unverifiedOriginalsSubstituted':substitution_notes,'shotSourceMap':shots,'unresolvedCanonicalIds':missing,'importantVisualConditions':['GLP1 exits L cell basolaterally toward tissue/capillaries, not into intestinal lumen.','No whole blood/RBCs leak into nephron filtrate; keep RBCs in capillary.','High salt is not a universal activation trigger for circulating RAAS. Show low perfusion sensing as a separate condition.','Sympathetic pathway is not the vagus teaching path; use thoracolumbar spinal/paravertebral landmarks.','Cuff midpoint at heart level; supported arm, back and feet; no speech while measuring.','LDL-C lab concentration is not identical to LDL particle number.','Molecular tracers are not rendered to imply molecules physically as large as red cells.']}
(BASE/'evidence.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'sources':len(sources),'shots':len(shots),'unresolved':missing},ensure_ascii=True))
