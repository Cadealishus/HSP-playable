# HOLDING PATTERN: level design document

**Flop Ops map 02 · Port Ellery International Airport (PEL) · Gate 12**

> Command: "The airport is closed. The flight is not cancelled. Those are different things."

Mood references (concept art supplied by the user, for tone and lighting only, not layout):
`holding-pattern-refs/01-check-in-hall.jpg` … `05-tarmac-cargo.jpg`.

---

## 0. Authoritative layout (the user's plan): this overrides the positions in §2–§3

The user supplied a labelled top-down plan (red callout boxes on a dark aerial image). In that
image **the light, outlined floor plan is the building interior; all dark grey is outside**
(roofs, roads and aprons around the terminal). This section transcribes it. Where §2–§3
disagree on *positions*, this section wins. Their gameplay rules (cover, sightlines, entrance
roles, anti-camp) still apply.

Scale: the plan is transcribed at **~9 px per metre** with north up. The building is about
**75 m (east–west) × 53 m (north–south)**, a compact footprint, with the airliner (~45 m)
parked **alongside the building's south-east edge, nose pointing east**. Coordinates below use
`x` east, `z` **south** (down the image), origin roughly at the middle of the building.

```
                         N  (landside roads/roofs: dark = outside, non-playable)
        ┌───────────────┬───────────┬──────────────────────┬───────────┐
        │ MAIN TERMINAL │ SECURITY  │   RETAIL / SHOPS     │ SERVICE   │
        │ (entry hall,  │ (lanes,   │   (shopfronts,       │ ROOMS     │
        │  "+" floor    │  podium)  │    diagonal walls)   │ (utility  │
┌───────┤  pattern)     ├──────┬────┴──────────┬───────────┤  stack,   │
│RESTAU-│               │CHECK-│  ESCALATORS   │ GATE      │  runs     │
│RANT / │  (west hall   │ IN   │  (bank, up to │ WAITING   │  south)   │
│FOOD   │   with seat   │(two  │   upper ring) │ AREA      ├───────────┘
│COURT  │   rows)       │ big  ├───────────────┤  GATE DESK│
│(west  │               │ light│   CENTRAL     │  BOARDING │
│ wing) │               │ atria│   CONCOURSE   │     ══════╪══ JET BRIDGE ══╗
└───┬───┴──┬────────────┴──────┴───────┬───────┴───────────┘               ║
    │KITCHEN│  ARRIVALS / south hall   │ ┌─REAR CABIN──MID CABIN──FRONT CABIN─╨─COCKPIT ▶ (nose E)
    │/ BACK │  (unlabelled on plan,    │ └──────────────────────────────────────┘
    │OF     │   angled SE corner)      │   ▲ cargo bay (aft, S side)  ▲ inflatable ramp (S side)
    │HOUSE  │                          │
    └───────┴──────────────────────────┘          ( ROUNDHOUSE )          TARMAC (S + E)
                                                  circular GSE building
```

