import "./shared.css";



import type { MessageChannel } from "@hyperlinkvr/core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

import {
    backend, content_message_engine,
    host_message_engine,
    set_current_url,
    set_dimensions,
    set_navigate_callback,
    SINGLE_TAB_ID
} from "./backend";


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

    const host_iframe_ref = useRef<HTMLIFrameElement>(null);
    const handle_host_iframe_load = useCallback(
        () => {
            host_message_engine.set_target_window(host_iframe_ref.current!.contentWindow!);
        },
        []
    );

    const content_iframe_ref = useRef<HTMLIFrameElement>(null);
    const handle_content_iframe_load = useCallback(
        () => {
            content_message_engine.set_target_window(content_iframe_ref.current!.contentWindow!);
        },
        []
    );

    const [input_url, setInputURL] = useState(url);

    return (
        <main className="h-screen w-screen flex flex-col">
            {!loaded && <p>Loading...</p>}
            <input type="url" value={input_url} onChange={(e) => setInputURL(e.target.value)} onBlur={() => setURL(input_url)} />
            <iframe name="hvr-host-frame" ref={host_iframe_ref} src={`./windows/vr_host?tab=${SINGLE_TAB_ID}`} allowFullScreen className="flex-1" onLoad={handle_host_iframe_load} />
            <iframe name="hvr-content-frame" ref={content_iframe_ref} src={url} className="hidden" onLoad={handle_content_iframe_load} />
        </main>
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
