import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{a as p}from"./chunk-FOCWZZDE.js";import{a as m}from"./chunk-QIQMJJZ4.js";import{a as u}from"./chunk-W5DWRFSU.js";var v={recursive:{short:"r",long:"recursive",type:"boolean"},recursiveUpper:{short:"R",type:"boolean"},force:{short:"f",long:"force",type:"boolean"},verbose:{short:"v",long:"verbose",type:"boolean"}},E={name:"rm",async execute(g,s){let e=m("rm",g,v);if(!e.ok)return e.error;let i=e.result.flags.recursive||e.result.flags.recursiveUpper,a=e.result.flags.force,d=e.result.flags.verbose,c=e.result.positional;if(c.length===0)return a?{stdout:"",stderr:"",exitCode:0}:{stdout:"",stderr:`rm: missing operand
`,exitCode:1};let f="",t="",l=0;for(let r of c)try{let n=s.fs.resolvePath(s.cwd,r);if((await s.fs.stat(n)).isDirectory&&!i){t+=`rm: cannot remove '${r}': Is a directory
`,l=1;continue}await s.fs.rm(n,{recursive:i,force:a}),d&&(f+=`removed '${r}'
`)}catch(n){if(!a){let o=u(n);o.includes("ENOENT")||o.includes("no such file")?t+=`rm: cannot remove '${r}': No such file or directory
`:o.includes("ENOTEMPTY")||o.includes("not empty")?t+=`rm: cannot remove '${r}': Directory not empty
`:t+=`rm: cannot remove '${r}': ${p(o)}
`,l=1}}return{stdout:f,stderr:t,exitCode:l}}},$={name:"rm",flags:[{flag:"-r",type:"boolean"},{flag:"-R",type:"boolean"},{flag:"-f",type:"boolean"},{flag:"-v",type:"boolean"}],needsArgs:!0};export{E as a,$ as b};