| Zone (plan label) | Approx. bounds x, z (m) | Notes |
|---|---|---|
| **Main Terminal** | −22..−2, −26..11 | North-west entry hall (the "+" floor inlay is the landmark), continuing south as the west hall with seat rows and kiosks. Landside entrance doors on the north façade. |
| **Security** | −2..7, −26..−13 | North-centre. Lanes run north–south, feeding the core. |
| **Retail / Shops** | 7..27, −26..−10 | North-east block. Shopfronts with diagonal partition walls (the plan shows a strong diagonal), plus walk-throughs. |
| **Service Rooms** | 27..38, −26..−8 | Far north-east column of small rooms/utility, linking down to the gate side and out onto the east apron. The flank route. |
| **Restaurant / Food Court** | −37..−22, −6..11 | West wing that pokes out of the main outline. Tables in long rows, a counter and a service line. |
| **Kitchen / Back of House** | −31..−21, 11..26 | South-west. Connects the food court to the south hall and out to the south-west apron. The second flank. |
| **Check-In** | −12..−1, −13..11 | Centre-west. Two large lighter squares on the plan (read as double-height atria with skylights) and counters between them. |
| **Escalators** | 2..13, −10..−1 | Centre. The escalator bank up to the upper overlook ring. The central landmark. |
| **Central Concourse** | 1..16, −1..12 | Centre-south, the main contested floor, opening east toward the gate. |
| **Gate Waiting Area** | 16..27, −10..6 | East. Seat rows, glass wall facing the apron and plane. |
| **Gate Desk** | ~20..24, −3..1 | Boarding podiums; hard cover. |
| **Boarding** | ~20..26, 5..9 | Queue lane to the bridge head. |
| **Jet Bridge** | from (11..32, z≈9.5) then south to the front door (≈34, 14) | Runs **east along the building's south edge**, leaves the building at the east wall, hooks south to the plane's front door. The fast route. |
| **Plane** | fuselage x ≈ 6..51, z ≈ 16..19; nose (cockpit) at the east end | Parked parallel to the building, nose east. **Rear Cabin** x≈6–15, **Mid Cabin** x≈15–25, **Front Cabin** x≈25–40, **Cockpit** x≈46–51. The bridge meets the front cabin door on the north (building) side. |
| **Inflatable Ramp** | south side of the fuselage, mid/overwing, x≈16 | Slide down to the south apron. The safe route. |
| **Cargo Bay** | aft hold, south side, x≈8 | Belt loader from the south apron. The flank route into the rear cabin. |
| **Tarmac** | everything south and east of the building, x −40..80, z 12..60 | The open exterior. |
| **Roundhouse** (unlabelled circle on the plan) | centre ≈ (9, 33), r ≈ 8 m | Circular ground-service building on the apron south of the plane. A big landmark and hard cover in the middle of the tarmac; rename freely. |
| **South hall** (unlabelled) | −22..1, 11..27 | The large south-central room with the angled south-east corner. Treat it as Arrivals / Baggage Claim with carousels. It connects the kitchen, check-in and concourse, and has apron doors on its south side. |

What changes from the original §2 proposal: the gate and the bridge sit on the east side,
the plane is **alongside** the building (not nose-in), the food court is a west wing, and the
back of house is split between the kitchen (south-west) and the service rooms (north-east). An
upper level still exists above the escalators as an overlook ring around the concourse and
gate; the jet bridge rises from the ground-floor Boarding lane to the cabin door (+3.4 m).

## 1. Concept overview

A mid-sized regional airport caught mid-evacuation at golden hour. The terminal is a clean,
modern concrete-and-glass building on two levels: **arrivals/ground (y = 0)** and
**departures/gate level (y = 4.5 m)**. A single narrow-body airliner, **Fine Air flight 612**,
sits nose-in at Gate 12 on the tarmac. The whole aircraft is playable.

The map reads as three rings of intensity:

| Ring | Space | Fight type |
|---|---|---|
| Outer | Check-In, Retail, Food Court, Tarmac | medium/long range, rotations, positioning |
| Middle | Security, Concourse, Escalators, Gate Lounge | contested mid, vertical play |
| Core | Jet Bridge + Plane | close quarters, 3-way entry |

**Originality notes.** This is not any existing shooter's airport. It follows the user's own
plan (§0): a compact terminal with a west food-court wing, a split back of house (kitchen
south-west, service rooms north-east), a central escalator bank over the concourse, an
east-side gate, and an airliner parked along the south-east edge whose three entrances sit on
three different decks (bridge to the front door, overwing slide, aft cargo hold), plus the
Roundhouse as a tarmac landmark.

## 2. Gameplay-first blockout plan (original proposal; positions superseded by §0)

Coordinates in metres. `x` runs west → east, `z` runs landside (south) → airside (north).
Playable footprint about 150 × 160 m (x −75..75, z −60..100). Everything outside is backdrop.

