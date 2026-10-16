(() => {
  // src/beso/LaunchWorldV16.ts
  var LaunchWorldV16 = class {
    ready;
    instance = null;
    dead = false;
    constructor(canvas, base) {
      this.ready = (async () => {
        const scope = window;
        if (!scope.LaunchWorldV16Runtime) {
          scope.v16RuntimeLoad ??= new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = base + "assets/v16/world-webgpu.js";
            s.onload = () => resolve();
            s.onerror = () => reject(Error("Native WaterPro runtime load failed"));
            document.head.appendChild(s);
          });
          await scope.v16RuntimeLoad;
        }
        if (this.dead) return;
        this.instance = new scope.LaunchWorldV16Runtime(canvas, base);
        await this.instance.ready;
      })();
    }
    get info() {
      return this.instance.info;
    }
    async render(time, blueprint = false) {
      if (!this.dead) await this.instance?.render(time, blueprint);
    }
    async renderBlueprint(time) {
      await this.render(time, true);
    }
    dispose() {
      this.dead = true;
      this.instance?.dispose();
    }
  };

  // <stdin>
  var w = new LaunchWorldV16(document.querySelector("canvas"), "/");
  window.world = w;
  window.ready = w.ready;
})();
