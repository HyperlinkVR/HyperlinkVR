type Vector3 = [number, number, number];

export const calculate_launch_velocity = (
    start: Vector3,
    apex: Vector3,
    target: Vector3,
    gravity: number = 9.81
): [Vector3, number] => {
    const [x0, y0, z0] = start;
    const [, ya, ] = apex;
    const [xt, yt, zt] = target;

    const height_up = ya - y0;
    const height_down = ya - yt;

    if (height_up <= 0 || height_down <= 0) {
        console.warn("Apex Y must be strictly higher than both start Y and target Y.");
        return [[0, 0, 0], 0];
    }

    // vertical velocity needed to reach the apex height
    const vy = Math.sqrt(2 * gravity * height_up);

    // total flight time
    const t_up = Math.sqrt((2 * height_up) / gravity);
    const t_down = Math.sqrt((2 * height_down) / gravity);
    const t = t_up + t_down;

    // horizontal velocity required to cross the distance in that time
    const vx = (xt - x0) / t;
    const vz = (zt - z0) / t;

    return [[vx, vy, vz], t];
}
