import { animate_zombot, zombot } from "./enemies";


const h = hyperlinkvr.builders;

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();

    const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(0, 0, -5).create();

    hyperlinkvr.players.on_spawn(() => {
        animate_zombot(created_zombot);
        created_zombot.seek().speed(1).set_distance(1).toward_player().start();
    });

    hyperlinkvr.finished_loading();
});
