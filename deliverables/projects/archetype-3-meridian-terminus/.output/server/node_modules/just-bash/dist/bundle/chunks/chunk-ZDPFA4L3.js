import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{a as r,b as m}from"./chunk-QAYAQNCG.js";var p={name:"basename",summary:"strip directory and suffix from filenames",usage:`basename NAME [SUFFIX]
basename OPTION... NAME...`,options:["-a, --multiple   support multiple arguments","-s, --suffix=SUFFIX  remove a trailing SUFFIX","    --help       display this help and exit"]},c={name:"basename",async execute(n,u){if(m(n))return r(p);let l=!1,s="",a=[];for(let t=0;t<n.length;t++){let e=n[t];e==="-a"||e==="--multiple"?l=!0:e==="-s"&&t+1<n.length?(s=n[++t],l=!0):e.startsWith("--suffix=")?(s=e.slice(9),l=!0):e.startsWith("-")||a.push(e)}if(a.length===0)return{stdout:"",stderr:`basename: missing operand
`,exitCode:1};!l&&a.length>=2&&(s=a.pop()??"");let o=[];for(let t of a){let e=t.replace(/\/+$/,""),i=e.split("/").pop()||e;s&&i.endsWith(s)&&(i=i.slice(0,-s.length)),o.push(i)}return{stdout:`${o.join(`
`)}
`,stderr:"",exitCode:0}}},h={name:"basename",flags:[{flag:"-a",type:"boolean"},{flag:"-s",type:"value",valueHint:"string"}],needsArgs:!0};export{c as a,h as b};
