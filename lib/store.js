// Dead-simple local persistence for samples. JSON, no cloud, ever.
const fs = require('fs');

class Store {
  constructor(file) {
    this.file = file;
    this.samples = this._load();
  }
  _load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')).samples || []; }
    catch { return []; }
  }
  add(s) { if (s) this.samples.push(s); }
  prune(maxAgeMs) {
    const cut = Date.now() - maxAgeMs;
    this.samples = this.samples.filter(x => x.ts >= cut);
  }
  save() {
    try { fs.writeFileSync(this.file, JSON.stringify({ samples: this.samples })); }
    catch { /* best-effort */ }
  }
}

module.exports = Store;
