import{createRequire} from"node:module";const require=createRequire(import.meta.url);
function x(r,o){let t=o?"d":"-",n=[r&256?"r":"-",r&128?"w":"-",r&64?"x":"-",r&32?"r":"-",r&16?"w":"-",r&8?"x":"-",r&4?"r":"-",r&2?"w":"-",r&1?"x":"-"];return t+n.join("")}export{x as a};
