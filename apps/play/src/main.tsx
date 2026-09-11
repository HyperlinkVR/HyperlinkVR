


import "./shared.css";



import type { MessageChannel } from "@hyperlinkvr/core";
import { CONTENT_FRAME_NAME } from "@hyperlinkvr/types";
import { LoadingSpinner } from "@hyperlinkvr/ui-dom";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";



import { attach_content_window, attach_host_window, backend, navigate_from_ui, notify_content_loaded, set_current_url, set_dimensions,
    set_iframe_window_handler, set_navigate_back_callback, set_navigate_callback, SINGLE_TAB_ID } from "./backend";
import { NavigationBar } from "./components/NavigationBar";
import { SquareButton } from "./components/SquareButton";
import { X } from "lucide-react";


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

    const [url, setURL] = useState(location.hash ? location.hash.substring(1) : location.origin);

    // TODO: should there be a confirm prompt if navigating from hash or is it obvious enough

    useEffect(() => {
        location.hash = `#${url}`;
    }, [url]);

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

    // TODO: split to component
    const window_iframe_ref = useRef<HTMLIFrameElement>(null);
    const window_closed = useRef(true);
    const [window_iframe_url, setWindowIFrameURL] = useState<string | null>(null);
    const on_iframe_window_requested = useCallback(
        (url: string) => {
            setWindowIFrameURL(url);
            window_closed.current = false;

            return {
                win: window_iframe_ref.current!.contentWindow!,
                is_closed: () => window_closed.current
            };
        },
        []
    );

    useEffect(() => {
        set_iframe_window_handler(on_iframe_window_requested);
    }, [on_iframe_window_requested]);

    return (
        <main className="h-screen w-screen flex flex-col">
            {!loaded && <div className="h-screen w-screen fixed inset-0 bg-slate-800 flex flex-col items-center justify-center">
                <LoadingSpinner className="text-white" />
            </div>}

            <NavigationBar on_url_submit={navigate_from_ui} initial_url={url} />

            <iframe name="hvr-host-frame" ref={handle_host_iframe} src={`./windows/vr_host/?tab=${SINGLE_TAB_ID}`} allowFullScreen className="flex-1" />
            <iframe name={CONTENT_FRAME_NAME} ref={handle_content_iframe} src={url} className="hidden" onLoad={notify_content_loaded} />

            <div className={`h-screen w-screen fixed inset-0 bg-slate-800 ${window_iframe_url ? "flex flex-col items-end justify-center" : "hidden"}`} aria-hidden={!window_iframe_url} role="dialog">
                <SquareButton label={<X />} on_click={() => {window_closed.current = true; setWindowIFrameURL(null)}} title="Close window" className=" h-10 transition bg-gray-500 hover:bg-red-600" />
                <iframe name="hvr-window-frame" ref={window_iframe_ref} src={window_iframe_url || "about:blank"} className="w-full h-full" />
            </div>
        </main>
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

// TODO: why is world env iffy?
// TODO: iwer shimming
// TODO: svg nest error again on published only? but the dep should be patched?
