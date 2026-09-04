export type SettingValueType = Exclude<any, null>;

export type NumberWidget =
    | { type: "number"; min?: number; max?: number }
    | {
          type: "range";
          min: number;
          max: number;
          slider_min?: number;
          slider_max?: number;
          slider_step?: number;
          precision_dp?: number;
          unit?: string;
      };

export type BooleanWidget = { type: "checkbox" } | { type: "switch" };

export type StringWidget<V extends string> =
    | {
          type: "text";
          placeholder?: string;
          max_length?: number;
          subtype_hint?: "url" | "email" | "password"; // note: best effort only
          validation_regex?: RegExp;
          width?: "short" | "medium" | "long";
      }
    | { type: "color" }
    | { type: "select"; options: Array<{ label: string; value: V }> };

export type ArrayWidget<V> =
    | { type: "list" }
    | { type: "tags"; max_tags?: number };

export type WidgetConfig<V> = V extends number
    ? NumberWidget
    : V extends boolean
      ? BooleanWidget
      : V extends string
        ? StringWidget<V>
        : V extends any[]
          ? ArrayWidget<V>
          : { type: "unsupported" };

export type WidgetType<V> = WidgetConfig<V>["type"];

export type WidgetArguments<T extends WidgetType<any>> = Omit<
    Extract<WidgetConfig<any>, { type: T }>,
    "type"
>;

export interface UISubdefinition<V> {
    label: string;
    description?: string;
    breadcrumbs?: string[]; // if omitted, component must be added manually to the UI, but will inherit all its existing widget definitions
    widget: WidgetConfig<V>;
    conditional?: (settings: Record<string, SettingValueType>, watch_play_mode?: "vr" | "flat") => boolean; // if omitted, widget is always shown. watch_play_mode is undefined if the setting is being shown in the flat UI, and "vr" or "flat" if being shown in the watch UI to indicate current play mode
}
// TODO: option to only show on watch in VR or only in flat for contextual config
export interface SeparateUIDefinition<V extends SettingValueType> {
    // if either omitted, then will have no associated widget and must be implemented manually on the specific platform

    flat?: UISubdefinition<V>;
    watch?: UISubdefinition<V>;
}

export interface CommonUIDefinition<V extends SettingValueType> {
    common: UISubdefinition<V>;
}

type UIDefinition<V extends SettingValueType> =
    | CommonUIDefinition<V>
    | SeparateUIDefinition<V>;

// value cannot be nullable, as null is used by storage engines to indicate a key is deleted
export interface Setting<V extends SettingValueType> {
    key: string;
    default_value: V;
    local_only?: boolean; // default false, if true, setting will not be placed into sync storage. note that changing this will make the setting value reset as a different storage engine is used
    ui?: UIDefinition<V>; // if omitted, the setting will have no associated widget and must be implemented manually
}

const build_settings = <T extends Record<string, Omit<Setting<any>, "key">>>(
    settings: T
): { [K in keyof T]: Setting<T[K]["default_value"]> } => {
    const result = {} as any;
    for (const [key, setting] of Object.entries(settings)) {
        result[key] = {
            key,
            ...setting
        };
    }
    return result;
};

