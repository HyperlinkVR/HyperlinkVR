import type * as hvr from "@hyperlinkvr/web-sdk";


import { apply_zombot_behaviour, zombot } from "./objects/enemies/zombot";
import { on_core_damaged } from "./core_state";


const h = hyperlinkvr.builders;

const map_markers = await hyperlinkvr.markers.load("map.glb");
const tunnels = Array.from(hyperlinkvr.markers.subset(map_markers, /^tunnel_/).values())
    .map((marker) => marker.transform.position);

const spawn_zombot = async (tunnel_idx: number) => {
    if (tunnel_idx < 0 || tunnel_idx >= tunnels.length) {
        console.error(`Cannot spawn zombot: invalid tunnel index ${tunnel_idx}`);
        return;
    }

    const tunnel_pos = tunnels[tunnel_idx]!;

    const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(tunnel_pos).create();
    await apply_zombot_behaviour(created_zombot);
}


type EnemyType = "zombot";

const spawn_enemy = async (type: EnemyType, tunnel_idx = Math.floor(Math.random() * tunnels.length)) => {
    switch (type) {
        case "zombot":
            await spawn_zombot(tunnel_idx);
            break;
        default:
            console.error(`Unknown enemy type: ${type}`);
    }
}

interface SpawnWaveEntry {
    type: EnemyType;
    amount: number;
    interval_ms: number;

    // allows spawning multiple enemies at the exact same time, rather than the default 1 per interval
    batch_size?: number;

    // optional tunnel index to spawn the enemy at, if not provided a random tunnel will be chosen
    tunnel_idx?: number;
}

interface SpawnWaveSingleSpawnBlock {
    enemy: SpawnWaveEntry;
    is_boss?: boolean;

    // by default, the wave will wait for all enemies to be killed before the next block
    // if made false, the wave will continue to the next block without waiting for the enemies to be killed
    wait_for_killed?: false | undefined;
}

interface SpawnWaveMultiSpawnBlock {
    enemies: SpawnWaveEntry[];
    is_boss?: boolean;

    // by default, the wave will wait for all enemies to be killed before the next block
    // if made false, the wave will continue to the next block without waiting for the enemies to be killed
    wait_for_killed?: false | undefined;
}

interface SpawnWaveDelayBlock {
    delay_ms: number;
}

interface SpawnWaveTextBlock {
    text: string;
}

type SpawnWaveBlock = SpawnWaveSingleSpawnBlock | SpawnWaveMultiSpawnBlock | SpawnWaveDelayBlock | SpawnWaveTextBlock;

// waves defined as a sequence of blocks, where each block contains a set of enemies to spawn in parallel
type SpawnWave = SpawnWaveBlock[];

// TODO: add speed and damage control? or just keep it as separate classes / fixed difficulty setting

// fixed wave definitions. any left undefined will be randomly generated depending on the wave number
const FIXED_WAVES = {
    1: [
        { enemy: { type: "zombot", amount: 5, interval_ms: 1000 } },
        { delay_ms: 5000 },
        { enemy: { type: "zombot", amount: 10, interval_ms: 500 } },
    ],
    2: [
        { enemy: { type: "zombot", amount: 10, interval_ms: 500 } },
        { enemy: { type: "zombot", amount: 20, interval_ms: 250 } },
    ],
    3: [
        { enemy: { type: "zombot", amount: 10, interval_ms: 500, tunnel_idx: 0 }, wait_for_killed: false },
        { delay_ms: 2000 },
        { enemy: { type: "zombot", amount: 10, interval_ms: 500, tunnel_idx: 1 }, wait_for_killed: false },
        { delay_ms: 2000 },
        { enemy: { type: "zombot", amount: 10, interval_ms: 500, tunnel_idx: 2 }, wait_for_killed: false },
        { delay_ms: 2000 },
        { enemy: { type: "zombot", amount: 10, interval_ms: 500, tunnel_idx: 3 }, wait_for_killed: false },
    ],
    4: [
        { enemy: { type: "zombot", amount: 12, interval_ms: 0, batch_size: 3 }, wait_for_killed: false },
        { delay_ms: 2000 },
        { enemy: { type: "zombot", amount: 12, interval_ms: 0, batch_size: 3 }, wait_for_killed: false },
        { delay_ms: 2000 },
        { enemy: { type: "zombot", amount: 12, interval_ms: 0, batch_size: 3 }, wait_for_killed: false },
    ],
    5: [
        { text: "The first boss approaches!" },
        {enemy: { type: "zombot", amount: 10, interval_ms: 500 }, wait_for_killed: false },
        //{enemy: { type: "zomboss", amount: 1, interval_ms: 0 }, is_boss: true }, TODO
    ]
} satisfies Record<number, SpawnWave>;

