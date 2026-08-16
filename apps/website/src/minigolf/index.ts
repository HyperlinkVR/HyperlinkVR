hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("Connected!");

    const h = hyperlinkvr.builders;

    const promises = [];

    for (let i = 0; i < 5; i++) {
        const x = i - 2.5;

        // random neon putter color, and the ball automatically matches just like real mini golf :)
        const putter = new h.GolfPutterPrefabBuilder().random_color().build();
        const ball = new h.GolfBallPrefabBuilder().named("ball").set_color(putter.color).build();

        promises.push(
            new h.EngineObjectDispatchBuilder()
                .set_object(putter)
                .set_position(x, 2, -1)
                .create()
        );

        promises.push(
            new h.EngineObjectDispatchBuilder()
                .set_object(ball)
                .set_position(x, 1, -2)
                .on("ball", async (event) => {
                    console.log(`Ball ${i}`, event);
                })
                .create()
        );
    }

    await Promise.all(promises);
    hyperlinkvr.finished_loading();
});
