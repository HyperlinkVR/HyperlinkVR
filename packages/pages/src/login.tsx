import { check_stored_private_key, is_private_key_stored, parse_identity, resolve_identity, signup_static, store_auth_session, type ActionableMethods, type IdentityResolutionData, type LoginAction, type LoginMethod } from "@hyperlinkvr/auth";
import {type Identity} from "@hyperlinkvr/types";
import { useDebounce, useStorageEngine } from "@hyperlinkvr/react";
import { CenteredLoadingSpinner } from "@hyperlinkvr/ui-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";


const LandingPage = ({
    username,
    setUsername,
    actionable_methods,
    on_path_selected,
    open_for_registration,
    method,
    error
}: {
    username: string;
    setUsername: (username: string) => void;
    actionable_methods: ActionableMethods;
    method: LoginMethod | null;
    on_path_selected: (method: LoginMethod, action: LoginAction) => void;
    open_for_registration?: boolean;
    error: string | null;
}) => {
    // if a method is already selected, only show the actions for that method
    const filtered_methods = useMemo(() => {
        if (method) {
            return {
                [method]: actionable_methods[method]
            };
        }

        return actionable_methods;
    }, [actionable_methods, method]);

    const closed = useMemo(
        () =>
            open_for_registration === false ||
            !Object.keys(filtered_methods).length,
        [open_for_registration, filtered_methods]
    );

    return (
        <>
            <h1>Login Window</h1>
            <input
                type="text"
                placeholder="user@host.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />
            {error && <p style={{ color: "red" }}>{error}</p>}
            <div>
                {Object.entries(filtered_methods).map(([method, actions]) => (
                    <div key={method}>
                        <h2>{method}</h2>
                        {actions.map((action) => (
                            <button
                                disabled={action === "signup" && closed}
                                key={action}
                                onClick={() =>
                                    on_path_selected(
                                        method as LoginMethod,
                                        action as LoginAction
                                    )
                                }>
                                {action === "signup" && closed
                                    ? "Host is not open for registration"
                                    : action}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </>
    );
};

interface FormProps {
    username: string;
    resolved_identity?: IdentityResolutionData | null;
}

const LoginFormStatic = ({ username, resolved_identity }: FormProps) => {
    const local_storage = useStorageEngine("local");
    const session_storage = useStorageEngine("session");

    const [success, setSuccess] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [show_password_input, setShowPasswordInput] = useState(false);

    const identity = useMemo(() => {
        const parsed = parse_identity(username);
        if (!parsed.success) {
            alert("Invalid username format. Please try again in a new window.");
            window.close();
            return;
        }

        return parsed.identity;
    }, [username])!;

    // on first launch, check if the user is already in a session state, and if so check and skip ahead
    useEffect(() => {
        if (!is_private_key_stored(local_storage)) {
            setShowPasswordInput(true);
            return;
        }

        if (!resolved_identity?.public_key) {
            setShowPasswordInput(true);
            return;
        }

        check_stored_private_key(identity, {
            local: local_storage,
            //session: session_storage
        }).then(async (success) => {
            if (success) {
                if (!resolved_identity?.public_key) {
                    setShowPasswordInput(true);
                    return;
                }

                await store_auth_session(
                    {
                        identity,
                        method: "static",
                        public_key: resolved_identity.public_key.key as JsonWebKey,
                        authed_at: Date.now()
                    },
                    local_storage
                );

                setSuccess(true);
                setTimeout(() => {
                    window.close();
                }, 3000);
            }
        }).catch((err) => {
            console.error("Error checking stored private key:", err);
            setShowPasswordInput(true);
        });
    }, [identity, local_storage, session_storage]);

    const submit = useCallback(() => {
        console.log(resolved_identity)
        if (!resolved_identity?.public_key) {
            setSuccess(false);
            setTimeout(() => {
                window.close();
            }, 3000);
            return;
        }

        check_stored_private_key(
            identity,
            {
                local: local_storage,
                //session: session_storage
            },
            { password }
        ).then(async (success) => {
            if (success) {
                if (!resolved_identity?.public_key) {
                    setSuccess(false);
                    setTimeout(() => {
                        window.close();
                    }, 3000);
                    return;
                }

                await store_auth_session(
                    {
                        identity,
                        method: "static",
                        public_key: resolved_identity.public_key.key as JsonWebKey,
                        authed_at: Date.now()
                    },
                    local_storage
                );
            }

            setSuccess(success);
            setTimeout(() => {
                window.close();
            }, 3000);
        }).catch((err) => {
            setSuccess(false);
            setTimeout(() => {
                window.close();
            }, 3000);
            // TODO: try again
        });
    }, [identity, password, local_storage, session_storage]);

    if (success === true) {
        return <p>Login successful!</p>;
    } else if (success === false) {
        return <p>Login failed. Please try again in a new window.</p>;
    }

    if (success === null && !show_password_input) {
        return <CenteredLoadingSpinner />;
    }

    return (
        <>
            <h2>Login as {username}</h2>
            <input
                type="password"
                placeholder="Passphrase"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={submit}>Login</button>
        </>
    );
};

const LoginFormJWT = ({ username }: FormProps) => {
    return <p>Not implemented yet!</p>;
};

const LoginFormPasskey = ({ username }: FormProps) => {
    return <p>Not implemented yet!</p>;
}

const SignupFormStaticManual = ({ username, resolved_identity }: FormProps) => {
    const local_storage = useStorageEngine("local");

    const [generating, setGenerating] = useState(false);
    const generating_lock_ref = useRef(false);
    const [passphrase, setPassphrase] = useState("");

    const hint = useMemo(() => {
        if (!resolved_identity) {
            return null;
        }

        if (!resolved_identity.auth_manifest) {
            return null;
        }

        return resolved_identity.auth_manifest.static_submit_hint;
    }, [resolved_identity]);

    const identity = useMemo(() => {
        const parsed = parse_identity(username);
        if (!parsed.success) {
            alert("Invalid username format. Please try again in a new window.");
            window.close();
            return;
        }

        return parsed.identity;
    }, [username])!;

    const generate_and_download_record = useCallback(async () => {
        if (!resolved_identity) {
            return;
        }

        if (await local_storage.get(`keystore:${username}`)) {
            alert(
                "A static identity record already exists for this username! Try logging in!"
            );
            return;
        }

        if (generating_lock_ref.current) {
            return;
        }
        generating_lock_ref.current = true;
        setGenerating(true);

        const {static_record, password} = await signup_static(identity, local_storage);

        // download the record as a json file
        const blob = new Blob([JSON.stringify(static_record, null, 4)], {
            type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${identity.name}.json`;
        a.click();
        URL.revokeObjectURL(url);

        setPassphrase(password);
        setGenerating(false);
    }, [username, resolved_identity, local_storage, identity]);

    if (generating) {
        return <CenteredLoadingSpinner />;
    }

    if (passphrase) {
        return (
            <>
                <h2>Account created for {username}!</h2>
                <hr />
                <p>
                    Your static identity record has been downloaded.
                </p>
                <p>
                    This is your passphrase:
                </p>
                <p style={{ fontWeight: "bold", fontSize: "1.2em", fontFamily: "monospace" }}>
                    {passphrase}
                </p>
                <p>
                    Please store this passphrase in a secure place, such as a password manager. If you lose it, you may not be able to log in again.
                </p>
                <hr />
                {hint && (
                    <div>
                        As a reminder, the host has provided the following instructions for submitting your static identity record:
                        <p>{hint}</p>
                    </div>
                )}
                <p>
                    Once your identity is available on the host, you can log in using your username and passphrase.
                </p>
            </>
        );
    }

    return (
        <>
            <h2>You're signing up for an account at {identity.host}</h2>

            {hint && (
                <div>
                    The host has provided the following instructions for
                    submitting your static identity record:
                    <p>{hint}</p>
                </div>
            )}

            <button onClick={generate_and_download_record}>
                Sign up and download record for {username}
            </button>

            <p>Get ready to store a passphrase!</p>
        </>
        // <Suspense fallback={<LoadingSpinner />}>
        //     <h1>Creating account as {username}</h1>
        //     <SchemaForm
        //         schema={StaticIdentityRecordSchema}
        //         title="Create Static Identity Record"
        //         defaultConstValues={{ identity: username, created_at: 0, status: "active" }}
        //         onSubmit={(data) => {
        //             console.log("Submitted data:", data);
        //         }}
        //     />
        // </Suspense>
    );
};

const SignupFormStatic = (props: FormProps) => {
    if (
        props.resolved_identity?.auth_manifest?.open_for_registration === false
    ) {
        return <p>Host is not open for registration</p>;
    }

    return <SignupFormStaticManual {...props} />;
};

const SignupFormJWT = (props: FormProps) => {
    return <LoginFormJWT {...props} />;
};

const SignupFormPasskey = (props: FormProps) => {
    return <p>Not implemented yet!</p>;
}

type FormGroup = Record<LoginMethod, React.FC<FormProps>>;

type Forms = Record<LoginAction, FormGroup>;

const FORMS: Forms = {
    login: {
        static: LoginFormStatic,
        jwt: LoginFormJWT,
        passkey: LoginFormPasskey
    },
    signup: {
        static: SignupFormStatic,
        jwt: SignupFormJWT,
        passkey: SignupFormPasskey
    }
};

export const LoginPage = () => {
    const [action, setAction] = useState<LoginAction | null>(null);
    const [method, setMethod] = useState<LoginMethod | null>(null);
    const [actionable_methods, setActionableMethods] =
        useState<ActionableMethods>({});

    const [username, setUsername] = useState("");
    const debounced_username = useDebounce(username, 500);

    const [resolved_identity, setResolvedIdentity] =
        useState<IdentityResolutionData | null>(null);

    const [error, setError] = useState<string | null>(null);

    const storage = useStorageEngine("local");

    const do_resolve_identity = useCallback(
        (identity: Identity) => {
            return resolve_identity(identity, storage);
        },
        [storage]
    );

    // optimistically clear when undebounced username changes
    useEffect(() => {
        // TODO: clear function
        setResolvedIdentity(null);
        setActionableMethods({});
        setAction(null);
        setMethod(null);
        setError(null);
    }, [username]);

    // when debounced username changes, resolve identity and present actions
    const resolving_username_ref = useRef<string | null>(null);
    useEffect(() => {
        resolving_username_ref.current = debounced_username;

        if (!debounced_username) {
            setResolvedIdentity(null);
            setActionableMethods({});
            setAction(null);
            setMethod(null);
            return;
        }

        const identity_parse = parse_identity(debounced_username);
        if (identity_parse.success === false) {
            if (resolving_username_ref.current !== debounced_username) {
                return;
            }

            setError(identity_parse.error);
            setActionableMethods({});
            setAction(null);
            setMethod(null);
            return;
        }

        do_resolve_identity(identity_parse.identity).then((result) => {
            if (resolving_username_ref.current !== debounced_username) {
                return;
            }

            if (result.resolved === false) {
                setError(result.error || "Failed to resolve identity");
                setActionableMethods({});
                setAction(null);
                setMethod(null);
                return;
            }

            setActionableMethods(result.allowed);
            setResolvedIdentity(result);
            setError(null);

            // if only one method is allowed, autoselect it
            const allowed_methods = Object.keys(
                result.allowed
            ) as LoginMethod[];

            let local_method: LoginMethod | null = null;
            if (allowed_methods.length === 1) {
                local_method = allowed_methods[0]!;
            } else {
                local_method = null;
            }

            setMethod(local_method);

            // // if only one action is allowed for the selected method, autoselect it
            // if (local_method) {
            //     const allowed_actions = result.allowed[local_method];
            //     if (allowed_actions.length === 1) {
            //         setAction(allowed_actions[0]);
            //     } else {
            //         setAction(null);
            //     }
            // } else {
            //     setAction(null);
            // }
        });
    }, [debounced_username, parse_identity, do_resolve_identity]);

    const FormComponent = useMemo(() => {
        if (!action || !method) {
            return null;
        }

        return FORMS[action][method];
    }, [action, method]);

    const on_path_selected = useCallback(
        (selected_method: LoginMethod, selected_action: LoginAction) => {
            setMethod(selected_method);
            setAction(selected_action);
        },
        []
    );

    return (
        <div>
            {FormComponent ? (
                <FormComponent
                    username={username}
                    resolved_identity={resolved_identity}
                />
            ) : (
                <LandingPage
                    username={username}
                    setUsername={setUsername}
                    actionable_methods={actionable_methods}
                    open_for_registration={
                        resolved_identity?.auth_manifest?.open_for_registration
                    }
                    method={method}
                    on_path_selected={on_path_selected}
                    error={error}
                />
            )}
        </div>
    );
};
