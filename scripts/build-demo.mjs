// Builds the demo and writes dist-demo/fundbridge-demo.html: the page body (title, style, root, script)
// without <html>/<head>/<body>, the shape the chat's page panel wraps itself.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

execSync("npx vite build --config vite.demo.config.ts", { stdio: "inherit" });
const html = readFileSync("dist-demo/index.html", "utf8");
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
const scripts = [...html.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join("\n");
if (!scripts) throw new Error("No inline script found in the demo build");
const page = `<title>FundBridge</title>\n${styles}\n<div id="root"></div>\n${scripts}\n`;
writeFileSync("dist-demo/fundbridge-demo.html", page);
console.log(`dist-demo/fundbridge-demo.html (${Math.round(page.length / 1024)} kB)`);
