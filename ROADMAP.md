# Roadmap

## MVP

Singleplayer, to support a handful of games

- [x] Finish grabbable options: sticky vs non-sticky, snap-to-hand default, grab offset
- [ ] Raycast interaction
- [ ] Gun interaction/monitor using raycasts + some default handling of ammo, reloading etc - **hitscan only for MVP** (arcing and projectile modes deferred to game-feel depth)
- [x] Floating text and sign prefabs - required for scores, instructions, win/lose states
- [x] Make the `Button` prefab real (currently a placeholder text mesh)
- [ ] Ensure all interaction properties are actually implemented (audit builders vs engine)
- [ ] Minimal keyframing system
- [ ] Starter prefab kit - a deliberately small set beyond button/ball/hoop/skootball:
  a target, a simple gun, and a spawner / respawn point
- [ ] Fix auth bugs: only allow lowercase username, improve UX (JWT/passkey can wait)
- [ ] Favourite and recent worlds carousel (no thumbnails or description page for now)
- [ ] Prefab for links that use player sending (a door / portal / big link logo). If it clearly
  displays text it could bypass the prompt
- [ ] Show prompt to confirm going to another world (allow skipping on same origin)
- [ ] Start implementing more games, with room for multiplayer soon
- [ ] UI layer in SDK. Shows around controls in flat, in space around face in VR

---

## Epic A - Browser runtime

- [ ] Make extension background script a generic package where platform specific impls are slotted in, making porting easy (RTC signaling/host-discovery. etc)
- [ ] BrowserMessageEngine implementing MessageEngine, slotted beside ExtensionMessageEngine
- [ ] Publish @hyperlinkvr/web-sdk to npm (runtime + TS declarations in the package)
- [ ] Version the SDK message/schema contract (vr-engine-schemas) explicitly
- [ ] Auth against our origin via the host connection, never tokens in the creator's page
- [ ] Keep ExtensionMessageEngine as the optional privileged platform (raw input, OSC) speaking the identical protocol. Explore how many features are truly extension only to determine how necessary it is to maintain, or if it can be backburnered

## Epic B - Multiplayer

P2P multiplayer, starting with a single node but later a decentralised relay network. Build the abstractions first so the later relay swap is a drop-in.

- [ ] Single-node P2P multiplayer - define discovery and transport interfaces abstractly so the
  later relay idea is a mostly drop-in swap
- [ ] Player presence + avatar transform sync (position, head, hands)
- [ ] Object / scene state authority + sync
- [ ] Voice chat
- [ ] If multiplayer has voice chat, extend audio effects to apply to player voices too
- [ ] If multiplayer has text chat: positional narration, and let players choose their own TTS voice
- [ ] SDK-hosted XR session handoff: investigate feasibility first (can we host on their behalf
  so they don't need a permission prompt?) and implement in a multiplayer-friendly way, or
  drop the idea entirely

---

## Epic C - Avatar expansion & self-expression

- [ ] Avatar walk animation and sounds (let surfaces choose their walk-sound material type from a selection)
- [ ] Avatar clothing, more hair options
- [ ] Avatar slots
- [ ] Expression input
- [ ] Force avatar expression (SDK)
- [ ] Force avatar items (SDK)
- [ ] Show spectator cam preview in settings or on third-party cam
- [ ] Force spectator camera mode / position (SDK)
- [ ] Backpack API for storing arbitrary data that can be shared across worlds
- [ ] Use of backpack API to add custom clothing / cross-world items - probably via approving
  creators on a baked-in list of public keys (needs vetting; may not be the best idea)
- [ ] More cosmetic types (gloves, hats, shades, glasses, wheelchairs, etc)

---

## Epic D - Game-feel and SDK improvements

Interchangeable with Epic B.

### Movement & camera
- [ ] Fly movement
- [ ] Crouch for flat
- [ ] Seated mode that auto-adjusts to player height (with crouch button)
- [ ] Sit interaction (player-initiated or forced) and chair prefabs
- [ ] Camera interaction/prefab: activating one moves the player POV there (race games etc;
  decide the real difference vs a forced-sit interaction)
- [ ] Billboard positioning interaction
- [ ] Flat FOV setting

### Player control (SDK)
- [ ] Read player velocity (might be able to just port object monitors to be attachable to players)
- [ ] Freeze player
- [ ] Set max speed(s)
- [ ] Set jump force
- [ ] Set player scale
- [ ] Set gravity of player individually vs rest of world
- [ ] Change whether player can sprint / jump / fly
- [ ] Player monitors (position, expression, velocity, fall of x height/velocity for fall damage,
  direct controller-button access, etc)
- [ ] Storing `user_data` on player for a custom tag
- [ ] Change whether flat and teleport are allowed, via meta

### Objects, physics & prefabs
- [ ] Grabbable translation/rotation constraints, scale unlock and constraints
- [ ] Grabbable hand positioning / hiding (guns, gauntlets, gloves)
- [ ] Gun interaction/monitor: arcing and projectile modes (hitscan shipped in MVP)
- [ ] Support tweening of light properties
- [ ] Scripted object pathways / full keyframing system on SDK (could a gradual tween already do
  this? Probably nicer to define a path in advance)
- [ ] Anchored option on kinematic-pos rigid body builder
- [ ] Option for SDK rigid body to forbid teleport onto
- [ ] Option for bodies to ignore player or object collisions
- [ ] Decide if/how to deal with duplicate interactions
- [ ] Scene/collection dispatch
- [ ] Object parenting via SDK (transform resolution against parent; decide what happens when a
  parent has a rigid body)
- [ ] Way to add prefabs using empties with custom props
- [ ] Extend prefab library in general (props, weapons, sports stuff, maybe even vehicles)
- [ ] `usePhysicsReporting` for motion (expensive, discourage in docs, point to monitors)
- [ ] Way for SDK to add HUD layer stuff (could reuse the vignette layer)
- [ ] Meta value telling the engine to preload assets from URLs so mesh/audio loading is immediate
  when used (shows as loading)
- [ ] Do we add first-party health, loadout, etc systems, or have creators always build it themselves? Depends on interop requirements

### Effects
- [ ] SDK audio effects (all audio, or specific audio sources)
- [ ] SDK visual effects (b&w, sepia, bloom, etc). Beware react-three/postprocessing limitations
  with XR; may need vignette-layer shaders)
