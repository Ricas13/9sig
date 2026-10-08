import {checkCommercialLaunch} from "../src/domain/commercial-launch";
const checks=checkCommercialLaunch(process.env);
for(const c of checks) console.log((c.passed?"PASS":"FAIL")+" "+c.key+(c.passed?"":" — "+c.reason));
const missing=checks.filter(x=>!x.passed).length;
console.log("Commercial launch: "+(missing?"BLOCKED ("+missing+" checks)":"CONFIGURATION CHECKS PASSED — still validate live services"));
if(missing)process.exitCode=1;
