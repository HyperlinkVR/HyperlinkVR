hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("Connected!");

    const h = hyperlinkvr.builders;

    const promises = [];

    const putter = new h.GolfPutterPrefabBuilder().build();
    const ball = new h.GolfBallPrefabBuilder().build();

    for (let i = 0; i < 5; i++) {
        const x = i - 2.5;

        promises.push(
            new h.EngineObjectDispatchBuilder().set_object(putter).set_position(x, 2, -1).create()
        );

        promises.push(
            new h.EngineObjectDispatchBuilder().set_object(ball).set_position(x, 1, -2).create()
        );
    }

    await Promise.all(promises);
    hyperlinkvr.finished_loading();
});
