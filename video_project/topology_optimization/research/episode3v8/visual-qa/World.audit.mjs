// src/episode3v8/World.ts
import * as T2 from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// src/episode3v7/StressField.ts
var clamp = (v) => Math.max(0, Math.min(1, v));
var dot = (a2, b) => a2[0] * b[0] + a2[1] * b[1] + a2[2] * b[2];
var cross = (a2, b) => [
  a2[1] * b[2] - a2[2] * b[1],
  a2[2] * b[0] - a2[0] * b[2],
  a2[0] * b[1] - a2[1] * b[0]
];
var subtract = (a2, b) => [a2[0] - b[0], a2[1] - b[1], a2[2] - b[2]];
var length = (a2) => Math.hypot(a2[0], a2[1], a2[2]);
var unit = (a2) => {
  const n = length(a2);
  if (n < 1e-12) throw new Error("StressField: degenerate local axis");
  return [a2[0] / n, a2[1] / n, a2[2] / n];
};
var tuple = (v) => {
  const a2 = "x" in v ? [v.x, v.y, v.z] : [v[0], v[1], v[2]];
  if (a2.some((q) => !Number.isFinite(q))) throw new Error("StressField: non-finite coordinate");
  return a2;
};
function prepareCoordinate(member, nodeEndpointsBlender, vertexThree) {
  const a2 = tuple(nodeEndpointsBlender[0]), b = tuple(nodeEndpointsBlender[1]);
  const ab = subtract(b, a2), L = length(ab), axisX = unit(ab);
  let roll = tuple(member.roll_vec ?? [0, 0, 1]);
  if (length(cross(axisX, roll)) < 1e-8) roll = [0, 1, 0];
  const axisY = unit(cross(roll, axisX)), axisZ = unit(cross(axisX, axisY));
  const v = tuple(vertexThree);
  const p = [v[0], -v[2], v[1]], relative = subtract(p, a2);
  const rawS = dot(relative, axisX) / L, s = clamp(rawS);
  const localY = dot(relative, axisY), localZ = dot(relative, axisZ);
  const width = member.section.b, height = member.section.h;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    throw new Error("StressField: positive rectangular b/h section required");
  const area = width * height, iy = width * height ** 3 / 12, iz = height * width ** 3 / 12;
  const tolerance = 1e-5;
  const within = Math.abs(localY) <= width / 2 + tolerance && Math.abs(localZ) <= height / 2 + tolerance;
  const alongOutside = (rawS - s) * L;
  return {
    element: member.id,
    partId: member.part_id,
    s,
    rawS,
    localY,
    localZ,
    axisXBlender: axisX,
    axisYBlender: axisY,
    axisZBlender: axisZ,
    distanceToAxisSq: localY * localY + localZ * localZ + alongOutside * alongOutside,
    withinGrossSection: within,
    axialCoordinateClamped: rawS !== s,
    areaM2: area,
    iyM4: iy,
    izM4: iz,
    nCoefficient: 1 / area,
    myCoefficient: localZ / iy,
    mzCoefficient: -localY / iz
  };
}
var elementCache = /* @__PURE__ */ new WeakMap();
function elementResponse(response, coord) {
  if ("elementID" in response) return response.elementID === coord.element ? response : void 0;
  let map = elementCache.get(response);
  if (!map) {
    map = /* @__PURE__ */ new Map();
    const parts = "members" in response ? Object.values(response.members) : [response];
    for (const part of parts) for (const element of part.elementResults) map.set(element.elementID, element);
    elementCache.set(response, map);
  }
  return map.get(coord.element);
}
function sampleSigned(response, coord) {
  if (!coord.withinGrossSection) return void 0;
  const f = elementResponse(response, coord)?.localEndForces;
  if (!f || f.length !== 12) return void 0;
  const u = 1 - coord.s, s = coord.s;
  const N = -u * f[0] + s * f[6], My = -u * f[4] + s * f[10], Mz = -u * f[5] + s * f[11];
  const stress = N * coord.nCoefficient + My * coord.myCoefficient + Mz * coord.mzCoefficient;
  return Number.isFinite(stress) ? stress : void 0;
}
function sampleEnvelope(response, coord) {
  const samples = elementResponse(response, coord)?.sectionSamples;
  if (!samples?.length) return void 0;
  const amplitude = (sample) => Math.max(Math.abs(sample.normalMinPa), Math.abs(sample.normalMaxPa));
  if (coord.s <= samples[0].s) return amplitude(samples[0]);
  for (let i = 1; i < samples.length; i++) if (coord.s <= samples[i].s) {
    const a2 = samples[i - 1], b = samples[i], span = b.s - a2.s;
    if (!(span > 0)) return void 0;
    const t = (coord.s - a2.s) / span;
    return amplitude(a2) * (1 - t) + amplitude(b) * t;
  }
  return amplitude(samples[samples.length - 1]);
}

