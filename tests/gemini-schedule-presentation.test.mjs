import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {geminiSchedulePresentation, nextVisibleGeminiSchedule} from "../lib/gemini-schedule-presentation.ts";

const setting = { saved:true, enabled:true, maxNewConcepts:1, nextRunAt:"2026-10-26T08:00:00.000Z" };
const gates = { globalRunning:true, externalEnabled:true, scheduledEnabled:true };
const now = Date.parse("2026-10-22T19:00:00.000Z");
const display=(s={},g={},time=now) => geminiSchedulePresentation({...setting,...s},{...gates,...g},time);

test("scheduler shows persisted future term without inventing another date",()=>{
  assert.equal(display().label,"Zapnuté");
  assert.match(display().explanation,/D1/);
  assert.equal(display({}, {}, Date.parse("2026-10-26T08:00:00.000Z")).label,"Zapnuté");
  assert.equal(display({nextRunAt:"2026-10-19T07:00:00.000Z"}).label,"Zapnuté");
  assert.match(display({nextRunAt:"2026-10-19T07:00:00.000Z"}).explanation,/Starší termín/);
});
test("each existing safety gate has a truthful, independent status",()=>{
  assert.equal(display({saved:false}).label,"Nenastavené");
  assert.equal(display({enabled:false}).label,"Vypnuté");
  assert.equal(display({maxNewConcepts:0}).label,"Limit 0");
  assert.equal(display({}, {globalRunning:false}).label,"Hlavný STOP");
  assert.equal(display({}, {externalEnabled:false}).label,"Pracovník vypnutý");
  assert.equal(display({}, {scheduledEnabled:false}).label,"Plánovač vypnutý");
  assert.equal(display({nextRunAt:null}).label,"Bez termínu");
  assert.equal(display({nextRunAt:"invalid"}).label,"Neplatný termín");
});
test("all saved categories show the next future slot without hiding overdue D1 work",()=>{
  const beforeDst = {
    ...setting, cadenceMinutes:10080, weeklyDay:1,
    nextRunAt:"2026-10-19T07:00:00.000Z",
  };
  const result = nextVisibleGeminiSchedule(beforeDst,now);
  assert.equal(result.nextRegularAt,"2026-10-26T08:00:00.000Z");
  assert.equal(result.overdueAt,"2026-10-19T07:00:00.000Z");
  assert.equal(beforeDst.nextRunAt,"2026-10-19T07:00:00.000Z");
  assert.deepEqual(nextVisibleGeminiSchedule({...beforeDst, nextRunAt:"2026-10-26T08:00:00.000Z"},now),
    { nextRegularAt:"2026-10-26T08:00:00.000Z",overdueAt:null });
  for(const disabled of [{enabled:false},{saved:false},{maxNewConcepts:0},{nextRunAt:null}]){
    assert.deepEqual(nextVisibleGeminiSchedule({...beforeDst,...disabled},now),
      { nextRegularAt:null,overdueAt:null });
  }
  const cadenceCases=[1440,2880,4320,7200,10080,20160,43200,5,60];
  for(const cadenceMinutes of cadenceCases){
    const view=nextVisibleGeminiSchedule({...beforeDst,cadenceMinutes,weeklyDay:null},now);
    assert.ok(Date.parse(view.nextRegularAt)>now);
    assert.equal(view.overdueAt,beforeDst.nextRunAt);
  }
});

test("Gemini admin polls runs and dates, preserves local edits and does not enqueue paid work",()=>{
  const ui=readFileSync(new URL("../components/admin-gemini-automation-settings.tsx",import.meta.url),"utf8");
  assert.match(ui,/const liveRuns = remote\?\.runs \?\? recentRuns;/);
  assert.match(ui,/runs: Array\.isArray\(data\.runs\) \? data\.runs/);
  assert.match(ui,/formatDate\(timing\.nextRegularAt\)/);
  assert.match(ui,/formatDate\(timing\.overdueAt\)/);
  assert.match(ui,/nextVisibleGeminiSchedule\(initial, currentTime\)/);
  assert.match(ui,/formatDate\(latestRun\?\.startedAt \?\? initial\.lastRunAt\)/);
  assert.doesNotMatch(ui,/formatDate\(latestJob\?\.created_at/);
  assert.match(ui,/geminiSchedulePresentation\(initial/);
  assert.match(ui,/const \[enabled, setEnabled\] = useState\(initial\.enabled\)/);
  assert.match(ui,/const \[cadence, setCadence\] = useState/);
  assert.match(ui,/const \[maximum, setMaximum\] = useState/);
  assert.match(ui,/const id = window\.setInterval\(\(\) => void refresh\(\), 10000\)/);
});
