import {glMatrix, mat4, quat, vec3} from "gl-matrix";
import {Transform} from "@hyperlinkvr/vr-engine-schemas";

glMatrix.setMatrixArrayType(Array);


// only relevant properties covered
interface GLTFNodeFull {
    name: string;
    translation: [number, number, number];
    rotation: [number, number, number, number]; // quaternion
    scale: [number, number, number];
    extras: Record<string, unknown>;
    matrix: number[];
    children: number[];
}

type GLTFNode = Partial<GLTFNodeFull>;

interface GLTFHeader {
    nodes: GLTFNode[];
}

const QUAT_IDENTITY = [0, 0, 0, 1] as [number, number, number, number];

const local_matrix = (node: GLTFNode) => {
    const mat = mat4.create();

    if (node.matrix) {
        mat4.copy(mat, node.matrix);
    } else {
        mat4.fromRotationTranslationScale(
            mat,
            node.rotation ?? QUAT_IDENTITY,
            node.translation ?? [0, 0, 0],
            node.scale ?? [1, 1, 1]
        );
    }

    return mat;
}

// collect the global transform by recursing tree
const resolve_world = (node_idx: number, nodes: GLTFNode[], parent_map: Map<number, number>, cache: Map<number, mat4>) => {
    const cached = cache.get(node_idx);
    if (cached) {
        return cached;
    }

    const local = local_matrix(nodes[node_idx]);
    const parent = parent_map.get(node_idx);
    const world = mat4.create();

    if (parent === undefined) {
        mat4.copy(world, local);
    } else {
        // parent (dot) local
        mat4.multiply(world, resolve_world(parent, nodes, parent_map, cache), local);
    }

    cache.set(node_idx, world);
    return world;
}

const decompose = (mat: mat4): Transform => {
    const position = vec3.create();
    const rotation = quat.create();
    const scale = vec3.create();
    mat4.getTranslation(position, mat);
    mat4.getRotation(rotation, mat);
    quat.normalize(rotation, rotation);   // getRotation doesn't divide scale out
    mat4.getScaling(scale, mat);
    return {
        position: position as [number, number, number],
        rotation: rotation as [number, number, number, number],
        scale: scale as [number, number, number],
    };
};

export interface Marker {
    name: string;
    transform: Transform;
    local_transform: Transform;
    properties: Record<string, unknown>;
}

const GLTF_MAGIC = 0x46546C67; // "glTF"
const JSON_MAGIC = 0x4E4F534A; // "JSON"
const OPEN_CURLY_MAGIC = 0x7B; // "{"

const get_markers_from_gltf_header = (header: string, name_regex: RegExp, remove_regex_match = true) => {
    const data: Partial<GLTFHeader> = JSON.parse(header);

    const nodes = data.nodes;
    if (!nodes) {
        console.warn("Markers GLTF contained no nodes!");
        return new Map<string, Marker>();
    }

    // build metadata for tree walk
    const parent_map = new Map<number, number>();
    nodes.forEach((n, i) => n.children?.forEach((c) => parent_map.set(c, i)));
    const cache = new Map<number, mat4>();

    const markers: Map<string, Marker> = new Map();
    nodes.forEach((node, node_idx) => {
        if (node.name && name_regex.test(node.name)) {
            const resolved_name = remove_regex_match ? node.name.replace(name_regex, "") : node.name;

            if (markers.has(resolved_name)) {
                throw new Error(`Duplicate marker name! Multiple markers share resolved name ${resolved_name}. Rename them in the file, or adjust the name_regex.`)
            }

            const resolved_local_transform: Transform = {
                position: node.translation ?? [0, 0, 0],
                rotation: node.rotation ?? QUAT_IDENTITY,
                scale: node.scale ?? [1, 1, 1]
            };

            const world_transform = resolve_world(node_idx, nodes, parent_map, cache);
            markers.set(resolved_name, {
                name: resolved_name,
                transform: decompose(world_transform),
                local_transform: resolved_local_transform,
                properties: node.extras ?? {}
            });
        }
    });

    return markers;
}

const decode_buffer = (buffer: ArrayBuffer | Uint8Array<ArrayBuffer>): string => {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer);
}

const extract_header_from_glb = (buffer: ArrayBuffer) => {
    const view = new DataView(buffer);

    const magic = view.getUint32(0, true);
    if (magic !== GLTF_MAGIC) {
        throw new Error("Invalid GLB file: Magic number does not match 'glTF'.");
    }

    // version should be 2
    const version = view.getUint32(4, true);
    if (version !== 2) {
        throw new Error(`Unsupported GLB version: ${version}. Expected 2/`);
    }

    // chunk 0 will be the json chunk
    const chunk_len = view.getUint32(12, true);
    const chunk_type = view.getUint32(16, true);

    if (chunk_type !== JSON_MAGIC) {
        throw new Error("Invalid GLB format: First chunk is not JSON.");
    }

    // extract json
    const json_view = new Uint8Array(buffer, 20, chunk_len);
    return decode_buffer(json_view);
}

// identifies if the file is a glTF (textual json file) or a glb (chunked binary glTF), provides no guarantee of correct contents
const identify_gltf_format = (buffer: ArrayBuffer) => {
    // too small to be anything reasonable
    if (buffer.byteLength < 4) {
        return null;
    }

    const view = new DataView(buffer);

    // glb contains the glTF magic number
    const magic = view.getUint32(0, true);
    if (magic === GLTF_MAGIC) {
        return "glb";
    }

    // look for an opening curly bracket up to 100 bytes in to duck type as json
    const uint8 = new Uint8Array(buffer);
    for (let i = 0; i < Math.min(uint8.length, 100); i++) {
        const byte = uint8[i];

        // found a "{"
        if (byte === OPEN_CURLY_MAGIC) {
            return "gltf";
        }

        // if this byte wasn't { or whitespace, and we haven't found the "{" yet, then it isn't gltf
        if (byte !== 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            break;
        }
    }

    // didn't find a "{"
    return null;
}

export const load_markers = async (url: string | URL, name_regex = /^marker_/i, remove_regex_match = true): Promise<Map<string, Marker>> => {
    const res = await fetch(url, {
        credentials: "omit"
    });

    if (!res.ok) {
        throw new Error(`Marker fetch failed: ${res.statusText}`);
    }

    const buffer = await res.arrayBuffer();
    const format = identify_gltf_format(buffer);

    if (!format) {
        throw new Error("Marker file is not a glTF or glb file.")
    }

    const header_str = format === "glb" ? extract_header_from_glb(buffer) : decode_buffer(buffer);
    return get_markers_from_gltf_header(header_str, name_regex, remove_regex_match);
}
