import{createRequire} from"node:module";const require=createRequire(import.meta.url);
function n(e){return`'${e.replace(/'/g,"'\\''")}'`}function r(e){return e.map(n).join(" ")}export{r as a};
