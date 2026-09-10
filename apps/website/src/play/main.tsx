import "./shared.css";



import type { MessageChannel } from "@hyperlinkvr/core";
import { CONTENT_FRAME_NAME } from "@hyperlinkvr/types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

import {
    attach_content_window,
    attach_host_window,
    backend,
    navigate_from_ui,
    notify_content_loaded,
    set_current_url,
    set_dimensions,
    set_navigate_back_callback,
    set_navigate_callback,
    SINGLE_TAB_ID
} from "./backend";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import { NavigationBar } from "./components/NavigationBar";


const App = () => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const cleanup_meta = backend.add_hook("on-meta", console.log);
        const cleanup_connect = backend.add_hook("alongside-connect", (channel: MessageChannel) => {
            if (channel.name.startsWith("hvr-ready")) {
                setLoaded(true);
            }
        });

        return () => {
            cleanup_meta();
            cleanup_connect();
        }
    }, []);

    const [url, setURL] = useState(location.origin);

    useEffect(() => {
        set_dimensions(1920, 1080);
    }, []);

    useEffect(() => {
        set_current_url(url);
    }, [url]);

    useEffect(() => {
        set_navigate_callback(setURL);
    }, []);

    const content_iframe_ref = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        set_navigate_back_callback(() => {
            content_iframe_ref.current?.contentWindow?.history.back();
        });
    }, []);

    const handle_host_iframe = useCallback((frame: HTMLIFrameElement | null) => {
        if (frame?.contentWindow) {
            attach_host_window(frame.contentWindow);
        }
    }, []);

    const handle_content_iframe = useCallback((frame: HTMLIFrameElement | null) => {
        content_iframe_ref.current = frame;
        if (frame?.contentWindow) {
            attach_content_window(frame.contentWindow);
        }
    }, []);

    return (
        <main className="h-screen w-screen flex flex-col">
            {!loaded && <div className="h-screen w-screen fixed inset-0 bg-slate-800 flex flex-col items-center justify-center">
                <LoadingSpinner className="text-white" />
            </div>}

            <NavigationBar commit_url={navigate_from_ui} initial_url={url} />

            <iframe name="hvr-host-frame" ref={handle_host_iframe} src={`./windows/vr_host/?tab=${SINGLE_TAB_ID}`} allowFullScreen className="flex-1" />
            <iframe name={CONTENT_FRAME_NAME} ref={handle_content_iframe} src={url} className="hidden" onLoad={notify_content_loaded} />
        </main>
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// TODO: split play to a diff package / subdomain, it adds a lot of deps to the web build
