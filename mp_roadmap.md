# Multiplayer roadmap

**Product goal:** social parity with Rec Room — shared worlds + voice + **text chat + DMs + friends**, not just world sync.

## Decisions (architecture)

- **Transport is relay-routed, not P2P.** Clients connect to a relay; the relay forwards everything. WebRTC P2P is off the table for game data — it needs signalling + TURN anyway, caps room size, and can't do global DMs.
- **Two modes of operation:**
  - **Single node** (`apps/single_node_mp`) — a standalone relay with *no* cross-relaying. For devs, self-hosters, and as a low-complexity fallback if the shared network ever goes away. Never participates in the network.
  - **The relay network** — one shared global system (not a federation of independent relays). A client hits a discovery **entrypoint** that places it on a well-colocated, not-too-busy entry point; through the network it can reach anyone in the world. Internal topology/routing is the network's concern, invisible to the client.
- **Overriding the service is a last resort**, not the normal path.
- **WebSocket now, for everything.** It's correct and permanent for reliable traffic (state, events, chat, presence). It only carries "unreliable" reliably (`capabilities.unreliable = false`).
- **WebTransport later, only for the pose/unreliable channel**, and only once WS's TCP head-of-line-blocking visibly hurts under packet loss. Drops in behind the same `NetworkEngine` interface — no game-code change. Not speculative work.
- **Wire format is msgpackr binary.** Shared wire types live in `@hyperlinkvr/core` (`network_wire.ts`); each side keeps its own codec so core has no runtime dep.
- **Voice chat = relay-routed (SFU-style), not P2P.** Discord model. Likely WebRTC just for the client↔relay media leg. Its own project (Phase E).
- **E2E encryption is a later layer**, needed once relays aren't all first-party. Payloads stay opaque to the relay (routing reads only the envelope), which also keeps relay CPU reasonable. Integrity wants signatures, not just confidentiality.

Ordering: **A and B are independent** (do in either order / interleave). **C needs both A and B. D needs C.** E is optional, after.

---

## ✅ Done

- [x] Transport interface (`NetworkEngine` / `NetworkRoom`)
- [x] Local `BroadcastChannel` carrier, with simulated latency, jitter and packet loss
- [x] Authority registry, and the report/trigger outbox that checks it
- [x] `NetSession` (join after consent, host election, leave on navigation) and the peer list overlay
- [x] Devtools network settings (sim sliders now gated to `local` mode only)
- [x] Presence: poses, appearance, interpolated remote avatars
- [x] **Node server** (`apps/single_node_mp`) — assigns peer IDs + join order, elects oldest peer as host, forwards to one / others / host, drops peers on socket close or missed heartbeat, cleans up empty rooms, rejects room-less connections. Backpressure drops unreliable sends to a backed-up peer.
- [x] **`WSNetworkEngine` carrier** — reports `capabilities.unreliable = false`; a dropped connection closes the room with `connection-lost` (v1 rejoin = join as a new peer); buffers inbound messages until the first listener attaches.
- [x] **Dev `ws` network mode** wired into `DevNetworkEngineProvider` (stopgap until full service mode).

---

## Phase A: the forwarding node

1. [x] **Node server [M].**
2. [x] **`WSNetworkEngine` carrier [S].**
3. [x] **Service mode [S].** Default connects to the relay network via a discovery **entrypoint** that returns a colocated, non-busy endpoint + protocol/capabilities/auth (and possibly a session ticket); `ServiceNetworkEngine` resolves that and builds the carrier. `service_override` (last resort) connects directly to a given URL — a single node or another network — bypassing discovery. Adds `"service"` to the devtools mode. *(The dev `ws` mode is a temporary shortcut.)*
4. [x] **Extension VR host provides a network engine [S].** Presence then works in the extension too, not just play.
5. [ ] **Identity rules [M, can wait until before public testing].** A signed identity handshake, so the node can reject guests and duplicate accounts. Replaces the currently-trusted `hello`. Pairs with the reconnection session-token work (Phase E).

**Flagged to change / add:**
- [ ] **Versioned wire protocol [S].** The frames are currently *unversioned* — add a version field or handshake before external clients exist, so protocol changes don't silently break older clients.
- [ ] **Server hardening [S].** Set `maxPayload` and `perMessageDeflate: false` on the `WebSocketServer`; add per-connection rate limiting and room caps (overlaps Phase E robustness).

**Milestone: presence between real machines and browsers.**

---

## Phase B: groundwork, all still singleplayer

6. [x] **Players identified by peer ID [M].** `Player.id`, `target_player` in messages, the spawn event carries the ID, the engine's player registry is keyed by ID, and minigolf is re-keyed (but don't forget singleplayer and reconnects!). Perhaps could use a stable ID, either a UUID stored in their static record, or a hash of the pub key (but keep in mind it may change if a new keypair is generated) although why not just use the username as the peer ID since it is meant to be stable currently. Keeping in mind the identity operator could change any of those fields arbitrarily
7. [ ] **Per-world multiplayer mode [S].** `solo` / `presence` / `shared` in the meta tag or world metadata, with `presence` as the default. Solo worlds don't join a room.
8. [ ] **Command bus [L].** Every SDK action handler (objects, HUD, VFX, world environment, animations, seeks, monitors, triggers) stops caring whether a command came from the page or the network. It accepts IDs minted by the host, and keeps a compacted log of commands for late joiners. *(The large foundational item — shared mode and physics depend on it.)*
9. [ ] **Session clock sync [S].** So tweens and animations can start at the same moment everywhere.

---