// generates a random wave scaled to the wave number (difficulty) with boss rounds every 5 (modulo)
const generate_random_wave = (wave_number: number): SpawnWave => {
    const wave: SpawnWave = [];

    const is_boss_round = wave_number % 5 === 0;
    const difficulty_multiplier = 1 + (wave_number - 1) * 0.1;

    if (is_boss_round) {
        wave.push({ text: "A boss approaches!" });
        wave.push({ enemy: { type: "zombot", amount: Math.floor(10 * difficulty_multiplier), interval_ms: 500 }, wait_for_killed: false });
        //wave.push({ enemy: { type: "zomboss", amount: Math.floor(1 * difficulty_multiplier), interval_ms: 0 }, is_boss: true });
    }

    // generate 3-5 random enemy blocks
    const num_blocks = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < num_blocks; i++) {
        const enemy_type: EnemyType = "zombot"; // TODO: add more enemy types
        const amount = Math.floor(Math.random() * 10) + 5;
        const interval_ms = Math.floor(Math.random() * 1000) + 500;

        wave.push({ enemy: { type: enemy_type, amount, interval_ms } });
    }

    return wave;
}

const run_spawn_wave = async (wave: SpawnWave) => {
    for (const block of wave) {
        if ("text" in block) {
            // TODO: hud message
        } else if ("delay_ms" in block) {
            await new Promise((resolve) => setTimeout(resolve, block.delay_ms));
        } else if ("enemy" in block) {
            const { enemy, is_boss, wait_for_killed } = block;

            const spawn_promises: Promise<void>[] = [];
            for (let i = 0; i < enemy.amount; i += enemy.batch_size ?? 1) {
                spawn_promises.push(new Promise((resolve) => {
                    setTimeout(async () => {
                        const batch_promises: Promise<void>[] = [];
                        for (let j = 0; j < (enemy.batch_size ?? 1) && (i + j) < enemy.amount; j++) {
                            batch_promises.push(spawn_enemy(enemy.type, enemy.tunnel_idx));
                        }
                        await Promise.all(batch_promises);
                        resolve();
                    }, enemy.interval_ms * Math.floor(i / (enemy.batch_size ?? 1)));
                }));
            }

            await Promise.all(spawn_promises);

            if (wait_for_killed !== false) {
                // TODO: handle waiting
            }
        } else if ("enemies" in block) {
            const { enemies, is_boss, wait_for_killed } = block;

            const spawn_promises: Promise<void>[] = [];
            for (const enemy of enemies) {
                for (let i = 0; i < enemy.amount; i += enemy.batch_size ?? 1) {
                    spawn_promises.push(new Promise((resolve) => {
                        setTimeout(async () => {
                            const batch_promises: Promise<void>[] = [];
                            for (let j = 0; j < (enemy.batch_size ?? 1) && (i + j) < enemy.amount; j++) {
                                batch_promises.push(spawn_enemy(enemy.type, enemy.tunnel_idx));
                            }
                            await Promise.all(batch_promises);
                            resolve();
                        }, enemy.interval_ms * Math.floor(i / (enemy.batch_size ?? 1)));
                    }));
                }
            }

            await Promise.all(spawn_promises);

            if (wait_for_killed !== false) {
                // TODO: handle waiting
            }
        }
    }

    // TODO: wait for all enemies to be killed before returning
}

export const start_game = async () => {
    // TODO; progress bar hud element
    const health_hud = await h.hud_text("health", "Core health: 100").set_font_size(30).set_slot("top-center").create();

    on_core_damaged((new_health => {
        health_hud.set_text(`Core health: ${new_health}`);

        if (new_health <= 0) {
            console.log("Game over");
        }
    }));

    // will run just first wave for now since no kill tracking yet or even the concept of killing (so they would all run at once!)
    run_spawn_wave(FIXED_WAVES[1] ?? generate_random_wave(1));
}
