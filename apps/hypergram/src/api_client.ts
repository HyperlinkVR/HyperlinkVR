import {initClient} from "@ts-rest/core";
import { api_v1_read_contract, api_v1_write_contract } from "@hyperlinkvr/hypergram-schemas/v1";

// reads are public and static, so one client per host keyed by the host's manifest base_url
export const read_client = (base_url: string) => initClient(api_v1_read_contract, {
    baseUrl: base_url.replace(/\/$/, "")
});

// writes go to the manifest's write.base_url, the signature headers are per request as they sign the body
export const write_client = (write_base_url: string) => initClient(api_v1_write_contract, {
    baseUrl: write_base_url.replace(/\/$/, "")
});
