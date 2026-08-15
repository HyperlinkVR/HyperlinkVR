const pending = new Map<string, Array<() => void>>();
const ready = new Set<string>();

export const wait_for_hud_element_ready = (element_id: string): Promise<void> => {
    if (ready.has(element_id)) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const waiters = pending.get(element_id) ?? [];
        waiters.push(resolve);
        pending.set(element_id, waiters);
    });
};

export const mark_hud_element_ready = (element_id: string) => {
    ready.add(element_id);

    const waiters = pending.get(element_id);
    if (waiters) {
        pending.delete(element_id);
        for (const resolve of waiters) {
            resolve();
        }
    }
};

export const clear_hud_element_ready = (element_id: string) => {
    ready.delete(element_id);
    pending.delete(element_id);
};
