import { execSync, spawn } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";


const HOST_NAME = "surf.hyperlink.discord_rpc";
const EXTENSION_ID_DEV = "fjmemngcdmokahnlanbkljldfmnhagbf";
const EXTENSION_ID_PROD = "dpiedhlnbehmphhiihhgibaodpbhdbln";

const OP_HANDSHAKE = 0;
const OP_HEARTBEAT = 1;

interface NativeManifest {
    name: string;
    description: string;
    path: string;
    type: "stdio";
    allowed_origins: string[];
}

interface DiscordActivity {
    details?: string;
    state?: string;
    timestamps?: { start?: number; end?: number };
    assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
    };
    buttons?: { label: string; url: string }[];
    [key: string]: unknown;
}

interface ExtensionMessage {
    client_id?: string;
    activity?: DiscordActivity | null;
}

interface DiscordFrame {
    cmd?: string;
    evt?: string | null;
    data?: unknown;
    nonce?: string | null;
    [key: string]: unknown;
}

const wait_for_keypress = async (): Promise<string> => {
    return new Promise((resolve) => {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.once("data", (data: Buffer) => {
            const key = data.toString();

            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
            process.stdin.pause();

            // Handle Ctrl+C (SIGINT) gracefully
            if (key === "\u0003") {
                process.exit(0);
            }

            resolve(key);
        });
    });
}

interface InstallPaths {
    install_dir: string;
    manifest_path: string;
    installed_exe_path: string;
}

const REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;

const get_install_paths = (): InstallPaths => {
    // basename of the currently running exe; on install the binary is copied
    // into install_dir under this name, on uninstall the whole dir is removed
    const exe_name = path.basename(process.execPath);

    let install_dir: string;
    let manifest_path: string;

    if (process.platform === "win32") {
        install_dir = path.join(
            process.env.LOCALAPPDATA || os.homedir(),
            HOST_NAME
        );
        manifest_path = path.join(install_dir, "manifest.json");
    } else if (process.platform === "darwin") {
        install_dir = path.join(
            os.homedir(),
            "Library",
            "Application Support",
            HOST_NAME
        );
        manifest_path = path.join(
            os.homedir(),
            "Library",
            "Application Support",
            "Google",
            "Chrome",
            "NativeMessagingHosts",
            `${HOST_NAME}.json`
        );
    } else {
        install_dir = path.join(os.homedir(), ".local", "share", HOST_NAME);
        manifest_path = path.join(
            os.homedir(),
            ".config",
            "google-chrome",
            "NativeMessagingHosts",
            `${HOST_NAME}.json`
        );
    }

    return {
        install_dir,
        manifest_path,
        installed_exe_path: path.join(install_dir, exe_name)
    };
};

const is_installed = (paths: InstallPaths): boolean =>
    fs.existsSync(paths.manifest_path);

const run_install = (paths: InstallPaths) => {
    const source_exe = process.execPath;

    fs.mkdirSync(paths.install_dir, { recursive: true });
    fs.mkdirSync(path.dirname(paths.manifest_path), { recursive: true });

    // copy binary to app data folder if it's not already running from there
    if (path.resolve(source_exe) !== path.resolve(paths.installed_exe_path)) {
        fs.copyFileSync(source_exe, paths.installed_exe_path);
        if (process.platform !== "win32") {
            fs.chmodSync(paths.installed_exe_path, 0o755);
        }
    }

    // create manifest pointing to the copied binary path
    const manifest: NativeManifest = {
        name: HOST_NAME,
        description: "Discord Rich Presence Host for HyperlinkVR",
        path: paths.installed_exe_path,
        type: "stdio",
        allowed_origins: [
            `chrome-extension://${EXTENSION_ID_DEV}/`,
            `chrome-extension://${EXTENSION_ID_PROD}/`
        ]
    };

    fs.writeFileSync(paths.manifest_path, JSON.stringify(manifest, null, 2));

    if (process.platform === "win32") {
        execSync(`reg add "${REGISTRY_KEY}" /ve /d "${paths.manifest_path}" /f`);
    }
};

