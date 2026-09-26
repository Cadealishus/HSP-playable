// HUD + menus (STUB — owned by the UI/audio agent). Contract: docs/CONTRACTS.md#ui
export function createUI() {
  return {
    name: 'ui',
    alwaysUpdate: true,
    async init(game) {
      const root = document.getElementById('ui-root');
      root.innerHTML = `
        <div style="position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#fff;border-radius:50%"></div>
        <div id="ammo" style="position:absolute;right:48px;bottom:40px;color:#fff;font:600 28px system-ui">30 / 120</div>`;
      const ammo = root.querySelector('#ammo');
      game.events.on('weapon:ammo', (e) => (ammo.textContent = `${e.mag} / ${e.reserve}`));
      if (!game.harness) {
        game.canvas.addEventListener('click', () => {
          game.input.requestLock();
          game.audio.unlock();
        });
      }
    },
  };
}