// src/episode3v8/ForceStory.ts
var a = (partID, x, y, z) => ({ partID, point: [x, y, z] });
var GRAVITY_ROUTES = [
  { id: "tile-board", start: 1, end: 2.8, contact: true, points: [a("TILE_LEFT", -1.04, 4.59, 0.528), a("DECK_LEFT", -1.04, 4.57, 0.528)] },
  { id: "board-rafter", start: 2, end: 3.8, contact: true, points: [a("DECK_LEFT", -1.04, 4.55, 0.528), a("RAF_3_03", -1.04, 4.536, 0.528)] },
  { id: "rafter-run", start: 2.3, end: 4, points: [a("RAF_3_03", -0.78, 4.692, 0.528), a("RAF_3_03", -1.15, 4.47, 0.528), a("RAF_3_03", -1.5, 4.26, 0.528)] },
  { id: "birdsmouth-seat", start: 3, end: 4.5, contact: true, points: [a("RAF_3_03", -1.5, 4.14, 0.528), a("PURLIN_Y_LEFT", -1.5, 4.14, 0.528)] },
  { id: "purlin-run", start: 3.35, end: 6, points: [a("PURLIN_Y_LEFT", -1.591, 4.07, 0.528), a("PURLIN_Y_LEFT", -1.591, 4.07, 1.12), a("PURLIN_Y_LEFT", -1.591, 4.105, 1.5)] },
  // The Y purlin is the upper half-lap. Its corner first bears on the X
  // purlin's remaining lower half, then onto the cap. Do not bridge the void.
  { id: "corner-lap", start: 5, end: 6.4, contact: true, points: [a("PURLIN_Y_LEFT", -1.5, 4.0708, 1.5), a("PURLIN_X_FRONT", -1.5, 4.0692, 1.5), a("CAP_FL", -1.5, 4, 1.5)] },
  { id: "cap-arm", start: 5.2, end: 6.7, contact: true, points: [a("CAP_FL", -1.6, 3.87, 1.5), a("GONG_X_FL", -1.6, 3.87, 1.5)] },
  { id: "arm-block", start: 5.35, end: 6.7, contact: true, points: [a("GONG_X_FL", -1.6, 3.75, 1.5), a("DOU_FL", -1.6, 3.75, 1.5)] },
  { id: "block-column", start: 5.6, end: 7, contact: true, points: [a("DOU_FL", -1.6, 3.63, 1.5), a("POST_FL", -1.6, 3.63, 1.5)] },
  { id: "column-run", start: 6, end: 8.4, points: [a("POST_FL", -1.641, 3.5, 1.5), a("POST_FL", -1.641, 2.2, 1.5), a("POST_FL", -1.641, 0.41, 1.5)] },
  { id: "column-stone", start: 7, end: 8.4, contact: true, points: [a("POST_FL", -1.5, 0.4, 1.5), a("STONE_FL", -1.5, 0.4, 1.5)] },
  { id: "cantilever-seat", start: 8, end: 9, points: [a("RAF_3_03", -2.18, 3.852, 0.528), a("RAF_3_03", -1.8, 4.08, 0.528), a("RAF_3_03", -1.5, 4.14, 0.528)] }
];
var WIND_ROUTES = [
  { id: "brace-left", scene: "wind", start: 4, end: 5, points: [a("CROSS_FRONT", -0.78, 2.85, 1.5), a("BRACE_X_FL", -0.78, 2.86, 1.55), a("BRACE_X_FL", -1.42, 2.13, 1.55), a("POST_FL", -1.36, 2.13, 1.5)] },
  { id: "brace-right", scene: "wind", start: 4, end: 5, points: [a("CROSS_FRONT", 0.78, 2.85, 1.5), a("BRACE_X_FR", 0.78, 2.86, 1.55), a("BRACE_X_FR", 1.42, 2.13, 1.55), a("POST_FR", 1.36, 2.13, 1.5)] },
  { id: "mortise-shoulder", scene: "wind", start: 5, end: 5.9, contact: true, points: [a("CROSS_FRONT", -1.36, 3.11, 1.5), a("POST_FL", -1.36, 3.11, 1.5)] },
  { id: "peg-hole", scene: "wind", start: 5.3, end: 5.95, contact: true, points: [a("PEG_X_FL", -1.5, 3.014, 1.64), a("POST_FL", -1.5, 3.02, 1.64)] }
];
var FORCE_FOCUS_PARTS = {
  0: ["TILE_LEFT", "TILE_FRONT", "TILE_RIGHT", "TILE_BACK"],
  1: ["TILE_LEFT", "DECK_LEFT"],
  2: ["DECK_LEFT", "RAF_3_03"],
  3: ["RAF_3_03", "PURLIN_Y_LEFT"],
  4: ["PURLIN_Y_LEFT"],
  5: ["PURLIN_Y_LEFT", "PURLIN_X_FRONT", "CAP_FL", "GONG_X_FL", "GONG_Y_FL", "DOU_FL"],
  6: ["DOU_FL", "POST_FL"],
  7: ["POST_FL", "STONE_FL"],
  8: ["RAF_3_03", "PURLIN_Y_LEFT"],
  9: ["RAF_3_03", "PURLIN_Y_LEFT", "CAP_FL", "GONG_X_FL", "DOU_FL", "POST_FL", "STONE_FL"]
};
var GRAVITY_CAMERA = [
  [0, 0, 2.65, 0, 14.7, 0.47, 0.35],
  [0.9, -0.5, 4.32, 0.3, 9.5, -0.7, 0.47],
  [1.45, -1.08, 4.49, 0.528, 5.8, -0.94, 0.3],
  [2.35, -1.15, 4.45, 0.528, 4.8, -1.1, 0.25],
  [3.25, -1.5, 4.18, 0.528, 3.9, -1.18, 0.17],
  [4.2, -1.5, 4.07, 0.6, 2.4, -1.19, 0.025],
  [5.25, -1.5, 3.84, 1.5, 3.55, -0.78, 0.15],
  [6.3, -1.5, 2.18, 1.5, 6, -0.72, 0.13],
  [6.82, -1.5, 0.6, 1.5, 4.4, -0.76, 0.24],
  [7.72, -1.5, 0.6, 1.5, 4.4, -0.76, 0.24],
  [8.25, -1.93, 3.96, 0.528, 5.3, -1.15, 0.24],
  [9.55, 0, 2.65, 0, 14.7, 0.47, 0.35],
  [10, 0, 2.65, 0, 14.7, 0.47, 0.35]
];
var WIND_CAMERA = [
  [0, 0, 2.65, 0, 14.7, 0.47, 0.35],
  [0.85, 0, 2.95, 0, 15, -0.65, 0.25],
  [1.55, 0, 3.08, 0, 14.4, -0.28, 0.25],
  [2.35, -0.12, 4.24, 0, 10.6, -0.63, 0.34],
  [3.28, -1.5, 3.56, 1.5, 4.8, -0.7, 0.2],
  [4.25, 0, 2.74, 1.5, 8.3, 0.02, 0.1],
  [5.25, -1.5, 3, 1.5, 3.3, -0.8, 0.14],
  [5.8, -1.5, 3, 1.5, 3.3, -0.8, 0.14],
  [6.12, -1.5, 3.25, 1.5, 4.7, -0.65, 0.18],
  [6.4, -1.4, 3.3, 1.5, 5.3, -0.6, 0.18],
  [6.83, 0, 2.65, 0, 14.7, 0.42, 0.31],
  [7.6, 0, 2.65, 0, 14.7, 0.6, 0.35],
  [8, 0, 2.65, 0, 14.7, 0.6, 0.35]
];
var TERM_ANCHORS = {
  tenon: { ...a("CROSS_FRONT", -1.5, 3.07, 1.53), scene: "straight", lines: [0, 1.2], candidates: [[-1.64, 3.04, 1.53]] },
  mortise: { ...a("POST_FL", -1.64, 2.9292, 1.5), scene: "straight", lines: [0, 1.2] },
  shoulder: { ...a("CROSS_FRONT", -1.36, 3.11, 1.5), scene: "straight", lines: [1.3, 2.5] },
  peg: { ...a("PEG_X_FL", -1.5, 3.014, 1.64), scene: "straight", lines: [5, 6.2], candidates: [[-1.5, 3, 1.67]] },
  bent: { ...a("CROSS_FRONT", 0, 3.15, 1.5), scene: "frame", lines: [0, 1] },
  longitudinal: { ...a("LONG_RIGHT", 1.59, 3.42, 0.4), scene: "frame", lines: [1, 2] },
  brace: { ...a("BRACE_X_FL", -1.08, 2.47, 1.55), scene: "straight", lines: [4, 5] },
  hip: { ...a("HIP_FL", -0.670800764, 4.719335821, 0.670800744), scene: "hip", lines: [0, 1] },
  hipRafter: { ...a("RAF_3_05", -1.3, 4.38, 0), scene: "hip", lines: [3, 4] },
  hipDeck: { ...a("DECK_LEFT", -1.3, 4.412, 0.5), scene: "hip", lines: [4, 5] },
  board: { ...a("DECK_LEFT", -1.08, 4.53, 0.75), scene: "gravity", lines: [1, 2] },
  rafter: { ...a("RAF_3_03", -1.15, 4.47, 0.56), scene: "gravity", lines: [2, 3] },
  purlin: { ...a("PURLIN_Y_LEFT", -1.59, 4.07, 0.396), scene: "gravity", lines: [3, 4] },
  bracket: { ...a("GONG_X_FL", -1.78, 3.81, 1.56), scene: "bracket", lines: [0, 2] },
  dou: { ...a("DOU_FL", -1.5, 3.69, 1.67), scene: "bracket", lines: [1, 3] },
  gong: { ...a("GONG_X_FL", -1.76, 3.81, 1.58), scene: "bracket", lines: [1, 3] },
  shortPost: { ...a("CENTRE_POST", 0, 4.42, 0.08), scene: "hip", lines: [2, 3] },
  supportBeam: { ...a("SUPPORT_X", -0.48, 4.07, 0.08), scene: "hip", lines: [2, 3] },
  post: { ...a("POST_FL", -1.64, 2.2, 1.5), scene: "gravity", lines: [6, 8] },
  stone: { ...a("STONE_FL", -1.76, 0.27, 1.5), scene: "gravity", lines: [7, 8] },
  stress: { ...a("CROSS_FRONT", 0, 3, 1.61), scene: "wind", lines: [6, 7] },
  displacement: { ...a("POST_FL", -1.5, 3.3, 1.64), scene: "wind", lines: [6, 7] }
};
var TERM_LABELS = { tenon: "\u69AB", mortise: "\u536F", shoulder: "\u69AB\u80A9", peg: "\u6728\u9500", bent: "\u4E00\u6980\u6881\u67B6", longitudinal: "\u7EB5\u678B", brace: "\u659C\u6491", bracket: "\u6597\u6831", dou: "\u6597", gong: "\u6831", shortPost: "\u77ED\u67F1", supportBeam: "\u6258\u6881", post: "\u67F1", hip: "\u89D2\u6881", hipRafter: "\u693D", rafter: "\u693D", hipDeck: "\u671B\u677F", board: "\u671B\u677F", purlin: "\u6AA9", stone: "\u67F1\u7840", stress: "\u5E94\u529B", displacement: "\u4F4D\u79FB", compression: "\u53D7\u538B", tension: "\u53D7\u62C9" };

