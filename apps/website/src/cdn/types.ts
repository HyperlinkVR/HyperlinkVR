export interface QueuedCall {
    path: string[];
    args: any[];
    resolve: (val: any) => void;
    reject: (err: any) => void;
}

