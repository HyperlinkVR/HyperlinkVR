import type {
    CollectionMember,
    EngineObject,
    ObjectCollection,
    ObjectCollectionInput,
    TransformInput
} from "@hyperlinkvr/vr-engine-schemas";
import { ObjectCollectionSchema } from "@hyperlinkvr/vr-engine-schemas";



import { BaseBuilder } from "./base";


/**
 * @group Objects
 */
export class ObjectCollectionBuilder extends BaseBuilder<ObjectCollectionInput> {
    constructor(parent: EngineObject, transform?: TransformInput) {
        super({
            type: "collection",
            parent: {object: parent, transform},
            children: []
        } as ObjectCollectionInput);
    }

    change_parent(parent: EngineObject, transform?: TransformInput) {
        this._internal.parent = {object: parent, transform};
        return this;
    }

    add_child(child: EngineObject, transform?: TransformInput) {
        this._internal.children.push({object: child, transform});
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