// src/episode3v8/force-evidence.json
var force_evidence_default = {
  provenance: "Unchanged v7 native imposed engineering wind loads; not CFD-derived pressures or local joint contact solve",
  panels: [
    {
      id: "DECK_FRONT",
      area_m2: 6.034335496937503,
      normal: [
        0,
        -0.5144957554275266,
        0.8574929257125441
      ],
      centroid_m: [
        0,
        -1.5625252525252524,
        4.254484848484849
      ],
      Cp: -0.5,
      pressure_Pa: -44.1,
      force_N: [
        0,
        -136.91462399999998,
        228.1910399999999
      ],
      support_nodes: [
        37,
        38,
        39,
        42,
        43,
        44,
        47,
        48,
        49,
        52,
        53,
        54,
        57,
        58,
        59,
        62,
        63,
        64,
        66,
        67,
        68,
        70,
        71,
        72,
        75,
        76,
        77,
        80,
        81,
        82,
        85,
        86,
        87
      ],
      normalThree: [
        0,
        0.8574929257125441,
        0.5144957554275266
      ],
      centroidThree: [
        0,
        4.254484848484849,
        1.5625252525252524
      ],
      forceThreeN: [
        0,
        228.1910399999999,
        136.91462399999998
      ]
    },
    {
      id: "DECK_RIGHT",
      area_m2: 6.034335496937503,
      normal: [
        0.5144957554275266,
        0,
        0.8574929257125441
      ],
      centroid_m: [
        1.5625252525252524,
        0,
        4.254484848484849
      ],
      Cp: -0.4,
      pressure_Pa: -35.28,
      force_N: [
        109.53169919999999,
        0,
        182.55283199999994
      ],
      support_nodes: [
        90,
        91,
        92,
        94,
        95,
        96,
        98,
        99,
        100,
        102,
        103,
        104,
        106,
        107,
        108,
        110,
        111,
        112,
        114,
        115,
        116,
        118,
        119,
        120,
        123,
        124,
        125,
        128,
        129,
        130,
        133,
        134,
        135
      ],
      normalThree: [
        0.5144957554275266,
        0.8574929257125441,
        -0
      ],
      centroidThree: [
        1.5625252525252524,
        4.254484848484849,
        -0
      ],
      forceThreeN: [
        109.53169919999999,
        182.55283199999994,
        -0
      ]
    },
    {
      id: "DECK_BACK",
      area_m2: 6.034335496937503,
      normal: [
        12334307830355848e-32,
        0.5144957554275266,
        0.857492925712544
      ],
      centroid_m: [
        33117174962172625e-32,
        1.5625252525252524,
        4.254484848484849
      ],
      Cp: -0.5,
      pressure_Pa: -44.1,
      force_N: [
        32823344042753885e-30,
        136.91462399999998,
        228.19103999999987
      ],
      support_nodes: [
        138,
        139,
        140,
        143,
        144,
        145,
        148,
        149,
        150,
        153,
        154,
        155,
        158,
        159,
        160,
        162,
        163,
        164,
        166,
        167,
        168,
        170,
        171,
        172,
        174,
        175,
        176,
        178,
        179,
        180,
        182,
        183,
        184
      ],
      normalThree: [
        12334307830355848e-32,
        0.857492925712544,
        -0.5144957554275266
      ],
      centroidThree: [
        33117174962172625e-32,
        4.254484848484849,
        -1.5625252525252524
      ],
      forceThreeN: [
        32823344042753885e-30,
        228.19103999999987,
        -136.91462399999998
      ]
    },
    {
      id: "DECK_LEFT",
      area_m2: 6.034335496937503,
      normal: [
        -0.5144957554275266,
        12334307830355848e-32,
        0.857492925712544
      ],
      centroid_m: [
        -1.5625252525252524,
        33117174962172625e-32,
        4.254484848484849
      ],
      Cp: 0.6,
      pressure_Pa: 52.92,
      force_N: [
        164.2975488,
        -3938801285130467e-29,
        -273.8292479999999
      ],
      support_nodes: [
        186,
        187,
        188,
        190,
        191,
        192,
        194,
        195,
        196,
        198,
        199,
        200,
        202,
        203,
        204,
        206,
        207,
        208,
        210,
        211,
        212,
        214,
        215,
        216,
        218,
        219,
        220,
        222,
        223,
        224,
        226,
        227,
        228
      ],
      normalThree: [
        -0.5144957554275266,
        0.857492925712544,
        -12334307830355848e-32
      ],
      centroidThree: [
        -1.5625252525252524,
        4.254484848484849,
        -33117174962172625e-32
      ],
      forceThreeN: [
        164.2975488,
        -273.8292479999999,
        3938801285130467e-29
      ]
    }
  ],
  gravitySupportReactions: {
    "1": [
      51.51946075203778,
      6108.567350831523,
      -5.964526132031335
    ],
    "2": [
      -51.519460752829495,
      6108.567350832809,
      -5.964526131932595
    ],
    "3": [
      51.51946075223689,
      6108.5673508312775,
      5.964526131890044
    ],
    "4": [
      -51.519460752582596,
      6108.567350832651,
      5.9645261319694916
    ]
  },
  gravityWindSupportReactions: {
    "1": [
      -500.92240607488765,
      5303.397534107902,
      -2.580111605263355
    ],
    "2": [
      -612.7396549697505,
      6731.184335561315,
      -7.054579240125713
    ],
    "3": [
      -500.9224060777545,
      5303.397534100035,
      2.580111601901158
    ],
    "4": [
      -612.7396549720623,
      6731.184335555965,
      7.054579233916952
    ]
  },
  purlinFiberProbe: {
    partID: "PURLIN_Y_LEFT",
    elementID: 177,
    s: 0.5,
    topThree: [
      -1.5,
      4.14,
      0.396
    ],
    bottomThree: [
      -1.5,
      4,
      0.396
    ]
  }
};

