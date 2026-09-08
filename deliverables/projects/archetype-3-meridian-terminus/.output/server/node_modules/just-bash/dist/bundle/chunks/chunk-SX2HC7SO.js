import{createRequire} from"node:module";const require=createRequire(import.meta.url);
function n(e){let r=e.match(/^(\d+\.?\d*)(s|m|h|d)?$/);if(!r)return null;let t=parseFloat(r[1]);switch(r[2]||"s"){case"s":return t*1e3;case"m":return t*60*1e3;case"h":return t*60*60*1e3;case"d":return t*24*60*60*1e3;default:return null}}export{n as a};
