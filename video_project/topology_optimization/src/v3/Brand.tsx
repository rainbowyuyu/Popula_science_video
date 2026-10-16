import React from 'react';
// Short-edge units: 1080 => x64 / y48 / image height90 / gap20 / wordmark44.
export function BrandLockup({src,scale=1}:{src:string;scale?:number}){
 return <div style={{display:'flex',alignItems:'center',gap:20*scale,height:90*scale,color:'#193643',whiteSpace:'nowrap'}}>
  <img src={src} alt="" style={{width:90*347/410*scale,height:90*scale,objectFit:'contain'}}/>
  <span style={{fontFamily:'"Microsoft YaHei",sans-serif',fontSize:44*scale,fontWeight:600,lineHeight:1}}>rainbow鱼</span>
 </div>;
}
