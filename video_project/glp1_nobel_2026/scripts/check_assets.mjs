import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qa = path.join(root, 'research/qa');
fs.mkdirSync(qa, {recursive: true});
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/manifest.json'), 'utf8'));
const glbResults = [];
for (const [name, entry] of Object.entries(manifest.assets)) {
  const buffer = fs.readFileSync(path.join(root, 'public', entry.path));
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  let meshCount = 0, triangleCount = 0;
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    meshCount++;
    triangleCount += object.geometry.index.count / 3;
    for (const value of object.geometry.attributes.position.array) {
      if (!Number.isFinite(value)) throw new Error(`Nonfinite vertex in ${name}`);
    }
  });
  if (meshCount !== entry.meshCount || triangleCount !== entry.triangles) throw new Error(`${name}: topology counts differ`);
  const box = new T.Box3().setFromObject(gltf.scene);
  const bounds = [box.min.toArray(), box.max.toArray()];
  for (let end = 0; end < 2; end++) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(bounds[end][axis] - entry.bounds[end][axis]) > 1e-7) throw new Error(`${name}: bounds differ`);
  }
  glbResults.push({name, meshCount, triangleCount, bounds, gltfLoaderParse: 'passed'});
}

const source = fs.readFileSync(path.join(root, 'src/MolecularDetail.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const compiledPath = path.join(qa, 'MolecularDetail.check.mjs');
fs.writeFileSync(compiledPath, compiled);
globalThis.fetch = async () => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, 'public/molecules/glp1r.json'), 'utf8'))});
const {MolecularDetail} = await import(pathToFileURL(compiledPath).href);
const molecule = new MolecularDetail('');
await molecule.ready;
const molecularBounds = [];
for (const progress of [0, .25, .5, .75, 1]) {
  molecule.render(10, progress);
  const box = new T.Box3().setFromObject(molecule.root);
  molecularBounds.push({progress, min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new T.Vector3()).toArray()});
}
let vertices = 0, meshes = 0, instances = 0;
molecule.root.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  instances += object.isInstancedMesh ? object.count : 1;
  vertices += object.geometry.attributes.position.count;
  for (const value of object.geometry.attributes.position.array) if (!Number.isFinite(value)) throw new Error('Nonfinite molecule vertex');
});
molecule.root.position.set(1, 2, 3);
molecule.root.scale.setScalar(2);
molecule.root.rotation.set(.1, .2, .3);
const transform = [molecule.root.position.toArray(), molecule.root.scale.toArray(), molecule.root.rotation.toArray()];
molecule.render(55, .72);
if (JSON.stringify(transform) !== JSON.stringify([molecule.root.position.toArray(), molecule.root.scale.toArray(), molecule.root.rotation.toArray()])) throw new Error('render modified external root transform');
const result = {glbResults, molecular: {meshes, instances, vertices, bounds: molecularBounds,
  boundProteinBounds: molecule.root.userData.boundProteinBounds, rootTransformPreserved: true,
  ligandBoundCenter: molecule.root.userData.ligandBoundCenter}};
fs.writeFileSync(path.join(qa, 'asset-validation.json'), JSON.stringify(result, null, 2));
molecule.dispose();
console.log(JSON.stringify({glbsPassed: glbResults.length, molecular: result.molecular}, null, 2));
