// Tiny synchronous event bus. Event names and payloads are catalogued in docs/CONTRACTS.md.
export class Events {
  constructor() {
    this.map = new Map();
  }

  on(name, fn) {
    let list = this.map.get(name);
    if (!list) this.map.set(name, (list = []));
    list.push(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off(name, fn) {
    const list = this.map.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(name, payload) {
    const list = this.map.get(name);
    if (!list) return;
    for (const fn of list.slice()) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${name}" threw`, err);
      }
    }
  }
}
