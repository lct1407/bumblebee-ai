# Space Battleship Game Visualization — Definitive Design Document

**Date**: 2026-03-19
**Status**: Brainstorm Complete
**Context**: Replaces/evolves the existing "Space Radar" tower-defense prototype (`space-radar-worktree/space-radar-ui/`) into a Space Battleship metaphor integrated directly into the Bumblebee Next.js web app.

---

## Problem Statement

Bumblebee needs a gamified project visualization that makes sprint progress tangible and engaging. The current prototype uses a ground-based RTS/tower-defense metaphor (zone bands, buildings, soldier units). The new vision is a **space battleship** metaphor where the construction and operation of starships directly mirrors sprint progress.

### Core Mapping Rules

| Bumblebee Concept | Game Concept |
|---|---|
| Sprint | Battleship (one ship per sprint) |
| Assignee | Robot crew member (unique archetype per person) |
| Feature/Story | Ship module being built/installed |
| Bug | Hull breach / damage (severity = visual intensity) |
| Task | Internal subsystem / crew activity |
| Epic | Ship section (groups of modules) |
| Agent Session | Repair/construction drone |

---

## 1. CHARACTER DESIGN -- Robot Crew Members

### Assignment Logic

Robots are assigned **deterministically by hashing the user's username** to one of the archetypes. This ensures the same person always gets the same robot across sessions and projects, creating identity. The hash uses a simple `username.charCodeAt(0) % 10` modulo for archetype selection, with the user's display color derived from a secondary hash.

### 10 Robot Archetypes

#### 1. FORGE-BOT (Welder/Builder)
- **Role mapping**: Assigned to users who most frequently work on `feature` type items
- **Appearance**: Stocky, barrel-chested robot. Orange/amber chassis with heavy welding arms. Visor is a single horizontal slit that glows bright when working. Tank treads instead of legs. Shoulder-mounted welding torch.
- **Pixel dimensions**: 16x20 (slightly taller than base 16x16)
- **Color scheme**: Primary #CC6600 (burnt orange), accent #FFAA00 (welding yellow), visor #FF4400
- **Animation states**:
  - *Idle* (2 frames): Slight torso bob, welding arm resting, visor pulses slowly
  - *Walking* (4 frames): Tread rotation, slight body bounce, arm sways
  - *Working* (4 frames): Welding arm raised, shower of spark particles (2x2 yellow/white pixels), bright visor
  - *Celebrating* (3 frames): Arms raised, visor flashes green, small firework particles above head
  - *Damaged* (2 frames): Sparks from chassis, visor flickers red, one arm droops
