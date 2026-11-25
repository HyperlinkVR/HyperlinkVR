// when each object was created, in session time, so state that started with the object (an
// autoplaying sound) can be picked up at the right point by a late joiner.
//
// the host stamps the time as it mints a created object (command bus). only objects a joiner received
// in its snapshot get the catch-up treatment: an object created live just starts once it has loaded,
// as it always has (otherwise a short one-shot that loads slower than it lasts would never be heard)

const created_at = new Map<string, number>();
const joined_late = new Map<string, number>();

export const record_object_created = (id: string, session_time: number | undefined) => {
    if (session_time !== undefined) {
        created_at.set(id, session_time);
    }
};

export const get_object_created_at = (id: string): number | undefined => created_at.get(id);

export const forget_object_created = (id: string) => {
    created_at.delete(id);
    joined_late.delete(id);
};

// a joiner hydrating its snapshot: this object already existed, since `session_time`
export const mark_object_joined_late = (id: string, session_time: number) => {
    created_at.set(id, session_time);
    joined_late.set(id, session_time);
};

// session time the object started at, if this engine joined after it was created (else undefined)
export const get_late_join_start = (id: string): number | undefined => joined_late.get(id);

export const get_created_at_table = (): [string, number][] => [...created_at];

export const clear_object_created = () => {
    created_at.clear();
    joined_late.clear();
};
