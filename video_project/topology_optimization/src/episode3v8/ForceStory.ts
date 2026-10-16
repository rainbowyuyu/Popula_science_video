/** Geometry-bound explanatory routes. These are NOT contact-force FE results.
 * Coordinates are assembled Three world metres, on the unchanged v7 pavilion.
 * Render bindings project each point onto its named part's actual triangles.
 */
export type RestAnchor={partID:string;point:[number,number,number]};
export type RouteSpec={id:string;points:RestAnchor[];start:number;end:number;contact?:boolean;scene?:'wind'};
const a=(partID:string,x:number,y:number,z:number):RestAnchor=>({partID,point:[x,y,z]});
export const GRAVITY_ROUTES:RouteSpec[]=[
 {id:'tile-board',start:1,end:2.8,contact:true,points:[a('TILE_LEFT',-1.04,4.59,.528),a('DECK_LEFT',-1.04,4.57,.528)]},
 {id:'board-rafter',start:2,end:3.8,contact:true,points:[a('DECK_LEFT',-1.04,4.55,.528),a('RAF_3_03',-1.04,4.536,.528)]},
 {id:'rafter-run',start:2.3,end:4,points:[a('RAF_3_03',-.78,4.692,.528),a('RAF_3_03',-1.15,4.47,.528),a('RAF_3_03',-1.50,4.26,.528)]},
 {id:'birdsmouth-seat',start:3,end:4.5,contact:true,points:[a('RAF_3_03',-1.50,4.14,.528),a('PURLIN_Y_LEFT',-1.50,4.14,.528)]},
 {id:'purlin-run',start:3.35,end:6,points:[a('PURLIN_Y_LEFT',-1.591,4.07,.528),a('PURLIN_Y_LEFT',-1.591,4.07,1.12),a('PURLIN_Y_LEFT',-1.591,4.105,1.50)]},
 // The Y purlin is the upper half-lap. Its corner first bears on the X
 // purlin's remaining lower half, then onto the cap. Do not bridge the void.
 {id:'corner-lap',start:5,end:6.4,contact:true,points:[a('PURLIN_Y_LEFT',-1.50,4.0708,1.50),a('PURLIN_X_FRONT',-1.50,4.0692,1.50),a('CAP_FL',-1.50,4.0,1.50)]},
 {id:'cap-arm',start:5.2,end:6.7,contact:true,points:[a('CAP_FL',-1.60,3.87,1.50),a('GONG_X_FL',-1.60,3.87,1.50)]},
 {id:'arm-block',start:5.35,end:6.7,contact:true,points:[a('GONG_X_FL',-1.60,3.75,1.50),a('DOU_FL',-1.60,3.75,1.50)]},
 {id:'block-column',start:5.6,end:7,contact:true,points:[a('DOU_FL',-1.60,3.63,1.50),a('POST_FL',-1.60,3.63,1.50)]},
 {id:'column-run',start:6,end:8.4,points:[a('POST_FL',-1.641,3.5,1.5),a('POST_FL',-1.641,2.2,1.5),a('POST_FL',-1.641,.41,1.5)]},
 {id:'column-stone',start:7,end:8.4,contact:true,points:[a('POST_FL',-1.5,.40,1.5),a('STONE_FL',-1.5,.40,1.5)]},
 {id:'cantilever-seat',start:8,end:9,points:[a('RAF_3_03',-2.18,3.852,.528),a('RAF_3_03',-1.8,4.08,.528),a('RAF_3_03',-1.5,4.14,.528)]},
];
export const WIND_ROUTES:RouteSpec[]=[
 {id:'brace-left',scene:'wind',start:4,end:5,points:[a('CROSS_FRONT',-.78,2.85,1.5),a('BRACE_X_FL',-.78,2.86,1.55),a('BRACE_X_FL',-1.42,2.13,1.55),a('POST_FL',-1.36,2.13,1.5)]},
 {id:'brace-right',scene:'wind',start:4,end:5,points:[a('CROSS_FRONT',.78,2.85,1.5),a('BRACE_X_FR',.78,2.86,1.55),a('BRACE_X_FR',1.42,2.13,1.55),a('POST_FR',1.36,2.13,1.5)]},
 {id:'mortise-shoulder',scene:'wind',start:5,end:5.9,contact:true,points:[a('CROSS_FRONT',-1.36,3.11,1.5),a('POST_FL',-1.36,3.11,1.5)]},
 {id:'peg-hole',scene:'wind',start:5.3,end:5.95,contact:true,points:[a('PEG_X_FL',-1.50,3.014,1.64),a('POST_FL',-1.50,3.02,1.64)]},
];
export const FORCE_FOCUS_PARTS:Record<number,string[]>={
 0:['TILE_LEFT','TILE_FRONT','TILE_RIGHT','TILE_BACK'],
 1:['TILE_LEFT','DECK_LEFT'],2:['DECK_LEFT','RAF_3_03'],
 3:['RAF_3_03','PURLIN_Y_LEFT'],4:['PURLIN_Y_LEFT'],
 5:['PURLIN_Y_LEFT','PURLIN_X_FRONT','CAP_FL','GONG_X_FL','GONG_Y_FL','DOU_FL'],
 6:['DOU_FL','POST_FL'],7:['POST_FL','STONE_FL'],
 8:['RAF_3_03','PURLIN_Y_LEFT'],9:['RAF_3_03','PURLIN_Y_LEFT','CAP_FL','GONG_X_FL','DOU_FL','POST_FL','STONE_FL'],
};
/** u=line+lineProgress, target x/y/z, distance, azimuth, elevation. */
export const GRAVITY_CAMERA=[
 [0,0,2.65,0,14.7,.47,.35],[.9,-.5,4.32,.3,9.5,-.7,.47],
 [1.45,-1.08,4.49,.528,5.8,-.94,.30],[2.35,-1.15,4.45,.528,4.8,-1.10,.25],
 [3.25,-1.5,4.18,.528,3.9,-1.18,.17],[4.20,-1.5,4.07,.60,2.4,-1.19,.025],
 [5.25,-1.5,3.84,1.5,3.55,-.78,.15],[6.30,-1.5,2.18,1.5,6.0,-.72,.13],
 [6.82,-1.5,.60,1.5,4.4,-.76,.24],[7.72,-1.5,.60,1.5,4.4,-.76,.24],[8.25,-1.93,3.96,.528,5.3,-1.15,.24],
 [9.55,0,2.65,0,14.7,.47,.35],[10,0,2.65,0,14.7,.47,.35],
];
export const WIND_CAMERA=[
 [0,0,2.65,0,14.7,.47,.35],[.85,0,2.95,0,15.0,-.65,.25],
 [1.55,0,3.08,0,14.4,-.28,.25],[2.35,-.12,4.24,0,10.6,-.63,.34],
 [3.28,-1.5,3.56,1.5,4.8,-.7,.2],[4.25,0,2.74,1.5,8.3,.02,.10],
 [5.25,-1.50,3.0,1.5,3.3,-.8,.14],[5.8,-1.50,3.0,1.5,3.3,-.8,.14],
 [6.12,-1.5,3.25,1.5,4.7,-.65,.18],[6.40,-1.4,3.3,1.5,5.3,-.60,.18],
 [6.83,0,2.65,0,14.7,.42,.31],[7.6,0,2.65,0,14.7,.60,.35],[8,0,2.65,0,14.7,.60,.35],
];
export type TermAnchor=RestAnchor&{scene:string;lines:[number,number];candidates?:[number,number,number][]};
export const TERM_ANCHORS:Record<string,TermAnchor>={
 tenon:{...a('CROSS_FRONT',-1.50,3.07,1.53),scene:'straight',lines:[0,1.2],candidates:[[-1.64,3.04,1.53]]},
 mortise:{...a('POST_FL',-1.64,2.9292,1.5),scene:'straight',lines:[0,1.2]},
 shoulder:{...a('CROSS_FRONT',-1.36,3.11,1.5),scene:'straight',lines:[1.3,2.5]},
 peg:{...a('PEG_X_FL',-1.5,3.014,1.64),scene:'straight',lines:[5,6.2],candidates:[[-1.50,3.0,1.67]]},
 bent:{...a('CROSS_FRONT',0,3.15,1.50),scene:'frame',lines:[0,1]},
 longitudinal:{...a('LONG_RIGHT',1.59,3.42,.40),scene:'frame',lines:[1,2]},
 brace:{...a('BRACE_X_FL',-1.08,2.47,1.55),scene:'straight',lines:[4,5]},
 hip:{...a('HIP_FL',-.670800764,4.719335821,.670800744),scene:'hip',lines:[0,1]},
 hipRafter:{...a('RAF_3_05',-1.30,4.38,0),scene:'hip',lines:[3,4]},
 hipDeck:{...a('DECK_LEFT',-1.30,4.412,.50),scene:'hip',lines:[4,5]},
 board:{...a('DECK_LEFT',-1.08,4.53,.75),scene:'gravity',lines:[1,2]},
 rafter:{...a('RAF_3_03',-1.15,4.47,.56),scene:'gravity',lines:[2,3]},
 purlin:{...a('PURLIN_Y_LEFT',-1.59,4.07,.396),scene:'gravity',lines:[3,4]},
 bracket:{...a('GONG_X_FL',-1.78,3.81,1.56),scene:'bracket',lines:[0,2]},
 dou:{...a('DOU_FL',-1.5,3.69,1.67),scene:'bracket',lines:[1,3]},
 gong:{...a('GONG_X_FL',-1.76,3.81,1.58),scene:'bracket',lines:[1,3]},
 shortPost:{...a('CENTRE_POST',0,4.42,.08),scene:'hip',lines:[2,3]},
 supportBeam:{...a('SUPPORT_X',-.48,4.07,.08),scene:'hip',lines:[2,3]},
 post:{...a('POST_FL',-1.64,2.2,1.5),scene:'gravity',lines:[6,8]},
 stone:{...a('STONE_FL',-1.76,.27,1.50),scene:'gravity',lines:[7,8]},
 stress:{...a('CROSS_FRONT',0,3.0,1.61),scene:'wind',lines:[6,7]},
 displacement:{...a('POST_FL',-1.50,3.30,1.64),scene:'wind',lines:[6,7]},
};
export const TERM_LABELS:Record<string,string>={tenon:'榫',mortise:'卯',shoulder:'榫肩',peg:'木销',bent:'一榀梁架',longitudinal:'纵枋',brace:'斜撑',bracket:'斗栱',dou:'斗',gong:'栱',shortPost:'短柱',supportBeam:'托梁',post:'柱',hip:'角梁',hipRafter:'椽',rafter:'椽',hipDeck:'望板',board:'望板',purlin:'檩',stone:'柱础',stress:'应力',displacement:'位移',compression:'受压',tension:'受拉'};
