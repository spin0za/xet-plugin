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
  const state = {
    keepAliveEnabled: true,
    keepAliveUrl: "https://merchant.pc.xiaoe-tech.com/course?id=private",
    keepAliveLastActivityAt: 0,
  };
  const alarmState = new Map();
  const fetchCalls = [];

  const runtimeOnMessage = event();
  const alarmsOnAlarm = event();
  const storageOnChanged = event();
  const runtimeOnInstalled = event();
  const runtimeOnStartup = event();

  const chrome = {
    runtime: {
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
      },
      onChanged: storageOnChanged,
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
    setTimeout,
  };

  const source = fs.readFileSync("src/background.js", "utf8");
  vm.runInNewContext(source, context, { filename: "src/background.js" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(alarmState.get("xet-keep-alive").periodInMinutes, 240);
  assert.equal(runtimeOnMessage.listeners.length, 1);

  const result = await new Promise((resolve) => {
    const keptOpen = runtimeOnMessage.listeners[0](
      { type: "xet:keep-alive-test" },
      {},
      resolve,
    );
    assert.equal(keptOpen, true);
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://merchant.pc.xiaoe-tech.com/bought");
  assert.equal(fetchCalls[0].options.credentials, "include");
  assert.equal(fetchCalls[0].options.cache, "no-store");
  assert.equal(fetchCalls[0].options.redirect, "follow");
  assert.equal(state.keepAliveLastResult.status, 200);

  runtimeOnMessage.listeners[0](
    { type: "xet:natural-visit" },
    { tab: { url: "https://merchant.pc.xiaoe-tech.com/bought" } },
    () => {},
  );
  await new Promise((resolve) => setImmediate(resolve));

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
