import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{a as o,b as i}from"./chunk-QAYAQNCG.js";var m={name:"dirname",summary:"strip last component from file name",usage:"dirname [OPTION] NAME...",options:["    --help       display this help and exit"]},p={name:"dirname",async execute(t,l){if(i(t))return o(m);let r=t.filter(n=>!n.startsWith("-"));if(r.length===0)return{stdout:"",stderr:`dirname: missing operand
`,exitCode:1};let e=[];for(let n of r){let a=n.replace(/\/+$/,""),s=a.lastIndexOf("/");s===-1?e.push("."):s===0?e.push("/"):e.push(a.slice(0,s))}return{stdout:`${e.join(`
`)}
`,stderr:"",exitCode:0}}},c={name:"dirname",flags:[],needsArgs:!0};export{p as a,c as b};
