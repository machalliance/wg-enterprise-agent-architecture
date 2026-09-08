import{createRequire} from"node:module";const require=createRequire(import.meta.url);
import{a as r}from"./chunk-L2UW7DWF.js";var c=new Map([["File operations",["ls","cat","head","tail","wc","touch","mkdir","rm","cp","mv","ln","chmod","stat","readlink"]],["Text processing",["grep","sed","awk","sort","uniq","cut","tr","tee","diff"]],["Search",["find"]],["Navigation & paths",["pwd","basename","dirname","tree","du"]],["Environment & shell",["echo","printf","env","printenv","export","alias","unalias","history","clear","true","false","bash","sh"]],["Data processing",["xargs","jq","base64","date"]],["Network",["curl","html-to-markdown"]]]);function d(n){let e=[],s=new Set(n);e.push(`Available commands:
`);let t=[];for(let[a,l]of c){let o=l.filter(i=>s.has(i));if(o.length>0){e.push(`  ${a}:`),e.push(`    ${o.join(", ")}
`);for(let i of o)s.delete(i)}}for(let a of s)t.push(a);return t.length>0&&(e.push("  Other:"),e.push(`    ${t.sort().join(", ")}
`)),e.push("Use '<command> --help' for details on a specific command."),`${e.join(`
`)}
`}var h={name:"help",async execute(n,e){if(n.includes("--help")||n.includes("-h"))return{stdout:`help - display available commands

Usage: help [command]

Options:
  -h, --help    Show this help message

If a command name is provided, shows help for that command.
Otherwise, lists all available commands.
`,stderr:"",exitCode:0};if(n.length>0&&e.exec){let t=n[0];return e.exec(r([t]),{cwd:e.cwd,signal:e.signal,args:["--help"]})}let s=e.getRegisteredCommands?.()??[];return{stdout:d(s),stderr:"",exitCode:0}}},p={name:"help",flags:[]};export{h as a,p as b};
