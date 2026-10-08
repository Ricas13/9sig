import {describe,expect,it} from "vitest";
import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

describe("restore drill script",()=>{
 it("is valid shell",()=>{
  expect(()=>execFileSync("sh",["-n","scripts/restore-drill.sh"])).not.toThrow();
 });
 it("refuses to restore over the live database",()=>{
  const result=spawnSync("sh",["scripts/restore-drill.sh"],{encoding:"utf8",env:{PATH:process.env.PATH,PGHOST:"x",PGUSER:"x",PGPASSWORD:"x",PGDATABASE:"live",DRILL_SCRATCH_DB:"live",DRILL_DUMP_FILE:"/dev/null"}});
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/must not be the live database/);
 });
 it("keeps its safety rails in the source",()=>{
  const source=readFileSync("scripts/restore-drill.sh","utf8");
  expect(source).toContain("DROP DATABASE IF EXISTS");
  expect(source).toContain("--exit-on-error");
  expect(source).not.toMatch(/DROP DATABASE[^\n]*\$PGDATABASE/);
 });
});