```
 z=100 ┌──────────────────── FAR APRON (spawn B) ─────────────────────┐
       │  fuel truck      tug      ◆PLANE TAIL (z≈94)     remote stand  │
       │                          ║  cargo hold (E, aft) ◄─ belt loader │
       │  WEST APRON   slide ◄════╣  MID CABIN (overwing)   EAST APRON  │
       │  (open, safe)  (W)       ║                        (service)   │
       │  bus-gate carts          ║  FRONT CABIN  ◄═══ JET BRIDGE      │
 z=58  │                          ▼ COCKPIT (nose z≈58)       ╲         │
 z=48  ├──[glass curtain wall]───────── GATE 12 LOUNGE (y 4.5) ─╲──────┤
       │ BUS GATE (y0)│   OVERLOOK balcony (y 4.5)   │ CREW STAIRS│BAG  │
       │ ▲ apron doors│                              │            │HALL │
 z=25  │ RETAIL       │  CENTRAL CONCOURSE (y0, 12 m atrium)      │ FOOD│
       │ (west shops) │        ╳ THE ESCALATORS ╳                 │COURT│
 z=-15 ├──────────────┴──────┬── SECURITY ──┬──────────────────────┴─────┤
       │   CHECK-IN HALL     │ 3 lanes +     │ staff door → SERVICE CORR. │
       │   (islands A–D)     │ body scanners │  → baggage hall (east)     │
 z=-60 └─────── landside doors / kerb (spawn A) ───────────────────────────┘
      x=-75                  x=-10        x=10                           x=75
```

Levels: ground y = 0 (landside, concourse, retail, food court, bus gate, baggage hall, tarmac);
gate level y = 4.5 (overlook, lounge, gate desk, bridge head); plane cabin floor y = 3.4
(the bridge ramps down 1.1 m); cargo hold floor y = 1.4.

## 3. Zone breakdown

| # | Zone | Bounds (x, z) | Level | Role and cover |
|---|---|---|---|---|
| 1 | **Check-In Hall** | −75..−10, −55..−15 | 0 | Spawn-side staging. Four island counters A–D run north–south (1.1 m high, 14 m long) with baggage belts behind; a departures board wall on the east end. Medium sightlines between islands, long diagonal to the board. |
| 2 | **Security** | −10..10, −40..−15 | 0 | Readable choke: 3 scanner lanes (belt tables are waist cover, arches are no cover), a raised officer podium, trays and bins as micro-cover. A glass partition on the concourse side is bullet-stopping below 1.2 m. |
| 3 | **Staff Door → Service Corridor** | 10..70, −45..−38 | 0 | 3 m wide concrete corridor, two 90° corners (no long lane), lockers and a trolley. Leads to the Baggage Hall. Flank route. |
| 4 | **Central Concourse** | −30..45, −15..25 | 0 | Double-height atrium, columns on a 12 m grid. The long east–west lane is broken by the Escalators, 4 kiosks, planters and seating clusters. The main mid fight. |
| 5 | **The Escalators** | −2..18, −2..14 | 0 → 4.5 | Two escalator pairs crossing in an X in plan (one up-pair, one down-pair), with a service stair tucked under the crossing. The map's centre landmark. |
| 6 | **Retail / Shops** | −45..−30, −15..25 | 0 | Four shopfronts (duty free, bookshop, pharmacy, "gadgets"), two of them walk-through with back-door service links. Close/medium fights, peeks into the concourse. |
| 7 | **Food Court** | 45..70, −15..25 | 0 | A café bar with stools, a raised seating deck (+0.6 m) behind a planter wall, and a kitchen back door to the Baggage Hall. Medium range, strong corner holds. |
| 8 | **Bus Gate** | −75..−45, 25..48 | 0 | Ground-level remote-stand gate: rope lines, a small desk, and **apron doors** onto the West Apron. The safe exit to the tarmac. |
| 9 | **Overlook (Mezzanine)** | −30..45, 15..25 | 4.5 | Balcony along the atrium's north edge with a glass balustrade (1.1 m, stops bullets at the base rail only), looking down into the concourse. Power position, but open from below and from the escalator tops. |
| 10 | **Gate 12 Lounge** | −10..40, 25..48 | 4.5 | Semi-open waiting area: seat rows (low micro-cover), charging pillars, planters, two structural columns. Floor-to-ceiling glass north wall (a 1.2 m solid upstand, glass above) looking straight at the plane. |
| 11 | **Gate Desk** | 12..22, 40..46 | 4.5 | Twin boarding podiums with a queue lane and stanchions. Hard cover for the bridge head. |
| 12 | **Crew Stairs** | 40..48, 30..48 | 0 → 4.5 | Enclosed stair from the Baggage Hall up to the east end of the lounge. The flank into the gate. |
| 13 | **Baggage Hall** | 45..75, 30..58 | 0 | Back of house: sorting conveyors (waist cover), carts, a roller door out to the East Apron under the bridge. |
| 14 | **Jet Bridge** | from (20, 48) to (10, 62) | 4.5 → 3.4 | 17 m angled glazed tunnel with one rotunda kink. No cover except the rotunda corner. The fast route. |
| 15 | **Plane: Cockpit** | nose, z 58..61 | 3.4 | Two seats, instrument panels, door jammed open. The front-hold anchor. |
| 16 | **Plane: Front Cabin** | z 61..70 | 3.4 | Front galley (L1 bridge door on the east, R1 sealed), rows 1–6. |
| 17 | **Plane: Mid Cabin** | z 70..82 | 3.4 | Rows 7–16, with overwing exits at row 12 (west slide door). |
| 18 | **Plane: Rear Cabin** | z 82..92 | 3.4 | Rows 17–22, aft galley, lavatories, and the **floor hatch** down to the cargo hold. |
| 19 | **Cargo Bay** | z 84..94, below cabin | 1.4 | Low hold (1.6 m clearance, so crouch-speed movement), container cans, a netted cargo wall. Opens to the East Apron via the belt loader. |
| 20 | **Inflatable Ramp** | west side at row 12 | 0 → 3.4 | Deployed evacuation slide, walkable uphill at a slow climb speed. Its base is shielded by a baggage-cart train. |
| 21 | **Tarmac: West Apron** | −75..0, 48..100 | 0 | Open-ish: bus-gate carts, a stairs truck (non-functional), cones, a ULD container stack. Exposed but flexible. |
| 22 | **Tarmac: East Apron** | 20..75, 58..100 | 0 | Service side: baggage tractor train, belt loader, catering truck, cargo pallets. Denser cover; the cargo flank. |
| 23 | **Far Apron** | −75..75, 95..100 | 0 | Spawn B edge: fuel truck, tug, blast fence. |

