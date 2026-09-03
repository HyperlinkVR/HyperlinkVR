export enum Layer {
    Default = 0,
    Reserved_LeftEye = 1,
    Reserved_RightEye = 2,
    PlayerModel_Head,
    PlayerModel_TorsoAndHands,
    MR_ForceForeground,
    MR_PlayerCapsule ,
    ThirdPerson_ForceHide,
    Vignette,
    Loader,
    HUD,
    NoVFX
}

export const compute_layer_mask = (layers: Layer[]): number => {
    return layers.reduce((mask, layer) => mask | (1 << layer), 0);
}
