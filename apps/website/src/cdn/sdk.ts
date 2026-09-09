import * as sdk from "@hyperlinkvr/web-sdk";

const { _bind_messages, ...sdk_rest } = sdk;

_bind_messages();

Object.defineProperty(window, "hyperlinkvr", {
    value: sdk_rest,
    writable: false,
    configurable: false
});
