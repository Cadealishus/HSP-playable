/**
 * Shared mission walk-through for the headless tests. Each step drives one
 * objective through its REAL trigger:
 *
 *   go: 'anchor' | {x,y,z,yaw}   teleport Doug into the trigger volume
 *   then: 'anchor'               a second teleport after `waitGroup`
 *   waitGroup: 'name'            wait for a scripted squad to spawn (out of view)
 *   groups: ['name']             squads that must have spawned when the step starts
 *   kill: 'group'                kill the squad through the damage path
 *   killTag: 'tag'               kill one tagged hostile (e.g. a leader)
 *   hold: true                   hold the real F key until the step completes
 *   wait: async (t) => {}        custom driving
 *   after: async () => {}        extra checks once the step completed
 */
export async function walkThrough(t, steps, opts = {}) {
  await t.until('window.FLOP?.mission?.state?.started === true', 'mission started', 600);
  await t.eval(() => window.FLOP.god(true));
  const s0 = await t.state();
  t.check(s0.objectives.length === steps.length, `${steps.length} objectives: ${s0.objectives.join(' > ')}`);
  const hud = await t.eval(() => {
    const h = window.FLOP.hud;
    return h ? { mode: h.mode, text: h.objective?.text, total: h.objective?.total } : null;
  });
  t.check(hud?.mode === 'mission' && hud.text && hud.total === steps.length, `mission HUD up: "${hud?.text}"`);

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    console.log(` -- objective ${i + 1}: ${st.id}`);
    await t.until(`FLOP.mission.state.index === ${i}`, `objective ${i + 1} active`, 300);
    const s = await t.state();
    t.check(s.objective === st.id, `objective ${i + 1} is '${st.id}' ("${s.text}")`);
    const mk = await t.eval(() => {
      const h = window.FLOP.hud;
      return { text: h.objective.text, markers: h.objectives.length, name: h.objectives[0]?.name ?? null };
    });
    t.check(mk.text === s.text, `HUD objective line reads "${mk.text}"`);
    if (!st.noMarker) t.check(mk.markers > 0, `waypoint marker shown (${mk.name})`);
    for (const g of st.groups ?? []) {
      await t.until(`(FLOP.mission.state.groups['${g}']?.spawned ?? 0) > 0 && FLOP.mission.state.groups['${g}'].queued === 0`, `squad '${g}' spawned (out of view)`, 400);
    }
    if (st.go) await teleport(t, st.go);
    if (st.waitGroup) {
      await t.until(`(FLOP.mission.state.groups['${st.waitGroup}']?.spawned ?? 0) > 0`, `trigger sprang squad '${st.waitGroup}'`, 300);
    }
    if (st.then) await teleport(t, st.then);
    if (st.kill) {
      await t.until(`(FLOP.mission.state.groups['${st.kill}']?.spawned ?? 0) > 0`, `squad '${st.kill}' present`, 400);
      // Members may still be queued (waiting for Doug to look away): keep killing.
      for (let k = 0; k < 12; k++) {
        const n = await t.eval((g) => window.FLOP.mission.killGroup(g), st.kill);
        const left = await t.eval((g) => {
          const x = window.FLOP.mission.state.groups[g];
          return x.alive + x.queued;
        }, st.kill);
        if (!left && !n) break;
        await t.frames(4);
      }
    }
    if (st.killTag) {
      await t.until(`!!FLOP.mission.agent('${st.killTag}')`, `'${st.killTag}' present`, 400);
      await t.eval((tag) => window.FLOP.mission.kill(tag, true), st.killTag);
    }
    if (st.hold) {
      await t.until('!!FLOP.mission.state.prompt', 'interaction prompt shown in range', 120);
      await t.page.keyboard.down('KeyF');
      await t.until(`FLOP.mission.state.index > ${i}`, 'held F to completion', 400);
      await t.page.keyboard.up('KeyF');
    }
    if (st.wait) await st.wait(t);
    await t.until(`FLOP.mission.state.index > ${i} || !!FLOP.mission.state.result`, `objective '${st.id}' completed`, st.maxFrames ?? 600);
    if (st.after) await st.after(t);
  }

  await t.until('FLOP.mission.state.result?.winner === "esf"', 'mission result: success', 60);
  await t.until('FLOP.lastRun && FLOP.lastRun.kind === "mission"', 'game:over carried the mission debrief', 300);
  const run = await t.eval(() => window.FLOP.lastRun);
  console.log('    debrief:', JSON.stringify({ grade: run.grade, label: run.gradeLabel, time: run.timeS, kills: run.kills, acc: run.accuracy, civ: run.civHits }));
  t.check(run.winner === 'esf' && run.result === 'complete', 'debrief: MISSION COMPLETE');
  t.check(/^[SABCD]$/.test(run.grade) && run.gradeLabel, `debrief rank ${run.grade} (${run.gradeLabel})`);
  t.check(Number.isFinite(run.timeS) && run.timeS > 0, `debrief time ${run.timeS}s`);
  t.check(run.kills >= (opts.minKills ?? 1), `debrief kills ${run.kills}`);
  t.check(Array.isArray(run.debrief) && run.debrief.length === 3 && run.debrief.every((l) => l.length > 10), 'Command summary: 3 lines');
  for (const l of run.debrief) console.log('      > ' + l);
  const dom = await t.eval(() => {
    const el = document.querySelector('.ow-screen.report.match');
    return el ? { shown: el.style.display !== 'none', text: el.innerText } : null;
  });
  t.check(dom?.shown && /MISSION COMPLETE/.test(dom.text) && /MISSION DEBRIEF/.test(dom.text), 'debrief screen shown (MISSION DEBRIEF / MISSION COMPLETE)');
  t.check(/REPLAY MISSION/.test(dom?.text ?? ''), 'debrief offers REPLAY MISSION');
  return run;
}

