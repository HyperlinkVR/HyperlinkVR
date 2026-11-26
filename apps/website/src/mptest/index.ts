// mptest: multiplayer test world, cut down to what's currently being fixed.
//
// only the host's page runs world logic (a client's page never gets READY), so everything here runs on
// the host. it checks what the host can observe itself; what only a person can judge becomes a guided
// step: an instruction on screen and PASS / FAIL / SKIP buttons, which anyone can press.
//
// how to run it: devtools network mode "Local (windows in this browser)". open this world in one window
// (the host) and click play. open it in a second window (the client) and DON'T click play yet, then
// follow the instruction line. the board (top left) shows every result, and the console prints a
// summary at the end ([mptest] lines).

import type * as hvr from "@hyperlinkvr/web-sdk";

const h = hyperlinkvr.builders;

// ---- layout (metres; players spawn at the origin facing -z) ----

const DESK = [0, 1, -2] as const;            // PASS / FAIL / SKIP
const CARRY_ORB = [1.6, 1.1, -2] as const;     // grabbable with no physics
const START = [0, 0, 2.5] as const;            // where on_spawn puts every player

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const distance = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

// ---- results board: one HUD line per test ----

type Status = "pending" | "running" | "pass" | "fail" | "skip";

const TESTS: [string, string][] = [
    ["host_events", "Host: join, spawn, enter in order"],
    ["client_join_spawn", "Client: join + spawn before play"],
    ["client_spawn_tp", "Client: on_spawn teleport lands"],
    ["client_enter", "Client: enter on clicking play"],
    ["client_tp_kept", "Client: still at start after play"],
    ["carry_scale", "Carried orb keeps its size"],
    ["collisions", "Player collisions block"],
    ["late_events", "Late joiner: join, spawn, enter"],
    ["late_tp", "Late joiner: on_spawn teleport lands"],
    ["late_orb", "Late joiner: dropped orb where left"],
    ["hidden_until_spawn", "Avatar hidden until they click play"]
];

const LABEL: Record<Status, string> = {
    pending: "[    ]",
    running: "[ .. ]",
    pass: "[PASS]",
    fail: "[FAIL]",
    skip: "[skip]"
};

interface Test {
    title: string;
    status: Status;
    note: string;
    hud: hvr.builders.HUDTextHandle | null;
}

const tests = new Map<string, Test>(TESTS.map(([id, title]) => [id, { title, status: "pending", note: "" , hud: null }]));
let instruction: hvr.builders.HUDTextHandle | null = null;

const line = (test: Test) => `${LABEL[test.status]} ${test.title}${test.note ? ` - ${test.note}` : ""}`;

const set = (id: string, status: Status, note = "") => {
    const test = tests.get(id)!;
    test.status = status;
    test.note = note;
    console.log(`[mptest] ${line(test)}`);
    void test.hud?.set_text(line(test));
};

const say = (text: string) => {
    console.log(`[mptest] >> ${text}`);
    void instruction?.set_text(text);
};

const wait_for = async (check: () => boolean, timeout_ms: number) => {
    const end = performance.now() + timeout_ms;
    while (performance.now() < end) {
        if (check()) return true;
        await sleep(100);
    }
    return check();
};

// ---- player arrival, as the page hears it ----

type Stage = "join" | "spawn" | "enter" | "leave";
const stages = new Map<string, Stage[]>();

const record = (stage: Stage) => (player: hvr.players.Player) => {
    const id = player.get_id();
    const list = stages.get(id) ?? [];
    list.push(stage);
    stages.set(id, list);
    console.log(`[mptest] ${stage}: ${id}`);
};

const stages_of = (id: string) => stages.get(id) ?? [];
const in_order = (id: string, expected: Stage[]) => JSON.stringify(stages_of(id).filter((s) => expected.includes(s))) === JSON.stringify(expected);

// ---- manual steps ----

type Verdict = "pass" | "fail" | "skip";
let resolve_manual: ((verdict: Verdict) => void) | null = null;

const manual = async (id: string, text: string, setup?: () => Promise<void>) => {
    set(id, "running");
    say(`${text}\n\nThen press PASS, FAIL or SKIP.`);
    await setup?.();
    const verdict = await new Promise<Verdict>((resolve) => {
        resolve_manual = resolve;
    });
    resolve_manual = null;
    set(id, verdict);
};

