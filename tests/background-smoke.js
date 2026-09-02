const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function event() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    listeners,
  };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const state = {
    keepAliveEnabled: true,
    keepAliveUrl: "https://merchant.pc.xiaoe-tech.com/course?id=private",
    keepAliveLastActivityAt: 0,
    disabledHosts: [],
  };
  const alarmState = new Map();
  const fetchCalls = [];
  const cssInjections = [];
  const scriptInjections = [];
  const registeredScripts = [
    {
      id: "xet_custom_legacy",
      matches: ["https://custom.example/*"],
      js: ["src/content.js"],
      css: [],
    },
  ];

  const runtimeOnMessage = event();
  const alarmsOnAlarm = event();
  const storageOnChanged = event();
  const runtimeOnInstalled = event();
  const runtimeOnStartup = event();

  const chrome = {
    runtime: {
      getManifest() {
        return manifest;
      },
      onInstalled: runtimeOnInstalled,
      onStartup: runtimeOnStartup,
      onMessage: runtimeOnMessage,
    },
    alarms: {
      onAlarm: alarmsOnAlarm,
      async clear(name) {
        return alarmState.delete(name);
      },
      async create(name, alarm) {
        alarmState.set(name, { name, ...alarm });
      },
      async get(name) {
        return alarmState.get(name);
      },
    },
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, ...state };
        },
        async set(changes) {
          Object.assign(state, changes);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete state[key];
          }
        },
      },
      onChanged: storageOnChanged,
    },
    scripting: {
      async executeScript(injection) {
        scriptInjections.push(injection);
      },
      async getRegisteredContentScripts(filter = {}) {
        if (!filter.ids) {
          return registeredScripts.map((script) => ({ ...script }));
        }
        return registeredScripts
          .filter((script) => filter.ids.includes(script.id))
          .map((script) => ({ ...script }));
      },
      async insertCSS(injection) {
        cssInjections.push(injection);
      },
      async updateContentScripts(updates) {
        for (const update of updates) {
          const index = registeredScripts.findIndex(
            (script) => script.id === update.id,
          );
          if (index >= 0) registeredScripts[index] = { ...update };
        }
      },
    },
  };

  const context = {
    AbortController,
    URL,
    chrome,
    clearTimeout,
    console,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        url,
        async text() {
          return "ok";
        },
      };
    },
    importScripts() {},
    setTimeout,
  };

  const siteAccessSource = fs.readFileSync("src/site-access.js", "utf8");
  vm.runInNewContext(siteAccessSource, context, {
    filename: "src/site-access.js",
  });
  const source = fs.readFileSync("src/background.js", "utf8");
  vm.runInNewContext(source, context, { filename: "src/background.js" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(alarmState.get("xet-keep-alive").periodInMinutes, 240);
  assert.equal(runtimeOnMessage.listeners.length, 1);
  assert.deepEqual(
    registeredScripts[0].js,
    manifest.content_scripts[0].js,
    "persisted custom registrations should migrate to the module list",
  );
  assert.deepEqual(
    registeredScripts[0].css,
    manifest.content_scripts[0].css,
    "persisted custom registrations should receive fullscreen CSS",
  );

  await runtimeOnStartup.listeners[0]();
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://merchant.pc.xiaoe-tech.com/bought");
  assert.equal(fetchCalls[0].options.credentials, "include");
  assert.equal(fetchCalls[0].options.cache, "no-store");
  assert.equal(fetchCalls[0].options.redirect, "follow");
  assert.ok(state.keepAliveLastActivityAt > 0);

  state.disabledSites = ["https://merchant.pc.xiaoe-tech.com"];
  await runtimeOnStartup.listeners[0]();
  assert.equal(fetchCalls.length, 1, "a disabled site must not be kept alive");
  assert.equal(alarmState.has("xet-keep-alive"), false);
  state.disabledSites = [];

  runtimeOnMessage.listeners[0](
    { type: "xet:natural-visit" },
    { tab: { url: "https://merchant.pc.xiaoe-tech.com/bought" } },
    () => {},
  );
  await new Promise((resolve) => setImmediate(resolve));

  const repairResult = await new Promise((resolve) => {
    const keptOpen = runtimeOnMessage.listeners[0](
      { type: "xet:repair-content-scripts" },
      {
        tab: {
          id: 7,
          url: "https://custom.example/course",
        },
      },
      resolve,
    );
    assert.equal(keptOpen, true);
  });
  assert.equal(repairResult.ok, true);
  assert.deepEqual(cssInjections[0].files, manifest.content_scripts[0].css);
  assert.deepEqual(scriptInjections[0].files, manifest.content_scripts[0].js);

  state.disabledSites = ["https://custom.example"];
  const disabledRepairResult = await new Promise((resolve) => {
    runtimeOnMessage.listeners[0](
      { type: "xet:repair-content-scripts" },
      { tab: { id: 8, url: "https://custom.example/course" } },
      resolve,
    );
  });
  assert.equal(disabledRepairResult.reason, "site-disabled");
  assert.equal(scriptInjections.length, 1, "disabled sites must not be repaired");
  state.disabledSites = [];

  alarmsOnAlarm.listeners[0]({ name: "xet-keep-alive" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls.length, 1, "recent activity should skip the alarm request");

  assert.equal("tabs" in chrome, false, "keep-alive must not depend on tabs");
  console.log("background keep-alive smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
