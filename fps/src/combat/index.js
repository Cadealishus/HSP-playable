// Combat: hitscan ballistics + damage routing (STUB — owned by the combat/fx agent).
// Contract: docs/CONTRACTS.md#combat
import { LAYER, groups, ALL } from '../core/Physics.js';

export function createCombat() {
  return {
    name: 'combat',
    async init(game) {
      game.events.on('weapon:fire', (e) => {
        const exclude = game.player?.collider;
        const hit = game.physics.raycast(e.origin, e.direction, 800, {
          exclude,
          filterGroups: groups(ALL, LAYER.WORLD | LAYER.PROP | LAYER.HITBOX),
        });
        if (!hit) return;
        game.events.emit('hit', {
          point: hit.point,
          normal: hit.normal,
          direction: e.direction,
          distance: hit.distance,
          surface: hit.data.surface || 'concrete',
          collider: hit.collider,
          target: hit.data.entity || null,
          part: hit.data.part || null,
          damage: e.weapon.damage,
          source: e.source,
          weapon: e.weapon,
        });
        hit.data.entity?.takeDamage?.(e.weapon.damage, { part: hit.data.part, point: hit.point, direction: e.direction, source: e.source, weapon: e.weapon });
      });
    },
  };
}
