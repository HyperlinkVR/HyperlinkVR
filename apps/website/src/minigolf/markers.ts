import type * as hvr from "@hyperlinkvr/web-sdk";

type MarkerMap = Map<string, hvr.markers.Marker>;

let all_markers: MarkerMap | null = null;

// more efficient to load all markers and use subset rather than load multiple times with different regexes, so we don't have to trust the browser cache
export const load_all_markers = async (offset_pos?: [number, number, number]) => {
    all_markers = await hyperlinkvr.markers.load("./course.glb", {
        transform_offset: {
            position: offset_pos || [0, 0, 0]
        },
    });
}

let hole_markers: MarkerMap | null = null;

export const get_hole_markers = () => {
    if (!all_markers) {
        throw new Error("Markers not loaded yet");
    }

    if (!hole_markers) {
        hole_markers = hyperlinkvr.markers.subset(all_markers, /^hole_/i);
    }

    return hole_markers;
}

let start_markers: MarkerMap | null = null;

export const get_start_markers = () => {
    if (!all_markers) {
        throw new Error("Markers not loaded yet");
    }

    if (!start_markers) {
        start_markers = hyperlinkvr.markers.subset(all_markers, /^start_/i);
    }

    return start_markers;
}

export const get_marker = (name: string) => {
    if (!all_markers) {
        throw new Error("Markers not loaded yet");
    }

    const marker = all_markers.get(name);
    if (!marker) {
        throw new Error(`Marker ${name} not found`);
    }

    return marker;
}

export const get_custom_marker_subset = (name_regex: RegExp, remove_regex_match = true) => {
    if (!all_markers) {
        throw new Error("Markers not loaded yet");
    }

    return hyperlinkvr.markers.subset(all_markers, name_regex, remove_regex_match);
}
