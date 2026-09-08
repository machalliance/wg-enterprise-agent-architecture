import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{d as g}from"./chunk-GN6CQ3J4.js";import{a as y,b as $,c as F}from"./chunk-QAYAQNCG.js";var b={name:"comm",summary:"compare two sorted files line by line",usage:"comm [OPTION]... FILE1 FILE2",options:["-1             suppress column 1 (lines unique to FILE1)","-2             suppress column 2 (lines unique to FILE2)","-3             suppress column 3 (lines that appear in both files)","    --help     display this help and exit"]},E={name:"comm",async execute(m,a){if($(m))return y(b);let r=!1,l=!1,f=!1,i=[];for(let e of m)if(e==="-1")r=!0;else if(e==="-2")l=!0;else if(e==="-3")f=!0;else if(e==="-12"||e==="-21")r=!0,l=!0;else if(e==="-13"||e==="-31")r=!0,f=!0;else if(e==="-23"||e==="-32")l=!0,f=!0;else if(e==="-123"||e==="-132"||e==="-213"||e==="-231"||e==="-312"||e==="-321")r=!0,l=!0,f=!0;else{if(e.startsWith("-")&&e!=="-")return F("comm",e);i.push(e)}if(i.length!==2)return{stdout:"",stderr:`comm: missing operand
Try 'comm --help' for more information.
`,exitCode:1};let p=async e=>{if(e==="-")return g(a.stdin);try{let x=a.fs.resolvePath(a.cwd,e);return await a.fs.readFile(x)}catch{return null}},c=await p(i[0]);if(c===null)return{stdout:"",stderr:`comm: ${i[0]}: No such file or directory
`,exitCode:1};let d=await p(i[1]);if(d===null)return{stdout:"",stderr:`comm: ${i[1]}: No such file or directory
`,exitCode:1};let t=c.split(`
`),s=d.split(`
`);t.length>0&&t[t.length-1]===""&&t.pop(),s.length>0&&s[s.length-1]===""&&s.pop();let n=0,o=0,u="",h=r?"":"	",w=(r?"":"	")+(l?"":"	");for(;n<t.length||o<s.length;)n>=t.length?(l||(u+=`${h}${s[o]}
`),o++):o>=s.length?(r||(u+=`${t[n]}
`),n++):t[n]<s[o]?(r||(u+=`${t[n]}
`),n++):t[n]>s[o]?(l||(u+=`${h}${s[o]}
`),o++):(f||(u+=`${w}${t[n]}
`),n++,o++);return{stdout:u,stderr:"",exitCode:0}}},L={name:"comm",flags:[{flag:"-1",type:"boolean"},{flag:"-2",type:"boolean"},{flag:"-3",type:"boolean"}],needsArgs:!0,minArgs:2};export{E as a,L as b};
