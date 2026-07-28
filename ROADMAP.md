# Roadmap

### Phase 1
<details>
<summary>Completed, open for list </summary>
<ul>
<li>Disable locomotion while watch UI is open (for flat)</li>
<li>Comfort options:<ul>
  <li>vignette/masking on move and turn</li>
  <li>snap/smooth turn toggle</li>
  <li>option for teleport locomotion</li>
  <li>option to swap locomotion hands</li>
  <li>make vignette work for teleport</li>
</ul></li>
<li>Match flat locomotion speed to VR speed</li>
<li>Match teleport locomotion to walk speed by using window to limit distance within timeframe</li>
<li>Split SDK builders into per-domain files (physics, interactions, prefabs, monitors, modification), barrel-export from one `index.ts` so consumer imports don't change</li>
</ul>
</details>

### Phase 2
- [x] Player gravity
- [ ] More movement
  - [x] Sprint
  - [x] Jump
  - [ ] Fly
  - [ ] Crouch for flat
  - [ ] Seated mode that automatically adjusts to player height (with crouch button)
- [ ] Option for SDK rigid body to forbid teleport onto
- [x] Light interactions: point, spot, directional
  - [ ] Support tweening of light properties 
- [x] Positional audio interaction/prefab (with option for 2D audio for consistency even though they could do it via their own DOM if they wished)
- [x] A way to control playback. Perhaps interactions need to be able to expose a custom API on the SDK ret_val
  - [x] Implement interaction command message and API binding
  - [x] Actually handle the created commands in engine
- [ ] Camera interaction/prefab: activating one moves the player POV there (race games etc, altho those could use a forced sit interaction instead added later. figure out what difference there could be)
- [ ] Implement ControllerButtonInteraction
- [ ] Expand ControllerButtonInteraction to also read flat input, and axes like movement. Provide option to use consolidated input, or to use raw input per control scheme to customise it
- [ ] Billboard positioning interaction
- [x] Implement monitors in engine
- [ ] Ensure all interaction properties implemented
- [ ] Anchored option on kinematic-pos rigid body builder
- [ ] Decide if/how to deal with duplicate interactions
- [x] Environment props via SDK (sky, fog, maybe even gravity and rain!)
- [x] Watch UI backstack and standardised screen layout
- [x] Detached watch mode
- [ ] Expression input
- [ ] Player stuff via SDK
  - [x] read player position
  - [ ] read player velocity
  - [x] teleport player
  - [ ] freeze player
  - [ ] set max speed(s)
  - [ ] set jump force
  - [ ] set scale
  - [ ] set gravity of player individually to rest of world
  - [ ] change whether can sprint/jump/fly
  - [ ] force avatar items
  - [ ] force spectator camera mode/pos
  - [ ] force avatar expression
  - [ ] player monitors (e.g. position, expression, velocity, fall of x height/velocity for fall damage, direct access to controller buttons, etc)
  - [x] send player to another world
  - [ ] show prompt to confirm going to another world (could allow skipping prompt on same origin)
  - [ ] storing user_data on player for custom tag
- [ ] Change if flat and teleport allowed via meta
- [x] Disable hand colliders for grabbed objects
- [ ] Grabbable option for hand positioning or hiding (guns, gauntlets, gloves, etc)
- [ ] Scene/collection dispatch
- [ ] Prefab for links that use player sending (a door? a portal? a big link logo?). If clearly displays text then could bypass prompt
- [ ] Way for SDK to add HUD layer stuff (could reuse vignette layer)
- [x] `wait_for_ready()` and `is_ready` on SDK as alternative to DOM event
- [ ] Meta value to tell the engine to preload assets from URLs to make mesh and audio loading immediate when used (shows as loading)
- [ ] Layers debugger devtool
- [ ] Camera debugger devtool
- [ ] Do we add first party health system? Or have them build it themself?
- [x] Reset scene state on world change (perhaps with loading screen if assets to be preloaded)
- [ ] Interactions/monitors for guns with either arcing, projectile, or hitscan (raycast)
- [ ] Flat FOV setting
- [ ] Resolve relative paths from SDK in relation to the world URL, not the VR host

### Phase 3
- [ ] VR keyboard for DOM and watch input
- [ ] Object parenting via SDK (needs transform resolution against parent, and think about what happens when a parent has a rigid body)
- [ ] Finish grabbable options: sticky vs non-sticky, snap-to-hand default, grab offset, translation/rotation constraints, scale unlock and constriants
- [ ] Free hand movement on flat with keypress
- [ ] Define consistent error message interface for SDK and check for it in builders
- [ ] Fix VR error boundary (doesnt follow player)
- [ ] DOMMirror input: right/middle click, hold-and-drag, thumbstick scroll, click ripple
- [ ] DOMMirror prefab
- [ ] Physics reporting:
  - [x] collision reports
  - [ ] `usePhysicsReporting` for motion (expensive, should discourage this and point towards monitors in docs)
