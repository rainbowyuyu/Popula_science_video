import {ensureBrowser} from '@remotion/renderer';
const result=await ensureBrowser({logLevel:'info',chromeMode:'headless-shell'});
console.log(JSON.stringify({type:result.type,path:result.path}));