// ---- world ----

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("[mptest] connected");

    // record arrivals from the start (late subscribers still catch up on the local player)
    hyperlinkvr.players.on_join(record("join"));
    hyperlinkvr.players.on_enter(record("enter"));
    hyperlinkvr.players.on_leave(record("leave"));

    for (const [id, test] of tests) {
        test.hud = await h.hud_text(`test_${id}`, line(test)).set_slot("top-left").set_font_size(18).create();
    }
    instruction = await h.hud_text("instruction", "Click play, then open this world in a second window (don't click play there yet).")
        .set_slot("bottom-center")
        .set_font_size(24)
        .create();

    const create = (builder: any, position: readonly number[]) =>
        new h.EngineObjectDispatchBuilder(builder).set_position(position[0]!, position[1]!, position[2]!);

    const sign = (text: string, position: readonly number[]) =>
        create(new h.TextSignPrefabBuilder().set_text(text).set_style("default").build(), position).create();

    // PASS / FAIL / SKIP desk
    for (const [name, label, color, dx] of [
        ["pass_btn", "PASS", 0x2e8555, -0.6],
        ["fail_btn", "FAIL", 0xb03a2e, 0],
        ["skip_btn", "SKIP", 0x55606e, 0.6]
    ] as const) {
        await create(new h.ButtonPrefabBuilder()
            .named(name)
            .set_label(label)
            .set_body_color(color)
            .set_reports_press(true)
            .set_fixed(true)
            .build(), [DESK[0] + dx, DESK[1], DESK[2]])
            .on(name, (e: any) => {
                if (e.payload?.type !== "press") return;
                resolve_manual?.(label.toLowerCase() as Verdict);
            })
            .create();
    }

    // carry orb: grabbable with no physics (a held object). checks the grab keeps its size, and that a
    // late joiner sees it where it was dropped
    await create(new h.CustomObjectBuilder()
        .set_mesh("/defendthecore/core.glb")
        .add_interaction("grab", new h.GrabbableInteractionBuilder().build())
        .build(), CARRY_ORB)
        .set_scale(0.12, 0.12, 0.12)
        .create();
    await sign("CARRY", [CARRY_ORB[0], CARRY_ORB[1] - 0.4, CARRY_ORB[2]]);
    await sign("START", [START[0], 0.4, START[2] + 0.6]);

    // ---- players ----

    let host_id: string | null = null;
    let client: hvr.players.Player | null = null;
    let late: hvr.players.Player | null = null;
    let phase: "waiting" | "client" | "late" = "waiting";

    // the moment to place a player: they have a body, even if they haven't clicked play yet
    hyperlinkvr.players.on_spawn(async (player, info) => {
        record("spawn")(player);
        const id = player.get_id();
        try {
            await player.teleport_to([START[0], START[1], START[2]], 0);
        } catch (error) {
            console.warn("[mptest] spawn teleport failed", id, error);
        }

        if (!info.remote) {
            host_id = id;
            return;
        }
        if (phase === "waiting") {
            client = player;
            phase = "client";
            void run(player);
        } else if (phase === "late" && !late && id !== client?.get_id()) {
            late = player;
        }
    });

    // checks a remote player's arrival up to (and including) clicking play
    const check_arrival = async (player: hvr.players.Player, ids: { events: string; tp: string; enter?: string; kept?: string }) => {
        const id = player.get_id();

        // spawned, and not entered: they're still on the play screen
        set(ids.events, "running");
        await sleep(1500);
        const pre_play = in_order(id, ["join", "spawn"]) && !stages_of(id).includes("enter");

        set(ids.tp, "running");
        const at = (await player.get_position()).position;
        const off = distance(at, START);
        set(ids.tp, off < 0.75 ? "pass" : "fail", `off by ${off.toFixed(2)}m, before play`);

        say("Now click play in the second window.");
        const entered = await wait_for(() => stages_of(id).includes("enter"), 120000);
        const ordered = in_order(id, ["join", "spawn", "enter"]);
        if (ids.enter) {
            set(ids.events, pre_play ? "pass" : "fail", pre_play ? "join, spawn before play" : `got ${stages_of(id).join(", ")}`);
            set(ids.enter, entered && ordered ? "pass" : "fail", entered ? stages_of(id).join(" > ") : "no enter after 2 min");
        } else {
            set(ids.events, pre_play && entered && ordered ? "pass" : "fail", stages_of(id).join(" > "));
        }

        if (ids.kept) {
            await sleep(1000);
            const after = distance((await player.get_position()).position, START);
            set(ids.kept, after < 0.75 ? "pass" : "fail", `off by ${after.toFixed(2)}m after play`);
        }
    };

    // ---- the run ----

    const run = async (player: hvr.players.Player) => {
        // the host's own arrival (it clicked play before the client joined)
        set("host_events", host_id && in_order(host_id, ["join", "spawn", "enter"]) ? "pass" : "fail",
            host_id ? stages_of(host_id).join(" > ") : "host never spawned");

        await check_arrival(player, { events: "client_join_spawn", tp: "client_spawn_tp", enter: "client_enter", kept: "client_tp_kept" });

        await manual("carry_scale", "CLIENT: pick up the small CARRY orb, carry it and drop it somewhere else.\nIt should stay small in your hand (no growing).");
        await manual("collisions", "Player collisions are ON: walk into each other.\nYou should be blocked (not pass through).",
            async () => {
                await new h.WorldEnvBuilder().set_player_collisions(true).apply();
            });
        await new h.WorldEnvBuilder().set_player_collisions(false).apply();

        // ---- late join ----
        phase = "late";
        say("CLIENT: reload your window, and DON'T click play yet.\nHOST: no avatar should appear (not at the origin, not anywhere) until they click play, then at START.");
        const joined = await wait_for(() => late !== null, 180000);
        if (!joined || !late) {
            set("late_events", "fail", "nobody rejoined within 3 minutes");
        } else {
            await check_arrival(late, { events: "late_events", tp: "late_tp" });
            await manual("late_orb", "LATE JOINER: the CARRY orb is where it was dropped earlier (not back by the desk).");
            await manual("hidden_until_spawn", "HOST: did their avatar stay hidden until they clicked play, and then appear at START?");
        }

        const results = [...tests.entries()].map(([id, t]) => ({ id, status: t.status, note: t.note }));
        const failed = results.filter((r) => r.status === "fail");
        say(failed.length === 0 ? "All done. Everything passed or was skipped." : `Done. ${failed.length} failed, see the board.`);
        console.log("[mptest] summary", JSON.stringify(results, null, 2));
    };

    hyperlinkvr.finished_loading();
    console.log("[mptest] finished loading");
});
