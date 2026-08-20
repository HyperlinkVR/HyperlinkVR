export type Player = InstanceType<typeof hyperlinkvr.players.Player>;

export type MarkerMap = Awaited<ReturnType<typeof hyperlinkvr.markers.load>>;
