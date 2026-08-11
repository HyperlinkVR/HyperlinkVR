import {z} from "zod";
import {PhysicsSystemSchema} from "./physics";
import {bindable} from "./binding";
import {InteractionSchema} from "./interactions";
import {HexColorSchema} from "./colors";


// export const MaterialAlbedoColorSchema = z.object({
//     type: z.literal("color"),
//     color: z.string()
// });
// export type MaterialAlbedoColor = z.infer<typeof MaterialAlbedoColorSchema>;

// export const MaterialAlbedoTextureSchema = z.object({
//     type: z.literal("texture"),
//     texture: z.string()
// });
// export type MaterialAlbedoTexture = z.infer<typeof MaterialAlbedoTextureSchema>;
//
// export const MaterialAlbedoSchema = z.discriminatedUnion("type", [
//     MaterialAlbedoColorSchema,
//     MaterialAlbedoTextureSchema
// ]);
// export type MaterialAlbedo = z.infer<typeof MaterialAlbedoSchema>;
// TODO: material override definition that takes value or texture for pbr fields. for now their mesh should include embedded material

export const CustomObjectSchema = z.object({
    type: z.literal("custom"),
    mesh: z
        .url({
            protocol: /^https?$/,
            hostname: z.regexes.domain
        })
        .optional(),
    // material_override: MaterialSchema.optional(),
    physics: PhysicsSystemSchema.optional(),
    interactions: z.array(InteractionSchema).optional()
});
export type CustomObject = z.infer<typeof CustomObjectSchema>;
export type CustomObjectInput = z.input<typeof CustomObjectSchema>;

// TODO: built in primitive meshes, either by a path or explicit in schema. would be useless without material override tho

// prefabs without special behaviour, we just need to tell zod the name
const StandardPrefabName = z.enum(["basketball", "avatar_mirror", "skootball"]);
export type StandardPrefabName = z.infer<typeof StandardPrefabName>;

export const StandardPrefabSchema = z.object({
    type: z.literal("prefab"),
    name: StandardPrefabName
});
export type StandardPrefab = z.infer<typeof StandardPrefabSchema>;
export type StandardPrefabInput = z.input<typeof StandardPrefabSchema>;

export const ButtonPrefabSchema = bindable({
    type: z.literal("prefab"),
    name: z.literal("button"),
    label: z.string(),
    body_color: HexColorSchema.default(0x00ff00),
    label_color: HexColorSchema.default(0xffffff),
    report_press: z.boolean().default(true),
    report_release: z.boolean().default(true),
    grabbable: z.boolean().default(false),
    fixed: z.boolean().default(true)
});
export type ButtonPrefab = z.infer<typeof ButtonPrefabSchema>;
export type ButtonPrefabInput = z.input<typeof ButtonPrefabSchema>;

export const BasketballHoopPrefabSchema = bindable({
    type: z.literal("prefab"),
    name: z.literal("basketball_hoop"),
    enable_sfx: z.boolean().default(true),
    enable_particles: z.boolean().default(true),
});
export type BasketballHoopPrefab = z.infer<typeof BasketballHoopPrefabSchema>;
export type BasketballHoopPrefabInput = z.input<typeof BasketballHoopPrefabSchema>;

export const ReflectiveMirrorPrefabSchema = z.object({
    type: z.literal("prefab"),
    name: z.literal("reflective_mirror"),
    width: z.number().positive(),
    height: z.number().positive(),
    resolution: z.number().int().positive().default(2048).optional(),
    tint: HexColorSchema.default(0xb0b0b0).optional()
});
export type ReflectiveMirrorPrefab = z.infer<typeof ReflectiveMirrorPrefabSchema>;
export type ReflectiveMirrorPrefabInput = z.input<typeof ReflectiveMirrorPrefabSchema>;

const TextPrefabBaseSchema = z.object({
    type: z.literal("prefab"),
    text: z.string(),
    font_size: z.number().positive().default(0.1),
    color: HexColorSchema.default(0xffffff),
});
export type TextPrefabBase = z.infer<typeof TextPrefabBaseSchema>;
export type TextPrefabBaseInput = z.input<typeof TextPrefabBaseSchema>;

export const FloatingText2DPrefabSchema = TextPrefabBaseSchema.extend({
    type: z.literal("prefab"),
    name: z.literal("floating_text_2d"),
});
export type FloatingText2DPrefab = z.infer<typeof FloatingText2DPrefabSchema>;
export type FloatingText2DPrefabInput = z.input<typeof FloatingText2DPrefabSchema>;

export const FloatingText3DPrefabSchema = TextPrefabBaseSchema.extend({
    type: z.literal("prefab"),
    name: z.literal("floating_text_3d"),
    depth: z.number().positive().default(0.05),
});
export type FloatingText3DPrefab = z.infer<typeof FloatingText3DPrefabSchema>;
export type FloatingText3DPrefabInput = z.input<typeof FloatingText3DPrefabSchema>;

export const TextSignPrefabSchema = TextPrefabBaseSchema.extend({
    type: z.literal("prefab"),
    name: z.literal("text_sign"),

    // TODO: is this the best way to be doing multiple styles, or should they be sep prefabs (or strongly typed union)?
    style: z.enum(["default", "wooden", "nameplate"]).default("default"),
    style_parameters: z.record(z.string(), z.any()).optional(),

    // override default color
    color: HexColorSchema.default(0x000000),
});
export type TextSignPrefab = z.infer<typeof TextSignPrefabSchema>;
export type TextSignPrefabInput = z.input<typeof TextSignPrefabSchema>;

export const PrefabSchema = z.discriminatedUnion("name", [
    StandardPrefabSchema,
    ButtonPrefabSchema,
    BasketballHoopPrefabSchema,
    ReflectiveMirrorPrefabSchema,
    FloatingText2DPrefabSchema,
    FloatingText3DPrefabSchema,
    TextSignPrefabSchema
]);
export type Prefab = z.infer<typeof PrefabSchema>;
export type PrefabInput = z.input<typeof PrefabSchema>;

export const EngineObjectSchema = z.union([CustomObjectSchema, PrefabSchema]);
export type EngineObject = z.infer<typeof EngineObjectSchema>;
export type EngineObjectInput = z.input<typeof EngineObjectSchema>;

// TODO: prefab for dom mirror
// TODO: support parenting
// TODO: split these schemas too in the same manner as builders