- [x] Rigid body extras: angular velocity, friction, damping
- [ ] Option for bodies to ignore player or object collisions
- [ ] Way to add prefabs using empties with custom props?
- [ ] Extend prefab library in general (adding props, weapons, sports stuff, maybe even vehicles etc)
- [x] Flat controller support
- [ ] Flat rebinding support
- [ ] Scripted object pathways/full keyframing system on SDK (could a gradual tween already do this? But I guess less annoying to just define a path in advance)
- [ ] Avatar walk animation and sounds (with ability to let surfaces choose their walk sound material type from a selection)
- [ ] Avatar clothing, more hair options
- [ ] Avatar slots
- [ ] Fix auth bugs (only allow lowercase username, improve UX, add JWT/passkey somehow)
- [ ] Favourite and recent worlds carousel (withouth thumbnails or description page for now)
- [ ] Sit interaction (player initiated or forced) and chair prefabs
- [ ] SDK audio effects (for all audio, or for specific audio sources)
- [ ] SDK visual effects (b&w, sepia, bloom, anything else possible within vr context, beware react-three/postprocessing limitations with xr! might have to resort to vignette layer shaders)
- [ ] Show spectator cam preview in settings or on third party cam
- [ ] Sandbox mode that allows spawning object a la Maker Pen, maybe with a way to serialise to builders/built objects
- [ ] A way for SDK to grab frame delta? Probably not possible though with RTC overhead. Good reason to have paths though, and maybe some stable timing system too
- [ ] Backpack API for storing arbitrary data that can be shared across worlds perhaps

### Phase 4
- [ ] Internal docstrings across engine + SDK, then public-facing SDK docs
- [ ] Thumbnail and description acquisition
- [ ] Signing rooms with private key and associating with room for verified author
- [ ] Improve OOBE
- [ ] Create hub world with links to other worlds at project homepage, fixed links for now
- [ ] Create other official worlds and games (i.e. our version of the Rec Center, some games that show off features, etc)
- [ ] Flat gestures
- [ ] Use of backpack API to add custom clothing/cross world items? Would probably do it by approving creators on a baked in list of public keys (but obvs needs vetting and may not be the best idea)
- [ ] Improve error resillience with more error boundaries (can isolate errors per object and per the scene contents as a whole to make sure the user can still navigate out with the watch UI)
- [ ] SDK can set time scale changes (if possible)
- [ ] externalcamera.cfg for MR camera position
- [ ] Third person camera lockable to avoid accidental moving
- [ ] Implement raw input via debugger perm in sidecar extension for least privilege (if not, then disable the option for now)
- [ ] Single-node P2P multiplayer, making sure to define the discovery and transport interfaces abstractly so the later relay idea is a drop-in swap
- [ ] If multiplayer has voice chat, extend audio effects to be able to abe applied to player voices too
- [ ] If multiplayer has text chat, positional narration, and let players choose their own TTS voice
- [ ] SDK-hosted XR session handoff: investigate feasibility first (can we host on their behalf so they don't need a permission prompt?) and implement in a multiplayer friendly way or drop the idea entirely
- [ ] Arrange informal testing with friends
- [ ] Prepare for first release

### Backlog (from code TODOs, no urgency)
- [ ] Subscription-based routing rather than naming tab ID to support other platforms later
- [ ] Detached mode that runs in an iframe to allow embedding a demo of a fixed world (useful for the homepage!)
- [ ] Replace `SmartSlider` workaround once pmndrs/uikit#247 is fixed
- [ ] Some form of formal test suite :P
- [ ] Tab hopping
- [ ] World editor tool that generates builders. Might not be awfully necessary if the sandbox mode is good enough. Maybe add blockly or roll our own declarative scripting to allow quick out the box logic?
- [ ] Ability to customise the default space for non-immersive pages
- [ ] "3DOM" builder that allows websites to half dip into immersive by being able to make existing DOM elements pop out (or try to do it automatically based on Z-index?!)
- [ ] World discovery (crawling? explicit lists? via world links but then how is that declared in advance? needs research)
- [ ] Sidecar extension for OSC via native messaging? Or ASIO audio input? I suppose depends how and what is implemented in multiplayer first. Not at all necessary
- [ ] More cosmetic types (gloves, hats, shades, glasses, wheelchairs, etc)
