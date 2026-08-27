import { useEffect, useState } from "react";

export const useActiveTab = (): chrome.tabs.Tab | null => {
    const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error fetching active tab:",
                    chrome.runtime.lastError
                );
                return;
            }

            if (tabs.length > 0) {
                setTab(tabs[0]!);
            }
        });
    }, []);

    return tab;
};
