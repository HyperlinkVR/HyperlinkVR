import { execSync } from "child_process";
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

const run_installer = async () => {
    try {
        const source_exe = process.execPath;
        const exe_name = path.basename(source_exe);

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

        // create target directories
        fs.mkdirSync(install_dir, { recursive: true });
        fs.mkdirSync(path.dirname(manifest_path), { recursive: true });

        const installed_exe_path = path.join(install_dir, exe_name);

        // copy binary to app data folder if it's not already running from there
        if (path.resolve(source_exe) !== path.resolve(installed_exe_path)) {
            fs.copyFileSync(source_exe, installed_exe_path);
            if (process.platform !== "win32") {
                fs.chmodSync(installed_exe_path, 0o755);
            }
        }

        // create manifest pointing to the copied binary path
        const manifest: NativeManifest = {
            name: HOST_NAME,
            description: "Discord Rich Presence Host for HyperlinkVR",
            path: installed_exe_path,
            type: "stdio",
            allowed_origins: [
                `chrome-extension://${EXTENSION_ID_DEV}/`,
                `chrome-extension://${EXTENSION_ID_PROD}/`
            ]
        };

        fs.writeFileSync(manifest_path, JSON.stringify(manifest, null, 2));

        if (process.platform === "win32") {
            execSync(
                `reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /ve /d "${manifest_path}" /f`
            );
        }

        console.log(`\nSuccess! ${HOST_NAME} installed and registered for Chrome.`);
        console.log("You can safely delete this executable.\n");
        process.stdout.write("Press any key to exit...");

        await wait_for_keypress();
        console.log();
        process.exit(0);
    } catch (err) {
        console.error("Installation failed:", (err as Error).message);
        process.stdout.write("\nPress any key to exit...");
        await wait_for_keypress();
        console.log();
        process.exit(1);
    }
}

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

if (process.stdout.isTTY || process.argv.includes("--install")) {
    console.log(
        `This will install and register the Discord Rich Presence Host for HyperlinkVR with Chrome.\n` +
            `The executable will be copied to your user AppData folder so you can delete this installer file.\n`
    );
    process.stdout.write("Do you want to continue? (y/n): ");

    wait_for_keypress().then(async (key) => {
        const char = key.toLowerCase();
        console.log(char); // echo

        if (char === "y") {
            await run_installer();
        } else {
            console.log("\nInstallation cancelled.");
            process.exit(0);
        }
    });
} else {
    run_host();
}
