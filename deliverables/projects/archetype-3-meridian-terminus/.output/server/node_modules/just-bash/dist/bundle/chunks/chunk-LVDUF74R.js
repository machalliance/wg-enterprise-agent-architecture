import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{d as f}from"./chunk-GN6CQ3J4.js";import{a,b as c,c as d}from"./chunk-QAYAQNCG.js";var u={name:"rev",summary:"reverse lines characterwise",usage:"rev [file ...]",description:"Copies the specified files to standard output, reversing the order of characters in every line. If no files are specified, standard input is read.",examples:["echo 'hello' | rev     # Output: olleh","rev file.txt           # Reverse each line in file"]};function p(r){return Array.from(r).reverse().join("")}var g={name:"rev",execute:async(r,s)=>{if(c(r))return a(u);let o=[];for(let e of r)if(e==="--"){let t=r.indexOf(e);o.push(...r.slice(t+1));break}else{if(e.startsWith("-")&&e!=="-")return d("rev",e);o.push(e)}let n="",l=e=>{let t=e.split(`
`),i=e.endsWith(`
`)&&t[t.length-1]==="";return i&&t.pop(),t.map(p).join(`
`)+(i?`
`:"")};if(o.length===0){let e=f(s.stdin)??"";n=l(e)}else for(let e of o)if(e==="-"){let t=f(s.stdin)??"";n+=l(t)}else{let t=s.fs.resolvePath(s.cwd,e),i=await s.fs.readFile(t);if(i===null)return{exitCode:1,stdout:n,stderr:`rev: ${e}: No such file or directory
`};n+=l(i)}return{exitCode:0,stdout:n,stderr:""}}},y={name:"rev",flags:[],stdinType:"text",needsFiles:!0};export{g as a,y as b};
