export interface ReportEventEnvelope<TKind extends string, TPayload> {
    source_id: string; // interaction or monitor id
    object_id: string; // owning object
    kind: TKind; // discriminator
    ts: number; // host-side event time
    payload: TPayload;
}

interface InteractedHand {
    part: "hand";
    handedness: "left" | "right";
}

interface InteractedHeadOrTorso {
    part: "head" | "torso";
}

type InteractedBodyPart = InteractedHand | InteractedHeadOrTorso;

export type InteractedPlayer = InteractedBodyPart & {
    type: "player"
}

export interface InteractedObject {
    type: "object";
    object_id: string;
    tags: string[];
}

export type Interacted = InteractedPlayer | InteractedObject;

export interface TriggerVolumeInteractionEnterPayload {
    type: "enter";
    interacted: Interacted;
    positioning?: {direction: "top" | "bottom" | "side", local_offset: { x: number; y: number; z: number }};
}

export interface TriggerVolumeInteractionExitPayload {
    type: "exit";
    interacted: Interacted;
}

export type TriggerVolumeInteractionPayload = TriggerVolumeInteractionEnterPayload | TriggerVolumeInteractionExitPayload;

interface GrabInteractionPayloadBase {
    type: "grab" | "release" | "proximity" | "trigger-start";
    handedness: "left" | "right";
}
interface GrabInteractionPayloadTriggerEnd {
    type: "trigger-end";
    handedness: "left" | "right" | null;
}
export type GrabInteractionPayload = GrabInteractionPayloadBase | GrabInteractionPayloadTriggerEnd;

export interface AxesMonitorPayload {
    axes: ("x" | "y" | "z")[];
    values: { x: number; y: number; z: number };
}

export interface PhysicsCollisionEnterPayload {
    type: "enter";
    other_object_id: string | null;
    contact_point: { x: number; y: number; z: number };
    contact_normal: { x: number; y: number; z: number };
    relative_velocity: { x: number; y: number; z: number };
    force: { x: number; y: number; z: number };
    impulse: { x: number; y: number; z: number };
}

export interface PhysicsCollisionExitPayload {
    type: "exit";
    other_object_id: string;
}

export type PhysicsCollisionPayload = PhysicsCollisionEnterPayload | PhysicsCollisionExitPayload;

export interface RaycastHit {
    // which ray of the pattern produced this hit, always 0 for a single ray
    ray_index: number;
    // order along that ray, 0 is nearest. only ever > 0 when piercing
    hit_index: number;

    distance: number;
    point: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };

    interacted: Interacted;
}

export interface RaycastResult {
    // groups every ray of one fire, so five pellets on one target are
    // distinguishable from five separate shots
    shot_id: string;
    // nearest first, then by ray, empty when every ray missed
    hits: RaycastHit[];
    // rays that reached max distance or were stopped by a non-target
    missed_rays: number;
}

export interface RaycastCastPayload extends RaycastResult {
    type: "cast";
}

// enter/exit style, emitted only when the nearest thing hit changes
// interacted is null when the ray stopped hitting anything
export interface RaycastTargetChangePayload {
    type: "target-change";
    shot_id: string;
    interacted: Interacted | null;
}

export type RaycastPayload = RaycastCastPayload | RaycastTargetChangePayload;

export interface BasketballHoopPrefabPayload {
    type: "scored"
    object_id?: string;
}

export interface ButtonPrefabPayload {
    type: "press" | "release";
    username: string | null;
}

interface GolfBallPrefabStruckPayload {
    type: "struck";
    velocity: { x: number; y: number; z: number };
}

interface GolfBallPrefabAtRestPayload {
    type: "at-rest";
    position: { x: number; y: number; z: number };
}

export type GolfBallPrefabPayload = GolfBallPrefabStruckPayload | GolfBallPrefabAtRestPayload;

export interface ButtonInputMonitorPayload {
    type: "press" | "release" | "hold";
    handedness?: "left" | "right";
}

export interface DistanceMonitorPayload {
    // enter fires as the pair moves into the range, leave as it moves back out
    type: "enter" | "leave";
    // the measured separation at the moment it crossed, in the monitor's plane
    distance: number;
}

export type ReportEventPayload =
    TriggerVolumeInteractionPayload
    | GrabInteractionPayload
    | AxesMonitorPayload
    | ButtonInputMonitorPayload
    | PhysicsCollisionPayload
    | BasketballHoopPrefabPayload
    | RaycastPayload
    | ButtonPrefabPayload
    | GolfBallPrefabPayload
    | DistanceMonitorPayload;

export type ReportEvent =
    | ReportEventEnvelope<"trigger-volume", TriggerVolumeInteractionPayload>
    | ReportEventEnvelope<"grab", GrabInteractionPayload>
    | ReportEventEnvelope<"pos-monitor", AxesMonitorPayload>
    | ReportEventEnvelope<"rot-monitor", AxesMonitorPayload>
    | ReportEventEnvelope<"lin-vel-monitor", AxesMonitorPayload>
    | ReportEventEnvelope<"ang-vel-monitor", AxesMonitorPayload>
    | ReportEventEnvelope<"physics-collision", PhysicsCollisionPayload>
    | ReportEventEnvelope<"basketball-hoop-prefab", BasketballHoopPrefabPayload>
    | ReportEventEnvelope<"button-input", ButtonInputMonitorPayload>
    | ReportEventEnvelope<"axis-input", AxesMonitorPayload>
    | ReportEventEnvelope<"button-prefab", ButtonPrefabPayload>
    | ReportEventEnvelope<"raycast", RaycastPayload>
    | ReportEventEnvelope<"golf-ball-prefab", GolfBallPrefabPayload>
    | ReportEventEnvelope<"distance-monitor", DistanceMonitorPayload>;
