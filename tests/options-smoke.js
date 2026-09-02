const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("options/options.html", "utf8");
const script = fs.readFileSync("options/options.js", "utf8");

assert.match(html, /<h1>网站管理<\/h1>/);
assert.match(html, /id="authorized-sites"/);
assert.match(html, /id="disabled-sites"/);
assert.match(html, /\.\.\/src\/site-access\.js/);
assert.match(script, /listAuthorizedCustomSites/);
assert.match(script, /siteAccess\.disableSite/);
assert.match(script, /siteAccess\.enableSite/);
assert.match(script, /className = "site-name"/);

console.log("options layout smoke test passed");
