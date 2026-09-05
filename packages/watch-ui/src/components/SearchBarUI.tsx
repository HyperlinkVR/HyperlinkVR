import { useDebounce, useSearchStore, useServiceURLs } from "@hyperlinkvr/react";
import { Container, Text } from "@react-three/uikit";
import { useCallback, useEffect, useState } from "react";



import { useNavState } from "../contexts/NavStateContext";
import { ellipsis_truncate } from "../util/text";
import { AuthorWithVerification } from "./AuthorWithVerification";
import { FocusableButton } from "./FocusableButton";
import { SearchBar } from "./SearchBar";
import { WorldThumbnail } from "./WorldThumbnail";


export const SearchBarUI = ({search_mode, set_search_mode}: {search_mode: boolean, set_search_mode?: (mode: boolean) => void}) => {
    const { change_screen, replace_args, current_args } = useNavState();

    const { search: search_url } = useServiceURLs();

    const preload_search = useSearchStore((state) => state.preload_search);
    const preload_slugs = useSearchStore((state) => state.preload_slugs);

    const is_search_loading = useSearchStore((state) => state.is_search_loading);
    const is_slug_loading = useSearchStore((state) => state.is_slug_loading);

    const search = useSearchStore((state) => state.search);
    const slug_prefix_search = useSearchStore((state) => state.slug_prefix_search);

    const on_focus_change = useCallback(
        (is_focused: boolean) => {
            if (is_focused) {
                preload_search(search_url);
                preload_slugs(search_url);
            }
        },
        [search_url, preload_search, preload_slugs]
    );

    const [value, setValue] = useState(current_args.search_value ?? "");

    const on_input = useCallback(
        (new_value: string) => {
            setValue(new_value);

            // store value in arg state so back button can restore it when returning to search screen
            replace_args({search_value: new_value});
        },
        [change_screen, search_mode, set_search_mode]
    );

    useEffect(() => {
        // set search mode on mount and in response to value changes
        // this means a value set by args as well as typing will trigger search mode, and deleting the value will exit search mode
        if (value && !search_mode) {
            set_search_mode && set_search_mode(true);
        } else if (!value && search_mode) {
            set_search_mode && set_search_mode(false);
        }
    }, [search_mode, set_search_mode, value]);

    const debounced_value = useDebounce(value, 300, true);
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!debounced_value) {
            setResults([]);
            return;
        }

        setSearching(true);

        if (debounced_value.startsWith("^")) {
            // slug search
            const slug_query = debounced_value.slice(1);
            slug_prefix_search(search_url, slug_query)
                .then((res) => {
                    setResults(res);
                    setSearching(false);
                })
                .catch((err) => {
                    console.error("Slug search failed:", err);
                    setResults([]);
                    setSearching(false);
                });
        } else {
            // fuzzy search
            search(search_url, debounced_value)
                .then((res) => {
                    setResults(res);
                    setSearching(false);
                })
                .catch((err) => {
                    console.error("Search failed:", err);
                    setResults([]);
                    setSearching(false);
                });
        }

    }, [debounced_value, search_url, search]);

    return (
        <>
            <SearchBar value={value} on_change={on_input} on_focus_change={on_focus_change} />

            {search_mode && value && (
                searching ? (
                    <Text>
                        {is_search_loading || is_slug_loading ? "Loading search indices..." : "Searching..."}
                    </Text>
                ) : (
                    <SearchResults results={results} />
               )
            )}
        </>
    );
};

const SearchResults = ({results}: {results: any[]}) => {
    const { change_screen } = useNavState();

    const on_result_click = useCallback(
        (result: any) => {
            change_screen("world", {url: result.url});
        },
        [change_screen]
    );

    return (
        <Container width="100%" flexDirection="column" alignItems="flex-start" justifyContent="flex-start" gap={8} marginTop={8}>
            {results.length === 0 ? (
                <Text>No results found.</Text>
            ) : (
                results.map((result, index) => (
                    <SearchResultItem key={index} result={result} on_click={on_result_click} />
                ))
            )}
        </Container>
    );
}

const SearchResultItem = ({result, on_click}: {result: any, on_click?: (result: any) => void}) => (
    <FocusableButton on_press={on_click ? () => on_click(result) : undefined} width="100%" height={100} flexDirection="row" alignItems="center" justifyContent="flex-start" padding={16} gap={16}>
        <WorldThumbnail
            thumbnail={result.thumbnail}
            container_props={{
                height: "100%",
                aspectRatio: 16 / 9,
                borderRadius: 8,
                overflow: "hidden",
                flexShrink: 0,
            }}
            image_props={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
            }}
        />

        <Container flexDirection="column" alignItems="flex-start" justifyContent="flex-start" gap={8}>
            <Container flexDirection="row" alignItems="center" justifyContent="flex-start" gap={6}>
                <Text>{result.title}</Text>
                <Text color="#444444">(^{result.id ?? result.slug})</Text>

                {result.author && <AuthorWithVerification author={{username: result.author, signature: result.author_sig}} url={result.url} />}
            </Container>

            <Text fontSize={12}>{result.description ? ellipsis_truncate(result.description, 50) : "No description provided."}</Text>
            <Text fontSize={12} color="#666666">{result.tags && result.tags.length > 0 ? `Tags: ${result.tags.map((tag: string) => `#${tag}`).join(", ")}` : "No tags provided."}</Text>
        </Container>
    </FocusableButton>
);

// TODO: need ingame vr keyboard
