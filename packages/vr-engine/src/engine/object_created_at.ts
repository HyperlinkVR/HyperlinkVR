// when each object was created, in session time, so a late joiner can catch up state that started
// with it (an autoplaying sound). only objects that came in the joiner's snapshot catch up; an object
// created live starts once it has loaded, as before.

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
