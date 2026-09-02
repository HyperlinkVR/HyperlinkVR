// collection members have no id of their own, so they are rendered under an id derived
// deterministically from the collection's id. kept in one place so the renderer that assigns
// them and the sync that gathers their animation channels stay in agreement.
export const collection_parent_id = (collection_id: string) => `${collection_id}-parent`;

export const collection_child_id = (collection_id: string, index: number) =>
    `${collection_id}-child-${index}`;
