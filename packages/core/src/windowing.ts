import type { WindowArguments } from "@hyperlinkvr/types";

export interface WindowArgumentsStrategy<S> {
    retrieve(): S;

    serialise(args: WindowArguments, serialise_opts?: Record<string, any>): S;
    deserialise(serialised: S): WindowArguments;
}
