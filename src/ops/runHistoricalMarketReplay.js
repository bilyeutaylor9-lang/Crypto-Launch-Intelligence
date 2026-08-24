import fs from "node:fs";
import { replayMarketEvents } from "../production/historicalEventReplay.js";
import { routeMarketEvent } from "../production/streamingEventRouter.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJsonl(file){if(!fs.existsSync(file))return[];return fs.readFileSync(file,"utf8").split("\n").filter(Boolean).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}})}
export function runHistoricalMarketReplay(options={}){const eventFile=options.eventFile||process.env.ALPHA_REPLAY_EVENT_FILE||"data/native-events.jsonl";const events=options.events||readJsonl(eventFile);const indexes=options.indexes||{};const reducer=(state,event)=>{const routed=routeMarketEvent(event,indexes);const counts={...(state.counts||{})};counts[event.type]=(counts[event.type]||0)+1;return{...state,events:(state.events||0)+1,counts,lastEventAt:event.observedAt,lastImpacted:routed.impactedIdentityKeys};};const report=replayMarketEvents(events,reducer,{events:0,counts:{}},{cutoff:options.cutoff||process.env.ALPHA_REPLAY_CUTOFF||undefined,captureState:options.captureState!==false});writeAtomicJson("reports/historical-market-replay.json",report);return report;}
if(import.meta.url===`file://${process.argv[1]}`){try{const r=runHistoricalMarketReplay();console.log(JSON.stringify({events:r.audit.replayedEvents,rejected:r.audit.rejected.length,valid:r.audit.valid,finalState:r.finalState},null,2));}catch(error){console.error(error);process.exitCode=1;}}
