/**
 * Compare full-project TypeScript diagnostics against the exact PR base commit.
 * Existing main errors are reported but do not become new regressions.
 *
 * Invocation:
 *   node scripts/admin-type-regression-gate-step10.mjs <main-tsc.log> <pr-tsc.log> <main-status> <pr-status>
 *
 * No auto-fixes, source mutation or production credentials.
 */
import fs from "node:fs";
import process from "node:process";

const [baselinePath,prPath,baselineCode,prCode]=process.argv.slice(2);
if(!baselinePath||!prPath||baselineCode===undefined||prCode===undefined){
  process.stderr.write("Usage: node scripts/admin-type-regression-gate-step10.mjs <main.log> <pr.log> <main-exit> <pr-exit>\n");
  process.exit(2);
}
const pattern=/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm;
function diagnostics(path){
  const log=fs.readFileSync(path,"utf8");
  const counts=new Map();
  for(const hit of log.matchAll(pattern)){
    // The same diagnostic can move in a modified file; keep path, code and
    // the message, but not line/column, in the multiset identity.
    const fingerprint=JSON.stringify([hit[1].replaceAll("\\","/"),hit[4],hit[5].trim()]);
    counts.set(fingerprint,(counts.get(fingerprint)??0)+1);
  }
  return {counts,total:[...counts.values()].reduce((sum,n)=>sum+n,0),hasDiagnostics:log.includes("error TS")};
}
const baseline=diagnostics(baselinePath);
const pr=diagnostics(prPath);
const regressions=[];
for(const [key,count] of pr.counts){
  const added=count-(baseline.counts.get(key)??0);
  if(added>0){
    const [file,code,message]=JSON.parse(key);
    regressions.push({file,code,message,count:added});
  }
}
const baselineExit=Number(baselineCode);
const prExit=Number(prCode);
const canTrustResults=Number.isInteger(baselineExit)&&Number.isInteger(prExit)
  && ((baselineExit===0&&!baseline.hasDiagnostics)||(baselineExit!==0&&baseline.hasDiagnostics))
  && ((prExit===0&&!pr.hasDiagnostics)||(prExit!==0&&pr.hasDiagnostics));
const result={
  comparison:"TypeScript diagnostics against PR base SHA; not a clean-project typecheck",
  baselineErrors:baseline.total,
  prErrors:pr.total,
  newErrors:regressions.reduce((sum,x)=>sum+x.count,0),
  baselineExit,prExit,
  trustworthy:canTrustResults,
  regressions:regressions.slice(0,50),
};
process.stdout.write(JSON.stringify(result,null,2)+"\n");
if(!canTrustResults){
  process.stderr.write("TypeScript comparison incomplete; refusing to silently pass.\n");
  process.exitCode=2;
}else if(regressions.length>0){
  process.stderr.write("New TypeScript diagnostics relative to main: "+result.newErrors+"\n");
  process.exitCode=1;
}else{
  process.stdout.write("No new TypeScript errors relative to unchanged main. Baseline errors remain outstanding.\n");
}
