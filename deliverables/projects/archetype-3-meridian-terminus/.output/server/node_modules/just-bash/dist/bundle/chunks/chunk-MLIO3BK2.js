import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{a as f}from"./chunk-FOCWZZDE.js";import{a as d}from"./chunk-QIQMJJZ4.js";import{a as l}from"./chunk-W5DWRFSU.js";var p={recursive:{short:"p",long:"parents",type:"boolean"},verbose:{short:"v",long:"verbose",type:"boolean"}},b={name:"mkdir",async execute(m,t){let e=d("mkdir",m,p);if(!e.ok)return e.error;let u=e.result.flags.recursive,g=e.result.flags.verbose,n=e.result.positional;if(n.length===0)return{stdout:"",stderr:`mkdir: missing operand
`,exitCode:1};let a="",o="",c=0;for(let r of n)try{let i=t.fs.resolvePath(t.cwd,r);await t.fs.mkdir(i,{recursive:u}),g&&(a+=`mkdir: created directory '${r}'
`)}catch(i){let s=l(i);s.includes("ENOENT")||s.includes("no such file")?o+=`mkdir: cannot create directory '${r}': No such file or directory
`:s.includes("EEXIST")||s.includes("already exists")?o+=`mkdir: cannot create directory '${r}': File exists
`:o+=`mkdir: cannot create directory '${r}': ${f(s)}
`,c=1}return{stdout:a,stderr:o,exitCode:c}}},h={name:"mkdir",flags:[{flag:"-p",type:"boolean"},{flag:"-v",type:"boolean"}],needsArgs:!0};export{b as a,h as b};
