import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTrending, classify, TAG_KEYWORDS } from "./fetch-github-trending.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(__dirname, "fixtures/trending-sample.html"), "utf8");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); failures += 1; }
}

const repos = parseTrending(fixture);
assert(repos.length === 3, `expected 3 repos, got ${repos.length}`);

const [r1, r2, r3] = repos;
assert(r1.repo === "simplex-chat/simplex-chat", `r1.repo=${r1.repo}`);
assert(r1.language === "Haskell", `r1.language=${r1.language}`);
assert(r1.starsToday === 191, `r1.starsToday=${r1.starsToday}`);
assert(r1.starsTotal === 12029, `r1.starsTotal=${r1.starsTotal}`);
assert(r1.forks === 684, `r1.forks=${r1.forks}`);
assert(r1.url === "https://github.com/simplex-chat/simplex-chat", `r1.url=${r1.url}`);
assert(r1.description.includes("SimpleX"), `r1.desc=${r1.description}`);

assert(r2.repo === "google-labs-code/design.md", `r2.repo=${r2.repo}`);
assert(r2.starsToday === 2319, `r2.starsToday=${r2.starsToday}`);
assert(r2.starsTotal === 20669, `r2.starsTotal=${r2.starsTotal}`);

assert(r3.repo === "commaai/openpilot", `r3.repo=${r3.repo}`);
assert(r3.starsTotal === 61673, `r3.starsTotal=${r3.starsTotal}`);
assert(r3.forks === 11040, `r3.forks=${r3.forks}`);

const tags = classify("An MCP agent runtime with long-term memory and RAG for LLM agents");
assert(tags.includes("AI代理"), `tags=${tags.join(",")}`);
assert(tags.includes("记忆管理"), `tags=${tags.join(",")}`);
assert(tags.includes("harness") || tags.includes("RAG"), `tags=${tags.join(",")}`);

assert(classify("zzz qqq nonsense").length === 0, "nonsense should yield no tags");

for (const t of tags) assert(Object.prototype.hasOwnProperty.call(TAG_KEYWORDS, t), `unknown tag ${t}`);

if (failures) { console.error(`${failures} test(s) failed`); process.exit(1); }
console.log("parser tests passed");
