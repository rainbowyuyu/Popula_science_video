import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { prepareCoordinate, sampleSigned, sampleEnvelope } from './StressField.audit.mjs';
export const clamp = (x) => Math.max(0, Math.min(1, x));
export const smooth = (x) => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const fromB = (v) => V(v[0], v[2], -v[1]);
const scalar = (points, t) => { if (t <= points[0][0])
    return points[0][1]; for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0])
        return mix(points[i - 1][1], points[i][1], smooth((t - points[i - 1][0]) / (points[i][0] - points[i - 1][0])));
} return points.at(-1)[1]; };
/** One repaired pavilion, always present. All frames are pure functions of time. */
export class JoineryWorld {
    renderer;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(34, 16 / 9, .035, 240);
    ready;
    environment;
    manifest;
    parts = new Map();
    pavilion = new T.Group();
    physics;
    staticData;
    inverseData;
    flowData;
    nodes = new Map();
    members = new Map();
    maxStress = 1;
    displayGain = 1;
    assemblyTravel = [];
    forceLines = [];
    arrows = [];
    flowLines = [];
    flowRoot = new T.Group();
    forces = new T.Group();
    woodGrain;
    constructor(canvas, base) {
        this.renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
        this.renderer.setSize(1920, 1080, false);
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.localClippingEnabled = true;
        this.scene.background = new T.Color('#eee7d8');
        this.scene.fog = new T.Fog('#eee7d8', 35, 95);
        const pm = new T.PMREMGenerator(this.renderer);
        this.environment = pm.fromScene(new RoomEnvironment(), .04);
        this.scene.environment = this.environment.texture;
        this.scene.environmentIntensity = .45;
        pm.dispose();
        this.scene.add(new T.HemisphereLight(0xfff2db, 0x78827a, 1.6));
        const key = new T.DirectionalLight(0xffebd2, 3.1);
        key.position.set(-5, 12, 7);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, { left: -17, right: 17, top: 20, bottom: -12, near: 1, far: 48 });
        key.shadow.normalBias = .012;
        key.shadow.bias = -.00015;
        key.shadow.radius = 5;
        this.scene.add(key);
        const fill = new T.DirectionalLight(0xe4eeef, 1.25);
        fill.position.set(8, 6, -8);
        this.scene.add(fill);
        const floor = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshStandardMaterial({ color: 0xe5ddcc, roughness: .91 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = .02;
        floor.receiveShadow = true;
        this.scene.add(floor, this.pavilion, this.flowRoot, this.forces);
        this.woodGrain = this.grain();
        const json = async (p) => { const r = await fetch(base + p); if (!r.ok)
            throw Error(`Missing required verified asset: ${p}`); return r.json(); };
        this.ready = Promise.all([json('models/pavilion-manifest.json'), json('physics/dynamic-response.json'), json('physics/static-cases.json'), json('physics/inverse-diffusion.json'), json('physics/flow.json'), json('physics/flow-central.json')]).then(async ([manifest, physics, stat, inverse, flow, central]) => {
            this.manifest = manifest;
            this.physics = physics;
            this.staticData = stat;
            this.inverseData = inverse;
            this.flowData = { slices: [flow, central] };
            const gltf = await new GLTFLoader().loadAsync(base + 'models/' + (manifest.glb ?? 'pavilion-v7.glb'));
            gltf.scene.updateMatrixWorld(true);
            for (const part of manifest.parts) {
                const source = gltf.scene.getObjectByName(part.id);
                if (!source)
                    throw Error(`Pavilion part missing: ${part.id}`);
                if (!part.assembly_keys?.length)
                    throw Error(`Assembly path missing: ${part.id}`);
                const root = new T.Group();
                root.name = part.id;
                this.pavilion.add(root);
                const meshes = [], vertices = [];
                source.traverse(o => {
                    if (!(o instanceof T.Mesh))
                        return;
                    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
                    const attrs = geo.getAttribute('position');
                    vertices.push(new Float32Array(attrs.array));
                    const sourceMat = Array.isArray(o.material) ? o.material[0] : o.material;
                    const mat = sourceMat.clone();
                    mat.roughness = Math.max(.36, mat.roughness);
                    mat.metalness = Math.min(.3, mat.metalness);
                    // Blender's procedural nodes do not export to glTF. Restore the same
                    // warm timber palette explicitly and keep the grain in this renderer.
                    if (/wood|cedar|fir|tenon|oak/i.test(mat.name)) {
                        if (!mat.map) {
                            mat.color.set(part.role === 'peg' ? '#c08a50' : '#a97243');
                            mat.map = this.woodGrain;
                        }
                        mat.roughness = .53;
                    }
                    mat.userData.baseColor = mat.color.clone();
                    mat.userData.physicsMapBlend = { value: 0 };
                    mat.onBeforeCompile = shader => { shader.uniforms.physicsMapBlend = mat.userData.physicsMapBlend; shader.fragmentShader = 'uniform float physicsMapBlend;\n' + shader.fragmentShader; shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= vec4(mix(sampledDiffuseColor.rgb, vec3(1.0), physicsMapBlend), sampledDiffuseColor.a);')); };
                    mat.customProgramCacheKey = () => 'rainbow-wood-to-physics-v7';
                    const colors = new Float32Array(attrs.count * 3);
                    colors.fill(1);
                    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
                    mat.vertexColors = true;
                    const mesh = new T.Mesh(geo, mat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    root.add(mesh);
                    meshes.push(mesh);
                });
                if (!meshes.length)
                    throw Error(`Part contains no geometry: ${part.id}`);
                const centroid = new T.Box3().setFromObject(root).getCenter(V());
                this.parts.set(part.id, { info: part, root, meshes, base: vertices, centroid, offset: V(), nodeWeights: [], stressCoordinates: [] });
            }
            for (const n of physics.nodes)
                this.nodes.set(String(n.id), fromB(n.xyz));
            for (const m of physics.members) {
                const list = this.members.get(m.part_id) ?? [];
                list.push(m);
                this.members.set(m.part_id, list);
            }
            const snapshots = [...physics.snapshots, ...Object.values(stat.cases ?? {}).map((c) => c.response).filter(Boolean)];
            this.maxStress = Math.max(1, ...snapshots.flatMap(s => Object.values(s.members).map(m => m.sigmaMaxAbsPa)));
            const maxU = Math.max(1e-8, ...physics.snapshots.flatMap((s) => Object.values(s.nodalDisplacements).map(u => fromB(u).length())));
            this.displayGain = Math.max(1, Math.min(250, .14 / maxU));
            this.prepareWeights();
            this.prepareTravel();
            this.buildForces();
            this.buildFlow();
        });
    }
    grain() { const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512; const ctx = canvas.getContext('2d'), im = ctx.createImageData(256, 512); for (let y = 0; y < 512; y++)
        for (let x = 0; x < 256; x++) {
            const v = 235 + 7 * Math.sin(x * .5 + 2 * Math.sin(y * .01)) + 3 * Math.sin(x * 2.4 + y * .02);
            im.data.set([v, v - 5, v - 12, 255], (y * 256 + x) * 4);
        } ctx.putImageData(im, 0, 0); const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 8; return texture; }
    offset(info, q) { const keys = info.assembly_keys; if (q <= keys[0].t)
        return V(...keys[0].offset_three); for (let i = 1; i < keys.length; i++) {
        if (q <= keys[i].t) {
            const a = keys[i - 1], b = keys[i], t = smooth((q - a.t) / Math.max(1e-6, b.t - a.t));
            return V(...a.offset_three).lerp(V(...b.offset_three), t);
        }
    } return V(...keys.at(-1).offset_three); }
    prepareWeights() {
        for (const part of this.parts.values()) {
            const mem = this.members.get(part.info.id) ?? [];
            part.nodeWeights = part.base.map(base => {
                const result = [], coordinates = [];
                for (let i = 0; i < base.length; i += 3) {
                    const p = V(base[i], base[i + 1], base[i + 2]);
                    let best = Infinity, weights = [], coordinate = undefined;
                    for (const m of mem) {
                        const a = this.nodes.get(String(m.nodes[0])), b = this.nodes.get(String(m.nodes[1])), ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq()), dist = p.distanceToSquared(a.clone().addScaledVector(ab, t));
                        if (dist < best) {
                            best = dist;
                            weights = [{ node: String(m.nodes[0]), weight: 1 - t }, { node: String(m.nodes[1]), weight: t }];
                            coordinate = prepareCoordinate(m, [[a.x, -a.z, a.y], [b.x, -b.z, b.y]], p);
                        }
                    }
                    // Roof panels and non-beam fittings follow nearest solved nodes; their
                    // visual displacement is labelled interpolation, never an extra FE solve.
                    if (!weights.length) {
                        const nearest = [...this.nodes].map(([node, pos]) => ({ node, dist: p.distanceToSquared(pos) })).sort((a, b) => a.dist - b.dist).slice(0, 3);
                        const sum = nearest.reduce((s, n) => s + 1 / (n.dist + .01), 0);
                        weights = nearest.map(n => ({ node: n.node, weight: 1 / (n.dist + .01) / sum }));
                    }
                    result.push(weights);
                    coordinates.push(coordinate);
                }
                part.stressCoordinates.push(coordinates);
                return result;
            });
        }
    }
    prepareTravel() {
        const count = 2000;
        this.assemblyTravel = [0];
        let previous = [...this.parts.values()].map(p => this.offset(p.info, 0));
        for (let i = 1; i <= count; i++) {
            const current = [...this.parts.values()].map(p => this.offset(p.info, i / count));
            const delta = Math.max(.00005, ...current.map((p, k) => p.distanceTo(previous[k])));
            this.assemblyTravel.push(this.assemblyTravel[i - 1] + delta);
            previous = current;
        }
    }
    travelAt(q) { const n = clamp(q) * 2000, i = Math.floor(n); return mix(this.assemblyTravel[i], this.assemblyTravel[Math.min(i + 1, 2000)], n - i); }
    travelMix(a, b, t) { const distance = mix(this.travelAt(a), this.travelAt(b), t); let lo = 0, hi = 2000; while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (this.assemblyTravel[mid] < distance)
            lo = mid;
        else
            hi = mid;
    } return (lo + (distance - this.assemblyTravel[lo]) / (this.assemblyTravel[hi] - this.assemblyTravel[lo])) / 2000; }
    assemblyCurve(points, t) { if (t <= points[0][0])
        return points[0][1]; for (let i = 1; i < points.length; i++)
        if (t <= points[i][0])
            return this.travelMix(points[i - 1][1], points[i][1], smooth((t - points[i - 1][0]) / (points[i][0] - points[i - 1][0]))); return points.at(-1)[1]; }
    demo(name) { const d = this.manifest.demonstrations[name]; if (!d)
        throw Error(`Camera requires verified demonstration: ${name}`); return d; }
    pose(scene, p, elapsed, line, lineProgress = 1) {
        let q = 1, target = V(0, 2.65, 0), az = .66 - .23 * p, el = .35, dist = 14.7, heat = 0, deform = 0, flow = 0, force = 0, cut = 0, inverse = 0, sim = p;
        if (scene === 'intro') {
            q = this.assemblyCurve([[0, 1], [.075, 1], [.27, .32], [.38, .32], [.58, 1], [.76, 1], [1, .32]], p);
            const cameraQ = scalar([[0, 1], [.075, 1], [.27, .32], [.38, .32], [.58, 1], [.76, 1], [1, .32]], p);
            target.y = mix(2.65, 5.2, 1 - cameraQ);
            dist = mix(14.7, 29.7, 1 - cameraQ);
            az = .65 - .36 * p;
        }
        if (['straight', 'frame', 'bracket', 'hip'].includes(scene)) {
            const d = this.demo(scene);
            const a = d.assembly_window[0], b = d.assembly_window[1];
            const u = line + lineProgress;
            if (scene === 'straight')
                q = this.assemblyCurve([[0, a], [1, a], [2, .23], [3.3, .23], [4, a], [5, .23], [5.8, b], [6, b], [6.35, .23], [7, a]], u);
            if (scene === 'frame')
                q = this.assemblyCurve([[0, a], [1, a], [2, .45], [4, .45], [5, b]], u);
            if (scene === 'bracket')
                q = this.assemblyCurve([[0, a], [1, a], [2, b], [3, b], [3.65, .605], [4, .605], [5, b]], u);
            if (scene === 'hip')
                q = this.assemblyCurve([[0, b], [1, .87], [1.8, .893], [2, .893], [2.32, .869], [2.84, .893], [3, .893], [4, 1]], u);
            target = V(...d.focus_three);
            const anchorId = scene === 'bracket' ? 'POST_FL' : scene === 'hip' ? 'SUPPORT_X' : d.anchor_part;
            const anchor = this.parts.get(anchorId);
            if (!anchor)
                throw Error(`Focus anchor missing ${anchorId}`);
            target.add(this.offset(anchor.info, q));
            az = { straight: -.66, frame: .63, bracket: .04, hip: .63 }[scene] + .38 * Math.sin((p - .5) * Math.PI);
            dist = scene === 'frame' ? 9.4 : scene === 'hip' ? 4.2 : scene === 'bracket' ? 2.9 : 3.7;
            el = scene === 'hip' ? .53 : scene === 'bracket' ? .28 : .2;
            if (scene === 'bracket') {
                az = .04 + .23 * Math.sin((p - .5) * Math.PI);
                const cameraQ = scalar([[0, a], [1, a], [2, b], [3, b], [3.65, .605], [4, .605], [5, b]], u), exploded = clamp((.66 - cameraQ) / .14);
                target.y += 1.2 * exploded;
                dist += 3.2 * exploded;
            }
            if (scene === 'frame') {
                const close = scalar([[0, 0], [1.9, 0], [2.25, 1], [3.8, 1], [4.25, 0], [5, 0]], u);
                dist = mix(9.4, 4.2, close);
                cut = .58 * close;
            }
            if (scene === 'hip') {
                const wide = smooth(clamp(u - 3));
                dist = mix(4.2, 14.7, wide);
                target.lerp(V(0, 2.65, 0), wide);
            }
            if (scene === 'straight') {
                const detail = scalar([[0, 0], [4.8, 0], [5.25, 1], [6.35, 1], [7, 0]], u);
                dist = mix(dist, 1.8, detail);
                const peg = this.parts.get('PEG_X_FL');
                target.lerp(peg.centroid.clone().add(this.offset(this.parts.get('POST_FL').info, q)), detail);
            }
            if (scene === 'straight')
                cut = scalar([[0, 0], [.38, 0], [.46, .72], [.62, .72], [.75, 0], [1, 0]], p);
        }
        if (scene === 'assembly') {
            const assemblyProgress = clamp((elapsed - 7) / 18);
            q = this.assemblyCurve([[0, 0], [.89, 1], [1, 1]], assemblyProgress);
            dist = mix(25.5, 14.6, smooth(p));
            target.y = mix(4.65, 2.65, smooth(p));
            az = .82 - .78 * p;
            el = .32;
        }
        if (scene === 'gravity') {
            const u = line + lineProgress;
            force = scalar([[0, 0], [.7, 1], [2.1, 1], [2.6, 0], [3.15, 0], [3.6, 1], [4.8, 1], [6, 0]], u);
            heat = scalar([[0, 0], [1.9, 0], [2.3, 1], [4.7, 1], [6, 0]], u);
            target = V(scalar([[0, 0], [1, -.45], [2, -.3], [2.9, -.3], [3.4, -1.35], [4, -1.35], [4.7, -.2], [6, 0]], u), scalar([[0, 2.65], [1, 4.1], [2.35, 3.1], [3.5, 3.05], [4.5, 1.6], [6, 2.65]], u), scalar([[0, 0], [1, .55], [2.2, 1.5], [4, 1.5], [6, 0]], u));
            dist = scalar([[0, 14.7], [1, 11], [2.35, 5.6], [3.5, 4.8], [4.5, 9.5], [6, 14.7]], u);
            az = scalar([[0, .5], [2, .2], [3.5, -.55], [5, .4], [6, .47]], u);
            el = scalar([[0, .28], [2.2, .08], [4, .13], [6, .3]], u);
        }
        if (scene === 'wind') {
            const u = line + lineProgress;
            heat = scalar([[0, 0], [3, 0], [4, 1], [6.5, 1], [7, 0]], u);
            deform = heat;
            flow = scalar([[0, 0], [.5, 1], [2.6, 1], [3.8, 0], [7, 0]], u);
            dist = 15;
            az = .62 - .44 * p;
            el = .28;
            target = V(0, 2.65, 0);
        }
        if (scene === 'inverse') {
            inverse = scalar([[0, 0], [.1, 1], [.92, 1], [1, 0]], p);
            q = this.assemblyCurve([[0, 1], [.55, 1], [.72, .947], [.92, .947], [1, 1]], p);
            heat = scalar([[0, 0], [.64, 0], [.76, 1], [.9, 1], [1, 0]], p);
            deform = heat;
            dist = 12.8;
            el = .45;
            az = .17 + .45 * p;
            target = V(0, 3.2, 0);
        }
        if (scene === 'return') {
            az = .6 + .32 * p;
            dist = 14.7;
            target = V(0, 2.65, 0);
        }
        if (scene === 'references') {
            az = .92;
            target = V(-13, 2.65, 0);
            dist = 14.7;
        }
        const position = target.clone().add(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
        if (!['straight', 'frame', 'bracket', 'hip'].includes(scene))
            target.add(V(-.25, .12, 0));
        return { q, position, target, heat, deform, flow, force, cut, inverse, sim };
    }
    blendedPose(s) {
        const pose = this.pose(s.scene, s.progress, s.elapsed, s.line, s.lineProgress), travelDuration = s.scene === 'assembly' ? 7 : 4;
        if (!s.previous || s.elapsed >= travelDuration)
            return pose;
        const prev = this.pose(s.previous, 1, 100, 99), a = smooth(s.elapsed / 4), travel = smooth(s.elapsed / travelDuration);
        const result = { ...pose, position: prev.position.clone().lerp(pose.position, a), target: prev.target.clone().lerp(pose.target, a) };
        for (const key of ['heat', 'deform', 'flow', 'force', 'cut', 'inverse', 'sim'])
            result[key] = mix(prev[key], pose[key], a);
        result.q = this.travelMix(prev.q, pose.q, travel);
        return result;
    }
    response(s) {
        if (s.scene === 'wind') {
            const frames = this.physics.snapshots, t = clamp((s.line + s.lineProgress - 3) / 3.8) * (frames.length - 1), i = Math.floor(t);
            return { a: frames[i], b: frames[Math.min(i + 1, frames.length - 1)], t: t - i };
        }
        if (s.scene === 'inverse') {
            const a = this.inverseData.true_native_result.response, b = this.inverseData.recovered_native_result.response;
            return { a: a, b: b, t: smooth(clamp((s.progress - .5) / .32)) };
        }
        const cases = this.staticData.cases;
        const gravity = cases.gravity?.response ?? cases.dead?.response ?? Object.values(cases).map((x) => x.response)[0];
        if (!gravity)
            throw Error('No actual gravity solve');
        return { a: gravity, b: gravity, t: 0 };
    }
    displacement(weights, a, b, t) { const result = V(); for (const w of weights) {
        const u = a.nodalDisplacements[w.node], v = b.nodalDisplacements[w.node];
        if (u && v)
            result.addScaledVector(fromB(u).lerp(fromB(v), t), w.weight);
    } return result; }
    heatColor(value) { const q = clamp(value / this.maxStress), cold = new T.Color('#4b8f99'), mid = new T.Color('#e7d5a4'), hot = new T.Color('#bd4c39'); return q < .48 ? cold.lerp(mid, q / .48) : mid.lerp(hot, (q - .48) / .52); }
    buildForces() {
        for (const m of this.physics.members) {
            const a = this.nodes.get(String(m.nodes[0])), b = this.nodes.get(String(m.nodes[1])), g = new T.BufferGeometry().setFromPoints([a, b]), mat = new T.LineBasicMaterial({ color: 0xc25a3b, transparent: true, opacity: 0, depthTest: false });
            const line = new T.Line(g, mat);
            line.renderOrder = 5;
            this.forces.add(line);
            const dot = new T.Mesh(new T.SphereGeometry(.045, 10, 8), new T.MeshBasicMaterial({ color: 0xca693e, transparent: true, opacity: 0, depthTest: false }));
            dot.renderOrder = 6;
            this.forces.add(dot);
            this.forceLines.push({ line, member: m, dot });
        }
        for (const [id, node] of this.nodes) {
            if (node.y < .6) {
                const arrow = new T.ArrowHelper(V(0, 1, 0), node.clone(), .01, 0x3d857c, .13, .06);
                this.forces.add(arrow);
                this.arrows.push(arrow);
            }
        }
    }
    buildFlow() {
        // Flow paths are integrated in the offline solver. No decorative sine curves.
        this.flowData.slices.forEach((slice, plane) => {
            const paths = (slice.streamlines ?? []).filter((path, i) => i % 2 === 0 && path.some(p => p[1] < 7 && p[1] > .3));
            if (!paths.length)
                throw Error('Actual flow solver streamlines missing');
            paths.forEach((path, i) => {
                for (const z of [-slice.plane_y_m]) {
                    const points = path.map(v => V(v[0], v[1], z));
                    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x5f9697, transparent: true, opacity: 0, depthWrite: false }));
                    line.userData.plane = plane;
                    line.frustumCulled = false;
                    this.flowRoot.add(line);
                    const dot = new T.Mesh(new T.SphereGeometry(.032, 8, 6), new T.MeshBasicMaterial({ color: 0x347e87, transparent: true, opacity: 0 }));
                    this.flowRoot.add(dot);
                    this.flowLines.push({ line, points, dot, seed: i * .073 + z * .03 });
                }
            });
        });
    }
    render(s) {
        if (!this.manifest)
            return;
        const p = this.blendedPose(s), r = this.response(s), signedMix = s.scene === 'gravity' ? scalar([[0, 0], [1.9, 0], [2.3, 1], [2.8, 1], [3.15, 0], [6, 0]], s.line + s.lineProgress) : 0;
        const frameDisplacement = new Map();
        if (p.deform > 0)
            for (const [id] of this.nodes) {
                const a = r.a.nodalDisplacements[id], b = r.b.nodalDisplacements[id];
                frameDisplacement.set(id, [mix(a[0], b[0], r.t), mix(a[2], b[2], r.t), -mix(a[1], b[1], r.t)]);
            }
        this.camera.position.copy(p.position);
        this.camera.lookAt(p.target);
        this.camera.updateMatrixWorld(true);
        for (const part of this.parts.values()) {
            const partQ = s.scene === 'hip' && s.line === 2 && part.info.id.startsWith('HIP_') && part.info.id !== 'HIP_FL' ? .893 : p.q;
            part.offset.copy(this.offset(part.info, partQ));
            part.root.position.copy(part.offset);
            const stressA = r.a.members[part.info.id]?.sigmaMaxAbsPa, stressB = r.b.members[part.info.id]?.sigmaMaxAbsPa;
            const stress = stressA === undefined ? undefined : mix(stressA, stressB ?? stressA, r.t);
            part.meshes.forEach((mesh, k) => {
                const material = mesh.material, base = material.userData.baseColor;
                material.color.copy(base);
                const localHeat = p.heat * (part.info.id === 'CROSS_FRONT' ? 1 : 1 - signedMix);
                material.userData.physicsMapBlend.value = stress !== undefined ? localHeat : 0;
                if (stress !== undefined && localHeat > 0) {
                    mesh.userData.hadHeat = true;
                    material.color.setRGB(1, 1, 1);
                    const colors = mesh.geometry.getAttribute('color');
                    const signedScale = this.staticData.cases.gravity.response.members.CROSS_FRONT.sigmaMaxAbsPa;
                    for (let i = 0; i < colors.count; i++) {
                        const coordinate = part.stressCoordinates[k][i];
                        let color = base.clone();
                        if (coordinate && localHeat > 0) {
                            const a = sampleEnvelope(r.a, coordinate), b = sampleEnvelope(r.b, coordinate);
                            if (a !== undefined) {
                                const envelope = this.heatColor(mix(a, b ?? a, r.t));
                                if (signedMix > 0 && part.info.id === 'CROSS_FRONT') {
                                    const signed = sampleSigned(r.a, coordinate);
                                    if (signed !== undefined) {
                                        const c = new T.Color('#ece4cc'), amp = clamp(Math.abs(signed) / signedScale);
                                        c.lerp(new T.Color(signed < 0 ? '#347f91' : '#bd4c39'), amp);
                                        envelope.lerp(c, signedMix);
                                    }
                                }
                                color.lerp(envelope, localHeat);
                            }
                        }
                        colors.setXYZ(i, color.r, color.g, color.b);
                    }
                    colors.needsUpdate = true;
                }
                else if (mesh.userData.hadHeat) {
                    const colors = mesh.geometry.getAttribute('color');
                    colors.array.fill(1);
                    colors.needsUpdate = true;
                    mesh.userData.hadHeat = false;
                }
                const pressureID = part.info.id.replace(/^TILE_/, 'DECK_');
                if (p.inverse > 0 && this.inverseData.panel_ids?.includes(pressureID)) {
                    const index = this.inverseData.panel_ids.indexOf(pressureID);
                    const truth = this.inverseData.pressure_truth_Cp;
                    const estimate = this.inverseData.pressure_recovered_Cp;
                    if (truth && estimate) {
                        let value = mix(truth[index], estimate[index], smooth(clamp((s.progress - .5) / .35)));
                        const steps = this.inverseData.diffusion_snapshots;
                        if (s.progress > .22 && s.progress < .52 && steps?.length) {
                            const j = clamp((s.progress - .22) / .3) * (steps.length - 1), i = Math.floor(j);
                            value = mix(steps[i].Cp[index], steps[Math.min(i + 1, steps.length - 1)].Cp[index], j - i);
                        }
                        const c = new T.Color('#468a98').lerp(new T.Color('#bd563d'), clamp((value + .65) / 1.3));
                        material.color.lerp(c, p.inverse);
                        material.userData.physicsMapBlend.value = p.inverse;
                    }
                }
                const post = part.info.id === 'POST_FL';
                material.transparent = post && p.cut > .001;
                const roof = /^(TILE_|DECK_)/.test(part.info.id), roofCut = roof && ['gravity', 'wind'].includes(s.scene) ? p.heat * .84 : 0;
                material.opacity = post ? 1 - p.cut * .75 : 1 - roofCut;
                material.transparent = material.opacity < .999;
                material.depthWrite = material.opacity > .95;
                const pos = mesh.geometry.getAttribute('position'), original = part.base[k];
                if (p.deform > 0) {
                    const gain = p.deform * this.displayGain;
                    for (let i = 0; i < pos.count; i++) {
                        let x = 0, y = 0, z = 0;
                        for (const w of part.nodeWeights[k][i]) {
                            const d = frameDisplacement.get(w.node);
                            x += d[0] * w.weight;
                            y += d[1] * w.weight;
                            z += d[2] * w.weight;
                        }
                        pos.setXYZ(i, original[i * 3] + x * gain, original[i * 3 + 1] + y * gain, original[i * 3 + 2] + z * gain);
                    }
                    pos.needsUpdate = true;
                    mesh.userData.deformed = true;
                    mesh.geometry.computeBoundingSphere();
                }
                else if (mesh.userData.deformed) {
                    pos.array.set(original);
                    pos.needsUpdate = true;
                    mesh.userData.deformed = false;
                    mesh.geometry.computeBoundingSphere();
                }
                // Beam section fields are interpolated onto the mesh; mortise contact stress is not solved.
            });
        }
        for (const f of this.forceLines) {
            const a = this.nodes.get(String(f.member.nodes[0])), b = this.nodes.get(String(f.member.nodes[1])), part = this.parts.get(f.member.part_id), off = part?.offset ?? V();
            const top = a.y > b.y ? a : b, bottom = a.y > b.y ? b : a;
            const selected = /POST_FL|CROSS_FRONT|BRACKET_FL|DOU_FL|GONG_.*FL|HIP_FL|RAF_0_05|SUPPORT_X|CENTRE_POST|HUB/.test(f.member.part_id);
            const mat = f.line.material;
            mat.opacity = p.force * (selected ? .68 : 0);
            f.line.geometry.setFromPoints([a.clone().add(off), b.clone().add(off)]);
            const phase = (s.time * .24 + Math.max(a.y, b.y) * .16) % 1;
            f.dot.position.copy(top).lerp(bottom, phase).add(off);
            f.dot.material.opacity = p.force * (selected ? .9 : 0);
        }
        this.arrows.forEach(a => { a.setLength(Math.max(.00001, .52 * p.force), .14 * p.force, .06 * p.force); });
        for (const f of this.flowLines) {
            const phase = ((s.time * .09 + f.seed) % 1 + 1) % 1;
            const index = clamp(phase) * (f.points.length - 1), i = Math.floor(index);
            f.dot.position.copy(f.points[i]).lerp(f.points[Math.min(i + 1, f.points.length - 1)], index - i);
            const central = smooth(clamp((s.progress - .16) / .13)), weight = f.line.userData.plane === 1 ? central : 1 - central;
            f.line.material.opacity = p.flow * .4 * weight;
            f.dot.material.opacity = p.flow * .85 * weight;
        }
        this.renderer.render(this.scene, this.camera);
    }
    dispose() { this.scene.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) {
        o.geometry.dispose();
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach(x => x.dispose());
    } }); this.woodGrain.dispose(); this.environment.dispose(); this.renderer.dispose(); }
}
