import fs from "fs";
import path from "path";
import { EXPORT_TO_JSON as AUTH_EXPORTS } from "@hyperlinkvr/auth";
import { METADATA_EXPORT_TO_JSON } from "@hyperlinkvr/vr-engine-schemas";
import { z } from "zod";


const EXPORT_TO_JSON = [
    ...AUTH_EXPORTS,
    ...METADATA_EXPORT_TO_JSON
];


const SCHEMA_URL_BASE = "https://hyperlink.surf/schemas";

const OUTPUT_DIR = path.join(__dirname, "../schemas");

// TODO: auto publish workflow

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface CustomSchemaMeta {
    name: string;
    version: number;
    title: string;
    description: string;
    json_schema_extra?: any;
}

for (const schema of EXPORT_TO_JSON) {
    const raw_schema = schema.toJSONSchema({
        io: "input",
        // pass empty registry so we can control metadata exactly
        metadata: z.registry()
    });

    const meta = schema.meta() as unknown as CustomSchemaMeta;

    // force the current version to be exact
    raw_schema.properties!.version = {
        type: "integer",
        const: meta.version
    };

    const final_schema = {
        $id: `${SCHEMA_URL_BASE}/${meta.name}_v${meta.version}.json`,
        version: meta.version,
        title: `${meta.title} (version ${meta.version})`,
        description: `${meta.description} This schema is version ${meta.version}.`,
        ...raw_schema,
        ...meta.json_schema_extra
    };

    fs.writeFileSync(
        path.join(
            OUTPUT_DIR,
            `${meta.name}_v${meta.version}.json`
        ),
        JSON.stringify(final_schema, null, 4)
    );

    console.log(
        `Generated JSON schema for ${meta.name} v${meta.version} at ${OUTPUT_DIR}`
    );
}
