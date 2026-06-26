#!/usr/bin/env node

import { parseArgs } from "./fetch-github-trending.mjs";

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); failures += 1; } }

const args = parseArgs(["--date", "2026-06-26", "--issue-date", "2026-06-26"]);
assert(args.date === "2026-06-26", `date=${args.date}`);
assert(args.issueDate === "2026-06-26", `issueDate=${args.issueDate}`);
assert(args.skipExisting === false, "skipExisting default false");

try { parseArgs(["--date", "bad"]); assert(false, "bad date should throw"); }
catch { assert(true, "bad date throws"); }

if (failures) { console.error(`${failures} schedule test(s) failed`); process.exit(1); }
console.log("schedule tests passed");
