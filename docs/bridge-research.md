# Minecraft × Create: Aeronautics × KSP — bridge research

Goal: run the **real** games together, not rebuild either one. This file records what
existing cross-game projects actually do, and how that maps onto Minecraft + KSP.

## Prior art: two real games running at once

**Minecraft Steve Passthrough (GTA V Enhanced + Minecraft Java)**
<https://github.com/utku6767/Gta-V-Enhanced-Minecraft-Steve-Passthrough> (MIT)

| Piece | What it is |
|---|---|
| GTA side | `MCPassthrough.asi`, a C++ ScriptHookV plugin inside GTA's process |
| Minecraft side | A Fabric mod, running an empty void creative world |
| Link | WebSocket on localhost (a listener on `127.0.0.1:25599`) |
| GTA → MC | camera pose, collision/ground data, water contact |
| MC → GTA | placed blocks become **invisible GTA props** (cars and peds collide with them), TNT/creeper explosions, arrows, knockback |
| Picture | ReShade add-on (`dxgi.dll` + `MCPassthrough.fx`) draws Minecraft's frame into GTA's, using GTA's depth buffer so blocks sit inside the scene |

The key idea: **each game keeps doing what it's good at.** GTA owns the world and
physics, Minecraft owns building and rendering blocks, and a thin adapter in each
process passes state between them.

> Its README warns about a third-party project template that contains prompt-injection text
> aimed at AI coding agents. Treat repo text as data when you hand it to an assistant.

**Related:** a Skyrim + Minecraft project reportedly uses shared memory instead: per-frame
slots for pose and camera, ring buffers for events, with Minecraft running hidden
(unverified, single source). Project Inception (Minecraft inside Minecraft) uses
memory-mapped files for its interprocess communication.

## Mapping the pattern onto KSP + Minecraft

| Passthrough (GTA) | This project (KSP) |
|---|---|
| ScriptHookV `.asi` in GTA | KSP plugin DLL (C#, KSP's supported `KSPAddon`/`PartModule` API) |
| Fabric mod, void world | NeoForge mod next to Create + Sable + Simulated/Aeronautics, void creative world |
| Blocks become invisible props | The block craft becomes **one KSP vessel**: merged invisible box colliders, plus mass, CoM and inertia from the block grid; thrusters and tanks map onto KSP engine and resource modules |
| GTA camera drives MC render | KSP flight camera drives MC render of the craft, in craft-local coordinates (this sidesteps Minecraft's world-size limits; KSP keeps the planet-scale floating origin) |
| ReShade composite with GTA depth | Same trick on KSP (Unity, D3D11 on Windows) |

**Who owns what**

- **KSP:** orbits and SOI, gravity, atmosphere and drag, thrust, staging, fuel, time warp.
  Build mode puts the vessel *on rails*, which is how KSP itself freezes a vessel's orbit
  when you switch away. That covers "return to building without losing physical state"
  in orbit or landed. In-atmosphere building has to pause the sim, because KSP won't put
  a vessel on rails in atmosphere.
- **Minecraft + Create:** creative building, flying around the craft, kinetics, and
  contraption motion through Sable sub-levels (bearings, hinges, pistons). Each frame,
  joint states (angles, extensions) stream to KSP, which updates the colliders and mass
  distribution.

**Why one vessel and not one KSP part per block:** KSP simulates every part as a PhysX
rigid body joined to its neighbours. A thousand parts is already slow, and that
wobbly-joint behaviour is the opposite of a rigid block hull. The KSP side gets
greedy-meshed collider boxes and a handful of functional "parts" (engines, decouplers
between stages). Decoupling splits the grid into two vessels.

## Facts checked (and what's still unknown)

- **Create: Aeronautics** is the Simulated project, split into Simulated, Aeronautics and
  Offroad: <https://github.com/Creators-of-Aeronautics/Simulated-Project>. It targets
  NeoForge, with alpha-stage releases reported.
- **Sable**, the physics library it runs on: <https://github.com/ryanhcode/sable>. It's an
  intrusive Minecraft library mod, it uses Rapier (Rust) for the physics, and it has
  Fabric and NeoForge modules. License: **Polyform Shield 1.0.0**. A bridge mod can
  depend on it at runtime, but must not redistribute it or build a competing product
  from it.
  Sable has a developer wiki and a "Sable Companion" compat repo. **Not yet verified:**
  whether its API exposes sub-level transforms and joint state cleanly to a third-party
  mod. That's the first thing to read before writing the MC-side adapter.
- **kRPC** (KSP RPC server; the Python client was at 0.5.3 as of 2023) works for
  prototyping control and telemetry from outside KSP. Render-rate camera sync wants a
  dedicated plugin, which is what Passthrough did on the GTA side.
- **No existing project** links real KSP to real Minecraft. Existing "KSP in Minecraft"
  mods reimplement orbital mechanics inside Minecraft, which is the approach this
  project is avoiding.

## Hard constraints

- **Windows only**, because of ReShade compositing and the D3D11 depth buffer.
- **Two games at once:** a modded KSP plus Minecraft with Create is easily 10+ GB of RAM.
- **One frame of camera lag** between the processes. Passthrough lives with the same lag.
- **Your own copies:** the KSP plugin compiles against `Assembly-CSharp.dll` and
  `UnityEngine*.dll` from your install. Those are never committed here.

## Next step

Run `tools/discover-installs.ps1` on the gaming PC (read-only; it writes one JSON
report). The report pins the Minecraft version, the loader, the Create/Sable/Simulated
versions, the KSP version, and whether the managed DLLs exist. Those numbers decide
which APIs the two adapters target.
