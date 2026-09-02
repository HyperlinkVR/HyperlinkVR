import { apply_zombot_behaviour, zombot } from "./enemies/zombot";


const h = hyperlinkvr.builders;

hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();

    hyperlinkvr.finished_loading();
});

(globalThis as any).make_zombot = async () => {
    const created_zombot = await new h.EngineObjectDispatchBuilder(zombot).set_position(0, 0, -5).create();
    await apply_zombot_behaviour(created_zombot);
}
