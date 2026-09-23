import { api_v1_auth_contract, api_v1_read_contract, api_v1_write_contract } from "@hyperlinkvr/hypergram-schemas/v1";
import { initClient } from "@ts-rest/core";

import config from "../config.json";

if (!config || !config.read_api_base_url) {
    throw new Error("Define read_api_base_url in config.json!");
}

export const read_client = (base_url: string = config.read_api_base_url) => initClient(api_v1_read_contract, {
    baseUrl: base_url.replace(/\/$/, "")
});

export const write_client = (base_url: string) =>
    initClient(api_v1_write_contract, {
        baseUrl: base_url.replace(/\/$/, ""),
        baseHeaders: {
            Authorization: () => {
                const token = localStorage.getItem("token");
                return token ? `Bearer ${token}` : "";
            }
        }
    });

export const auth_client = (base_url: string) =>
    initClient(api_v1_auth_contract, {
        baseUrl: base_url.replace(/\/$/, ""),
    });