## 4. Route flow

- **Main lane (medium–long):** Check-In → Security → Concourse → Escalators → Overlook/Lounge → Bridge → Plane front.
- **Safe rotation (west):** Check-In west end → Retail back doors → Bus Gate → apron doors → West Apron → **Slide** → mid cabin.
- **Power route (upper):** Escalators → Overlook → Lounge → Gate Desk → **Bridge** → front galley.
- **Flank (east, back of house):** Staff Door → Service Corridor → Baggage Hall → either **Crew Stairs** (into the lounge's east flank) or the roller door → East Apron → belt loader → **Cargo Bay** → rear cabin hatch.
- **Airside ↔ landside:** the tarmac never connects straight to Check-In. You have to go through the terminal (Bus Gate or Baggage Hall), so spawns stay protected.

Every zone has at least two exits, and the only single-entry spaces are the Cockpit (intentional, the hold) and the Crew Stairs (short, with a window slit to peek).

## 5. Callouts

Check-In: **Islands A/B/C/D, Board, Kerb Doors** · Security: **Lanes 1/2/3, Podium, Staff Door** ·
Concourse: **X / Escalators, Under-X, Kiosk West/East, Long Lane** · **Duty Free, Books, Pharmacy, Gadgets** ·
Food Court: **Café Bar, Deck, Kitchen** · **Overlook, Balcony West/East** · **Lounge, Gate Desk, Charging Pillars, Window** ·
**Crew Stairs, Bag Hall, Roller Door, Corridor** · **Bus Gate, Apron Doors** · **Bridge, Rotunda, L1** ·
Plane: **Cockpit, Front Galley, Business (rows 1–6), Mid, Overwing, Rear, Aft Galley, Lavs, Hatch** ·
Outside: **Slide, Carts, Stairs Truck, Cans (ULD stack), Belt Loader, Cargo Door, Tractor, Catering, Fuel Truck, Tail**.

## 6. The three plane entrances (sides per §0: bridge on the building side at the front, slide and cargo on the south side)

| Entrance | Deck / side | Enters at | Identity | How it plays |
|---|---|---|---|---|
| **Bridge** | Gate level, east side of the nose (L1) | Front galley | Speed / aggression / front hold | Shortest path from mid-map. The rotunda kink is the one pause point. You enter facing across the galley, with the cockpit to your left and the aisle to your right, so the first duel is immediate. Win it, and the cockpit sits at your back with a single aisle to watch: the front hold. |
| **Slide** | Ground, west side, overwing (row 12) | Mid cabin | Safety / consistency | Approach under cover of the cart train from the Bus Gate. The slide climb is slow but its top is recessed in the fuselage, so defenders must step into the aisle to shoot it. It lands you mid-cabin, splitting a front hold from the rear. |
| **Cargo** | Ground, east side, aft hold via belt loader | Cargo Bay → floor hatch → aft galley | Flank / sneak / back attack | The longest route, but fully covered from the lounge windows. The hold is dark and cramped. The hatch pops up in the aft galley behind anyone watching the slide, and the hatch lid's audible clang makes it fair. |

Anti-camp rules for the cabin:
- **Seats are micro-cover.** Seat backs are 1.05 m high, bullet-penetrable (fabric) and don't
  stop crouched bodies being hit. They exist to break silhouettes, not to hide behind.
- **Cabin windows are bullet-proof and opaque from outside**, so there are no tarmac-to-cabin cross-fires.
- **The aisle is 1.0 m wide** (slightly wider than real for smooth collision), with 2 + 2 seats. There are no overhead bins below 1.9 m, so nothing blocks headshots.
- The cockpit hold has no cover of its own. The anchor is the galley corner, and a grenade
  bounced off the galley wall reaches the cockpit. Holding is strong, not safe.

## 7. Blockout order

1. **Footprint + levels:** ground slab, gate-level slab, the atrium void, ceiling heights, the glass wall line. Walk it for scale (target: Security → Bridge head in ~20 s of running).
2. **Plane shell greybox:** fuselage, cabin floor, all three entrances working (bridge, slide, hatch), with walk timing tested.
3. **Connectors:** escalators X (as ramps first), Crew Stairs, service corridor, Bus Gate doors, roller door.
4. **Cover pass:** island counters, security lanes, kiosks, seat clusters, gate desk, cart trains, loader, containers. Playtest sightlines with AI bots.
5. **Nav + spawns + objective** (the wave-mode objective sits at the Gate Desk: "hold Gate 12").
6. **Art kit pass:** swap greybox for modular kit pieces zone by zone, terminal interior first (most-seen), then plane cabin, then tarmac.
7. **Lighting pass**, then **dressing pass** (signage, boards, clutter at the edges of paths only).
8. **Performance pass:** merge static meshes per material, instance seats and stanchions, LOD the far apron and backdrop.

## 8. Modular asset list

**Architecture:** floor tiles (polished terrazzo 4 × 4 m), concrete column (1.2 m square, clad base), ceiling coffer / slat panel modules, glass curtain wall bay (3 × 4.5 m with mullions and a 1.2 m upstand), glass balustrade segment, escalator unit (up/down, with side cladding and handrail belts), stair module, jet bridge tunnel segment + rotunda + cab, shopfront module (3 variants with signage slots), roller door, service door, wall panels (painted block, acoustic panel, stone cladding).

**Terminal props:** check-in island (counter, belt, scale, screen), queue stanchions + belt ropes, security lane (belt table, X-ray tunnel, body scanner arch, tray stacks, podium), seat rows (3/4/5-seat beams), charging pillar, planter (round, long), kiosk, café bar + stools + tables, departures board (large + hanging small), wayfinding signs (hanging, pictogram), bins, luggage (hard case 3 sizes, duffel), luggage trolley, wet-floor sign, CCTV dome, speaker, ceiling light strips, gate podium + gate number sign.

**Aircraft:** fuselage sections (nose/cockpit, cabin barrel ×3, tail cone), wing + engine (exterior only), landing gear, cabin seat pair (instanced), galley module (carts, ovens), lavatory module, cockpit module (seats, panels, yokes), overhead bin module, window strip, doors (L1 open, overwing open, others closed), evacuation slide, floor hatch, cargo hold interior (ULD cans, nets, floor rollers).

**Tarmac:** baggage tractor + dolly carts, belt loader, catering truck (scissor body), stairs truck, fuel truck, tug, ULD containers + pallets with nets, cones, chocks, blast fence, ground markings decal set (stand lines, hatching, stop bars), apron flood-light mast.

## 9. Lighting and materials

- **Key light:** golden-hour sun (~18–25° elevation) from the **west-north-west**, raking through the glass curtain wall and skylights into the gate lounge and concourse. That gives long mullion shadows across polished floors, which is the signature look.
- **Interior fill:** cool bounce from the sky through the glazing; warm practical strips over the retail and café; neutral cool-white linear fixtures in check-in and security.
- **Reflections:** polished terrazzo gets SSR plus roughness breakup (scuffs, dust near walls) so it reads as floor, not a mirror. Glass: a thin, slightly green tint, dirty edges, strong Fresnel.
- **Plane cabin:** warm window light patches across seat backs, cool fluorescent overheads, a slightly worn blue-grey upholstery and carpet.
- **Tarmac:** sun-bleached concrete panels with tar joints, oil stains, painted markings with wear, heat haze in the distance.
- **Materials palette:** off-white concrete, sandstone cladding, brushed steel, warm oak (café/lounge ceiling slats), navy upholstery, safety yellow/red accents on ground equipment. Readability rule: floors stay mid-value, cover objects darker or lighter than the floor, never the same value.

## 10. Balancing warnings

- **Long Lane** (Retail ↔ Food Court, ~100 m on the ground floor) will be a sniper lane. Keep the Escalator X solid at eye height and add kiosks on the 12 m column grid.
- **The Overlook** can dominate the concourse. Keep the balustrade see-through (so players on it are visible) and give the concourse two covered ways upstairs (Crew Stairs and the service stair under the X).
- **Glass wall to tarmac:** if the glass is shootable, the lounge and the West Apron become a cross-map snipe. The 1.2 m solid upstand plus bullet-stopping glass is the default; revisit after playtests.
- **The bridge can be over-held** from the gate side. The rotunda kink breaks the straight line, and the lounge window gives the East Apron a view into the bridge's glazing.
- **Cockpit camping:** there's no hard cover in the cockpit, a grenade bank shot off the galley wall reaches it, and the slide/hatch flanks reach the front cabin within about 6 s.
- **Spawn safety:** tarmac spawns (Far Apron) must not see Bus Gate or roller door exits. The blast fence blocks it.
- **Performance:** big glass areas, SSR floors and the full plane interior are expensive. Cull the cabin interior when the camera is outside the fuselage, and the terminal interior from deep in the plane.

## 11. Set pieces and identity moments

- **The departures board** lists only Fine Air flights, all of them deadpan: `FA 612 · GATE 12 · BOARDING (DOUG)`, `FA 404 · CANCELLED`, `FA 007 · DELAYED — REASON: YES`. Shooting it scrambles the split-flap letters.
- **The Escalators keep running** during the fight; one of them runs in the wrong direction and nobody mentions it.
- **The baggage belt in the hall never stops.** A single suitcase with an ESF tag goes round forever.
- **Seatbelt chime:** each wave in wave mode starts with the cabin "ding" over the PA, and Command says "Please remain seated."
- **Physics chaos:** the stairs truck and baggage carts are dynamic. Explosions on the apron scatter luggage in a satisfying (and slightly too large) arc.
- **Gate 12 objective:** in Flop Ops wave mode the mission is **OPERATION CARRY-ON** ("Hold Gate 12 until boarding completes. Boarding will not complete.").

---

## Implementation notes (this engine)

- **Map selection:** the world system builds one map per page load. A map registry
  (`src/world/maps/index.js`) exposes `{ id, name, subtitle, operation, build(ctx) }` for each
  map; the active map comes from `?map=<id>` (default `town`). The title screen shows a map
  picker (card per map); choosing a different map stores it in `localStorage` and reloads with
  `?map=`. Capture shots accept `?map=` too.
- The airport lives under `src/world/maps/airport/` and reuses the world kit, the materials
  library and the physics collider path. AI navmesh, player spawns, the wave spawn points and
  the objective position all come from the active map's data, not hard-coded constants.
