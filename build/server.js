"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
// Récupérer le chemin du répertoire utilisateur
const userHomeDir = process.env.USER_HOME || node_os_1.default.homedir();
// Create an MCP server
const server = new mcp_js_1.McpServer({
    name: "demo-server",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
        prompts: {
            "prompt-1": {
                model: "mistral",
            }
        },
    },
});
server.resource("user-details", new mcp_js_1.ResourceTemplate("users://{userId}/profile", { list: undefined }), {
    description: "Get a user's details from teh database",
    title: "User Details",
    mimeType: "application/json",
}, async (uri, { userId }) => {
    const users = await import("./data/users.json", {
        with: { type: "json" },
    }).then(m => m.default);
    const user = users.find(u => u.id === parseInt(userId));
    if (user == null) {
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify({ error: "User not found" }),
                    mimeType: "application/json",
                },
            ],
        };
    }
    return {
        contents: [
            {
                uri: uri.href,
                text: JSON.stringify(user),
                mimeType: "application/json",
            },
        ],
    };
});
server.tool("create-user", "Create a new user in the database", {
    name: zod_1.z.string(),
    email: zod_1.z.string().email(),
    address: zod_1.z.string(),
    phone: zod_1.z.string(),
    password: zod_1.z.string(),
}, {
    title: "Create User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async (params) => {
    try {
        const id = await createUser(params);
        return {
            content: [{ type: "text", text: `User ${params.name} created successfully` }]
        };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `User ${params.name} creation failed` }]
        };
    }
});
server.tool("add-note", "Ajoute une nouvelle ligne au fichier de notes", {
    text: zod_1.z.string().describe("Le texte à ajouter au fichier de notes"),
}, {
    title: "Ajouter une note",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ text }) => {
    try {
        const notesDir = node_path_1.default.join(userHomeDir, 'Documents', 'notes');
        // Créer le répertoire s'il n'existe pas
        await promises_1.default.mkdir(notesDir, { recursive: true });
        // Ajouter la nouvelle ligne au fichier
        await promises_1.default.appendFile(node_path_1.default.join(notesDir, 'note.txt'), `${new Date().toISOString()} - ${text}\n`);
        return {
            content: [{ type: "text", text: `${text},Note ajoutée avec succès` }]
        };
    }
    catch (error) {
        console.error("Erreur lors de l'ajout de la note:", error);
        return {
            content: [{ type: "text", text: `Erreur lors de l'ajout de la note` }]
        };
    }
});
async function createUser(user) {
    const users = await import("./data/users.json", {
        with: { type: "json" },
    }).then((module) => module.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await promises_1.default.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
    return id;
}
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main();
