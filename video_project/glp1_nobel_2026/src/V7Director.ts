import type {Clip} from './visual';
import type {V5View} from './V5CameraPath';

/** V7 editorial contract. Coordinates are metres; this selects a camera and
 * a semantic rendering family, never scales anatomy to fill the image.
 * Contiguous groups keep one physical location and do not restart at sentences.
 */
export type V7Shot={group:string;view:V5View;anchor:string;distance:number;az:number;el:number;roll?:number;parent:string};
export const V7_SHOTS:Record<string,V7Shot>={
 "h001": {
  "group": "opening-life",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 3.2,
  "az": 0.4,
  "el": 0.14,
  "parent": "mealPerson"
 },
 "h002": {
  "group": "opening-life",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 3.2,
  "az": 0.4,
  "el": 0.14,
  "parent": "mealPerson"
 },
 "h003": {
  "group": "body-map",
  "view": "torso",
  "anchor": "torso",
  "distance": 1.42,
  "az": 0.16,
  "el": 0.1,
  "parent": "torso"
 },
 "h004": {
  "group": "body-map",
  "view": "torso",
  "anchor": "torso",
  "distance": 1.42,
  "az": 0.16,
  "el": 0.1,
  "parent": "torso"
 },
 "h005": {
  "group": "digestive",
  "view": "gut",
  "anchor": "small_intestine",
  "distance": 0.65,
  "az": 0.18,
  "el": 0.12,
  "parent": "small_intestine"
 },
 "h006": {
  "group": "metabolic-macro",
  "view": "liver",
  "anchor": "liver",
  "distance": 0.62,
  "az": 0.05,
  "el": 0.12,
  "parent": "liver"
 },
 "h007": {
  "group": "pancreatic-macro",
  "view": "pancreas",
  "anchor": "pancreas",
  "distance": 0.46,
  "az": 0.1,
  "el": 0.16,
  "parent": "pancreas"
 },
 "h008": {
  "group": "muscle-uptake",
  "view": "muscle_cell",
  "anchor": "muscleCell",
  "distance": 8.5e-07,
  "az": 0.18,
  "el": 0.45,
  "parent": "muscle"
 },
 "h009": {
  "group": "muscle-uptake",
  "view": "muscle_cell",
  "anchor": "muscleCell",
  "distance": 8.5e-07,
  "az": 0.18,
  "el": 0.45,
  "parent": "muscle"
 },
 "h010": {
  "group": "pancreatic-compensation",
  "view": "pancreas",
  "anchor": "pancreas",
  "distance": 0.38,
  "az": 0.14,
  "el": 0.14,
  "parent": "pancreas"
 },
 "h011": {
  "group": "hepatic-export",
  "view": "liver",
  "anchor": "liver",
  "distance": 0.58,
  "az": -0.08,
  "el": 0.12,
  "parent": "liver"
 },
 "h012": {
  "group": "meal-choice",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 2.75,
  "az": 0.42,
  "el": 0.16,
  "parent": "mealPerson"
 },
 "h013": {
  "group": "activity-macro",
  "view": "muscle",
  "anchor": "personActivity",
  "distance": 3.15,
  "az": 0.26,
  "el": 0.12,
  "parent": "personActivity"
 },
 "h014": {
  "group": "muscle-uptake",
  "view": "muscle_cell",
  "anchor": "muscleCell",
  "distance": 8.5e-07,
  "az": 0.18,
  "el": 0.45,
  "parent": "muscle"
 },
 "h015": {
  "group": "muscle-uptake",
  "view": "muscle_cell",
  "anchor": "muscleCell",
  "distance": 8.5e-07,
  "az": 0.18,
  "el": 0.45,
  "parent": "muscle"
 },
 "h016": {
  "group": "preserve-muscle-action",
  "view": "muscle",
  "anchor": "personActivity",
  "distance": 3.2,
  "az": 0.27,
  "el": 0.12,
  "parent": "personActivity"
 },
 "h017": {
  "group": "gut-signals",
  "view": "gut",
  "anchor": "small_intestine",
  "distance": 0.65,
  "az": 0.16,
  "el": 0.12,
  "parent": "small_intestine"
 },
 "h018": {
  "group": "gut-brain",
  "view": "gut",
  "anchor": "gutBrain",
  "distance": 1.45,
  "az": 0.1,
  "el": 0.08,
  "parent": "small_intestine"
 },
 "h019": {
  "group": "gut-signal-experiment",
  "view": "gut",
  "anchor": "small_intestine",
  "distance": 0.65,
  "az": 0.16,
  "el": 0.12,
  "parent": "small_intestine"
 },
 "h020": {
  "group": "gut-signal-experiment",
  "view": "gut",
  "anchor": "small_intestine",
  "distance": 0.65,
  "az": 0.16,
  "el": 0.12,
  "parent": "small_intestine"
 },
 "h021": {
  "group": "pancreas-locator",
  "view": "pancreas",
  "anchor": "islet",
  "distance": 0.29,
  "az": 0.14,
  "el": 0.15,
  "parent": "pancreas"
 },
 "h022": {
  "group": "beta-signals",
  "view": "beta",
  "anchor": "beta",
  "distance": 4.3e-05,
  "az": 0.18,
  "el": 0.2,
  "parent": "pancreas"
 },
 "h023": {
  "group": "beta-signals",
  "view": "beta",
  "anchor": "beta",
  "distance": 4.3e-05,
  "az": 0.18,
  "el": 0.2,
  "parent": "pancreas"
 },
 "h024": {
  "group": "satiety-gastric",
  "view": "stomach",
  "anchor": "gutBrain",
  "distance": 1.45,
  "az": 0.1,
  "el": 0.08,
  "parent": "stomach"
 },
 "h025": {
  "group": "gastric-emptying",
  "view": "stomach",
  "anchor": "stomach",
  "distance": 0.62,
  "az": 0.19,
  "el": 0.12,
  "parent": "stomach"
 },
 "h026": {"group":"glp1-peptide-engineering","view":"drug","anchor":"drug","distance":24e-9,"az":.10,"el":.14,"parent":"veins"},
 "h027": {"group":"glp1-peptide-engineering","view":"drug","anchor":"drug","distance":24e-9,"az":.10,"el":.14,"parent":"veins"},
 "h028": {
  "group": "gastric-effects",
  "view": "stomach",
  "anchor": "stomach",
  "distance": 0.62,
  "az": 0.2,
  "el": 0.14,
  "parent": "stomach"
 },
 "h029": {
  "group": "gastric-effects",
  "view": "stomach",
  "anchor": "stomach",
  "distance": 0.62,
  "az": 0.2,
  "el": 0.14,
  "parent": "stomach"
 },
 "h030": {
  "group": "gastric-effects",
  "view": "stomach",
  "anchor": "stomach",
  "distance": 0.62,
  "az": 0.2,
  "el": 0.14,
  "parent": "stomach"
 },
 "h031": {
  "group": "nutrition-muscle",
  "view": "torso",
  "anchor": "gutMuscle",
  "distance": 1.4,
  "az": 0.18,
  "el": 0.1,
  "parent": "stomach"
 },
 "h032": {
  "group": "meal-choice",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 2.75,
  "az": 0.43,
  "el": 0.16,
  "parent": "mealPerson"
 },
 "h033": {
  "group": "hepatic-export",
  "view": "lipid_liver",
  "anchor": "liver",
  "distance": 0.53,
  "az": 0.07,
  "el": 0.12,
  "parent": "liver"
 },
 "h034": {
  "group": "ldl-transport",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.18,
  "el": 0.18,
  "parent": "liver"
 },
 "h035": {
  "group": "ldl-transport",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.18,
  "el": 0.18,
  "parent": "liver"
 },
 "h036": {
  "group": "ldl-transport",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.18,
  "el": 0.18,
  "parent": "liver"
 },
 "h037": {
  "group": "ldl-transport",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.18,
  "el": 0.18,
  "parent": "liver"
 },
 "h038": {
  "group": "vessel-plaque",
  "view": "plaque",
  "anchor": "artery",
  "distance": 0.033,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h039": {
  "group": "foam-cell",
  "view": "plaque",
  "anchor": "foamCell",
  "distance": 8.5e-05,
  "az": 0.4,
  "el": -0.35,
  "parent": "artery",
  "roll": 1.57079632679
 },
 "h040": {
  "group": "fat-choice",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 2.75,
  "az": 0.40,
  "el": 0.15,
  "parent": "mealPerson"
 },
 "h041": {
  "group": "ldl-recovery",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.16,
  "el": 0.2,
  "parent": "liver"
 },
 "h042": {
  "group": "ldl-recovery",
  "view": "lipoprotein",
  "anchor": "lipid",
  "distance": 4.8e-07,
  "az": 0.16,
  "el": 0.2,
  "parent": "liver"
 },
 "h043": {
  "group": "statin-muscle-context",
  "view": "torso",
  "anchor": "muscle",
  "distance": 0.65,
  "az": 0.22,
  "el": 0.1,
  "parent": "muscle"
 },
 "h044": {
  "group": "statin-muscle-context",
  "view": "torso",
  "anchor": "muscle",
  "distance": 0.65,
  "az": 0.22,
  "el": 0.1,
  "parent": "muscle"
 },
 "h045": {
  "group": "lipid-context",
  "view": "torso",
  "anchor": "torso",
  "distance": 1.18,
  "az": 0.13,
  "el": 0.12,
  "parent": "torso"
 },
 "h046": {
  "group": "arterial-pulse",
  "view": "pressure",
  "anchor": "artery",
  "distance": 0.05,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h047": {
  "group": "arterial-pulse",
  "view": "pressure",
  "anchor": "artery",
  "distance": 0.05,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h048": {
  "group": "muscle-arteriole",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0032,
  "az": 0.22,
  "el": 0.24,
  "parent": "muscle"
 },
 "h049": {
  "group": "muscle-arteriole",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0032,
  "az": 0.22,
  "el": 0.24,
  "parent": "muscle"
 },
 "h050": {
  "group": "kidney-locator",
  "view": "kidney",
  "anchor": "kidney",
  "distance": 0.4,
  "az": 0.14,
  "el": 0.18,
  "parent": "kidney"
 },
 "h051": {
  "group": "renal-salt",
  "view": "nephron",
  "anchor": "nephron",
  "distance": 0.0066,
  "az": 0.17,
  "el": 0.24,
  "parent": "kidney"
 },
 "h052": {
  "group": "salt-at-the-table",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 3.2,
  "az": 0.4,
  "el": 0.14,
  "parent": "mealPerson"
 },
 "h053": {
  "group": "renal-control",
  "view": "autonomic",
  "anchor": "renalControl",
  "distance": 0.86,
  "az": 0.12,
  "el": 0.16,
  "parent": "kidney"
 },
 "h054": {
  "group": "raas-arteriole",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0034,
  "az": 0.30,
  "el": 0.20,
  "parent": "muscle"
 },
 "h055": {
  "group": "renal-control",
  "view": "autonomic",
  "anchor": "renalControl",
  "distance": 0.86,
  "az": 0.12,
  "el": 0.16,
  "parent": "kidney"
 },
 "h056": {
  "group": "renal-control",
  "view": "autonomic",
  "anchor": "renalControl",
  "distance": 0.86,
  "az": 0.12,
  "el": 0.16,
  "parent": "kidney"
 },
 "h057": {
  "group": "renal-control",
  "view": "autonomic",
  "anchor": "renalControl",
  "distance": 0.86,
  "az": 0.12,
  "el": 0.16,
  "parent": "kidney"
 },
 "h058": {
  "group": "airway",
  "view": "brainheart",
  "anchor": "airway",
  "distance": 0.21,
  "az": 1.27,
  "el": 0.125,
  "parent": "brainstem"
 },
 "h059": {
  "group": "airway",
  "view": "brainheart",
  "anchor": "airway",
  "distance": 0.21,
  "az": 1.27,
  "el": 0.125,
  "parent": "brainstem"
 },
 "h060": {
  "group": "arteriole-treatment",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0026,
  "az": 0.45,
  "el": 0.27,
  "parent": "muscle"
 },
 "h061": {
  "group": "arteriole-treatment",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0026,
  "az": 0.45,
  "el": 0.27,
  "parent": "muscle"
 },
 "h062": {
  "group": "arteriole-treatment",
  "view": "arteriole",
  "anchor": "arteriole",
  "distance": 0.0026,
  "az": 0.45,
  "el": 0.27,
  "parent": "muscle"
 },
 "h063": {
  "group": "renal-treatment",
  "view": "nephron",
  "anchor": "nephron",
  "distance": 0.0072,
  "az": 0.23,
  "el": 0.23,
  "parent": "kidney"
 },
 "h064": {
  "group": "renal-treatment",
  "view": "nephron",
  "anchor": "nephron",
  "distance": 0.0072,
  "az": 0.23,
  "el": 0.23,
  "parent": "kidney"
 },
 "h065": {
  "group": "renal-treatment",
  "view": "nephron",
  "anchor": "nephron",
  "distance": 0.0072,
  "az": 0.23,
  "el": 0.23,
  "parent": "kidney"
 },
 "h066": {
  "group": "measurement",
  "view": "homecheck",
  "anchor": "measurement",
  "distance": 2.85,
  "az": 0.28,
  "el": 0.12,
  "parent": "measurement"
 },
 "h067": {
  "group": "measurement",
  "view": "homecheck",
  "anchor": "measurement",
  "distance": 2.85,
  "az": 0.28,
  "el": 0.12,
  "parent": "measurement"
 },
 "h068": {
  "group": "vessel-clot",
  "view": "thrombus",
  "anchor": "artery",
  "distance": 0.042,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h069": {
  "group": "vessel-clot",
  "view": "thrombus",
  "anchor": "artery",
  "distance": 0.042,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h070": {
  "group": "vessel-clot",
  "view": "thrombus",
  "anchor": "artery",
  "distance": 0.042,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h071": {
  "group": "vessel-clot",
  "view": "thrombus",
  "anchor": "artery",
  "distance": 0.042,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h072": {
  "group": "vessel-clot",
  "view": "thrombus",
  "anchor": "artery",
  "distance": 0.042,
  "az": 0.52,
  "el": -0.73,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h073": {
  "group": "atrial-clot",
  "view": "brainheart",
  "anchor": "leftAtrium",
  "distance": 0.105,
  "az": 0.65,
  "el": 0.24,
  "parent": "heart"
 },
 "h074": {
  "group": "atrial-clot",
  "view": "brainheart",
  "anchor": "leftAtrium",
  "distance": 0.105,
  "az": 0.65,
  "el": 0.24,
  "parent": "heart"
 },
 "h075": {
  "group": "clinical-summary",
  "view": "pressure",
  "anchor": "artery",
  "distance": 0.085,
  "az": 0.48,
  "el": 0.48,
  "parent": "aorta",
  "roll": 1.57079632679
 },
 "h076": {
  "group": "clinical-clot-detail",
  "view": "clot_detail",
  "anchor": "clotDetail",
  "distance": 75e-6,
  "az": 0.16,
  "el": 0.46,
  "parent": "aorta"
 },
 "h077": {
  "group": "clinical-summary",
  "view": "brainheart",
  "anchor": "brainheart",
  "distance": 1.18,
  "az": 0.16,
  "el": 0.08,
  "parent": "torso"
 },
 "h078": {
  "group": "closing-meal",
  "view": "meal",
  "anchor": "mealPerson",
  "distance": 3.2,
  "az": 0.4,
  "el": 0.16,
  "parent": "mealPerson"
 },
 "h079": {
  "group": "daily-activity",
  "view": "muscle",
  "anchor": "personActivity",
  "distance": 3.25,
  "az": 0.22,
  "el": 0.11,
  "parent": "personActivity"
 },
 "h080": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h081": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h082": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h083": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h084": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h085": {
  "group": "daily-feedback",
  "view": "torso",
  "anchor": "wholeRegulation",
  "distance": 1.9,
  "az": 0.14,
  "el": 0.08,
  "parent": "torso"
 },
 "h086": {
  "group": "review-measurement",
  "view": "homecheck",
  "anchor": "measurement",
  "distance": 2.8,
  "az": 0.28,
  "el": 0.12,
  "parent": "measurement"
 },
 "h087": {
  "group": "review-measurement",
  "view": "homecheck",
  "anchor": "measurement",
  "distance": 2.8,
  "az": 0.28,
  "el": 0.12,
  "parent": "measurement"
 },
 "h088": {
  "group": "closing-body",
  "view": "torso",
  "anchor": "torso",
  "distance": 1.45,
  "az": 0.17,
  "el": 0.12,
  "parent": "torso"
 },
 "h089": {
  "group": "closing-life",
  "view": "muscle",
  "anchor": "personActivity",
  "distance": 2.9,
  "az": 0.25,
  "el": 0.1,
  "parent": "personActivity"
 }
};
export const directedShot=(clip:Clip)=>V7_SHOTS[clip.id];
export const directedView=(clip:Clip):V5View=>directedShot(clip)?.view??(clip as Clip&{view?:V5View}).view??'torso';
