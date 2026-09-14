# Multiplayer roadmap

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
7. [x] **Per-world multiplayer mode [S].** `solo` / `shared`, **derived from `max_players` in `hvr-world.json` — no separate mode field** (a second source of truth could contradict the first). `max_players === 1` → solo; `> 1` → shared. The source must be readable *without executing the world*, because the mode gates whether a client even loads the world page — so it lives in the sidecar metadata, never an in-page `<meta>` tag (that'd be circular). Fallback: `mode = solo if (no resolvable metadata) or (max_players === 1) else shared` — note this is *not* the schema's `default(32)`; a parsed-but-omitted field means shared, but unresolvable metadata falls back to solo (never strand someone in shared when the world didn't even resolve). Solo worlds don't join a room. **No `presence` mode** — avatar sync is on in every non-solo world regardless, so `presence` was never a real distinction: for a stateless world it's indistinguishable from `shared`, and for a stateful one it just looks broken (you'd see someone grab a ball and it wouldn't move on your copy). The one real thing under it — a world with no shared mutable state running each client autonomously instead of through the host (no host load, no SPOF, instant local interaction) — survives only as a possible *internal* engine optimisation keyed off a declared-stateless flag, invisible to authors and players.
8. [x] **Command bus [M].** Every SDK action handler (objects, HUD, VFX, world environment, animations, seeks, monitors, triggers) stops caring whether a command came from the page or the network. It accepts IDs minted by the host, and exposes a hook to broadcast each command it applies (the live delta channel, see #11); no command log or compaction here, since late joiners catch up from a state snapshot rather than a replay (see #13). *(The large foundational item — shared mode and physics depend on it.)*
9. [ ] **Session clock sync [S].** So tweens and animations can start at the same moment everywhere.

---

## Phase C: shared mode

10. [ ] **Roles [S].** The engine knows if it's host. In shared worlds, clients hand world-level authority (world monitors) to the host.
11. [~] **Command replication [M].** The host broadcasts every command it applies on a reliable channel, and clients apply them.
12. [x] **Client page lifecycle [S].** In shared worlds, client pages never get `READY`, and the host's "loading finished" is replicated to everyone.
13. [~] **Late join (snapshot, not replay) [M].** A newcomer gets a serialized snapshot of current world state — each subsystem (objects, HUD, VFX, active tweens/seeks with their start-time, monitors) exposes `serialize()`/`hydrate()` — and holds a loading screen until it's hydrated. Not a command-log replay: replaying timing-dependent commands (a tween that started 10s ago) is the fragility to avoid — a snapshot captures `tween X 40% through, started at session-time T` instead. The stores are already serializable and ID-keyed (`EngineObjectStore.objects`), and this same serialization feeds `net.state` / host migration (#28).
14. [ ] **Report routing [M].** Client engines send reports to the host's page with `player` attached. Player-targeted actions (teleport, send to world, player monitors) go to that player's engine.
15. [ ] **Per-player HUD and effects [S].** Using the scope the HUD already has.
16. [ ] **SDK [S].** `e.player`, `players.on_spawn` fires for remote players on the host, `players.list()` and `on_leave`, and `.create()` throws on clients.
17. [ ] **Host leaves [S].** For v1, the instance simply ends.
18. [ ] **Games [S].** Port clubhouse, or a button and score world, to `shared`.
19. [ ] **WebTransport [S].** for the unreliable channel (making it a hybrid transport, with WebSocket for reliable. Maybe fallback to WebSocket for unreliable if WebTransport isn't available, but need to be careful that all parties agree, so don't do that yet)

**Milestone: button, score and HUD games are multiplayer.**

---

## Phase D: physics

20. [ ] **`ObjectPhysics` honours authority [M].** A body simulated by another engine becomes kinematic and follows the stream.
21. [ ] **Host physics streaming [M].** The host streams the pose and velocity of every dynamic body that's moving. It reuses the pose buffer, and stops sending once a body comes to rest.
22. [ ] **Grab handoff [L].** A grab claims the object through the host (optimistically, host settles conflicts). The holder streams it; letting go hands it back to the host with its velocity. Needs the most feel-tuning. *(This is the VRChat-style ownership model.)*
23. [ ] **Held objects run their own triggers [M].** Triggers and reports for a held object run on the holder's engine. Other engines replay visuals only, reports suppressed.
24. [ ] **Pinned ownership [S].** `set_ownership(player)`, needed for minigolf balls.
25. [ ] **Remote avatar colliders [S].** So players can push things, and raycasts can hit them.
26. [ ] **Games [M].** Minigolf, basketball, defendthecore.

**Milestone: physics games are multiplayer. At this point it's "fully working".**

---

## Phase E: optional, after that

27. [ ] The local escape hatch: `hyperlinkvr.local()`, `me.create()`, message channels.
28. [ ] `net.state` and host migration.
29. [ ] **Voice chat** (its own project) — relay-routed / SFU-style, likely WebRTC for the client↔relay media leg.
30. [ ] Presence polish: syncing facial expressions, an interpolation delay that adapts to conditions, binary encoding.
    - [ ] **Pose send optimisation.** Poses currently broadcast at 20Hz unconditionally. Gate on a movement threshold *plus* a late-join pose (or low-rate keepalive) — a pure delta check alone would leave idle avatars stuck at their default pose for newcomers, since the appearance handshake syncs appearance but not pose. Matters mainly for flat/idle players; in VR micro-movements make it near-moot.
31. [ ] Robustness: **reconnects** (stable session token so a returning peer keeps its `PeerID` / `joined_at` and host election doesn't flap; server holds `PeerInfo` through a grace window), node rate limits and room caps, invites and instance selection (Discord join button), a peer list in the watch UI.
32. [ ] **Relay network.** One shared global network (not a federation of independent relays): a discovery entrypoint places clients on a well-colocated, non-busy entry point, and internal routing (server-to-server: WS or QUIC, not WebRTC) lets any client reach anyone in the world. Distinct from the single node, which never cross-relays.
33. [ ] **E2E encryption.** Encrypt private channels (chat/DMs) so relay operators can't read them; keep game data cleartext-to-relay (or authenticated-only) — decide per channel. Needed once relays aren't all first-party.

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