const run_uninstall = (paths: InstallPaths) => {
    if (process.platform === "win32") {
        try {
            execSync(`reg delete "${REGISTRY_KEY}" /f`, { stdio: "ignore" });
        } catch {
            // key already absent
        }
    }

    try {
        fs.rmSync(paths.manifest_path, { force: true });
    } catch {
        // ignore
    }

    const running_inside = path
        .resolve(process.execPath)
        .startsWith(path.resolve(paths.install_dir) + path.sep);

    if (running_inside && process.platform === "win32") {
        // can't delete our own running exe on Windows, schedule a detached cleanup that runs once this process has exited and released the lock
        const child = spawn(
            "cmd.exe",
            ["/c", `timeout /t 2 >nul & rmdir /s /q "${paths.install_dir}"`],
            { detached: true, stdio: "ignore", windowsHide: true }
        );
        child.unref();
    } else {
        try {
            fs.rmSync(paths.install_dir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }
};

const exit_prompt = async (code: number): Promise<never> => {
    process.stdout.write("Press any key to exit...");
    await wait_for_keypress();
    console.log();
    process.exit(code);
};

const install_flow = async (paths: InstallPaths, is_update: boolean) => {
    try {
        run_install(paths);
        console.log(
            `\nSuccess! ${HOST_NAME} ${is_update ? "updated" : "installed"} and registered for Chrome.`
        );
        console.log("You can safely delete this executable.\n");
    } catch (err) {
        console.error(
            `${is_update ? "Update" : "Installation"} failed:`,
            (err as Error).message
        );
        await exit_prompt(1);
    }
    await exit_prompt(0);
};

const uninstall_flow = async (paths: InstallPaths) => {
    try {
        run_uninstall(paths);
        console.log(`\n${HOST_NAME} has been removed.`);
        console.log(
            "Discord Rich Presence for HyperlinkVR is now uninstalled.\n"
        );
    } catch (err) {
        console.error("Uninstall failed:", (err as Error).message);
        await exit_prompt(1);
    }
    await exit_prompt(0);
};

const run_host = () => {
    let ipc_socket: net.Socket | null = null;
    let current_client_id: string | null = null;
    let handshake_done = false;
    let pending_activity: DiscordActivity | null = null;

    // read length-prefixed json from chrome stdin
    let input_buf = Buffer.alloc(0);
    process.stdin.on("data", (chunk: Buffer) => {
        input_buf = Buffer.concat([input_buf as any, chunk]);
        while (input_buf.length >= 4) {
            const len = input_buf.readUInt32LE(0);
            if (input_buf.length >= 4 + len) {
                const msg_buf = input_buf.subarray(4, 4 + len);
                input_buf = input_buf.subarray(4 + len);
                const data = JSON.parse(
                    msg_buf.toString("utf8")
                ) as ExtensionMessage;
                handle_extension_message(data);
            } else {
                break;
            }
        }
    });

    const get_ipc_path = () => {
        if (process.platform === "win32") return "\\\\.\\pipe\\discord-ipc-0";
        const env = process.env;
        const sysDir = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || "/tmp";
        return path.join(sysDir, "discord-ipc-0");
    };

    const connect_to_discord = (client_id: string) => {
        if (ipc_socket && current_client_id === client_id) {
            if (handshake_done) flush_activity();
            return;
        }

        // different client id or no socket
        if (ipc_socket) {
            ipc_socket.destroy();
            ipc_socket = null;
        }
        handshake_done = false;
        current_client_id = client_id;

        const socket = net.connect(get_ipc_path());
        ipc_socket = socket;

        const cleanup = () => {
            if (ipc_socket) {
                ipc_socket.destroy();
                ipc_socket = null;
            }
            process.exit(0);
        };

        // chrome closes stdin when the extension or Chrome shuts down
        process.stdin.on("end", cleanup);
        process.stdin.on("close", cleanup);
        process.stdin.on("error", cleanup);

        let read_buf = Buffer.alloc(0);
        socket.on("data", (chunk: Buffer) => {
            read_buf = Buffer.concat([read_buf as any, chunk]);
            while (read_buf.length >= 8) {
                const op = read_buf.readInt32LE(0);
                const len = read_buf.readInt32LE(4);
                if (read_buf.length < 8 + len) break;
                const payload_buf = read_buf.subarray(8, 8 + len);
                read_buf = read_buf.subarray(8 + len);

                let payload: DiscordFrame;
                try {
                    payload = JSON.parse(
                        payload_buf.toString("utf8")
                    ) as DiscordFrame;
                } catch {
                    continue;
                }
                handle_discord_frame(op, payload);
            }
        });

        socket.on("connect", () => {
            send_frame(OP_HANDSHAKE, { v: 1, client_id: client_id });
        });

        socket.on("error", () => {
            ipc_socket = null;
            handshake_done = false;
            current_client_id = null;
        });

        socket.on("close", () => {
            if (ipc_socket === socket) {
                ipc_socket = null;
                handshake_done = false;
                current_client_id = null;
            }
        });
    };

    const handle_discord_frame = (op: number, payload: DiscordFrame) => {
        if (
            op === OP_HEARTBEAT &&
            payload.cmd === "DISPATCH" &&
            payload.evt === "READY"
        ) {
            handshake_done = true;
            flush_activity();
        }
    }

    const flush_activity = () => {
        if (!handshake_done || pending_activity === null) return;

        send_frame(OP_HEARTBEAT, {
            cmd: "SET_ACTIVITY",
            args: { pid: process.pid, activity: pending_activity },
            nonce: String(Date.now())
        });
    }

    const send_frame = (op: number, payload: Record<string, unknown>) => {
        if (!ipc_socket) return;
        const json = JSON.stringify(payload);
        const len = Buffer.byteLength(json);
        const packet = Buffer.alloc(8 + len);
        packet.writeInt32LE(op, 0);
        packet.writeInt32LE(len, 4);
        packet.write(json, 8);
        ipc_socket.write(packet as any);
    }

    const handle_extension_message = (msg: ExtensionMessage) => {
        if (!msg.client_id) return;
        pending_activity = msg.activity ?? null;
        connect_to_discord(msg.client_id);
    }
};

const is_interactive =
    process.stdout.isTTY ||
    process.argv.includes("--install") ||
    process.argv.includes("--uninstall");

if (is_interactive) {
    const paths = get_install_paths();

    (async () => {
        // explicit flags for scripted / silent invocation
        if (process.argv.includes("--uninstall")) {
            await uninstall_flow(paths);
            return;
        }
        if (process.argv.includes("--install")) {
            await install_flow(paths, is_installed(paths));
            return;
        }

        if (is_installed(paths)) {
            console.log(
                `An existing Discord Rich Presence Host for HyperlinkVR was found.\n`
            );
            process.stdout.write(
                "Would you like to [U]pdate, [R]emove, or [C]ancel? (press the corresponding key in brackets): "
            );

            const char = (await wait_for_keypress()).toLowerCase();
            console.log(char); // echo

            if (char === "u") {
                await install_flow(paths, true);
            } else if (char === "r") {
                await uninstall_flow(paths);
            } else {
                console.log("\nNo changes made.");
                process.exit(0);
            }
        } else {
            // fresh install
            console.log(
                `This will install and register the Discord Rich Presence Host for HyperlinkVR with Chrome.\n` +
                    `The executable will be copied to your user AppData folder so you can delete this installer file.\n`
            );
            process.stdout.write("Do you want to continue? (y/n): ");

            const char = (await wait_for_keypress()).toLowerCase();
            console.log(char); // echo

            if (char === "y") {
                await install_flow(paths, false);
            } else {
                console.log("\nInstallation cancelled.");
                process.exit(0);
            }
        }
    })();
} else {
    run_host();
}
