const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const state = {
    disabledSites: ["https://custom.example"],
  };
  const grantedOrigins = new Set();
  const registrations = [];
  const permissionRequests = [];
  const permissionRemovals = [];
  const cssInjections = [];
  const scriptInjections = [];

  const chrome = {
    runtime: {
      getManifest: () => manifest,
    },
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, ...state };
        },
        async set(changes) {
          Object.assign(state, changes);
        },
      },
    },
    permissions: {
      async contains({ origins }) {
        return origins.every((origin) => grantedOrigins.has(origin));
      },
      async getAll() {
        return {
          origins: [...manifest.host_permissions, ...grantedOrigins],
        };
      },
      async request({ origins }) {
        permissionRequests.push(...origins);
        origins.forEach((origin) => grantedOrigins.add(origin));
        return true;
      },
      async remove({ origins }) {
        permissionRemovals.push(...origins);
        origins.forEach((origin) => grantedOrigins.delete(origin));
        return true;
      },
    },
    scripting: {
      async executeScript(injection) {
        scriptInjections.push(injection);
      },
      async getRegisteredContentScripts(filter = {}) {
        if (!filter.ids) return registrations.map((item) => ({ ...item }));
        return registrations
          .filter((item) => filter.ids.includes(item.id))
          .map((item) => ({ ...item }));
      },
      async insertCSS(injection) {
        cssInjections.push(injection);
      },
      async registerContentScripts(items) {
        registrations.push(...items.map((item) => ({ ...item })));
      },
      async unregisterContentScripts({ ids }) {
        for (let index = registrations.length - 1; index >= 0; index -= 1) {
          if (ids.includes(registrations[index].id)) registrations.splice(index, 1);
        }
      },
      async updateContentScripts(items) {
        for (const item of items) {
          const index = registrations.findIndex((entry) => entry.id === item.id);
          if (index >= 0) registrations[index] = { ...item };
        }
      },
    },
  };

  const context = { URL, chrome, console };
  vm.runInNewContext(fs.readFileSync("src/site-access.js", "utf8"), context, {
    filename: "src/site-access.js",
  });
  const access = context.XetSiteAccess;
  const customUrl = "https://custom.example/course/1";

  assert.deepEqual(
    Array.from(
      access.normalizeDisabledSites(null, ["legacy.pc.xiaoe-tech.com"]),
    ),
    ["https://legacy.pc.xiaoe-tech.com"],
  );

  const enableResult = await access.enableSite(customUrl, { tabId: 9 });
  assert.equal(enableResult.ok, true);
  assert.deepEqual(permissionRequests, ["https://custom.example/*"]);
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].js, manifest.content_scripts[0].js);
  assert.deepEqual(registrations[0].css, manifest.content_scripts[0].css);
  assert.deepEqual(Array.from(state.disabledSites), []);
  assert.equal(cssInjections[0].target.tabId, 9);
  assert.equal(scriptInjections[0].target.tabId, 9);
  assert.equal(await access.isAuthorized(customUrl), true);

  const authorized = await access.listAuthorizedCustomSites();
  assert.deepEqual(
    Array.from(authorized, (site) => site.origin),
    ["https://custom.example"],
  );

  await access.disableSite(customUrl);
  assert.deepEqual(Array.from(state.disabledSites), ["https://custom.example"]);
  assert.equal(registrations.length, 0);
  assert.deepEqual(permissionRemovals, ["https://custom.example/*"]);
  assert.equal(await access.isAuthorized(customUrl), false);

  const defaultUrl = "https://merchant.pc.xiaoe-tech.com/course";
  await access.disableSite(defaultUrl);
  assert.deepEqual(Array.from(state.disabledSites), [
    "https://custom.example",
    "https://merchant.pc.xiaoe-tech.com",
  ]);
  assert.equal(permissionRemovals.length, 1, "built-in access is not removable");

  await access.enableSite(defaultUrl);
  assert.deepEqual(Array.from(state.disabledSites), ["https://custom.example"]);
  assert.equal(permissionRequests.length, 1, "built-in access needs no prompt");

  console.log("site access smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