export const settings_def = build_settings({
    watch_hand: {
        default_value: "left" as "left" | "right",
        ui: {
            common: {
                label: "Watch hand",
                description: "Which hand to wear the wristwatch on",
                widget: {
                    type: "select",
                    options: [
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" }
                    ]
                },
                include_in_popup: true,
                breadcrumbs: ["General", "Player"]
            }
        }
    },

    use_debug_input: {
        default_value: false,
        local_only: true,
        ui: {
            flat: {
                label: "Use raw input",
                description:
                    "The default method of dispatching input events to the tab may cause some sites to ignore it.\nEnable this option to use Chrome's debugger to inject raw inputs directly.",
                widget: {
                    type: "switch"
                },
                include_in_popup: true,
                breadcrumbs: ["Input"]
            }
        }
    },

    spectator_view: {
        default_value: "first_person" as
            | "first_person"
            | "third_person"
            | "mixed_reality",
        ui: {
            common: {
                label: "Spectator view",
                description: "How the spectator view is displayed",
                widget: {
                    type: "select",
                    options: [
                        { label: "First Person", value: "first_person" },
                        { label: "Third Person", value: "third_person" },
                        { label: "Mixed Reality", value: "mixed_reality" }
                    ]
                },
                include_in_popup: true,
                breadcrumbs: ["General", "Spectator Camera"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    third_person_fov: {
        default_value: 60,
        ui: {
            common: {
                label: "Third person FOV",
                description:
                    "Field of view for the third person spectator camera",
                widget: {
                    type: "range",
                    min: 1,
                    max: 120,
                    slider_min: 30,
                    slider_max: 90,
                    slider_step: 0.1,
                    precision_dp: 2,
                    unit: "°"
                },
                include_in_popup: true,
                breadcrumbs: ["General", "Spectator Camera"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    player_height_cm: {
        default_value: 170,
        ui: {
            common: {
                label: "Player height",
                description: "Height of the player in centimeters",
                widget: {
                    type: "range",
                    min: 100,
                    max: 225,
                    precision_dp: 1,
                    unit: "cm"
                },
                include_in_popup: true,
                breadcrumbs: ["General", "Player"]
            }
        }
    },

    flat_sensitivity: {
        default_value: 2.5,
        ui: {
            common: {
                label: "Mouse sensitivity",
                description: "Sensitivity of the mouse look in flat mode",
                widget: {
                    type: "range",
                    min: 0.1,
                    max: 20,
                    precision_dp: 2,
                    slider_step: 0.1
                },
                breadcrumbs: ["Input", "Flat"],
                conditional: (_, mode) => !mode || mode === "flat"
            }
        }
    },

    vr_locomotion: {
        default_value: "walk" as "walk" | "teleport",
        ui: {
            common: {
                label: "Locomotion method",
                description: "Method of locomotion in VR",
                widget: {
                    type: "select",
                    options: [
                        { label: "Walk", value: "walk" },
                        { label: "Teleport", value: "teleport" }
                    ]
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    vr_locomotion_hand: {
        default_value: "left" as "left" | "right",
        ui: {
            common: {
                label: "Movement hand",
                description:
                    "Which hand to use for locomotion in VR. The other hand will be used for turning.",
                widget: {
                    type: "select",
                    options: [
                        { label: "Left", value: "left" },
                        { label: "Right", value: "right" }
                    ]
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    vr_rotation: {
        default_value: "snap" as "snap" | "smooth",
        ui: {
            common: {
                label: "Rotation method",
                description: "Method of rotation in VR",
                widget: {
                    type: "select",
                    options: [
                        { label: "Snap", value: "snap" },
                        { label: "Smooth", value: "smooth" }
                    ]
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    vr_snap_rotation_angle: {
        default_value: 30 as 5 | 10 | 15 | 30 | 45 | 60 | 90,
        ui: {
            common: {
                label: "Snap rotation angle",
                description: "Angle of snap rotation in degrees",
                widget: {
                    type: "select",
                    options: [
                        { label: "5°", value: 5 },
                        { label: "10°", value: 10 },
                        { label: "15°", value: 15 },
                        { label: "30°", value: 30 },
                        { label: "45°", value: 45 },
                        { label: "60°", value: 60 },
                        { label: "90°", value: 90 }
                    ]
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (settings, mode) => settings.vr_rotation === "snap" && (!mode || mode === "vr")
            }
        }
    },

    vr_smooth_rotation_speed: {
        default_value: 60,
        ui: {
            common: {
                label: "Smooth rotation speed",
                description: "Speed of smooth rotation in degrees per second",
                widget: {
                    type: "range",
                    min: 30,
                    max: 180,
                    precision_dp: 0,
                    unit: "°/s"
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (settings, mode) => settings.vr_rotation === "smooth" && (!mode || mode === "vr")
            }
        }
    },

    vignette_intensity: {
        default_value: 0.5,
        ui: {
            common: {
                label: "Vignette intensity",
                description:
                    "Intensity of the motion sickness reduction vignette",
                widget: {
                    type: "range",
                    min: 0,
                    max: 100,
                    precision_dp: 0,
                    unit: "%"
                },
                breadcrumbs: ["Comfort", "VR Movement"],
                conditional: (_, mode) => !mode || mode === "vr"
            }
        }
    },

    ssao_mode: {
        default_value: "balanced" as
            | "off"
            | "performance"
            | "balanced"
            | "quality",
        ui: {
            common: {
                label: "SSAO",
                description:
                    "Screen space ambient occlusion makes lighting more realistic by making corners and crevices darker",
                widget: {
                    type: "select",
                    options: [
                        { label: "Off", value: "off" },
                        { label: "Performance", value: "performance" },
                        { label: "Balanced", value: "balanced" },
                        { label: "Quality", value: "quality" }
                    ]
                },
                breadcrumbs: ["Graphics"]
            }
        }
    },

    shadows_mode: {
        default_value: "soft_medium" as
            | "off"
            | "basic"
            | "soft_low"
            | "soft_medium"
            | "soft_high",
        ui: {
            common: {
                label: "Shadows",
                description:
                    "Soft shadows make the world look more realistic, but can be expensive to render",
                widget: {
                    type: "select",
                    options: [
                        { label: "Off", value: "off" },
                        { label: "Basic", value: "basic" },
                        { label: "Soft (Low)", value: "soft_low" },
                        { label: "Soft (Medium)", value: "soft_medium" },
                        { label: "Soft (High)", value: "soft_high" }
                    ]
                },
                breadcrumbs: ["Graphics"]
            }
        }
    },

    show_fps: {
        default_value: false,
        local_only: true,
        ui: {
            common: {
                label: "Show FPS",
                widget: {
                    type: "switch"
                },
                breadcrumbs: ["Graphics"]
            }
        } // TODO: show fps in vr too
    },

    discord_rpc: {
        default_value: false,
        local_only: true,
        ui: {
            flat: {
                label: "Discord Rich Presence",
                description:
                    "Show your current activity in HyperlinkVR on Discord",
                widget: {
                    type: "switch"
                },
                breadcrumbs: ["Discord"]
                // TODO: show in vr if has been set up already
            }
        }
    },

    discord_show_world: {
        default_value: true,
        ui: {
            common: {
                label: "Show current world",
                description:
                    "Show the current world you're in on Discord Rich Presence",
                widget: {
                    type: "switch"
                },
                breadcrumbs: ["Discord"],
                conditional: (settings) => settings.discord_rpc === true
            }
        }
    },

    service_override: {
        default_value: false as boolean,
        ui: {
            flat: {
                label: "Override services (don't use unless you know what you're doing)",
                description: "Override the services HyperlinkVR loads from",
                widget: {
                    type: "switch"
                },
                breadcrumbs: ["Services"],
                conditional: (_, mode) => !mode || mode === "flat"
            }
        }
    },

    service_featured: {
        default_value: "https://hyperlink.surf/featured-worlds.json",
        ui: {
            flat: {
                label: "Featured worlds file",
                description: "URL to fetch the list of featured worlds from",
                widget: {
                    type: "text",
                    placeholder: "https://hyperlink.surf/featured-worlds.json",
                    subtype_hint: "url",
                    width: "long"
                },
                breadcrumbs: ["Services"],
                conditional: (settings) => settings.service_override === true
            }
        }
    },

    service_search: {
        default_value: "https://search.hyperlink.surf",
        ui: {
            flat: {
                label: "Search service (WARNING: changing this will change where ^shortcodes link to!)",
                description: "URL to fetch the search index from",
                widget: {
                    type: "text",
                    placeholder: "https://search.hyperlink.surf",
                    subtype_hint: "url",
                    width: "long"
                },
                breadcrumbs: ["Services"],
                conditional: (settings) => settings.service_override === true
            }
        }
    },
    // TODO: put all default urls, repos, etc in a root consts file

    debug_ray_hits: {
        default_value: false,
        local_only: true
    },

    debug_clicks: {
        default_value: false,
        local_only: true
    },

    debug_touch: {
        default_value: false,
        local_only: true
    },

    debug_lights: {
        default_value: false,
        local_only: true
    },

    debug_colliders: {
        default_value: false,
        local_only: true
    },

    debug_groups: {
        default_value: false,
        local_only: true
    },

    debug_show_expression_ui: {
        default_value: false,
        local_only: true
    },

    debug_rerenders: {
        default_value: false,
        local_only: true
    },

    devtools_dangerously_allow_localhost_fetch: {
        default_value: false,
        local_only: true // TODO: store this in session storage so they have to re-enable it every time
    }
});

export type SettingKey = keyof typeof settings_def;

export type SettingKeyReturning<V extends Exclude<any, null>> = {
    [K in SettingKey]: (typeof settings_def)[K]["default_value"] extends V
        ? K
        : never;
}[SettingKey];


export interface SettingsTree {
    subtrees: Record<string, SettingsTree>;
    settings: Setting<any>[];
}

// TODO: hard limits on ranges that are clamped on read