- **Work VFX**: Welding spark shower -- 4-6 particles per frame, yellow (#FFCC00) and white (#FFFFFF), 2x2 pixels, gravity-affected, lifespan 8-12 frames

#### 2. SCAN-BOT (Scanner/Analyst)
- **Role mapping**: Users who work on `spike` and `chore` type items
- **Appearance**: Tall, thin frame. Teal/cyan chassis. Large rotating dish antenna on head. Two thin sensor arms. Hovers slightly (no legs -- small thruster glow beneath).
- **Pixel dimensions**: 14x20
- **Color scheme**: Primary #00AAAA (teal), accent #00FFCC (scan green), antenna #44CCCC
- **Animation states**:
  - *Idle*: Antenna rotates slowly (2 frames), hover bob (1px vertical oscillation)
  - *Walking*: Glide movement, antenna spins faster
  - *Working*: Antenna locks direction, scan beam projects outward (horizontal line of cyan pixels), holographic data readout appears (small green text-like rectangle)
  - *Celebrating*: Antenna does full rapid spin, emits ring of scan particles
  - *Damaged*: Antenna bent, hover flickers (drops 2px every other frame)
- **Work VFX**: Scan beam -- 1px wide cyan line extending 24px in facing direction, with periodic sweep. Hologram effect: 8x6 green-tinted translucent rectangle near target

#### 3. COMMAND-BOT (Commander/Lead)
- **Role mapping**: Users with the most assigned items, or project owner
- **Appearance**: Medium build, authoritative stance. Deep blue chassis with gold trim. Cape-like panel on back (2px wide flowing element). Star insignia on chest. Standard bipedal with armored boots.
- **Pixel dimensions**: 16x18
- **Color scheme**: Primary #2244AA (navy), accent #CCAA00 (gold), insignia #FFFFFF
- **Animation states**:
  - *Idle*: Cape sways (1px offset alternating), stands at attention
  - *Walking*: Measured stride, cape flows, arms swing precisely
  - *Working*: Points forward (directing), small holographic tactical display appears beside them (4x4 blue grid)
  - *Celebrating*: Salute pose, gold particles emanate from insignia
  - *Damaged*: Cape torn (shorter), leans to one side, insignia flickers
- **Work VFX**: Tactical hologram -- small blue wireframe grid (6x4 pixels) floating beside the bot, with blinking dots representing items

#### 4. WRENCH-BOT (Engineer/DevOps)
- **Role mapping**: Users who work on `task` and infrastructure items
- **Appearance**: Round, compact body. Green chassis. Oversized mechanical arms (longer than body). Tool belt around waist. Single large eye (camera lens style). Four stubby legs for stability.
- **Pixel dimensions**: 16x16
- **Color scheme**: Primary #228844 (forest green), accent #44CC44 (lime), eye #88FFAA
- **Animation states**:
  - *Idle*: Eye tracks left-right slowly, arms rest at sides, tool belt glints
  - *Walking*: Four-leg scuttle (alternating pairs), arms swing loosely
  - *Working*: One arm extends with wrench/tool, rotational motion, mechanical sound-suggesting particles (small gray gear-like 3x3 shapes)
  - *Celebrating*: Spins wrench overhead, eye turns to happy squint (horizontal line)
  - *Damaged*: One leg dragging, arm hangs limp, eye turns red
- **Work VFX**: Gear particles -- 3x3 gray (#888888) pixel clusters that rotate and float away, plus small bolt/nut particles (1x1 metallic)

#### 5. SHIELD-BOT (Security/QA)
- **Role mapping**: Users who work on `bug` fixes and review tasks
- **Appearance**: Wide, defensive posture. Purple/violet chassis. Large energy shield generator on left arm (hexagonal shape when deployed). Armored plating visible. Bipedal with wide stance.
- **Pixel dimensions**: 18x16
- **Color scheme**: Primary #6622AA (purple), accent #AA44FF (violet glow), shield #8844FF with #FFFFFF edge
- **Animation states**:
  - *Idle*: Shield generator hums (faint purple glow pulse around arm), weight shifts foot to foot
  - *Walking*: Heavy deliberate steps, shield arm forward
  - *Working*: Shield deployed (hexagonal energy field, 12x10 translucent purple), scanning for threats
  - *Celebrating*: Shield pulses outward as expanding ring, victory stance
  - *Damaged*: Shield flickers and breaks (fragments scatter), armor cracked
- **Work VFX**: Shield hex-grid -- translucent purple hexagonal pattern that pulses when active. When fixing bugs, the shield contracts around the damage site.

#### 6. CARGO-BOT (Logistics/Story Management)
- **Role mapping**: Users who work on `story` type items
- **Appearance**: Rectangular torso (like a walking crate). Yellow chassis with black hazard stripes. Forklift-style arms. Small head with two dot eyes on top of large body. Wheeled base.
- **Pixel dimensions**: 16x18
- **Color scheme**: Primary #CCAA00 (yellow), accent #000000 (hazard black), eyes #FFFFFF
- **Animation states**:
  - *Idle*: Slight rocking motion, eyes blink occasionally (every 120 frames)
  - *Walking*: Wheels roll (rotation marks), body slightly tilts forward
  - *Working*: Forklift arms raised carrying a translucent blue cargo container (representing the story/module being transported)
  - *Celebrating*: Drops cargo successfully, does a little wheel spin
  - *Damaged*: Cargo falls, one wheel stuck, hazard stripes flash
- **Work VFX**: Cargo glow -- translucent blue (#4488FF44) rectangle carried between forklift arms, pulsing softly

#### 7. MEDIC-BOT (Bug Fixer/Healer)
- **Role mapping**: Secondary archetype for bug-fix specialists
- **Appearance**: White chassis with red cross marking. Slender build. One arm is a multi-tool medical appendage (drill, patch applicator, scanner). Head has rotating medical lamp. Bipedal, quick movements.
- **Pixel dimensions**: 14x18
- **Color scheme**: Primary #DDDDDD (white), accent #CC2200 (red cross), lamp #44FF44 (green)
- **Animation states**:
  - *Idle*: Medical lamp rotates slowly, stands ready
  - *Walking*: Quick nimble steps, lamp bounces
  - *Working*: Multi-tool arm extends to hull breach, green healing particles flow from tool to damage site
  - *Celebrating*: Lamp turns solid green, red cross pulses brightly
  - *Damaged*: Lamp broken (dark), red cross faded, limps
- **Work VFX**: Healing stream -- line of green (#44FF44) particles flowing from tool to repair site, with small "+" symbols (3x3 pixel cross shapes)

#### 8. TURRET-BOT (Defense/Testing)
- **Role mapping**: Users doing test/verification tasks
- **Appearance**: Stationary-looking but mobile. Tripod base. Upper body is a rotating turret with dual cannons. Small sensor eye between barrels. Compact, aggressive silhouette.
- **Pixel dimensions**: 16x16
- **Color scheme**: Primary #884422 (bronze), accent #FF6600 (muzzle flash), sensor #FF0000
- **Animation states**:
  - *Idle*: Turret slowly scans left-right, sensor eye blinks
  - *Walking*: Tripod legs animate (3-frame cycle), turret stays level
  - *Working*: Turret locks on target, fires diagnostic beams (thin red lines to target module)
  - *Celebrating*: Fires celebratory shots upward (small projectile particles going up)
  - *Damaged*: One barrel bent, tripod wobbles, sensor dim
- **Work VFX**: Diagnostic beam -- thin red (#FF4400) line from barrels to target, with impact sparks at target end. Muzzle flash: 3x3 bright orange (#FF8800) for 2 frames

#### 9. COMM-BOT (Communications/Documentation)
- **Role mapping**: Users who frequently add comments or documentation tasks
- **Appearance**: Satellite dish head (large relative to body). Thin body with blinking antenna array on back. Two nimble arms for typing gestures. Floats on small hover pad.
- **Pixel dimensions**: 14x18
- **Color scheme**: Primary #4466AA (steel blue), accent #66AAFF (signal blue), dish #88AACC
- **Animation states**:
  - *Idle*: Dish rotates, antenna lights blink in sequence
  - *Walking*: Hover-glide, dish stabilizes (gyroscope effect)
  - *Working*: Arms type rapidly (alternating arm positions), signal waves emanate from dish (expanding arcs)
  - *Celebrating*: Dish projects holographic firework display
  - *Damaged*: Dish cracked, antenna dark, hover failing
- **Work VFX**: Signal waves -- expanding arc shapes (3px radius growing to 12px, fading) emanating from dish in facing direction, colored #66AAFF with decreasing opacity

#### 10. STEALTH-BOT (Covert Ops/Spike Research)
- **Role mapping**: Fallback/rare archetype for spike researchers
- **Appearance**: Angular, faceted chassis (stealth aircraft inspired). Dark gray with subtle edge lighting. Single narrow visor. Thin limbs. Cloaking shimmer effect when idle.
- **Pixel dimensions**: 16x16
- **Color scheme**: Primary #333344 (dark steel), accent #6666AA (edge light), visor #44AAFF
- **Animation states**:
  - *Idle*: Semi-transparent (alpha 0.6), edge lights pulse faintly, visor scans
  - *Walking*: Fully visible, smooth glide, minimal animation
  - *Working*: Becomes fully visible, visor projects data stream (falling green text-like pixels ala Matrix)
  - *Celebrating*: Briefly fully visible with bright edge lights, then re-cloaks
  - *Damaged*: Cloak broken (full opacity, flickering), edge lights red
- **Work VFX**: Data rain -- vertical columns of small green (#44CC44) pixels falling within a 8x12 area near the bot, Matrix-style

### Robot Scale Relative to Ship
- Robots are **1/8th the height of a ship section** (ship section = ~64px tall at 2x zoom, robot = ~8px visible)
- At default zoom, robots appear as small colored dots with distinguishing silhouettes
- At zoomed-in view, full detail is visible
- Robots are drawn ON the ship surface (walking along hull corridors, working in module bays)

---

## 2. SHIP DESIGN -- Sprint Battleships

### Art Style: Chunky Industrial Sci-Fi
The ships should feel like **working vessels** -- not sleek Star Trek ships, but utilitarian, modular, industrial spacecraft. Think Alien's Nostromo meets Homeworld's mothership. Visible rivets, panel lines, antenna arrays, exposed conduits. This matches the "building things" metaphor better than sleek designs.

### Ship Anatomy (Top-Down View)

The ship is viewed from a **3/4 top-down isometric angle** (same as the existing pixel art buildings in the prototype). Each ship is composed of a grid of module slots.

```
Ship Layout (conceptual grid, 8 columns x 4 rows):

        [BOW]
   ┌─────────────────┐
   │  Bridge   Comms  │  Row 0: Command Section (Epic-level)
   ├─────────────────┤
   │ Eng  Eng  Wep  Wep│  Row 1: Core Systems
   ├─────────────────┤
   │ Cargo Hold  Labs  │  Row 2: Operations
   ├─────────────────┤
   │  Engine Room      │  Row 3: Propulsion
   └─────────────────┘
        [STERN]
```

### Module Slot Mapping

| Ship Section | Work Item Types | Visual Character |
|---|---|---|
| Bridge (top-center) | Epic items, high-priority features | Command tower, antenna array, viewport windows |
| Communications Array | Documentation tasks, comms features | Satellite dishes, antenna masts |
| Weapons Systems | Testing/verification tasks, security features | Turret mounts, shield generators |
| Engineering Bays | Core features, backend work | Glowing reactor cores, pipe networks |
| Cargo Hold | Story items, data/content features | Large bay doors, crate stacks |
| Laboratories | Spike/research items | Bubble domes, holographic displays |
| Engine Room | Infrastructure tasks, DevOps | Thruster nozzles, fuel lines, exhaust |
| Hull Plating | Chore items | Armor panels, structural reinforcement |

### Ship Construction Lifecycle

#### Phase 1: Blueprint (Sprint status = `planning`)
- Ship appears as a **translucent wireframe outline** -- cyan/blue lines on dark background
- Module slots visible as dotted rectangles
- No crew present, no activity
- Faint grid overlay suggesting "plans"
- Label: "BLUEPRINT -- [Sprint Name]"

#### Phase 2: Skeleton Frame (Sprint status = `active`, 0-25% items done)
- Wireframe solidifies into a dark metallic skeleton
- Visible structural ribs and frame members
- First modules begin to appear where items are `in_progress`
- Crew robots arrive and begin walking the frame
- Construction scaffolding visible (small pixel structures around edges)
- Ambient: Occasional welding sparks in random locations

#### Phase 3: Under Construction (25-50% items done)
- Hull partially plated -- some sections have solid panels, others still show skeleton
- Active construction zones glow with work activity
- More crew visible, moving between modules
- Engine section starts to glow faintly (reactor powering up)
- Ship begins to look recognizable as a vessel

#### Phase 4: Systems Online (50-75% items done)
- Most hull plating complete
- Interior lights visible through windows
- Weapons/sensor arrays begin to extend from hull
- Engine glow intensifies
- Bridge viewport illuminated
- Ship looks functional but not finished

#### Phase 5: Final Assembly (75-99% items done)
- Nearly complete ship with a few remaining construction zones
- Full lighting, all major systems visually active
- Paint job / markings appear (sprint name on hull)
- Running lights activate along edges
- Crew in final positions

#### Phase 6: Launch Ready (100% items done / sprint `completed`)
- Fully assembled, gleaming ship
- All lights on, engine at full glow
- Victory particle effects (small stars/sparkles around ship)
- Ship name prominently displayed
- **Launch animation**: Ship accelerates forward with engine trail, moves to "completed fleet" area

### Ship Size Scaling
- Base ship size: **128x64 pixels** (at 1x) for a standard sprint (10-20 items)
- Ships scale up for larger sprints: +16px width per 10 additional items
- Maximum ship size: **256x96 pixels** for very large sprints (50+ items)
- Each module slot is approximately **16x16 pixels**

### Completed Ship Visual
- Solid hull with consistent color scheme
- All windows lit (warm yellow/white glow)
- Engine producing steady blue-white exhaust trail (particle effect)
- Sprint name and completion date etched on hull
- Small flag/pennant element on bridge tower
- Crew visible at stations through windows (colored dots)

### In-Progress Ship Visual
- Mixed hull: solid panels where done, skeleton/scaffolding where in-progress, empty slots where todo
- Welding sparks at active construction sites
- Some windows dark, some lit
- Engine partially glowing
- Construction cranes/scaffolding around unfinished areas
- Crew moving between work sites

---

## 3. BUG VISUALIZATION -- Hull Damage

Bugs manifest as **visible damage on the ship hull**, positioned at the module most related to the bug's parent epic/feature. If no parent, damage appears at a random hull location.

### Damage by Priority

#### Critical Bug -- Massive Hull Breach
- **Visual**: Large hole in hull (8x8 to 12x12 pixel area) with jagged edges
- **Effects**:
  - Fire particles: Orange/red (#FF4400, #FF8800) pixels streaming outward, 6-8 particles, gravity-free (space), flickering
  - Atmosphere venting: White/blue (#AACCFF) particles streaming from breach in a cone, dissipating over 20px
  - Alarm lights: Red pixels on nearby hull sections flash every 15 frames (alternating on/off)
  - Breach interior: Dark void (#000000) with occasional internal spark
- **Size**: ~12x12 pixel damage area
- **Sound trigger**: Klaxon alarm loop while visible

#### High Bug -- System Failure
- **Visual**: Hull section discolored (darker, scorched), with visible cracks (1px dark lines radiating from center)
- **Effects**:
  - Sparks: Intermittent spark particles (yellow #FFCC00) every 30 frames, 2-3 particles
  - Flickering lights: Nearby window lights flicker (alpha oscillation 0.3 - 1.0)
  - Smoke wisps: Small gray (#666666) particles drifting slowly upward, 1-2 at a time
- **Size**: ~8x8 pixel damage area
- **Sound trigger**: Electrical short circuit sound, intermittent

#### Medium Bug -- Structural Crack
- **Visual**: Visible crack pattern on hull (2-3 branching 1px dark lines)
- **Effects**:
  - Subtle particle dust: Tiny gray particles (1x1) occasionally drift from crack
  - Hull discoloration: Slight color shift in crack area (darker by 20%)
  - No lighting effects
- **Size**: ~6x6 pixel affected area
- **Sound trigger**: Subtle creaking sound

#### Low Bug -- Minor Dent
- **Visual**: Small depression in hull (2x2 darker pixels with 1px highlight on edge suggesting dent shape)
- **Effects**:
  - Cosmetic only -- no particles, no lighting change
  - Barely visible at default zoom
- **Size**: ~3x3 pixel affected area
- **Sound trigger**: None

### Bug Repair Animation
When a bug's status changes to `in_progress`:
1. A **MEDIC-BOT or SHIELD-BOT** (the assigned robot) moves to the damage site
2. Green healing/repair particles flow from robot to damage
3. Damage area shrinks progressively (8 frames of shrinking)
4. When bug status becomes `resolved`:
   - Damage closes up
   - A **repair scar** remains: slightly different colored hull panel (lighter gray, suggesting patch welding) -- this preserves history
   - Brief green flash at repair site
   - Robot celebrates briefly, then moves on

### Bug Positioning Logic
```typescript
function getBugPosition(bug: WorkItem, shipModules: ModuleSlot[]): Position {
  // If bug has a parent feature, place damage on that module
  if (bug.parent_id) {
    const parentModule = shipModules.find(m => m.itemId === bug.parent_id);
    if (parentModule) {
      // Offset slightly from module center to avoid overlap
      return offsetFromCenter(parentModule.position, bug.id);
    }
  }
  // No parent: place on hull edge (exterior damage)
  return randomHullEdgePosition(bug.id); // deterministic from ID
}
```

---

## 4. TASK LIFECYCLE VISUALIZATION

### Status-to-Visual Mapping

#### Backlog / Open -- Blueprint Schematic
- Module appears as a **translucent cyan wireframe** floating near its designated slot on the ship
- Faint dotted line connects schematic to its slot position
- Slight gentle bob animation (floating in space, 1px vertical oscillation every 40 frames)
- Label shows item key in dim cyan
- No crew assigned to this location

#### Confirmed / Todo -- Queued Component
- Wireframe becomes **semi-opaque** (alpha 0.5)
- Color shifts from cyan to white -- "approved for construction"
- Small queue number appears (position in construction order)
- Faint pulsing glow indicates "ready to be picked up"

#### In Progress -- Active Construction
- Module slot shows **scaffolding framework** (thin brown/gray pixel lines forming a box around the slot)
- Inside scaffolding: module is **partially built** (bottom half solid, top half still wireframe)
- The assigned robot crew member is present at this location
- Active VFX based on robot type (welding sparks, scan beams, etc.)
- Construction progress bar appears below module (tiny, 12px wide, green fill)
- Scaffolding lights: small yellow dots at scaffolding corners, blinking

#### In Review -- Diagnostic Scan
- Module is **fully assembled** but enclosed in a **pulsing blue diagnostic field** (translucent blue rectangle pulsing alpha 0.3-0.6 every 20 frames)
- Scan lines sweep across module (horizontal line moving top-to-bottom, repeating)
- Robot crew member stands nearby in scan/observe pose
- Diagnostic readout: small green text-like pixels beside the module
- Module itself looks complete but slightly desaturated (not yet "live")

#### Done / Resolved -- Operational Module
- Module **fully integrated** into ship hull -- seamless with surrounding panels
- Interior lights ON (warm glow through any windows/ports)
- No scaffolding, no diagnostic field
- Module matches ship's overall color scheme
- Small green status indicator (2x2 green pixel) in corner
- Assigned robot has moved to next task (or celebrates briefly on completion)

#### Failed -- Destroyed Module
- Module slot shows **wreckage**: charred/blackened debris, broken structural elements
- Fire particles (smaller than critical bug -- 2-3 orange pixels flickering)
- Floating debris: 2-3 small pixel chunks drifting slowly away from the slot
- Slot has a red "X" marker
- Dark smoke particles (1-2 gray pixels rising)
- No robot present (abandoned)

### Transition Animations

**Open to In Progress**: Wireframe materializes into scaffolding over 30 frames (fade + structural lines appear). Robot walks to position.

**In Progress to In Review**: Scaffolding dissolves (fades out over 20 frames), diagnostic field fades in. Scan sweep begins.

**In Review to Done**: Diagnostic field contracts and disappears with a bright flash (white, 3 frames). Module color saturates to full. Lights turn on. Brief celebration particle burst (green/gold).

**Any to Failed**: Explosion animation at module (expanding orange circle, 6 frames, same as existing explosion system). Module texture replaced with wreckage. Smoke begins.

---

## 5. COMPLETED TASKS DISPLAY

### Approach: Dual Display System

#### A. On-Ship Integration (Primary)
Completed modules are simply the fully-lit, operational sections of the ship. They stand out because:
- They glow warmly while in-progress sections have construction VFX
- They have smooth, finished hull plating vs. skeletal framework
- A subtle **gold trim line** borders completed sections, distinguishing them from never-started areas
- Hovering a completed module shows a "COMPLETE" badge with completion timestamp

#### B. Ship's Log Panel (Secondary -- UI Overlay)
A collapsible side panel (right side, overlaying the game canvas) that shows:

```
SHIP'S LOG -- [Sprint Name]
================================
COMPLETED MODULES (12/20)

[14:32] BB-201 Project Dashboard    [MIA]  3SP
[13:15] BB-104 JWT Auth Refresh     [KAI]  8SP
[12:00] BB-106 PostgreSQL Setup     [SAM]  2SP
...

ACTIVE CONSTRUCTION (5)
  BB-211 Priority Queue             [ALEX] ████░░ 60%
  BB-202 File Upload                [MIA]  ██░░░░ 35%
  ...

DAMAGE REPORT (3 breaches)
  BB-205 Payment Webhook [CRITICAL] ██████ REPAIRING
  BB-206 Queue Deadlock  [CRITICAL] ██████ UNREPAIRED
  ...
```

This log panel uses the existing shadcn/ui Sheet component, matching the detail-panel pattern already in the codebase.

#### C. Construction Replay (Stretch Goal)
A "timelapse" button that replays the ship's construction history:
- Start from empty frame
- Fast-forward through each completed item in chronological order
- Each module pops in with a quick build animation
- Shows the ship growing over time
- Controlled by a timeline scrubber

---

## 6. SPACE ENVIRONMENT

### Background Layers (Parallax)

#### Layer 0: Deep Space (furthest, slowest parallax)
- Pure black (#000008) base
- Distant stars: ~200 randomly placed 1x1 white pixels, very slow twinkle (alpha oscillation every 200+ frames)
- 2-3 distant galaxies: small 8x4 smudges of purple/blue (#221133), barely visible
- Parallax rate: 0.05x camera movement

#### Layer 1: Nebula Clouds (mid-distance)
- 3-4 large nebula patches: 64x32 to 128x64 soft gradient blobs
- Colors: deep purple (#1a0a2e), dark blue (#0a1a2e), hints of teal (#0a2e2a)
- Very low opacity (alpha 0.15-0.25)
- Slight animated drift (0.02px/frame horizontal)
- Parallax rate: 0.15x camera movement

#### Layer 2: Star Field (mid-ground)
- ~100 stars, mix of sizes:
  - 70% are 1x1 white pixels
  - 20% are 2x2 with slight color (pale blue #AACCFF, pale yellow #FFEEAA)
  - 10% are 3x3 with cross-shaped twinkle animation
- Twinkle: random stars change alpha (0.4-1.0) on different timers
- Parallax rate: 0.3x camera movement

#### Layer 3: Game Objects (ships, stations)
- Parallax rate: 1.0x (standard camera tracking)
- This is where all ships, crew, effects live

### Environmental Objects

#### Space Station (Project Hub)
- Large structure at the center-left of the scene
- Represents the **project overview** / settings
- Visual: Rotating ring station with central hub, 64x64 pixels
- Function: clicking opens project settings/overview
- Connected to active ship via a **supply line** (thin dotted line with moving dots, representing data flow from project to sprint)

#### Asteroid Field (Backlog)
- Cluster of small asteroids (4x4 to 8x8 irregular brown/gray shapes) at the bottom of the scene
- Each asteroid represents an **unassigned backlog item**
- Asteroids slowly drift and rotate
- Clicking an asteroid shows the backlog item details
- When an item gets assigned to a sprint, the asteroid "launches" toward the ship (quick animation)

#### Completed Fleet Formation
- Completed sprint ships arranged in a **V-formation** or **line formation** in the upper-right area
- Ships are smaller (50% scale) and slightly dimmed
- Engine trails visible (blue particle streams)
- Hovering shows sprint name and completion stats
- Clicking a completed ship expands it to full size temporarily and shows the Ship's Log

#### Warp Gate (Future Sprints)
- A glowing portal structure at the far right
- Represents sprints in `planning` status
- Blueprint ships are faintly visible through the gate
- Visual: Circular energy ring with swirling particles, 48x48 pixels

---

## 7. HUD / UI OVERLAY

The HUD combines pixel-art game elements with the existing shadcn/ui design system for overlay panels.

### Top Bar (Fixed, Full Width)

```
[FLEET: Bumblebee]  [SHIP: S2 - Operation Client Storm]  [INTEGRITY ████████░░ 78%]  [CREW: 4/5 ●●●●○]  [ALERT: ▲▲ 2 CRITICAL]  [T-8D]
```

- **Fleet Name**: Project name, clickable to return to project overview
- **Ship Name**: Active sprint name, clickable to cycle through sprints
- **Integrity Meter**: Percentage of items in done/resolved status. Bar color: green (>70%), yellow (40-70%), red (<40%)
- **Crew Roster**: Assignees with online/offline indicators (filled/empty circles). Online status from WebSocket presence
- **Alert Level**: Bug count by severity. Flashes red when critical bugs exist
- **Countdown**: Days remaining in sprint. Turns red on final 2 days

### Bottom Panel (Contextual)

Shows details when an entity is clicked/selected:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Module Icon]  BB-201: Project Dashboard         STATUS: BUILDING  │
│ Assigned: MIA (CARGO-BOT)  |  SP: 8  |  Due: Mar 25           │
│ Progress: ████████░░░░ 65%  |  Sprint: Operation Client Storm  │
│ [VIEW DETAILS]  [START AGENT]  [OPEN IN BOARD]                 │
└─────────────────────────────────────────────────────────────────┘
```

- Renders as a shadcn Card component overlaying the bottom of the canvas
- **VIEW DETAILS**: Opens the existing detail-panel Sheet
- **START AGENT**: Triggers `bb agent run` for this item
- **OPEN IN BOARD**: Navigates to kanban board view with this item highlighted

### Mini-Map (Bottom-Right Corner)

- Small 120x60 pixel overview of the entire scene
- Shows ship positions as colored rectangles
- Current viewport shown as a white rectangle outline
- Click to navigate

### Resource Display (Top-Right)

```
SP: 142/200  |  VELOCITY: 12pts/week  |  BURN: 6D remaining
```

- **Story Points**: Total done vs total in sprint
- **Velocity**: Calculated from recent completion rate
- **Burn**: Estimated days to complete remaining work at current velocity

---

## 8. INTERACTIONS

### Click Interactions

| Target | Click Action | Double-Click |
|---|---|---|
| Ship Module (feature/story) | Select, show bottom panel with details | Open detail page (`/projects/[slug]/items/[number]`) |
| Robot Crew Member | Select, show assignee info + current task | Open assignee's task list (filtered board view) |
| Hull Damage (bug) | Select, show bug details in bottom panel | Open bug detail page |
| Completed Ship | Expand to full size, show ship's log | Navigate to that sprint's board view |
| Space Station | Show project stats overlay | Navigate to project settings |
| Asteroid (backlog item) | Show backlog item details | Open item detail page |
| Empty Space | Deselect all, hide bottom panel | -- |

### Hover Effects

- **Module**: Subtle glow outline (2px border, module's status color, alpha 0.4)
- **Robot**: Name tooltip appears above (assignee display name + current task title)
- **Bug Damage**: Severity tooltip + bug title
- **Completed Ship**: Sprint name + completion date tooltip

### Zoom Controls

- **Scroll wheel**: Zoom in/out (3 levels)
  - **Fleet View** (0.5x): All ships visible, robots not visible, ship labels only
  - **Ship View** (1.0x): Single ship fills most of screen, modules and robots visible, labels on everything
  - **Detail View** (2.0x): Close-up of ship section, full robot detail, animation detail, can read module contents
- **Click + Drag**: Pan the camera
- **Keyboard shortcuts**: `1` Fleet View, `2` Ship View, `3` Detail View, `Space` center on active ship

### Sprint Navigation

- **Left/Right arrows** or **Tab**: Cycle between sprint ships
- Current sprint has a **glowing border** and is centered by default
- Transitioning between sprints: smooth camera pan animation (300ms ease-in-out)

### Context Menu (Right-Click)

On any game entity:
- View Details
- Open in Board
- Start Agent (for items)
- Assign to Sprint (for backlog items)
- Change Status (quick status selector)

### Agent Integration

From the game view, users can:
1. **Select a module** (work item) that is `in_progress` or `confirmed`
2. Click **"Deploy Agent"** in the bottom panel
3. An **Agent Drone** (from existing prototype) launches from the Space Station toward the ship
4. Drone arrives at the module and begins working (execute phase)
5. WebSocket events update drone status in real-time
6. On completion, drone posts results and module transitions to `in_review`

---

## 9. SOUND DESIGN

### Sound Implementation
Use the **Web Audio API** with pre-loaded audio buffers. All sounds are optional (mute by default, toggle in HUD). Sounds are short clips (0.5-3 seconds), loaded as ArrayBuffers.

### Ambient Layer (Looping)
- **Ship Engine Hum**: Low frequency drone (80-120Hz), subtle, continuous. Different pitch based on ship completion % (higher = more complete). Format: 5-second seamless loop.
- **Space Atmosphere**: Very faint high-frequency shimmer (like radio static but musical), almost subliminal. 8-second loop.
- **Construction Ambience** (when in-progress items exist): Distant metallic clanks and hisses, randomized from a pool of 4-5 short samples, triggered every 3-8 seconds at low volume.

### Event Sounds

| Event | Sound | Duration | Description |
|---|---|---|---|
| Module construction start | Hydraulic hiss + clank | 0.8s | Pneumatic locking sound |
| Welding/work tick | Quick spark zap | 0.2s | Plays every ~60 frames during active construction |
| Module complete | Satisfying lock-in + power-up chime | 1.2s | Mechanical snap followed by ascending tone (C-E-G) |
| Diagnostic scan start | Electronic sweep | 0.6s | Rising frequency sweep, sci-fi scanner feel |
| Scan complete (review done) | Affirmative beep | 0.4s | Two-tone ascending beep (approval sound) |
| Bug detected | Warning klaxon | 0.8s | Short alarm burst, intensity based on severity |
| Critical bug | Full alarm + hull breach | 1.5s | Klaxon + decompression whoosh + emergency siren |
| Bug repair start | Tool power-up | 0.5s | Drill/welder spin-up sound |
| Bug repaired | Seal + hiss | 0.8s | Welding seal followed by pressurization hiss |
| Sprint complete (ship launch) | Engine roar + fanfare | 3.0s | Ascending engine sound + triumphant chord |
| Agent deployed | Drone launch | 0.6s | Quick thruster burst |
| Item failed | Explosion + debris | 1.0s | Small explosion, falling debris |
| Crew robot walking | Tiny footsteps | 0.15s | Barely audible metallic tap, only at Detail zoom level |

### Sound Generation Approach
Generate all sounds programmatically using Web Audio API oscillators and noise generators (no audio files needed):
- Engine hum: OscillatorNode (sine wave, 80Hz) + gain envelope
- Sparks: White noise burst (50ms) with high-pass filter
- Chimes: OscillatorNode sequence (sine, specific frequencies)
- Alarms: Square wave oscillator with frequency modulation
- This eliminates the need for audio asset files entirely

---

## 10. ASSET GENERATION PLAN (Gemini AI)

### Art Style Guidelines for Prompts

**Master Style Prompt Prefix** (prepend to all asset prompts):
```
Pixel art sprite, 16-bit retro game style, top-down 3/4 isometric view,
dark space background, limited color palette (max 12 colors per sprite),
clean pixel edges, no anti-aliasing, transparent background PNG.
```

### Asset Categories and Prompts

#### A. Robot Crew Sprites (10 archetypes x 5 states x 2-4 frames = 100-200 frames)

**Format**: 16x20 pixels per frame, organized into sprite sheets (horizontal strip)
**Export**: PNG with transparency, 4x upscaled (64x80 per frame) for Gemini generation, then downscale to actual size

**Example prompt for FORGE-BOT idle**:
```
Pixel art sprite sheet, 16-bit retro game style, top-down 3/4 isometric view.
A stocky orange industrial welding robot, barrel chest, single horizontal visor slit glowing amber,
tank treads, heavy welding arm with torch attachment. Idle animation, 2 frames side by side.
Frame 1: standing still, visor dim. Frame 2: slight body bob, visor bright pulse.
Dark space background, transparent. 64x80 pixels per frame, 128x80 total sheet.
Color palette: #CC6600 orange body, #FFAA00 welding yellow accents, #FF4400 visor,
#444444 dark metal treads, #222222 shadow.
```

**Batch approach**: Generate all 10 robots in idle state first, validate consistency, then generate remaining states using the idle as reference ("same robot as reference, now in walking pose...").

#### B. Ship Hull Sections (6 construction phases x 8 section types = 48 tiles)

**Format**: 16x16 pixel tiles, tileable where applicable
**Export**: PNG, 4x upscaled (64x64) for generation

**Example prompt for Engineering Bay - Under Construction**:
```
Pixel art tile, 16-bit retro style, top-down 3/4 isometric view.
Spaceship engineering bay module, partially constructed. Metal scaffolding visible on left half,
completed hull plating on right half. Exposed pipes and conduit in scaffolding area.
Single small glowing reactor core (cyan) visible in completed section. Construction sparks.
64x64 pixels, transparent background.
Color palette: #334455 hull metal, #556677 scaffolding, #00CCCC reactor glow,
#FFCC00 sparks, #222233 shadow.
```

#### C. Bug Damage Overlays (4 severities x 2 states [active, repaired] = 8 sprites)

**Format**: 8x8 to 12x12 pixels, designed to overlay on hull tiles
**Export**: PNG with transparency, 4x upscaled

**Example prompt for Critical Breach**:
```
Pixel art sprite, 16-bit retro style. Spaceship hull breach, massive hole with jagged torn metal edges.
Fire and sparks visible inside breach. Atmosphere venting as white particles.
48x48 pixels (will be downscaled to 12x12), transparent background.
Color palette: #FF4400 fire, #FF8800 sparks, #AACCFF venting gas,
#333344 torn hull metal, #000000 void.
```

#### D. Environment Objects (5 assets)

1. **Space Station**: 64x64 rotating ring station
2. **Asteroid**: 8x8 irregular rock, 4 variants
3. **Warp Gate**: 48x48 energy portal ring
4. **Nebula**: 128x64 soft cloud (generated as gradient, not pixel art)
5. **Supply Line Dot**: 2x2 glowing dot for animated supply lines

#### E. Effects (sprite sheets)

1. **Explosion**: 6-frame animation, 20x20 per frame (existing asset can be reused)
2. **Welding Sparks**: 4-frame particle sheet, 4x4 per frame
3. **Scan Beam**: 3-frame sweep, 24x4 per frame
4. **Shield Hex**: Single frame, 12x10 translucent overlay
5. **Engine Exhaust**: 4-frame trail, 8x16 per frame

### Color Palette (Global, All Assets)

```
HULL:       #334455  #445566  #556677  #667788
ACCENT:     #CC6600  #CCAA00  #00AAAA  #AA44FF
GLOW:       #00CCCC  #44FF44  #FF4400  #4488FF
UI:         #CCCCAA  #888866  #444433  #222211
DAMAGE:     #FF4400  #FF8800  #CC2200  #660000
SPACE:      #000008  #0a0a1a  #1a0a2e  #0a1a2e
```

### Batch Generation Workflow

1. **Phase 1 -- Key Assets** (Day 1-2): Generate all 10 robot idle sprites + ship hull tiles (basic set). Validate style consistency.
2. **Phase 2 -- Animation Frames** (Day 3-4): Generate remaining robot animation states using Phase 1 as style reference.
3. **Phase 3 -- Environment** (Day 5): Space station, asteroids, warp gate, nebula.
4. **Phase 4 -- Effects** (Day 6): Explosion, sparks, beams, shields.
5. **Phase 5 -- Damage** (Day 7): Bug damage overlays, repair scars.
6. **Post-Processing**: Batch downscale all 4x assets to target resolution, validate transparency, assemble sprite sheets.

### Sprite Sheet Format

All animations packed into horizontal strip sprite sheets:
```
robot_forgebot.png  = [idle1][idle2][walk1][walk2][walk3][walk4][work1][work2][work3][work4][celebrate1][celebrate2][celebrate3][damaged1][damaged2]
```
- Each frame is 16x20 pixels
- Sheet width = frames * 16
- Sheet height = 20
- Loaded and sliced in code using `ctx.drawImage(sheet, frameX, 0, 16, 20, destX, destY, 16, 20)`

---

## 11. TECHNICAL ARCHITECTURE

### Rendering Engine Recommendation: **PixiJS v8**

**Why PixiJS over Phaser 3 or raw Canvas2D:**

| Criterion | Canvas2D (current) | Phaser 3 | PixiJS v8 |
|---|---|---|---|
| Bundle size | 0KB (native) | ~350KB min | ~150KB min |
| WebGL acceleration | No | Yes | Yes |
| Sprite batching | Manual | Automatic | Automatic |
| Particle systems | Manual | Built-in | Via @pixi/particle-emitter |
| Scene graph | None | Full | Full |
| React integration | Direct ref | Iframe/wrapper | @pixi/react (official) |
| Camera/viewport | Manual math | Built-in | Via @pixi/viewport plugin |
| Tween/animation | Manual | Built-in | Via gsap or @pixi/animate |
| Learning curve | Low | High (game framework) | Medium (rendering lib) |
| Overkill factor | N/A | High (full game engine) | Low (just rendering) |

**Verdict**: PixiJS is the sweet spot. It gives us WebGL-accelerated sprite rendering with batching (critical for 60fps with hundreds of sprites), official React bindings, and a proper scene graph -- without the bloat of a full game engine. Phaser is overkill (we don't need physics, tilemaps, or input managers -- we have React for UI). Raw Canvas2D (current approach) will struggle at 60fps once we add parallax layers, 200+ star particles, 10+ robot animations, and ship construction effects simultaneously.

### Route

```
/projects/[slug]/bridge    -- Fleet/ship view (primary game view)
```

This follows the existing pattern in `web/src/app/projects/[slug]/` and fits the nautical metaphor ("bridge" = command center of a ship).

### Component Architecture

```
web/src/app/projects/[slug]/bridge/
  page.tsx                          -- Route page, data fetching with React Query

web/src/components/bridge/
  bridge-view.tsx                   -- Main container, manages PixiJS Application lifecycle
  canvas/
    pixi-app.tsx                    -- PixiJS Application wrapper (React component)
    layers/
      star-field.ts                 -- Background star parallax layer (PixiJS Container)
      nebula-layer.ts               -- Nebula cloud layer
      fleet-layer.ts                -- Completed ships formation
      active-ship-layer.ts          -- Current sprint ship + modules + crew
      effects-layer.ts              -- Particles, explosions, beams (ParticleContainer)
      hud-canvas-layer.ts           -- In-canvas HUD elements (labels, HP bars)
    entities/
      ship.ts                       -- Ship class: manages hull sections, module slots, damage
      module-slot.ts                -- Individual module: construction state, animations
      robot-crew.ts                 -- Robot entity: archetype, animations, pathfinding on ship
      bug-damage.ts                 -- Damage overlay: severity visuals, repair animation
      agent-drone.ts                -- Agent drone: movement, work effects (reuse existing logic)
      asteroid.ts                   -- Backlog item asteroid
      space-station.ts              -- Project hub station
    systems/
      camera-controller.ts          -- Zoom levels, pan, follow, smooth transitions
      sprite-loader.ts              -- Async sprite sheet loading + slicing
      animation-system.ts           -- Frame-based animation state machine
      sound-manager.ts              -- Web Audio API procedural sounds
      data-mapper.ts                -- Maps API WorkItem/Sprint data to game entities
      websocket-handler.ts          -- Translates WS events to game state changes
  ui/
    top-bar.tsx                     -- Fleet stats bar (React + Tailwind, overlays canvas)
    bottom-panel.tsx                -- Selected entity details (React + shadcn Card)
    ships-log-panel.tsx             -- Completed items list (React + shadcn Sheet)
    mini-map.tsx                    -- Scene overview (small canvas element)
    zoom-controls.tsx               -- Zoom buttons (React)
    sound-toggle.tsx                -- Mute/unmute control
  hooks/
    use-bridge-data.ts              -- React Query hook: fetch sprints + work items + agents
    use-bridge-websocket.ts         -- WebSocket hook: real-time game state updates
    use-bridge-sounds.ts            -- Sound manager hook (init, play, toggle)
```

### Data Flow

```
API (REST)                     WebSocket
    |                              |
    v                              v
use-bridge-data.ts          use-bridge-websocket.ts
(React Query, polling 30s)   (real-time events)
    |                              |
    +---------> data-mapper.ts <---+
                     |
                     v
              Game State (PixiJS scene graph)
                     |
                     v
              PixiJS Renderer (WebGL)
                     |
                     v
                  <canvas>
```

### Data Mapper Logic

```typescript
interface GameState {
  ships: ShipState[];          // One per sprint
  station: StationState;       // Project hub
  asteroids: AsteroidState[];  // Unassigned backlog items
  fleet: CompletedShipState[]; // Past sprint ships
}

interface ShipState {
  sprint: Sprint;
  modules: ModuleState[];      // One per non-bug work item in sprint
  crew: CrewState[];           // One per unique assignee in sprint
  damage: DamageState[];       // One per bug in sprint
  agents: AgentDroneState[];   // Active agent sessions
  completionPct: number;       // Derived: done items / total items
  phase: 'blueprint' | 'skeleton' | 'construction' | 'systems' | 'assembly' | 'complete';
}

function mapSprintToShip(sprint: Sprint, items: WorkItem[], agents: AgentSession[]): ShipState {
  const sprintItems = items.filter(i => i.sprint_id === sprint.id);
  const modules = sprintItems.filter(i => i.type !== 'bug');
  const bugs = sprintItems.filter(i => i.type === 'bug');
  const doneCount = sprintItems.filter(i => ['done', 'resolved', 'closed'].includes(i.status)).length;
  const completionPct = sprintItems.length > 0 ? doneCount / sprintItems.length : 0;

  const assigneeIds = [...new Set(sprintItems.map(i => i.assignee_id).filter(Boolean))];

  return {
    sprint,
    modules: modules.map(m => mapItemToModule(m)),
    crew: assigneeIds.map(id => mapAssigneeToCrew(id, sprintItems)),
    damage: bugs.map(b => mapBugToDamage(b)),
    agents: agents.filter(a => sprintItems.some(i => i.id === a.work_item_id)),
    completionPct,
    phase: getShipPhase(completionPct, sprint.status),
  };
}
```

### WebSocket Event Handling

```typescript
// Existing WebSocket events from the API that trigger game updates:
const WS_EVENT_MAP = {
  'work_item:created':       'addModuleOrDamage',
  'work_item:updated':       'updateModuleState',    // status change = visual transition
  'work_item:deleted':       'removeModuleOrDamage',
  'sprint:updated':          'updateShipState',       // sprint status change
  'agent_session:created':   'launchDrone',
  'agent_session:updated':   'updateDroneState',
  'comment:created':         'showNotificationBlip',  // small flash on relevant module
};

// Each event triggers the corresponding game animation/transition
// rather than just a data refresh
```

### Performance Targets

- **60fps** on mid-range laptop (Intel i5, integrated GPU, 8GB RAM)
- **Maximum entity count**: 500 sprites simultaneously (PixiJS batches these into ~5 draw calls)
- **Particle budget**: 200 active particles maximum (use ParticleContainer for O(1) rendering)
- **Memory**: <50MB GPU memory for all loaded textures
- **Initial load**: <2 seconds for game assets (sprite sheets ~500KB total)
- **React re-renders**: HUD components only, never the canvas -- PixiJS manages its own render loop

### Integration with Existing App

The bridge page is a standard Next.js route page that:
1. Uses the existing `AppShell` layout (sidebar navigation works normally)
2. Renders the PixiJS canvas as the main content area (flex-1, fills available space)
3. Overlays React components (top bar, bottom panel) using absolute positioning on top of the canvas
4. Shares the same React Query cache and WebSocket connection as other pages
5. Uses the existing `useWebSocket` hook from `web/src/lib/websocket.ts`

```typescript
// web/src/app/projects/[slug]/bridge/page.tsx
export default function BridgePage() {
  const { slug } = useParams();
  const { sprints, items, agents } = useBridgeData(slug);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <BridgeCanvas sprints={sprints} items={items} agents={agents} />
      <BridgeTopBar sprints={sprints} items={items} />
      <BridgeBottomPanel /> {/* Shows on entity selection */}
      <BridgeMiniMap />
      <ZoomControls />
      <SoundToggle />
    </div>
  );
}
```

---

## 12. SPRINT PLAN

### Phase 1: Static Ship with Placeholder Sprites (1.5 weeks)

**Goal**: A working canvas showing a single ship with rectangular placeholder modules, no animations.

**Tasks**:
1. Install PixiJS v8 + @pixi/react in web package
2. Create `/projects/[slug]/bridge` route page
3. Implement `pixi-app.tsx` -- PixiJS Application lifecycle in React
4. Implement `star-field.ts` -- static star background (no parallax yet)
5. Implement `ship.ts` -- draw a ship outline from rectangular tiles based on sprint data
6. Implement `module-slot.ts` -- color-coded rectangles for each work item (green=done, yellow=in-progress, gray=todo, red=bug)
7. Implement `data-mapper.ts` -- map real API data to ship layout
8. Implement `camera-controller.ts` -- basic zoom (3 levels) and pan
9. Implement `top-bar.tsx` -- sprint name, integrity meter, countdown
10. Implement `bottom-panel.tsx` -- shows item details on click
11. Wire up `use-bridge-data.ts` with React Query (fetch sprints + items)

**Deliverable**: Navigate to `/projects/bumblebee/bridge`, see a ship made of colored rectangles representing the active sprint's items. Click a module to see details. Zoom in/out.

**Estimated effort**: 40-50 hours

### Phase 2: Real Data Integration + Ship Construction Phases (1 week)

**Goal**: Ship visually reflects actual sprint progress. Multiple sprints visible.

**Tasks**:
1. Implement ship construction phases (blueprint through complete)
2. Add completed fleet formation (past sprints as smaller ships)
3. Add space station entity (project hub)
4. Implement `websocket-handler.ts` -- real-time updates from WebSocket
5. Add module status transitions (visual state changes on item updates)
6. Implement bug damage overlays (colored damage markers by severity)
7. Add mini-map
8. Implement sprint navigation (cycle between ships)

**Deliverable**: Multiple ships visible. Active ship changes appearance based on completion %. WebSocket events cause immediate visual updates. Bugs appear as damage marks.

**Estimated effort**: 30-40 hours

### Phase 3: Animations + WebSocket Events (1.5 weeks)

**Goal**: Everything moves and animates. Robot crew visible. Transitions are smooth.

**Tasks**:
1. Implement `sprite-loader.ts` -- load and slice sprite sheets
2. Implement `robot-crew.ts` -- crew members with idle/walk animations, positioned on ship
3. Implement `animation-system.ts` -- frame-based state machine for all entities
4. Add construction animations (scaffolding, sparks) for in-progress modules
5. Add diagnostic scan animation for in-review modules
6. Add completion transition animation (flash + color change)
7. Add failure animation (explosion + debris)
8. Implement `agent-drone.ts` -- drones that fly from station to ship on agent events
9. Add bug damage VFX (fire, venting, sparks by severity)
10. Add repair animation (robot at damage site + healing particles)
11. Implement parallax scrolling on background layers
12. Add star twinkle animation
13. Add ship engine exhaust particle effect

**Deliverable**: Fully animated scene. Robots walk around ship. Construction has sparks. Bugs have fire/sparks. Status changes trigger smooth transitions. Agents fly in as drones.

**Estimated effort**: 50-60 hours

### Phase 4: Asset Generation + Polish (1 week)

**Goal**: Replace placeholder rectangles with proper pixel art sprites.

**Tasks**:
1. Generate robot sprites using Gemini (10 archetypes x idle state first)
2. Validate style consistency, iterate prompts if needed
3. Generate remaining robot animation frames (walk, work, celebrate, damaged)
4. Generate ship hull section tiles (8 types x 6 phases)
5. Generate bug damage overlay sprites
6. Generate environment sprites (station, asteroids, warp gate)
7. Generate effect sprite sheets (explosions, sparks, beams)
8. Implement sprite-based rendering (replace geometric fallbacks)
9. Color palette unification pass
10. Add nebula clouds to background
11. Add asteroid field for backlog items
12. Add repair scar textures for fixed bugs
13. Polish: ship name labels on hull, running lights, window glow effects

**Deliverable**: Beautiful pixel art scene. All geometric fallbacks replaced with proper sprites. Consistent visual style throughout.

**Estimated effort**: 40-50 hours

### Phase 5: Interactions + Sound + Ship's Log (1 week)

**Goal**: Full interactivity and audio. Ship's Log panel. Construction replay.

**Tasks**:
1. Implement `sound-manager.ts` -- Web Audio API procedural sounds
2. Add all event sounds (construction, completion, alarm, repair, launch)
3. Add ambient sound layers (engine hum, space atmosphere, construction)
4. Add sound toggle to HUD
5. Implement Ship's Log panel (completed items list, damage report)
6. Add right-click context menu on entities
7. Add keyboard shortcuts (zoom levels, sprint navigation)
8. Implement "Deploy Agent" button from game view
9. Add hover tooltips on all entities
10. Implement sprint completion "launch" animation (ship flies to fleet area)
11. Add construction timelapse replay (stretch goal)
12. Performance profiling and optimization
13. E2E tests for bridge page

**Deliverable**: Complete Space Battleship experience with sound, full interactions, agent integration, and Ship's Log. Production-ready.

**Estimated effort**: 40-50 hours

### Total Estimated Effort: 200-250 hours (5-6 weeks for a single developer)

### Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| PixiJS + React integration issues | High | Low | @pixi/react is official and well-maintained |
| Gemini asset consistency | Medium | Medium | Generate key assets first, use as style reference for batch |
| 60fps on integrated graphics | High | Medium | Use ParticleContainer, limit particle budget, profile early |
| WebSocket event volume overwhelming game loop | Medium | Low | Throttle visual updates to 1 per entity per 500ms |
| Scope creep on animations | Medium | High | Phase 3 has strict particle/animation budgets |
| Ship layout algorithm complexity | Medium | Medium | Start with simple grid, iterate |

---

## Success Metrics

1. **Page load to interactive**: <3 seconds (including asset load)
2. **Frame rate**: Sustained 60fps with 3 ships, 30 modules, 10 crew, 50 particles
3. **Data accuracy**: Ship state matches actual sprint data within 1 WebSocket event cycle
4. **User engagement**: Users voluntarily navigate to bridge view (track page views)
5. **Agent adoption**: "Deploy Agent" from bridge view is used at least as often as from board view
6. **Fun factor**: Qualitative -- does watching the ship build feel satisfying?

---

## Dependencies

- **PixiJS v8**: `npm install pixi.js @pixi/react`
- **@pixi/particle-emitter**: For efficient particle systems
- **Existing**: React Query, WebSocket infrastructure, shadcn/ui, Tailwind v4 -- all already in place
- **Gemini API access**: For batch sprite generation in Phase 4
- **No new backend changes needed**: All data already available via existing REST endpoints + WebSocket events

---

## Next Steps

1. User reviews this document and confirms direction
2. If confirmed, create a detailed implementation plan (`/plan:hard`)
3. Create BB work items for each phase's tasks
4. Begin Phase 1 implementation
