import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{d as C}from"./chunk-IBRT3OJS.js";import{a as g}from"./chunk-QIQMJJZ4.js";import{a as v}from"./chunk-W5DWRFSU.js";var y=`Usage: rmdir [-pv] DIRECTORY...
Remove empty directories.

Options:
  -p, --parents   Remove DIRECTORY and its ancestors
  -v, --verbose   Output a diagnostic for every directory processed`,w={parents:{short:"p",long:"parents",type:"boolean"},verbose:{short:"v",long:"verbose",type:"boolean"},help:{long:"help",type:"boolean"}},O={name:"rmdir",async execute(r,t){let e=g("rmdir",r,w);if(!e.ok)return e.error;if(e.result.flags.help)return{stdout:`${y}
`,stderr:"",exitCode:0};let n=e.result.flags.parents,a=e.result.flags.verbose,o=e.result.positional;if(o.length===0)return{stdout:"",stderr:`rmdir: missing operand
`,exitCode:1};let s="",d="",u=0,l=new C({limits:t.limits,signal:t.signal,executionScope:t.executionScope,site:"rmdir",label:"parent traversal"});for(let c of o){let i=await h(t,c,n,a,l);s+=i.stdout,d+=i.stderr,i.exitCode!==0&&(u=i.exitCode)}return{stdout:s,stderr:d,exitCode:u}}};async function h(r,t,e,n,a){let o="",s="",u=r.fs.resolvePath(r.cwd,t),l=await x(r,u,t,n);if(o+=l.stdout,s+=l.stderr,l.exitCode!==0)return{stdout:o,stderr:s,exitCode:l.exitCode};if(e){let c=u,i=t;for(;;){a.visit(0);let f=b(c),m=b(i);if(f===c||f==="/"||f==="."||m==="."||m==="")break;let p=await x(r,f,m,n);if(o+=p.stdout,p.exitCode!==0)break;c=f,i=m}}return{stdout:o,stderr:s,exitCode:0}}async function x(r,t,e,n){try{if(!await r.fs.exists(t))return{stdout:"",stderr:`rmdir: failed to remove '${e}': No such file or directory
`,exitCode:1};if(!(await r.fs.stat(t)).isDirectory)return{stdout:"",stderr:`rmdir: failed to remove '${e}': Not a directory
`,exitCode:1};if((await r.fs.readdir(t)).length>0)return{stdout:"",stderr:`rmdir: failed to remove '${e}': Directory not empty
`,exitCode:1};await r.fs.rm(t,{recursive:!1,force:!1});let d="";return n&&(d=`rmdir: removing directory, '${e}'
`),{stdout:d,stderr:"",exitCode:0}}catch(a){let o=v(a);return{stdout:"",stderr:`rmdir: failed to remove '${e}': ${o}
`,exitCode:1}}}function b(r){let t=r.replace(/\/+$/,""),e=t.lastIndexOf("/");return e===-1?".":e===0?"/":t.substring(0,e)}var S={name:"rmdir",flags:[{flag:"-p",type:"boolean"},{flag:"-v",type:"boolean"}],needsArgs:!0};export{O as a,S as b};