// src/episode3v8/SurfaceSampling.ts
import * as T from "three";
function refineStressSurface(source, maxEdge = 0.07) {
  const attributes = Object.entries(source.attributes), offsets = [];
  let stride = 0;
  for (const [, attribute] of attributes) {
    offsets.push(stride);
    stride += attribute.itemSize;
  }
  const positionOffset = offsets[attributes.findIndex(([name]) => name === "position")];
  const index = source.getIndex(), count = index?.count ?? source.getAttribute("position").count;
  const values = attributes.map(() => []);
  const read = (i) => attributes.flatMap(([, attribute]) => Array.from({ length: attribute.itemSize }, (_, k) => attribute.getComponent(i, k)));
  const lengthSq = (a2, b) => {
    let n = 0;
    for (let k = 0; k < 3; k++) n += (a2[positionOffset + k] - b[positionOffset + k]) ** 2;
    return n;
  };
  const write = (v) => attributes.forEach(([, attribute], i) => {
    for (let k = 0; k < attribute.itemSize; k++) values[i].push(v[offsets[i] + k]);
  });
  const split = (a2, b, c, depth = 0) => {
    const lengths = [lengthSq(a2, b), lengthSq(b, c), lengthSq(c, a2)], longest = Math.max(...lengths);
    if (longest <= maxEdge * maxEdge || depth >= 16) {
      write(a2);
      write(b);
      write(c);
      return;
    }
    const edge = lengths.indexOf(longest), vertices = [a2, b, c], u = vertices[edge], v = vertices[(edge + 1) % 3], opposite = vertices[(edge + 2) % 3], mid = u.map((n, k) => (n + v[k]) * 0.5);
    split(u, mid, opposite, depth + 1);
    split(mid, v, opposite, depth + 1);
  };
  for (let i = 0; i < count; i += 3) split(read(index ? index.getX(i) : i), read(index ? index.getX(i + 1) : i + 1), read(index ? index.getX(i + 2) : i + 2));
  const result = new T.BufferGeometry();
  attributes.forEach(([name, attribute], i) => result.setAttribute(name, new T.Float32BufferAttribute(values[i], attribute.itemSize, attribute.normalized)));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

// src/episode3v8/World.ts
var clamp2 = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  const t = clamp2(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix = (a2, b, t) => a2 + (b - a2) * t;
var V = (x = 0, y = 0, z = 0) => new T2.Vector3(x, y, z);
var fromB = (v) => V(v[0], v[2], -v[1]);
var scalar = (points, t) => {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) return mix(points[i - 1][1], points[i][1], smooth((t - points[i - 1][0]) / (points[i][0] - points[i - 1][0])));
  }
  return points.at(-1)[1];
};
var BRACKET_ASSEMBLY = [[0, 0.52], [1, 0.52], [1.88, 0.66], [2, 0.66], [2.28, 0.62], [4, 0.62], [4.72, 0.66], [5, 0.66]];
var JoineryWorld = class {
  constructor(canvas, base) {
    this.scene = new T2.Scene();
    this.camera = new T2.PerspectiveCamera(34, 16 / 9, 0.035, 240);
    this.parts = /* @__PURE__ */ new Map();
    this.pavilion = new T2.Group();
    this.nodes = /* @__PURE__ */ new Map();
    this.members = /* @__PURE__ */ new Map();
    this.maxStress = 1;
    this.displayGain = 1;
    this.assemblyTravel = [];
    this.forceLines = [];
    this.arrows = [];
    this.flowLines = [];
    this.flowRoot = new T2.Group();
    this.forces = new T2.Group();
    this.routeVisuals = [];
    this.surfaceBindings = /* @__PURE__ */ new Map();
    this.loadArrows = [];
    this.annotationRay = new T2.Raycaster();
    this.renderer = new T2.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setSize(1920, 1080, false);
    this.renderer.outputColorSpace = T2.SRGBColorSpace;
    this.renderer.toneMapping = T2.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T2.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.scene.background = new T2.Color("#eee7d8");
    this.scene.fog = new T2.Fog("#eee7d8", 35, 95);
    const pm = new T2.PMREMGenerator(this.renderer);
    this.environment = pm.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();
    this.scene.add(new T2.HemisphereLight(16773851, 7897722, 1.6));
    const key = new T2.DirectionalLight(16772050, 3.1);
    key.position.set(-5, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -17, right: 17, top: 20, bottom: -12, near: 1, far: 48 });
    key.shadow.normalBias = 0.012;
    key.shadow.bias = -15e-5;
    key.shadow.radius = 5;
    this.scene.add(key);
    const fill = new T2.DirectionalLight(15003375, 1.25);
    fill.position.set(8, 6, -8);
    this.scene.add(fill);
    const floor = new T2.Mesh(new T2.PlaneGeometry(300, 300), new T2.MeshStandardMaterial({ color: 15064524, roughness: 0.91 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    this.scene.add(floor, this.pavilion, this.flowRoot, this.forces);
    this.woodGrain = this.grain();
    const json = async (p) => {
      const r = await fetch(base + p);
      if (!r.ok) throw Error(`Missing required verified asset: ${p}`);
      return r.json();
    };
    this.ready = Promise.all([json("models/pavilion-manifest.json"), json("physics/dynamic-response.json"), json("physics/static-cases.json"), json("physics/inverse-diffusion.json"), json("physics/flow.json"), json("physics/flow-central.json")]).then(async ([manifest, physics, stat, inverse, flow, central]) => {
      this.manifest = manifest;
      this.physics = physics;
      this.staticData = stat;
      this.inverseData = inverse;
      this.flowData = { slices: [flow, central] };
      const gltf = await new GLTFLoader().loadAsync(base + "models/" + (manifest.glb ?? "pavilion-v7.glb"));
      gltf.scene.updateMatrixWorld(true);
      for (const part of manifest.parts) {
        const source = gltf.scene.getObjectByName(part.id);
        if (!source) throw Error(`Pavilion part missing: ${part.id}`);
        if (!part.assembly_keys?.length) throw Error(`Assembly path missing: ${part.id}`);
        const root = new T2.Group();
        root.name = part.id;
        this.pavilion.add(root);
        const meshes = [], vertices = [];
        source.traverse((o) => {
          if (!(o instanceof T2.Mesh)) return;
          let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          if (part.id === "PURLIN_Y_LEFT") {
            const original = geo;
            geo = refineStressSurface(original);
            original.dispose();
          }
          geo.computeBoundingBox();
          geo.computeBoundingSphere();
          const attrs = geo.getAttribute("position");
          vertices.push(new Float32Array(attrs.array));
          const sourceMat = Array.isArray(o.material) ? o.material[0] : o.material;
          const mat = sourceMat.clone();
          mat.roughness = Math.max(0.36, mat.roughness);
          mat.metalness = Math.min(0.3, mat.metalness);
          if (/wood|cedar|fir|tenon|oak/i.test(mat.name)) {
            if (!mat.map) {
              mat.color.set(part.role === "peg" ? "#c08a50" : "#a97243");
              mat.map = this.woodGrain;
            }
            mat.roughness = 0.53;
          }
          mat.userData.baseColor = mat.color.clone();
          mat.userData.physicsMapBlend = { value: 0 };
          mat.onBeforeCompile = (shader) => {
            shader.uniforms.physicsMapBlend = mat.userData.physicsMapBlend;
            shader.fragmentShader = "uniform float physicsMapBlend;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", T2.ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", "diffuseColor *= vec4(mix(sampledDiffuseColor.rgb, vec3(1.0), physicsMapBlend), sampledDiffuseColor.a);"));
          };
          mat.customProgramCacheKey = () => "rainbow-wood-to-physics-v7";
          const colors = new Float32Array(attrs.count * 3);
          colors.fill(1);
          geo.setAttribute("color", new T2.BufferAttribute(colors, 3));
          mat.vertexColors = true;
          const mesh = new T2.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          root.add(mesh);
          meshes.push(mesh);
        });
        if (!meshes.length) throw Error(`Part contains no geometry: ${part.id}`);
        const centroid = new T2.Box3().setFromObject(root).getCenter(V());
        this.parts.set(part.id, { info: part, root, meshes, base: vertices, centroid, offset: V(), nodeWeights: [], stressCoordinates: [] });
      }
      for (const n of physics.nodes) this.nodes.set(String(n.id), fromB(n.xyz));
      for (const m of physics.members) {
        const list = this.members.get(m.part_id) ?? [];
        list.push(m);
        this.members.set(m.part_id, list);
      }
      const snapshots = [...physics.snapshots, ...Object.values(stat.cases ?? {}).map((c) => c.response).filter(Boolean)];
      this.maxStress = Math.max(1, ...snapshots.flatMap((s) => Object.values(s.members).map((m) => m.sigmaMaxAbsPa)));
      const maxU = Math.max(1e-8, ...physics.snapshots.flatMap((s) => Object.values(s.nodalDisplacements).map((u) => fromB(u).length())));
      this.displayGain = Math.max(1, Math.min(250, 0.14 / maxU));
      this.prepareWeights();
      this.prepareTravel();
      this.buildForces();
      this.buildFlow();
    });
  }
  grain() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d"), im = ctx.createImageData(256, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
      const v = 235 + 7 * Math.sin(x * 0.5 + 2 * Math.sin(y * 0.01)) + 3 * Math.sin(x * 2.4 + y * 0.02);
      im.data.set([v, v - 5, v - 12, 255], (y * 256 + x) * 4);
    }
    ctx.putImageData(im, 0, 0);
    const texture = new T2.CanvasTexture(canvas);
    texture.colorSpace = T2.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T2.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  }
  offset(info, q) {
    const keys = info.assembly_keys;
    if (q <= keys[0].t) return V(...keys[0].offset_three);
    for (let i = 1; i < keys.length; i++) {
      if (q <= keys[i].t) {
        const a2 = keys[i - 1], b = keys[i], t = smooth((q - a2.t) / Math.max(1e-6, b.t - a2.t));
        return V(...a2.offset_three).lerp(V(...b.offset_three), t);
      }
    }
    return V(...keys.at(-1).offset_three);
  }
  prepareWeights() {
    for (const part of this.parts.values()) {
      const mem = this.members.get(part.info.id) ?? [];
      part.nodeWeights = part.base.map((base) => {
        const result = [], coordinates = [];
        for (let i = 0; i < base.length; i += 3) {
          const p = V(base[i], base[i + 1], base[i + 2]);
          let best = Infinity, weights = [], coordinate = void 0;
          for (const m of mem) {
            const a2 = this.nodes.get(String(m.nodes[0])), b = this.nodes.get(String(m.nodes[1])), ab = b.clone().sub(a2), t = clamp2(p.clone().sub(a2).dot(ab) / ab.lengthSq()), dist = p.distanceToSquared(a2.clone().addScaledVector(ab, t));
            if (dist < best) {
              best = dist;
              weights = [{ node: String(m.nodes[0]), weight: 1 - t }, { node: String(m.nodes[1]), weight: t }];
              coordinate = prepareCoordinate(m, [[a2.x, -a2.z, a2.y], [b.x, -b.z, b.y]], p);
            }
          }
          if (!weights.length) {
            const nearest = [...this.nodes].map(([node, pos]) => ({ node, dist: p.distanceToSquared(pos) })).sort((a2, b) => a2.dist - b.dist).slice(0, 3);
            const sum = nearest.reduce((s, n) => s + 1 / (n.dist + 0.01), 0);
            weights = nearest.map((n) => ({ node: n.node, weight: 1 / (n.dist + 0.01) / sum }));
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
    const count = 2e3;
    this.assemblyTravel = [0];
    let previous = [...this.parts.values()].map((p) => this.offset(p.info, 0));
    for (let i = 1; i <= count; i++) {
      const current = [...this.parts.values()].map((p) => this.offset(p.info, i / count));
      const delta = Math.max(5e-5, ...current.map((p, k) => p.distanceTo(previous[k])));
      this.assemblyTravel.push(this.assemblyTravel[i - 1] + delta);
      previous = current;
    }
  }
  travelAt(q) {
    const n = clamp2(q) * 2e3, i = Math.floor(n);
    return mix(this.assemblyTravel[i], this.assemblyTravel[Math.min(i + 1, 2e3)], n - i);
  }
  travelMix(a2, b, t) {
    const distance = mix(this.travelAt(a2), this.travelAt(b), t);
    let lo = 0, hi = 2e3;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (this.assemblyTravel[mid] < distance) lo = mid;
      else hi = mid;
    }
    return (lo + (distance - this.assemblyTravel[lo]) / (this.assemblyTravel[hi] - this.assemblyTravel[lo])) / 2e3;
  }
  assemblyCurve(points, t) {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) if (t <= points[i][0]) return this.travelMix(points[i - 1][1], points[i][1], smooth((t - points[i - 1][0]) / (points[i][0] - points[i - 1][0])));
    return points.at(-1)[1];
  }
  demo(name) {
    const d = this.manifest.demonstrations[name];
    if (!d) throw Error(`Camera requires verified demonstration: ${name}`);
    return d;
  }
  getPartAssemblyQ(partID, s, p = this.blendedPose(s)) {
    if (s.scene === "hip" && partID === "HIP_FL" && s.line + s.lineProgress < 2.6 && (!s.previous || s.elapsed >= 4)) {
      return scalar([[0, 0.893], [1, 0.893], [1.22, 0.875], [1.45, 0.855], [1.67, 0.875], [1.96, 0.893], [2.6, 0.893]], s.line + s.lineProgress);
    }
    return p.q;
  }
  pose(scene, p, elapsed, line, lineProgress = 1) {
    let q = 1, target = V(0, 2.65, 0), az = 0.66 - 0.23 * p, el = 0.35, dist = 14.7, heat = 0, deform = 0, flow = 0, force = 0, cut = 0, inverse = 0, sim = p;
    if (scene === "intro") {
      q = this.assemblyCurve([[0, 1], [0.075, 1], [0.27, 0.32], [0.38, 0.32], [0.58, 1], [0.76, 1], [1, 0.32]], p);
      const cameraQ = scalar([[0, 1], [0.075, 1], [0.27, 0.32], [0.38, 0.32], [0.58, 1], [0.76, 1], [1, 0.32]], p);
      target.y = mix(2.65, 5.2, 1 - cameraQ);
      dist = mix(14.7, 29.7, 1 - cameraQ);
      az = 0.65 - 0.36 * p;
    }
    if (["straight", "frame", "bracket", "hip"].includes(scene)) {
      const d = this.demo(scene);
      const a2 = d.assembly_window[0], b = d.assembly_window[1];
      const u = line + lineProgress;
      if (scene === "straight") q = this.assemblyCurve([[0, a2], [1, a2], [2, 0.23], [3.3, 0.23], [4, a2], [5, 0.23], [5.8, b], [6, b], [6.35, 0.23], [7, a2]], u);
      if (scene === "frame") q = this.assemblyCurve([[0, a2], [1, a2], [2, 0.45], [4, 0.45], [5, b]], u);
      if (scene === "bracket") q = this.assemblyCurve(BRACKET_ASSEMBLY, u);
      if (scene === "hip") q = this.assemblyCurve([[0, 0.893], [2.6, 0.893], [2.98, 0.943], [3.8, 0.947], [4, 0.952], [4.34, 0.979], [4.78, 1], [5, 1]], u);
      target = V(...d.focus_three);
      const anchorId = scene === "bracket" ? "POST_FL" : scene === "hip" ? "SUPPORT_X" : d.anchor_part;
      const anchor = this.parts.get(anchorId);
      if (!anchor) throw Error(`Focus anchor missing ${anchorId}`);
      target.add(this.offset(anchor.info, q));
      az = { straight: -0.66, frame: 0.63, bracket: 0.04, hip: 0.63 }[scene] + 0.38 * Math.sin((p - 0.5) * Math.PI);
      dist = scene === "frame" ? 9.4 : scene === "hip" ? 4.2 : scene === "bracket" ? 2.9 : 3.7;
      el = scene === "hip" ? 0.53 : scene === "bracket" ? 0.28 : 0.2;
      if (scene === "bracket") {
        az = 0.04 + 0.23 * Math.sin((p - 0.5) * Math.PI);
        const cameraQ = scalar(BRACKET_ASSEMBLY, u), exploded = clamp2((0.66 - cameraQ) / 0.14);
        target.y += 1.2 * exploded;
        dist += 3.2 * exploded;
        const crossedDetail = scalar([[0, 0], [2, 0], [2.28, 1], [3.76, 1], [4.72, 0], [5, 0]], u);
        const bearing = scalar([[0, 0], [3, 0], [3.45, 1], [4, 1], [4.72, 0], [5, 0]], u);
        target.lerp(V(-1.5, mix(4.08, 3.88, bearing), 1.5), crossedDetail);
        dist = mix(dist, 3.3, crossedDetail);
        az = mix(az, -0.52, crossedDetail);
        el = mix(el, mix(0.4, 0.28, bearing), crossedDetail);
      }
      if (scene === "frame") {
        const close = scalar([[0, 0], [1.9, 0], [2.25, 1], [3.8, 1], [4.25, 0], [5, 0]], u);
        dist = mix(9.4, 4.2, close);
        cut = 0.58 * close;
      }
      if (scene === "hip") {
        const hip = this.parts.get("HIP_FL"), hipQ = scalar([[0, 0.893], [1, 0.893], [1.22, 0.875], [1.45, 0.855], [1.67, 0.875], [1.96, 0.893], [2.6, 0.893]], u), hipOffset = this.offset(hip.info, hipQ);
        const closeHip = scalar([[0, 1], [1.88, 1], [2.23, 0], [5, 0]], u);
        const hipTarget = hip.centroid.clone().addScaledVector(hipOffset, 0.7);
        target.lerp(hipTarget, closeHip);
        dist = mix(dist, 6.7 + hipOffset.length() * 0.45, closeHip);
        az = mix(az, -0.1 + 0.06 * Math.sin(u * 1.6), closeHip);
        el = mix(el, 0.34, closeHip);
        const support = scalar([[0, 0], [1.9, 0], [2.22, 1], [2.58, 1], [2.95, 0], [5, 0]], u);
        target.lerp(V(-0.1, 4.42, 0), support);
        dist = mix(dist, 5.8, support);
        el = mix(el, 0.12, support);
        const reveal = scalar([[0, 0], [2.58, 0], [2.98, 1], [3.8, 1], [4.2, 0.7], [5, 0]], u);
        target.lerp(V(-1.07, 4.5, 0.528), reveal);
        dist = mix(dist, 8.2, reveal);
        az = mix(az, -0.75, reveal);
        const wide = smooth(clamp2((u - 4) / 0.8));
        dist = mix(dist, 14.7, wide);
        target.lerp(V(0, 2.65, 0), wide);
      }
      if (scene === "straight") {
        const detail = scalar([[0, 0], [4.8, 0], [5.25, 1], [6.35, 1], [7, 0]], u);
        dist = mix(dist, 1.8, detail);
        const peg = this.parts.get("PEG_X_FL");
        target.lerp(peg.centroid.clone().add(this.offset(this.parts.get("POST_FL").info, q)), detail);
      }
      if (scene === "straight") cut = scalar([[0, 0], [1.3, 0], [1.57, 0.86], [3.15, 0.86], [3.7, 0], [7, 0]], u);
    }
    if (scene === "assembly") {
      const assemblyProgress = clamp2((elapsed - 7) / 18);
      q = this.assemblyCurve([[0, 0], [0.89, 1], [1, 1]], assemblyProgress);
      dist = mix(25.5, 14.6, smooth(p));
      target.y = mix(4.65, 2.65, smooth(p));
      az = 0.82 - 0.78 * p;
      el = 0.32;
    }
    if (scene === "gravity") {
      const u = line + lineProgress;
      const channel = (i) => scalar(GRAVITY_CAMERA.map((v) => [v[0], v[i]]), u);
      target = V(channel(1), channel(2), channel(3));
      dist = channel(4);
      az = channel(5);
      el = channel(6);
      force = scalar([[0, 0], [0.55, 1], [9.5, 1], [10, 0]], u);
      heat = scalar([[0, 0], [3.95, 0], [4.18, 1], [4.85, 1], [5.15, 0], [6.05, 0], [6.3, 1], [6.82, 1], [7.1, 0], [10, 0]], u);
    }
    if (scene === "wind") {
      const u = line + lineProgress, channel = (i) => scalar(WIND_CAMERA.map((v) => [v[0], v[i]]), u);
      target = V(channel(1), channel(2), channel(3));
      dist = channel(4);
      az = channel(5);
      el = channel(6);
      heat = scalar([[0, 0], [3.95, 0], [4.2, 1], [4.75, 1], [5, 0], [5.8, 0], [6.1, 1], [6.95, 1], [7.55, 0], [8, 0]], u);
      deform = scalar([[0, 0], [5.8, 0], [6.1, 1], [6.95, 1], [7.55, 0], [8, 0]], u);
      flow = scalar([[0, 0], [0.45, 1], [1.9, 1], [2.8, 0.32], [3.2, 0], [5.8, 0], [6.15, 0.25], [7.5, 0], [8, 0]], u);
      force = scalar([[0, 0], [0.5, 1], [5.65, 1], [6, 0], [8, 0]], u);
      cut = scalar([[0, 0], [4.85, 0], [5.18, 0.7], [5.7, 0.7], [6, 0], [8, 0]], u);
    }
    if (scene === "inverse") {
      inverse = scalar([[0, 0], [0.1, 1], [0.92, 1], [1, 0]], p);
      q = this.assemblyCurve([[0, 1], [0.55, 1], [0.72, 0.947], [0.92, 0.947], [1, 1]], p);
      heat = scalar([[0, 0], [0.64, 0], [0.76, 1], [0.9, 1], [1, 0]], p);
      deform = heat;
      dist = 12.8;
      el = 0.45;
      az = 0.17 + 0.45 * p;
      target = V(0, 3.2, 0);
    }
    if (scene === "return") {
      az = 0.6 + 0.32 * p;
      dist = 14.7;
      target = V(0, 2.65, 0);
    }
    if (scene === "references") {
      az = 0.92;
      target = V(-13, 2.65, 0);
      dist = 14.7;
    }
    const position = target.clone().add(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
    if (!["straight", "frame", "bracket", "hip", "gravity", "wind"].includes(scene)) target.add(V(-0.25, 0.12, 0));
    return { q, position, target, heat, deform, flow, force, cut, inverse, sim };
  }
  blendedPose(s) {
    const pose = this.pose(s.scene, s.progress, s.elapsed, s.line, s.lineProgress), travelDuration = s.scene === "assembly" ? 7 : 4;
    if (!s.previous || s.elapsed >= travelDuration) return pose;
    const prev = this.pose(s.previous, 1, 100, 99), a2 = smooth(s.elapsed / 4), travel = smooth(s.elapsed / travelDuration);
    const result = { ...pose, position: prev.position.clone().lerp(pose.position, a2), target: prev.target.clone().lerp(pose.target, a2) };
    for (const key of ["heat", "deform", "flow", "force", "cut", "inverse", "sim"]) result[key] = mix(prev[key], pose[key], a2);
    result.q = this.travelMix(prev.q, pose.q, travel);
    return result;
  }
  response(s) {
    if (s.scene === "wind") {
      if (s.line + s.lineProgress < 5.85) {
        const a2 = this.staticData.cases.gravity_wind.response;
        return { a: a2, b: a2, t: 0 };
      }
      const frames = this.physics.snapshots, t = clamp2((s.line + s.lineProgress - 5.85) / 1.2) * (frames.length - 1), i = Math.floor(t);
      return { a: frames[i], b: frames[Math.min(i + 1, frames.length - 1)], t: t - i };
    }
    if (s.scene === "inverse") {
      const a2 = this.inverseData.true_native_result.response, b = this.inverseData.recovered_native_result.response;
      return { a: a2, b, t: smooth(clamp2((s.progress - 0.5) / 0.32)) };
    }
    const cases = this.staticData.cases;
    const gravity = cases.gravity?.response ?? cases.dead?.response ?? Object.values(cases).map((x) => x.response)[0];
    if (!gravity) throw Error("No actual gravity solve");
    return { a: gravity, b: gravity, t: 0 };
  }
  displacement(weights, a2, b, t) {
    const result = V();
    for (const w of weights) {
      const u = a2.nodalDisplacements[w.node], v = b.nodalDisplacements[w.node];
      if (u && v) result.addScaledVector(fromB(u).lerp(fromB(v), t), w.weight);
    }
    return result;
  }
  heatColor(value) {
    const q = clamp2(value / this.maxStress), cold = new T2.Color("#4b8f99"), mid = new T2.Color("#e7d5a4"), hot = new T2.Color("#bd4c39");
    return q < 0.48 ? cold.lerp(mid, q / 0.48) : mid.lerp(hot, (q - 0.48) / 0.52);
  }
  buildForces() {
    const material = (color) => new T2.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const segment = () => {
      const core = new T2.Mesh(new T2.CylinderGeometry(0.011, 0.011, 1, 8), material(12150070)), halo = new T2.Mesh(new T2.CylinderGeometry(0.03, 0.03, 1, 8), material(14857319));
      core.renderOrder = 13;
      halo.renderOrder = 12;
      this.forces.add(core, halo);
      return { core, halo };
    };
    for (const spec of [...GRAVITY_ROUTES, ...WIND_ROUTES]) {
      const bindings = spec.points.map((a2) => this.bindSurface(a2)), segments = bindings.slice(1).map(segment);
      const dots = Array.from({ length: 3 }, () => {
        const dot2 = new T2.Mesh(new T2.SphereGeometry(0.031, 10, 8), material(13734210));
        dot2.renderOrder = 14;
        this.forces.add(dot2);
        return dot2;
      });
      const ring = new T2.Mesh(new T2.RingGeometry(0.059, 0.072, 36), material(13011780));
      ring.renderOrder = 14;
      this.forces.add(ring);
      this.routeVisuals.push({ spec, bindings, segments, dots, ring });
    }
    const arrow = (anchor, direction, kind, amplitude = 1, panel) => {
      const value = new T2.ArrowHelper(direction, V(), 1e-3, kind === "reaction" ? 4161909 : 12084285, 0.15, 0.08);
      value.renderOrder = 15;
      value.traverse((o) => {
        if (o instanceof T2.Mesh || o instanceof T2.Line) {
          const m = o.material;
          m.transparent = true;
          m.opacity = 0;
          m.depthWrite = false;
          m.depthTest = false;
          o.renderOrder = 15;
        }
      });
      const shaft2 = new T2.Mesh(new T2.CylinderGeometry(0.012, 0.012, 1, 10), material(kind === "reaction" ? 4161909 : 12084285));
      shaft2.renderOrder = 15;
      this.forces.add(value, shaft2);
      this.loadArrows.push({ anchor: this.bindSurface(anchor), direction, arrow: value, shaft: shaft2, kind, amplitude, panel });
    };
    for (const panel of force_evidence_default.panels) {
      const p = panel.centroidThree, partID = panel.id.replace("DECK_", "TILE_");
      arrow({ partID, point: [p[0], p[1] + 0.06, p[2]] }, V(0, -1, 0), "weight");
      arrow({ partID, point: [p[0], p[1] + 0.06, p[2]] }, V(...panel.forceThreeN).normalize(), "wind", Math.abs(panel.Cp), panel.id);
    }
    arrow({ partID: "POST_FL", point: [-1.64, 2.1, 1.5] }, V(1, 0, 0), "wind", 0.55);
    for (const suffix of ["FL", "FR", "BL", "BR"]) {
      const part = this.parts.get("POST_" + suffix);
      arrow({ partID: part.info.id, point: [part.centroid.x, 0.4, part.centroid.z] }, V(0, 1, 0), "reaction");
    }
    const rest = new T2.Mesh(new T2.SphereGeometry(0.017, 14, 10), material(15656920)), current = new T2.Mesh(new T2.SphereGeometry(0.026, 14, 10), material(12150070)), shaft = new T2.Mesh(new T2.CylinderGeometry(9e-3, 9e-3, 1, 10), material(12150070)), restRing = new T2.Mesh(new T2.RingGeometry(0.034, 0.041, 32), material(5860455));
    for (const mesh of [rest, current, shaft, restRing]) {
      mesh.renderOrder = 16;
      this.forces.add(mesh);
    }
    this.displacementMeasure = { binding: this.bindSurface(TERM_ANCHORS.displacement), rest, current, shaft, restRing };
  }
  bindSurface(anchor) {
    const key = anchor.partID + ":" + anchor.point.join(","), existing = this.surfaceBindings.get(key);
    if (existing) return existing;
    const part = this.parts.get(anchor.partID);
    if (!part) throw Error(`No real part for anchor ${anchor.partID}`);
    const point = V(...anchor.point), va = V(), vb = V(), vc = V(), closest = V(), triangle = new T2.Triangle();
    let winner, best = Infinity;
    part.meshes.forEach((mesh, k) => {
      const base = part.base[k], index = mesh.geometry.getIndex(), count = index?.count ?? base.length / 3;
      for (let i = 0; i < count; i += 3) {
        const ids = [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2];
        va.fromArray(base, ids[0] * 3);
        vb.fromArray(base, ids[1] * 3);
        vc.fromArray(base, ids[2] * 3);
        triangle.set(va, vb, vc);
        triangle.closestPointToPoint(point, closest);
        const d = closest.distanceToSquared(point);
        if (d < best) {
          const bary = triangle.getBarycoord(closest, V());
          if (bary) {
            best = d;
            winner = { partID: anchor.partID, mesh, indices: ids, bary, distance: Math.sqrt(d) };
          }
        }
      }
    });
    if (!winner) throw Error(`No valid surface triangle for ${anchor.partID}`);
    this.surfaceBindings.set(key, winner);
    return winner;
  }
  surfacePoint(binding) {
    const pos = binding.mesh.geometry.getAttribute("position"), [a2, b, c] = binding.indices, w = binding.bary;
    return binding.mesh.localToWorld(V().addScaledVector(V().fromBufferAttribute(pos, a2), w.x).addScaledVector(V().fromBufferAttribute(pos, b), w.y).addScaledVector(V().fromBufferAttribute(pos, c), w.z));
  }
  restSurfacePoint(binding) {
    const part = this.parts.get(binding.partID), base = part.base[part.meshes.indexOf(binding.mesh)], [a2, b, c] = binding.indices, w = binding.bary;
    return binding.mesh.localToWorld(V().addScaledVector(V().fromArray(base, a2 * 3), w.x).addScaledVector(V().fromArray(base, b * 3), w.y).addScaledVector(V().fromArray(base, c * 3), w.z));
  }
  getAnchor(partID, restPointThree) {
    const binding = this.bindSurface({ partID, point: restPointThree }), world = this.surfacePoint(binding), ndc = world.clone().project(this.camera);
    const material = binding.mesh.material, opacity = material.opacity;
    const ray = world.clone().sub(this.camera.position), distance = ray.length();
    this.annotationRay.set(this.camera.position, ray.normalize());
    this.annotationRay.far = Math.max(0, distance - 0.025);
    const hit = this.annotationRay.intersectObject(this.pavilion, true).find((h) => h.object instanceof T2.Mesh && h.object.material.opacity > 0.45);
    const occluded = !!hit, visible = ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && opacity > 0.18 && !occluded;
    return { partID, partId: partID, world: world.toArray(), x: (ndc.x + 1) * 960, y: (1 - ndc.y) * 540, visible, occluded, opacity, distanceToSurface: binding.distance };
  }
  getAnnotationAnchors(s) {
    if (!this.manifest) return {};
    const out = {};
    for (const [term, spec] of Object.entries(TERM_ANCHORS)) {
      if (spec.scene !== s.scene) continue;
      out[term] = this.getAnchor(spec.partID, spec.point);
      if (TERM_LABELS[term]) out[TERM_LABELS[term]] = out[term];
      if (term === "hipRafter") out.rafter = out[term];
      if (term === "hipDeck") out.deck = out[term];
    }
    const addGroup = (key, memberIds) => {
      if (!out[key]) return;
      const points = [];
      for (const id of memberIds) {
        const part = this.parts.get(id);
        const box = new T2.Box3().setFromObject(part.root);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(V(x, y, z).project(this.camera));
      }
      out[key].groupBounds = { left: Math.min(...points.map((v) => (v.x + 1) * 960)), right: Math.max(...points.map((v) => (v.x + 1) * 960)), top: Math.min(...points.map((v) => (1 - v.y) * 540)), bottom: Math.max(...points.map((v) => (1 - v.y) * 540)) };
      out[key].memberIds = memberIds;
    };
    addGroup("bent", ["POST_FL", "POST_FR", "CROSS_FRONT", "BRACE_X_FL", "BRACE_X_FR"]);
    addGroup("bracket", ["DOU_FL", "GONG_X_FL", "GONG_Y_FL", "CAP_FL"]);
    if (s.scene === "gravity" && s.line === 4) {
      out.compression = this.getAnchor("PURLIN_Y_LEFT", [-1.59, 4.1395, 0.396]);
      out.tension = this.getAnchor("PURLIN_Y_LEFT", [-1.59, 4.0005, 0.396]);
      out["\u53D7\u538B"] = out.compression;
      out["\u53D7\u62C9"] = out.tension;
    }
    return out;
  }
  getPhysicsOverlay(s) {
    const u = s.line + s.lineProgress, p = this.blendedPose(s), out = { mode: "none", label: "", unit: "", min: 0, max: 0, parts: [], displayGain: this.displayGain, signed: false, flow: false, opacity: 0 };
    if (s.scene === "gravity") {
      Object.assign(out, { mode: "path", label: "\u91CD\u91CF\u6CBF\u652F\u627F\u9762\u4F20\u9012", parts: FORCE_FOCUS_PARTS[Math.min(9, s.line)] ?? [], opacity: p.force });
      if (u >= 4 && u < 5.1) {
        const member = this.physics.members.find((m) => m.id === 177), ends = member.nodes.map((n) => {
          const v = this.nodes.get(String(n));
          return [v.x, -v.z, v.y];
        });
        const response = this.staticData.cases.gravity.response, top = sampleSigned(response, prepareCoordinate(member, ends, [-1.59, 4.1395, 0.396])), bottom = sampleSigned(response, prepareCoordinate(member, ends, [-1.59, 4.0005, 0.396]));
        Object.assign(out, { mode: "signed", label: "\u8FD9\u6BB5\u6AA9\u7684\u62C9\u538B", unit: "MPa", signed: true, min: -response.members.PURLIN_Y_LEFT.sigmaMaxAbsPa / 1e6, max: response.members.PURLIN_Y_LEFT.sigmaMaxAbsPa / 1e6, parts: ["PURLIN_Y_LEFT"], opacity: p.heat, probe: { topMPa: top / 1e6, bottomMPa: bottom / 1e6 } });
      } else if (u >= 6.1 && u < 7) {
        const scale = this.staticData.cases.gravity.response.members.POST_FL.sigmaMaxAbsPa / 1e6;
        Object.assign(out, { mode: "signed", label: "\u67F1\u8EAB\u4EE5\u8F74\u538B\u4E3A\u4E3B", unit: "MPa", signed: true, min: -scale, max: scale, parts: ["POST_FL"], opacity: p.heat });
      } else if (u >= 7 && u < 8) {
        const value = force_evidence_default.gravitySupportReactions["1"][1];
        Object.assign(out, { mode: "reaction", label: "\u67F1\u811A\u53CD\u529B", unit: "N", max: value, parts: ["STONE_FL", "POST_FL"] });
      }
    } else if (s.scene === "wind") {
      if (u < 2) {
        Object.assign(out, { mode: "flow", label: "\u98CE\u7ED5\u8FC7\u5C4B\u6A90\uFF0C\u7A7F\u8FC7\u67F1\u95F4", flow: true, opacity: p.flow });
      } else if (u < 3) {
        Object.assign(out, { mode: "pressure", label: "\u5C4B\u9762\u4FA7\u63A8\u4E0E\u4E0A\u6380", unit: "Pa", min: Math.min(...force_evidence_default.panels.map((v) => v.pressure_Pa)), max: Math.max(...force_evidence_default.panels.map((v) => v.pressure_Pa)), parts: force_evidence_default.panels.map((v) => v.id), opacity: p.force });
      } else if (u < 5.85) {
        Object.assign(out, { mode: "path", label: u < 4 ? "\u4F20\u5230\u6881\u67F1\u63A5\u5934" : u < 5 ? "\u659C\u6491\u7EA6\u675F\u6846\u67B6\u53D8\u659C" : "\u69FD\u9762\u627F\u538B\uFF0C\u6728\u9500\u9650\u5236\u9000\u51FA", parts: u < 4 ? ["PURLIN_Y_LEFT", "POST_FL"] : u < 5 ? ["BRACE_X_FL", "BRACE_X_FR"] : ["POST_FL", "CROSS_FRONT", "PEG_X_FL"], opacity: p.force });
        if (u >= 4 && u < 5) {
          const response = this.staticData.cases.gravity_wind.response, scale = Math.max(response.members.BRACE_X_FL.sigmaMaxAbsPa, response.members.BRACE_X_FR.sigmaMaxAbsPa) / 1e6;
          Object.assign(out, { mode: "signed", signed: true, label: "\u4E24\u4FA7\u659C\u6491\u7684\u62C9\u538B", unit: "MPa", min: -scale, max: scale, opacity: p.heat });
        }
      } else {
        Object.assign(out, { mode: "envelope", label: "\u6784\u4EF6\u5E94\u529B\u5E45\u503C", unit: "MPa", max: this.maxStress / 1e6, parts: [...this.members.keys()], opacity: p.heat });
      }
    }
    return out;
  }
  updateForces(s, p) {
    const u = s.line + s.lineProgress, unitY = V(0, 1, 0), gravity = s.scene === "gravity";
    for (const route of this.routeVisuals) {
      const matches = route.spec.scene === "wind" ? s.scene === "wind" : gravity;
      const active = matches ? smooth((u - route.spec.start) / 0.32) * (1 - smooth((u - route.spec.end) / 0.35)) : 0;
      const overview = gravity && !route.spec.scene ? smooth((u - 9) / 0.35) * (1 - smooth((u - 9.65) / 0.35)) : 0;
      let amount = Math.max(active, overview * 0.7) * p.force;
      if (gravity && ["purlin-run", "birdsmouth-seat"].includes(route.spec.id)) amount *= 1 - scalar([[0, 0], [3.85, 0], [4.12, 1], [4.9, 1], [5.15, 0], [10, 0]], u);
      if (s.scene === "wind" && u >= 3 && u < 4.3 && ["corner-lap", "cap-arm", "arm-block", "block-column"].includes(route.spec.id)) amount = p.force * smooth((u - 3) / 0.22) * (1 - smooth((u - 4) / 0.3));
      const points = route.bindings.map((b) => this.surfacePoint(b));
      route.segments.forEach((segment, i) => {
        const a2 = points[i], b = points[i + 1], direction = b.clone().sub(a2), length2 = direction.length(), at = a2.clone().lerp(b, 0.5);
        for (const mesh of [segment.core, segment.halo]) {
          mesh.position.copy(at);
          mesh.quaternion.setFromUnitVectors(unitY, length2 > 1e-8 ? direction.clone().normalize() : unitY);
          mesh.scale.y = Math.max(1e-4, length2);
        }
        segment.core.material.opacity = amount * 0.88;
        segment.halo.material.opacity = amount * 0.16;
      });
      const lengths = points.slice(1).map((v, i) => v.distanceTo(points[i])), total = lengths.reduce((a2, b) => a2 + b, 0);
      route.dots.forEach((dot2, k) => {
        let d = (s.time * 0.31 + k / 3) % 1 * total, segment = 0;
        while (segment < lengths.length - 1 && d > lengths[segment]) {
          d -= lengths[segment];
          segment++;
        }
        dot2.position.copy(points[segment]).lerp(points[segment + 1], clamp2(d / Math.max(1e-6, lengths[segment])));
        dot2.material.opacity = route.spec.contact ? 0 : amount * 0.94;
      });
      route.ring.position.copy(points.at(-1));
      route.ring.quaternion.copy(this.camera.quaternion);
      route.ring.scale.setScalar(1 + 0.09 * Math.sin(s.time * 2.1));
      route.ring.material.opacity = route.spec.contact ? amount * 0.88 : 0;
    }
    for (const load of this.loadArrows) {
      let alpha = 0;
      if (load.kind === "weight" && gravity) alpha = p.force * scalar([[0, 0.7], [1, 0.7], [2.7, 0.3], [3.4, 0], [8.9, 0], [9.3, 0.35], [10, 0]], u);
      if (load.kind === "wind" && s.scene === "wind") alpha = p.force * scalar([[0, 0], [0.5, 0.7], [1.6, 0.3], [2.15, 1], [2.9, 0.6], [3.4, 0], [8, 0]], u);
      if (load.kind === "reaction" && gravity) alpha = p.force * scalar([[0, 0], [6.9, 0], [7.2, 1], [7.8, 1], [8.15, 0], [9.1, 0], [9.4, 0.55], [10, 0]], u);
      const length2 = (load.kind === "reaction" ? 0.58 : 0.66) * (0.7 + load.amplitude * 0.55), tip = this.surfacePoint(load.anchor);
      load.arrow.position.copy(tip).addScaledVector(load.direction, -length2);
      load.arrow.setDirection(load.direction);
      load.arrow.setLength(length2, 0.15, 0.07);
      load.arrow.traverse((o) => {
        if (o instanceof T2.Line || o instanceof T2.Mesh) o.material.opacity = alpha;
      });
      load.shaft.position.copy(tip).addScaledVector(load.direction, -(length2 + 0.12) * 0.5);
      load.shaft.quaternion.setFromUnitVectors(unitY, load.direction);
      load.shaft.scale.y = length2 - 0.12;
      load.shaft.material.opacity = alpha;
    }
    if (this.displacementMeasure) {
      const { binding, rest, current, shaft, restRing } = this.displacementMeasure, a2 = this.restSurfacePoint(binding), b = this.surfacePoint(binding), direction = b.clone().sub(a2), length2 = direction.length();
      const alpha = s.scene === "wind" ? scalar([[0, 0], [5.94, 0], [6.08, 1], [6.7, 1], [7, 0], [8, 0]], u) : 0;
      rest.position.copy(a2);
      current.position.copy(b);
      restRing.position.copy(a2);
      restRing.quaternion.copy(this.camera.quaternion);
      shaft.position.copy(a2).lerp(b, 0.5);
      shaft.quaternion.setFromUnitVectors(unitY, length2 > 1e-8 ? direction.normalize() : unitY);
      shaft.scale.y = Math.max(1e-5, length2);
      for (const mesh of [rest, current, shaft, restRing]) mesh.material.opacity = alpha;
    }
  }
  buildFlow() {
    this.flowData.slices.forEach((slice, plane) => {
      const paths = (slice.streamlines ?? []).filter((path, i) => i % 2 === 0 && path.some((p) => p[1] < 7 && p[1] > 0.3));
      if (!paths.length) throw Error("Actual flow solver streamlines missing");
      paths.forEach((path, i) => {
        for (const z of [-slice.plane_y_m]) {
          const points = path.map((v) => V(v[0], v[1], z));
          const line = new T2.Line(new T2.BufferGeometry().setFromPoints(points), new T2.LineBasicMaterial({ color: 6264471, transparent: true, opacity: 0, depthWrite: false }));
          line.userData.plane = plane;
          line.frustumCulled = false;
          this.flowRoot.add(line);
          const dot2 = new T2.Mesh(new T2.SphereGeometry(0.032, 8, 6), new T2.MeshBasicMaterial({ color: 3440263, transparent: true, opacity: 0 }));
          this.flowRoot.add(dot2);
          this.flowLines.push({ line, points, dot: dot2, seed: i * 0.073 + z * 0.03 });
        }
      });
    });
  }
  render(s) {
    if (!this.manifest) return;
    this.latestState = s;
    const p = this.blendedPose(s), r = this.response(s), u = s.line + s.lineProgress;
    const signedParts = s.scene === "gravity" ? [u < 5.2 ? "PURLIN_Y_LEFT" : "POST_FL"] : s.scene === "wind" && u >= 3.95 && u < 5 ? ["BRACE_X_FL", "BRACE_X_FR"] : [];
    const signedMix = signedParts.length ? p.heat : 0;
    const frameDisplacement = /* @__PURE__ */ new Map();
    if (p.deform > 0) for (const [id] of this.nodes) {
      const a2 = r.a.nodalDisplacements[id], b = r.b.nodalDisplacements[id];
      frameDisplacement.set(id, [mix(a2[0], b[0], r.t), mix(a2[2], b[2], r.t), -mix(a2[1], b[1], r.t)]);
    }
    this.camera.position.copy(p.position);
    this.camera.lookAt(p.target);
    this.camera.updateMatrixWorld(true);
    for (const part of this.parts.values()) {
      const partQ = this.getPartAssemblyQ(part.info.id, s, p);
      part.offset.copy(this.offset(part.info, partQ));
      part.root.position.copy(part.offset);
      const stressA = r.a.members[part.info.id]?.sigmaMaxAbsPa, stressB = r.b.members[part.info.id]?.sigmaMaxAbsPa;
      const stress = stressA === void 0 ? void 0 : mix(stressA, stressB ?? stressA, r.t);
      part.meshes.forEach((mesh, k) => {
        const material = mesh.material, base = material.userData.baseColor;
        material.color.copy(base);
        const localHeat = p.heat * (signedParts.length ? signedParts.includes(part.info.id) ? 1 : 0 : 1);
        const focus = FORCE_FOCUS_PARTS[Math.min(9, s.line)] ?? [], focusPrevious = FORCE_FOCUS_PARTS[Math.max(0, s.line - 1)] ?? [];
        const focusAmount = s.scene === "gravity" ? mix(focusPrevious.includes(part.info.id) ? 1 : 0, focus.includes(part.info.id) ? 1 : 0, smooth(s.lineProgress / 0.3)) : 0;
        material.emissive.set("#bc793d");
        material.emissiveIntensity = focusAmount * 0.075 * p.force;
        material.userData.physicsMapBlend.value = stress !== void 0 ? localHeat : 0;
        if (stress !== void 0 && localHeat > 0) {
          mesh.userData.hadHeat = true;
          material.color.setRGB(1, 1, 1);
          const colors = mesh.geometry.getAttribute("color");
          const signedResponse = s.scene === "wind" ? this.staticData.cases.gravity_wind.response : this.staticData.cases.gravity.response;
          const signedScale = Math.max(1, ...signedParts.map((id) => signedResponse.members[id]?.sigmaMaxAbsPa ?? 1));
          for (let i = 0; i < colors.count; i++) {
            const coordinate = part.stressCoordinates[k][i];
            let color = base.clone();
            if (coordinate && localHeat > 0) {
              const a2 = sampleEnvelope(r.a, coordinate), b = sampleEnvelope(r.b, coordinate);
              if (a2 !== void 0) {
                const envelope = this.heatColor(mix(a2, b ?? a2, r.t));
                if (signedMix > 0 && signedParts.includes(part.info.id)) {
                  const signed = sampleSigned(r.a, coordinate);
                  if (signed !== void 0) {
                    const c = new T2.Color("#ece4cc"), amp = clamp2(Math.abs(signed) / signedScale);
                    c.lerp(new T2.Color(signed < 0 ? "#347f91" : "#bd4c39"), amp);
                    envelope.copy(c);
                  }
                }
                color.lerp(envelope, localHeat);
              }
            }
            colors.setXYZ(i, color.r, color.g, color.b);
          }
          colors.needsUpdate = true;
        } else if (mesh.userData.hadHeat) {
          const colors = mesh.geometry.getAttribute("color");
          colors.array.fill(1);
          colors.needsUpdate = true;
          mesh.userData.hadHeat = false;
        }
        const pressureID = part.info.id.replace(/^TILE_/, "DECK_");
        if (p.inverse > 0 && this.inverseData.panel_ids?.includes(pressureID)) {
          const index = this.inverseData.panel_ids.indexOf(pressureID);
          const truth = this.inverseData.pressure_truth_Cp;
          const estimate = this.inverseData.pressure_recovered_Cp;
          if (truth && estimate) {
            let value = mix(truth[index], estimate[index], smooth(clamp2((s.progress - 0.5) / 0.35)));
            const steps = this.inverseData.diffusion_snapshots;
            if (s.progress > 0.22 && s.progress < 0.52 && steps?.length) {
              const j = clamp2((s.progress - 0.22) / 0.3) * (steps.length - 1), i = Math.floor(j);
              value = mix(steps[i].Cp[index], steps[Math.min(i + 1, steps.length - 1)].Cp[index], j - i);
            }
            const c = new T2.Color("#468a98").lerp(new T2.Color("#bd563d"), clamp2((value + 0.65) / 1.3));
            material.color.lerp(c, p.inverse);
            material.userData.physicsMapBlend.value = p.inverse;
          }
        }
        const post = part.info.id === "POST_FL", tile = part.info.id.startsWith("TILE_"), deck = part.info.id.startsWith("DECK_");
        let roofCut = 0;
        if (s.scene === "gravity") {
          const reveal = tile ? scalar([[0, 0], [0.8, 0], [1.25, 0.82], [2, 0.965], [8.95, 0.965], [9.55, 0.24], [10, 0]], u) : scalar([[0, 0], [1.7, 0], [2.2, 0.965], [8.95, 0.965], [9.55, 0.25], [10, 0]], u);
          roofCut = tile || deck ? reveal : 0;
          if (tile && u < 1) material.color.lerp(new T2.Color("#d5d3c8"), 0.35 * p.force);
        }
        if (s.scene === "wind") roofCut = tile || deck ? scalar([[0, 0], [2.7, 0], [3.2, 0.87], [6.9, 0.87], [7.55, 0], [8, 0]], u) : 0;
        if (s.scene === "hip" && tile) roofCut = scalar([[0, 0], [3.6, 0], [3.92, 0.8], [4.45, 0.8], [4.95, 0], [5, 0]], u);
        let contextCut = 0;
        if (s.scene === "gravity") {
          const clear = scalar([[0, 0], [1.65, 0], [2.1, 0.945], [8.9, 0.945], [9.55, 0], [10, 0]], u);
          if (part.info.id.startsWith("RAF_") && part.info.id !== "RAF_3_03") contextCut = clear;
          if (part.info.id.startsWith("HIP_") || part.info.id === "HUB" || part.info.id === "CENTRE_POST") contextCut = clear * 0.96;
          if (part.info.id === "RAF_3_03") contextCut = clear * scalar([[0, 0], [3.8, 0], [4.12, 1], [7.75, 1], [8.15, 0], [10, 0]], u);
          const fiberClose = scalar([[0, 0], [3.85, 0], [4.2, 0.99], [4.9, 0.99], [5.15, 0], [10, 0]], u);
          if (part.info.id !== "PURLIN_Y_LEFT" && !part.info.id.startsWith("STONE_") && part.info.role !== "base") contextCut = Math.max(contextCut, fiberClose);
        }
        if (s.scene === "wind" && /^RAF_|^HIP_/.test(part.info.id)) contextCut = scalar([[0, 0], [2.8, 0], [3.2, 0.73], [5.75, 0.73], [6.2, 0.25], [7.3, 0.25], [7.6, 0], [8, 0]], u);
        material.opacity = Math.min(post ? 1 - p.cut * 0.75 : 1, 1 - roofCut, 1 - contextCut);
        material.transparent = material.opacity < 0.999;
        material.depthWrite = material.opacity > 0.95;
        const pos = mesh.geometry.getAttribute("position"), original = part.base[k];
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
        } else if (mesh.userData.deformed) {
          pos.array.set(original);
          pos.needsUpdate = true;
          mesh.userData.deformed = false;
          mesh.geometry.computeBoundingSphere();
        }
      });
    }
    this.pavilion.updateMatrixWorld(true);
    this.updateForces(s, p);
    for (const f of this.flowLines) {
      const phase = ((s.time * 0.09 + f.seed) % 1 + 1) % 1;
      const index = clamp2(phase) * (f.points.length - 1), i = Math.floor(index);
      f.dot.position.copy(f.points[i]).lerp(f.points[Math.min(i + 1, f.points.length - 1)], index - i);
      const central = smooth(clamp2((u - 1.35) / 0.45)), weight = f.line.userData.plane === 1 ? central : 1 - central;
      f.line.material.opacity = p.flow * 0.43 * weight;
      f.dot.material.opacity = p.flow * 0.88 * weight;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof T2.Mesh || o instanceof T2.Line) {
        o.geometry.dispose();
        const m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach((x) => x.dispose());
      }
    });
    this.woodGrain.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
};
export {
  JoineryWorld,
  clamp2 as clamp,
  smooth
};
