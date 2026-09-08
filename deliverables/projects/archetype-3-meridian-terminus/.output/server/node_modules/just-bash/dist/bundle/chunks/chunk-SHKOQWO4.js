import{createRequire} from"node:module";const require=createRequire(import.meta.url);
var o={name:"pwd",async execute(l,a){let t=!1;for(let e of l)if(e==="-P")t=!0;else if(e==="-L")t=!1;else{if(e==="--")break;e.startsWith("-")}let s=a.cwd;if(t)try{s=await a.fs.realpath(a.cwd)}catch{}return{stdout:`${s}
`,stderr:"",exitCode:0}}},f={name:"pwd",flags:[{flag:"-P",type:"boolean"},{flag:"-L",type:"boolean"}]};export{o as a,f as b};
