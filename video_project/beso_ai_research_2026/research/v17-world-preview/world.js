(() => {
  // src/beso/LaunchWorldV17.ts
  var LaunchWorldV17 = class {
    ready;
    instance = null;
    dead = false;
    constructor(canvas, base) {
      this.ready = (async () => {
        const s = window;
        if (!s.LaunchWorldV17Runtime) {
          s.v17RuntimeLoad ??= new Promise((resolve, reject) => {
            const e = document.createElement("script");
            e.src = base + "assets/v17/world-webgpu.js";
            e.onload = () => resolve();
            e.onerror = () => reject(Error("v17 runtime missing"));
            document.head.appendChild(e);
          });
          await s.v17RuntimeLoad;
        }
        if (this.dead) return;
        this.instance = new s.LaunchWorldV17Runtime(canvas, base);
        await this.instance.ready;
      })();
    }
    get info() {
      return this.instance.info;
    }
    async render(t, blueprint = false) {
      if (!this.dead) await this.instance?.render(t, blueprint);
    }
    async renderBlueprint(t) {
      await this.render(t, true);
    }
    dispose() {
      this.dead = true;
      this.instance?.dispose();
    }
  };

  // <stdin>
  var w = new LaunchWorldV17(document.querySelector("canvas"), "/");
  window.world = w;
  window.ready = w.ready;
})();
