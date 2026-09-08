import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{c as p}from"./chunk-KIGPB52X.js";import{a as g}from"./chunk-L2UW7DWF.js";import{a as h}from"./chunk-DLL7UR66.js";import{a as f}from"./chunk-FOCWZZDE.js";var T={name:"time",async execute(r,s){let a="%e %M",o=null,u=!1,c=!1,t=0;for(;t<r.length;){let e=r[t];if(e==="-f"||e==="--format"){if(t++,t>=r.length)return{stdout:"",stderr:`time: missing argument to '-f'
`,exitCode:1};a=r[t],t++}else if(e==="-o"||e==="--output"){if(t++,t>=r.length)return{stdout:"",stderr:`time: missing argument to '-o'
`,exitCode:1};o=r[t],t++}else if(e==="-a"||e==="--append")u=!0,t++;else if(e==="-v"||e==="--verbose")a=`Command being timed: %C
Elapsed (wall clock) time: %e seconds
Maximum resident set size (kbytes): %M`,t++;else if(e==="-p"||e==="--portability")c=!0,t++;else if(e==="--"){t++;break}else if(e.startsWith("-"))t++;else break}let l=r.slice(t);if(l.length===0)return{stdout:"",stderr:"",exitCode:0};let w=p(),C=l.join(" "),i;try{if(!s.exec)return{stdout:"",stderr:`time: exec not available
`,exitCode:1};i=await s.exec(g([l[0]]),{env:h(s.env),cwd:s.cwd,stdin:s.stdin,stdinKind:"bytes",signal:s.signal,args:l.slice(1)})}catch(e){i={stdout:"",stderr:`time: ${f(e.message)}
`,exitCode:127}}let m=(p()-w)/1e3,n;if(c?n=`real ${m.toFixed(2)}
user 0.00
sys 0.00
`:(n=a.replace(/%e/g,m.toFixed(2)).replace(/%E/g,F(m)).replace(/%M/g,"0").replace(/%S/g,"0.00").replace(/%U/g,"0.00").replace(/%P/g,"0%").replace(/%C/g,C),n.endsWith(`
`)||(n+=`
`)),o)try{let e=s.fs.resolvePath(s.cwd,o);if(u&&await s.fs.exists(e)){let d=await s.fs.readFile(e);await s.fs.writeFile(e,d+n)}else await s.fs.writeFile(e,n)}catch(e){let d=f(e.message);return{stdout:i.stdout,stderr:i.stderr+`time: cannot write to '${o}': ${d}
`,exitCode:i.exitCode}}else i={...i,stderr:i.stderr+n};return i}};function F(r){let s=Math.floor(r/3600),a=Math.floor(r%3600/60),o=r%60;return s>0?`${s}:${a.toString().padStart(2,"0")}:${o.toFixed(2).padStart(5,"0")}`:`${a}:${o.toFixed(2).padStart(5,"0")}`}var k={name:"time",flags:[{flag:"-p",type:"boolean"}],needsArgs:!0};export{T as a,k as b};