export async function teleport(t, to) {
  const ok = await t.eval((a) => window.FLOP.mission.teleport(a), to);
  t.check(ok, `teleport -> ${typeof to === 'string' ? to : JSON.stringify(to)}`);
  await t.frames(3);
}

/**
 * Replay, skip to `skipTo` (debug skip), die (god off, lethal damage on the
 * player), check the failed debrief offers the checkpoint, retry, check the
 * mission resumed there.
 */
export async function failAndRetry(t, { skipTo, expectCheckpoint }) {
  console.log(' -- fail + checkpoint retry');
  await t.eval(() => window.FLOP.restart());
  await t.until('FLOP.mission.state.started && FLOP.mission.state.index === 0 && !FLOP.mission.state.result', 'REPLAY: fresh run at objective 1', 300);
  for (let k = 0; k < skipTo; k++) {
    await t.eval(() => window.FLOP.mission.skip());
    await t.frames(2);
  }
  await t.until(`FLOP.mission.state.index === ${skipTo}`, `skipped to objective ${skipTo + 1}`, 100);
  const cp = (await t.state()).checkpoint;
  t.check(cp === expectCheckpoint, `checkpoint reached: objective ${cp + 1}`);
  await t.eval(() => {
    window.FLOP.god(false);
    const p = window.__ENGINE__.ctx.peek('player');
    p.applyDamage(100000, null);
  });
  await t.until('FLOP.mission.state.result?.reason === "kia"', 'Doug down -> mission failed (kia)', 120);
  await t.until('FLOP.lastRun?.reason === "kia"', 'failed debrief issued', 300);
  const run = await t.eval(() => window.FLOP.lastRun);
  t.check(run.result === 'failed' && run.retryLabel === 'RETRY FROM CHECKPOINT' && run.checkpoint === expectCheckpoint, `failed debrief offers RETRY FROM CHECKPOINT (objective ${run.checkpoint + 1})`);
  const dom = await t.eval(() => document.querySelector('.ow-screen.report.match')?.innerText ?? '');
  t.check(/MISSION FAILED/.test(dom) && /RETRY FROM CHECKPOINT/.test(dom), 'debrief screen: MISSION FAILED + RETRY FROM CHECKPOINT');
  await t.eval(() => window.FLOP.restart());
  await t.until(
    `FLOP.mission.state.started && FLOP.mission.state.resumedAt === ${expectCheckpoint} && FLOP.mission.state.index === ${expectCheckpoint} && FLOP.mission.state.stats.retries === 1 && !FLOP.mission.state.result`,
    `retry resumed at the checkpoint (objective ${expectCheckpoint + 1})`,
    300
  );
  const alive = await t.eval(() => {
    const p = window.__ENGINE__.ctx.peek('player');
    return { hp: p.health?.value, ctl: p.controlEnabled };
  });
  t.check(alive.hp > 0 && alive.ctl, 'Doug redeployed alive with controls');
}
