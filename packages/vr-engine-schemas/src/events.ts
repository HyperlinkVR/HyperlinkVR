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

type InteractedPlayer = InteractedBodyPart & {
    type: "player"
}

interface InteractedObject {
    type: "object";
    object_id: string;
    tags: string[];
}

export interface TriggerVolumeInteractionEnterPayload {
    type: "enter";
    interacted: InteractedPlayer | InteractedObject;
    positioning?: {direction: "top" | "bottom" | "side", local_offset: { x: number; y: number; z: number }};
}

export interface TriggerVolumeInteractionExitPayload {
    type: "exit";
    interacted: InteractedPlayer | InteractedObject;
}

export type TriggerVolumeInteractionPayload = TriggerVolumeInteractionEnterPayload | TriggerVolumeInteractionExitPayload;

export interface GrabInteractionPayload {
    type: "grab" | "release" | "proximity";
    handedness: "left" | "right";
}

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

export interface BasketballHoopPrefabPayload {
    type: "scored"
    object_id?: string;
}

export interface ButtonInputMonitorPayload {
    type: "press" | "release" | "hold";
    handedness?: "left" | "right";
}

export type ReportEventPayload = TriggerVolumeInteractionPayload | GrabInteractionPayload | AxesMonitorPayload | ButtonInputMonitorPayload | PhysicsCollisionPayload | BasketballHoopPrefabPayload;

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
    | ReportEventEnvelope<"axis-input", AxesMonitorPayload>;

