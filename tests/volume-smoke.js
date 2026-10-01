const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function main() {
  class Element extends EventTarget {
    constructor(tagName = "DIV", volume = 0.4, readyState = 0, duration = NaN) {
      super();
      Object.assign(this, { tagName, volume, readyState, duration, muted: true, isConnected: true, children: [] });
    }
  }
  const initial = new Element("VIDEO");
  const loaded = new Element("VIDEO", 0.25, 4, 120);
  const audio = new Element("AUDIO", 0.3, 4, 120);
  const document = { documentElement: {}, children: [initial, loaded, audio] };
  const location = { href: "https://merchant.pc.xiaoe-tech.com/course/a" };
  let fullScans = 0;
  const observers = [];
  const context = {
    Element, document, location, setTimeout, clearTimeout, console,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
  };
  vm.runInNewContext(fs.readFileSync("src/content/volume.js", "utf8"), context);
  const module = context.__xetPlayerHelperModules.volume;
  const controller = module.createVolumeController({ playerDom: {
    deepElements(scope = document) {
      if (scope === document) fullScans++;
      return [...scope.children];
    },
  } });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
  controller.start();
  controller.start();
  await flush();
  assert.equal(initial.volume, 1);
  assert.equal(loaded.volume, 1);
  assert.equal(initial.muted, true, "initialization must not force unmuting");
  assert.equal(audio.volume, 0.3, "audio-only elements are outside this feature");
  assert.equal(fullScans, 1, "idempotent start must not rescan the page");

  initial.readyState = 1;
  initial.duration = 120;
  initial.addEventListener("loadedmetadata", () => { initial.volume = 0.35; }, { once: true });
  initial.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(initial.volume, 1, "initialize after SDK metadata listeners restore their volume");

  initial.volume = 0.2;
  initial.muted = true;
  initial.readyState = 0;
  initial.dispatchEvent(new Event("loadstart"));
  initial.readyState = 4;
  initial.duration = 120.04;
  initial.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(initial.volume, 0.2, "quality reloads must preserve manual volume");
  assert.equal(initial.muted, true);

  const dynamic = new Element("VIDEO", 0.1, 4, 30);
  const box = new Element();
  box.children.push(dynamic);
  observers[0].callback([{ addedNodes: [box] }]);
  await flush();
  assert.equal(dynamic.volume, 1, "new analysis/native videos must initialize");
  assert.equal(fullScans, 1, "new videos should scan only their added subtree");
  dynamic.volume = 0.4;
  observers[0].callback([{ addedNodes: [new Element()] }]);
  await flush();
  assert.equal(dynamic.volume, 0.4);

  location.href = "https://merchant.pc.xiaoe-tech.com/course/b";
  initial.dispatchEvent(new Event("loadstart"));
  await flush();
  assert.equal(initial.volume, 1, "SPA navigation on a reused video must initialize again");
  initial.volume = 0.2;
  initial.duration = 240;
  initial.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(initial.volume, 1, "a different clip on the same route must initialize again");

  const queued = new Element("VIDEO", 0.15, 4, 45);
  observers[0].callback([{ addedNodes: [queued] }]);
  controller.stop();
  await flush();
  assert.equal(queued.volume, 0.15, "disable must cancel pending initialization");
  initial.volume = 0.3;
  initial.duration = 300;
  initial.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(initial.volume, 0.3, "disabled module must remove media listeners");

  controller.start();
  await flush();
  assert.equal(initial.volume, 1, "reenabling restores default-volume initialization");
  const obsolete = new Element("VIDEO", 0.1, 4, 20);
  observers.at(-1).callback([{ addedNodes: [obsolete] }]);
  controller.stop();
  controller.start();
  await flush();
  assert.equal(obsolete.volume, 0.1, "previous generation must not run after restart");
  controller.stop();
  console.log("default volume smoke test passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
