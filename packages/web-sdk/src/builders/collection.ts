import type {
    CollectionMember,
    CollectionMemberInput,
    EngineObject,
    ObjectCollection,
    ObjectCollectionInput,
    ObjectMonitor,
    TransformInput,
    Trigger
} from "@hyperlinkvr/vr-engine-schemas";
import { ObjectCollectionSchema } from "@hyperlinkvr/vr-engine-schemas";



import { BaseBuilder } from "./base";


export interface CollectionMemberExtra {
    tags?: string[];
    user_data?: Record<string, any>;
    // named like a dispatch monitor so triggers can source from it by name
    monitors?: { name: string; monitor: ObjectMonitor }[];
    triggers?: Trigger[];
}

const make_member = (
    object: EngineObject,
    transform?: TransformInput,
    extra?: CollectionMemberExtra
): CollectionMemberInput => ({
    object,
    transform,
    tags: extra?.tags,
    user_data: extra?.user_data,
    monitors: extra?.monitors?.map(({ name, monitor }) => ({ ...monitor, binding: { name } })),
    triggers: extra?.triggers
});

/**
 * @group Objects
 */
export class ObjectCollectionBuilder extends BaseBuilder<ObjectCollectionInput> {
    constructor(parent: EngineObject, transform?: TransformInput, extra?: CollectionMemberExtra) {
        super({
            type: "collection",
            parent: make_member(parent, transform, extra),
            children: []
        } as ObjectCollectionInput);
    }

    change_parent(parent: EngineObject, transform?: TransformInput, extra?: CollectionMemberExtra) {
        this._internal.parent = make_member(parent, transform, extra);
        return this;
    }

    add_child(child: EngineObject, transform?: TransformInput, extra?: CollectionMemberExtra) {
        this._internal.children.push(make_member(child, transform, extra));
        return this;
    }

    add_children(children: (EngineObject | CollectionMember)[]) {
        if (children.length === 0) {
            return this;
        }

        this._internal.children.push(...children.map((child) => {
            if ("object" in child) {
                return child;
            } else {
                return {object: child};
            }
        }));

        return this;
    }

    set_children(children: (EngineObject | CollectionMember)[]) {
        if (children.length === 0) {
            throw new Error("ObjectCollection must have at least one child");
        }

        this._internal.children = children.map((child) => {
            if ("object" in child) {
                return child;
            } else {
                return {object: child};
            }
        });

        return this;
    }

    build(): ObjectCollection {
        return ObjectCollectionSchema.parse(this._internal);
    }
}