## Phase C: shared mode

10. [ ] **Roles [S].** The engine knows if it's host. In shared worlds, clients hand world-level authority (world monitors) to the host.
11. [ ] **Command replication [M].** The host broadcasts every command it applies on a reliable channel, and clients apply them.
12. [ ] **Client page lifecycle [S].** In shared worlds, client pages never get `READY`, and the host's "loading finished" is replicated to everyone.
13. [ ] **Late join [M].** A newcomer gets the command log replayed, and holds a loading screen until it's caught up (might be able to look at current state rather than replay all commands, or at the very least do it differentially)
14. [ ] **Report routing [M].** Client engines send reports to the host's page with `player` attached. Player-targeted actions (teleport, send to world, player monitors) go to that player's engine.
15. [ ] **Per-player HUD and effects [S].** Using the scope the HUD already has.
16. [ ] **SDK [S].** `e.player`, `players.on_spawn` fires for remote players on the host, `players.list()` and `on_leave`, and `.create()` throws on clients.
17. [ ] **Host leaves [S].** For v1, the instance simply ends.
18. [ ] **Games [S].** Port clubhouse, or a button and score world, to `shared`.

**Milestone: button, score and HUD games are multiplayer.**

---

## Phase D: physics

19. [ ] **`ObjectPhysics` honours authority [M].** A body simulated by another engine becomes kinematic and follows the stream.
20. [ ] **Host physics streaming [M].** The host streams the pose and velocity of every dynamic body that's moving. It reuses the pose buffer, and stops sending once a body comes to rest.
21. [ ] **Grab handoff [L].** A grab claims the object through the host (optimistically, host settles conflicts). The holder streams it; letting go hands it back to the host with its velocity. Needs the most feel-tuning. *(This is the VRChat-style ownership model.)*
22. [ ] **Held objects run their own triggers [M].** Triggers and reports for a held object run on the holder's engine. Other engines replay visuals only, reports suppressed.
23. [ ] **Pinned ownership [S].** `set_ownership(player)`, needed for minigolf balls.
24. [ ] **Remote avatar colliders [S].** So players can push things, and raycasts can hit them.
25. [ ] **Games [M].** Minigolf, basketball, defendthecore.

**Milestone: physics games are multiplayer. At this point it's "fully working".**

---

## Phase E: optional, after that

26. [ ] The local escape hatch: `hyperlinkvr.local()`, `me.create()`, message channels.
27. [ ] `net.state` and host migration.
28. [ ] **Voice chat** (its own project) — relay-routed / SFU-style, likely WebRTC for the client↔relay media leg.
29. [ ] Presence polish: syncing facial expressions, an interpolation delay that adapts to conditions, binary encoding.
    - [ ] **Pose send optimisation.** Poses currently broadcast at 20Hz unconditionally. Gate on a movement threshold *plus* a late-join pose (or low-rate keepalive) — a pure delta check alone would leave idle avatars stuck at their default pose for newcomers, since the appearance handshake syncs appearance but not pose. Matters mainly for flat/idle players; in VR micro-movements make it near-moot.
30. [ ] Robustness: **reconnects** (stable session token so a returning peer keeps its `PeerID` / `joined_at` and host election doesn't flap; server holds `PeerInfo` through a grace window), node rate limits and room caps, invites and instance selection (Discord join button), a peer list in the watch UI.
31. [ ] **Relay network.** One shared global network (not a federation of independent relays): a discovery entrypoint places clients on a well-colocated, non-busy entry point, and internal routing (server-to-server: WS or QUIC, not WebRTC) lets any client reach anyone in the world. Distinct from the single node, which never cross-relays.
32. [ ] **E2E encryption.** Encrypt private channels (chat/DMs) so relay operators can't read them; keep game data cleartext-to-relay (or authenticated-only) — decide per channel. Needed once relays aren't all first-party.
33. [ ] **WebTransport carrier** for genuine unreliable pose delivery, if/when WS TCP head-of-line-blocking proves to hurt.

---

## Social track: text chat, DMs & friends

A first-class goal (Rec Room parity), run as a **parallel track** to world-sync (B/C/D) — it depends on the relay + identity, not on the command bus or physics.

- [ ] **In-world text chat [S/M].** A reliable `chat` channel + chat UI (log, input, sender identity). Depends only on presence/relay (done), so it can land early — and doubles as a real-payload test of the relay. Sender via `PeerID` now, stable identity once auth lands.
- [ ] **Identity & profiles [M].** Stable user identity (usernames, IDs, profile) — extends Phase A#5 identity rules. Prerequisite for DM addressing and durable message authorship.
- [ ] **Direct messages [L].** 1:1 (and group) messaging independent of sharing a world. Needs: identity (addressing), **message persistence / inbox** (history + offline delivery — a backend store, not just relay forwarding), and routing to a user wherever they are (the relay network, E#31).
- [ ] **Friends / social graph & presence [M].** Friends list, online status, "join friend's instance" (ties into invites / instance selection, E#30).
- [ ] **Safety controls [M, before public].** Client-side **block / mute** (local, needs no server or central authority) and rate limiting. No reporting pipeline — a decentralised network has no central operator to receive one — and no server-side scanning of E2E channels.
- [ ] **E2E for private channels** — see E#32; encrypt chat/DM channels so relay operators can't read them.
- [ ] **Multiple instances** - more than the 1 main instance for each world to split players and allow private lobbies

**Dependency summary:** in-world chat is near-term (relay only). DMs trail identity + persistence, and reaching anyone in the world trails the relay network (E#31).