- [ ] SDK can set time-scale changes (if possible)

### Robustness
- [ ] Define a consistent error-message interface for the SDK and check for it in builders
- [ ] Fix VR error boundary (doesn't follow the player)
- [ ] Resolve relative paths from the SDK relative to the world URL, not the VR host
- [ ] A way for the SDK to grab frame delta? Probably not possible with RTC overhead - good reason
  to have paths, and maybe a stable timing system

---

## Epic E - Flat and DOM improvements

- [ ] VR keyboard for DOM and watch input
- [ ] DOMMirror input: right/middle click, hold-and-drag, thumbstick scroll, click ripple
- [ ] DOMMirror prefab
- [ ] Free hand movement on flat with keypress
- [ ] Flat rebinding support
- [ ] Flat gestures
- [ ] Implement raw input via debugger perm in the sidecar extension for least privilege (if not feasible, disable the option for now)

---

## Epic F - Author tooling & platform plumbing

- [ ] Sandbox mode that allows spawning objects a la Maker Pen, maybe serialising to
  builders/built objects
- [ ] Improve error resilience with more error boundaries (isolate errors per object and per the
  scene as a whole so the user can still navigate out via the watch UI)
- [ ] Layers debugger devtool
- [ ] Camera debugger devtool
- [ ] externalcamera.cfg for MR camera position
- [ ] Third-person camera lockable to avoid accidental moving

---

## Epic G - Public launch

- [ ] Internal docstrings across engine + SDK, then public-facing SDK docs
- [ ] Thumbnail and description acquisition
- [ ] Signing rooms with a private key and associating with the room for a verified author
- [ ] Improve OOBE
- [ ] Create hub world with links to other worlds at the project homepage (fixed links for now)
- [ ] Create other official worlds and games (our version of the Rec Center, games that show off
  features, etc)
- [ ] World discovery (crawling? explicit lists? via world links — but how declared in advance?
  needs research)
- [ ] Arrange informal multiplayer testing with friends
- [ ] Prepare for first release

---

## Backlog (no urgency)

- [ ] Subscription-based routing rather than naming tab ID, to support other platforms later
- [ ] Detached mode that runs in an iframe to embed a demo of a fixed world (useful for the homepage!)
- [ ] Replace `SmartSlider` workaround once pmndrs/uikit#247 is fixed
- [ ] Some form of formal test suite :P
- [ ] Tab hopping
- [ ] World editor tool that generates builders (maybe unnecessary if sandbox mode is good enough;
  maybe Blockly or a roll-our-own declarative scripting layer for quick out-of-the-box logic)
- [ ] Ability to customise the default space for non-immersive pages
- [ ] "3DOM" builder that lets websites half-dip into immersive by popping existing DOM elements out
  (or automatically based on z-index?!)
- [ ] Sidecar extension for OSC via native messaging? Or ASIO audio input? Depends on how multiplayer
  lands first. Not at all necessary

---

<details>
<summary><strong>Done</strong> (click to expand)</summary>

### Comfort & locomotion
- [x] Disable locomotion while watch UI is open (flat)
- [x] Comfort options: vignette/masking on move and turn; snap/smooth turn toggle; teleport
  locomotion option; swap locomotion hands; vignette for teleport
- [x] Match flat locomotion speed to VR speed
- [x] Match teleport locomotion to walk speed via a window that limits distance within a timeframe
- [x] Split SDK builders into per-domain files (physics, interactions, prefabs, monitors,
  modification), barrel-exported from one `index.ts` so consumer imports don't change

### Movement
- [x] Player gravity
- [x] Sprint
- [x] Jump

### Interactions, lights, audio, environment
- [x] Light interactions: point, spot, directional
- [x] Positional audio interaction/prefab (with 2D-audio option for consistency)
- [x] Playback control — interactions can expose a custom API on the SDK return value
- [x] Implement interaction command message and API binding
- [x] Handle the created commands in the engine
- [x] Implement monitors in engine
- [x] Environment props via SDK (sky, fog, maybe gravity and rain)

### Watch UI
- [x] Watch UI backstack and standardised screen layout
- [x] Detached watch mode

### Player (SDK)
- [x] Read player position
- [x] Teleport player
- [x] Send player to another world
- [x] `wait_for_ready()` and `is_ready` as an alternative to the DOM event
- [x] Reset scene state on world change (with loading screen if assets to preload)

### Physics / objects
- [x] Collision reports
- [x] Rigid body extras: angular velocity, friction, damping
- [x] Disable hand colliders for grabbed objects

### Input
- [x] Flat controller support

</details>