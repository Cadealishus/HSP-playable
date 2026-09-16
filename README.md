# HSP — Human Space Program

Runtime asset repository for the standalone HSP build.

## parts/

`parts/manifest.json` describes every downloadable part. The game reads it at
startup and pulls each `model` from `parts/models/` over `raw.githubusercontent.com`,
so the models do not have to be embedded as base64 in the HTML file.

- `parts/models/` — GLB meshes, converted from the original MU assets.
- `parts/cfg/` — the source KSP `.cfg` files, kept for reference. The numbers in
  `manifest.json` are derived from these.

### Units

The manifest is in HSP units, not KSP units:

| Field           | KSP source        | HSP manifest        |
|-----------------|-------------------|---------------------|
| `mass`          | tonnes            | kilograms           |
| `reactionWheel` | kN·m (`PitchTorque`) | N·m, ×600 (Mk1 pod 5 → 3000) |

### Adding a part

Drop the `.glb` into `parts/models/`, add an entry to `parts/manifest.json`, and
it appears in the VAB on the next load. No change to the game file is needed.

Attachment nodes use the KSP layout: `[x, y, z, dx, dy, dz, size]` for stack
nodes and `[x, y, z, dx, dy, dz]` for surface attachment. Nodes only mate with
the same `size` class.
