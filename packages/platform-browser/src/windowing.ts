import type { WindowArguments } from "@hyperlinkvr/types";
import type { WindowArgumentsStrategy } from "@hyperlinkvr/core";

export class URLParamsWindowArgumentsStrategy implements WindowArgumentsStrategy<string> {
    retrieve(): string {
        return window.location.search.substring(1);
    }
    
    serialise(args: WindowArguments, opts?: {url?: string}): string {
        const serialised = new URLSearchParams(args).toString();
        if (!opts?.url) {
            return serialised;
        }

        return `${opts.url}?${serialised}`;
    }
    
    deserialise(serialised: string): WindowArguments {
        const params = new URLSearchParams(serialised);
        const args: WindowArguments = {};
        params.forEach((value, key) => {
            args[key] = value;
        });
        return args;
    }
}
