export const DREAD = Object.freeze({lesserDread:{dc:20,floor:1},moderateDread:{dc:29,floor:2},greaterDread:{dc:38,hold:true}});
export function recoveryValue(value, minimum=0, hold=false) {
 return hold ? value : Math.min(value,Math.max(value-1,minimum));
}
export function recoveryFloor(base,value,sources) {
 return sources.reduce((floor,s)=>s.outcome==='failure'||s.outcome==='criticalFailure'?Math.max(floor,s.hold?value:s.floor??0):floor,base);
}
