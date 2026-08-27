import {createContext, useContext, useEffect, useState} from "react";
import type {WorldEnvFull} from "@hyperlinkvr/vr-engine-schemas";
import { WorldEnvSchema} from "@hyperlinkvr/vr-engine-schemas";
import {useWebSDKMessaging} from "../contexts";

export const WORLD_ENV_DEFAULT: WorldEnvFull = {
    sky: {
        sky_zenith_color: 0x1e5b9f,
        sky_horizon_color: 0x6a9ac7,

        ground_horizon_color: 0x42302a,
        ground_nadir_color: 0x241714,

        sun_direction: [0.5, 0.8, 0.3],
        sun_color: 0xfcecc5,
        sun_intensity: 1.0,

        sun_size: 2.0,
        sun_glow: 8,

        horizon_sharpness: 1,
        horizon_band: 0.1,

        cast_light: true,
        light_intensity: 0.9,
        light_distance: 100,

        sky_light_intensity: 0.5,

        ambient_override_color: undefined,
        ambient_override_intensity: 0.3,
    },

    fog: {
        color: 0x6a9ac7,
        near: 20,
        far: 150,
    },

    physics: {
        gravity: -9.81,
    }
}

// TODO: use this sky when the world is the plain dom
export const WORLD_ENV_GRAYSPACE: WorldEnvFull = {
    sky: {
        sky_zenith_color: 0x111111,
        sky_horizon_color: 0x222222,

        ground_horizon_color: 0x111111,
        ground_nadir_color: 0x000000,

        sun_direction: [0.3, 0.6, 0.2],
        sun_color: 0xffffff,
        sun_intensity: 1.0,

        sun_size: 3,
        sun_glow: 6,

        horizon_sharpness: 1.0,
        horizon_band: 0.02,

        cast_light: true,
        light_intensity: 1.0,
        light_distance: 50,

        sky_light_intensity: 0.5,

        ambient_override_color: undefined,
        ambient_override_intensity: 0.25,
    },

    fog: {
        color: 0x222222,
        near: 10,
        far: 75,
    },

    physics: {
        gravity: -9.81,
    }
};

interface WorldEnvironmentContextType {
    world_env: WorldEnvFull;
    setWorldEnv: (env: WorldEnvFull) => void;
}

const WorldEnvironmentContext = createContext<WorldEnvironmentContextType>({
    world_env: WORLD_ENV_DEFAULT,
    setWorldEnv: () => {throw new Error("WorldEnvironment cannot be changed")}
});

export const FixedWorldEnvironmentProvider = WorldEnvironmentContext.Provider;

export const SDKWorldEnvironmentProvider = ({children}: {children: React.ReactNode}) => {
    const [world_env, setWorldEnv] = useState<WorldEnvFull>(WORLD_ENV_DEFAULT);
    const {on_action} = useWebSDKMessaging();

    useEffect(() => {
        const unlisten_reset = on_action("HVRSDK_RESET_WORLD_ENV", (message, reply) => {
            setWorldEnv(message.type === "grayspace" ? WORLD_ENV_GRAYSPACE : WORLD_ENV_DEFAULT);
            reply({
                for: "HVRSDK_RESET_WORLD_ENV",
                success: true,
            });
        });

        const unlisten_update = on_action("HVRSDK_UPDATE_WORLD_ENV", (message, reply) => {
            // the world env can be partial, patch the value deeply
            setWorldEnv((prev) => {
                const {success, data} = WorldEnvSchema.safeParse(message.env);
                if (!success) {
                    console.error("Invalid world env update", data);
                    reply({
                        for: "HVRSDK_UPDATE_WORLD_ENV",
                        error: "Invalid world env update",
                    });
                    return prev;
                }

                const new_env = {...prev};

                if (data.sky) {
                    new_env.sky = {...new_env.sky, ...data.sky};
                }

                if (data.fog) {
                    new_env.fog = {...new_env.fog, ...data.fog};
                }

                if (data.physics) {
                    new_env.physics = {...new_env.physics, ...data.physics};
                }

                console.log("Updated world env", new_env);
                return new_env;
            });

            reply({
                for: "HVRSDK_UPDATE_WORLD_ENV",
                success: true,
            });
        });

        return () => {
            unlisten_reset();
            unlisten_update();
        }
    }, []);

    return (
        <WorldEnvironmentContext.Provider value={{world_env, setWorldEnv}}>
            {children}
        </WorldEnvironmentContext.Provider>
    );
}

export const useWorldEnvironment = () => {
    const value = useContext(WorldEnvironmentContext);
    return value;
}
