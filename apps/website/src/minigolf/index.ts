hyperlinkvr.on_ready(async () => {
    await hyperlinkvr.connect();
    console.log("Connected!");

    const h = hyperlinkvr.builders;

    hyperlinkvr.finished_loading();
});
