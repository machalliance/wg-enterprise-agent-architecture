import{createRequire} from"node:module";const require=createRequire(import.meta.url);
async function c(t,e){if(t.length>0&&t[0]!=="-"){let i=e.fs.resolvePath(e.cwd,t[0]);try{let s=(await e.fs.readFile(i)).split(`
`);s[s.length-1]===""&&s.pop();let r=s.reverse();return{stdout:r.length>0?`${r.join(`
`)}
`:"",stderr:"",exitCode:0}}catch{return{stdout:"",stderr:`tac: ${t[0]}: No such file or directory
`,exitCode:1}}}let n=e.stdin.split(`
`);n[n.length-1]===""&&n.pop();let o=n.reverse();return{stdout:o.length>0?`${o.join(`
`)}
`:"",stderr:"",exitCode:0,stdoutKind:"bytes"}}var u={name:"tac",execute:c},f={name:"tac",flags:[],stdinType:"text",needsFiles:!0};export{u as a,f as b};
