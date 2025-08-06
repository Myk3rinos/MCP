import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Récupérer le chemin du répertoire utilisateur
const userHomeDir = process.env.USER_HOME || os.homedir();

// Create an MCP server
const server = new McpServer({
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

server.resource(
    "user-details",
    new ResourceTemplate("users://{userId}/profile", { list: undefined }),
    {
        description: "Get a user's details from teh database",
        title: "User Details",
        mimeType: "application/json",
    },
    async (uri, { userId }) => {
        const users = await import("./data/users.json", {
            with: { type: "json" },
        }).then(m => m.default)
        const user = users.find(u => u.id === parseInt(userId as string))
  
        if (user == null) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify({ error: "User not found" }),
                        mimeType: "application/json",
                    },
                ],
            }
        }
  
        return {
            contents: [
                {
                    uri: uri.href,
                    text: JSON.stringify(user),
                    mimeType: "application/json",
                },
            ],
        }
    }
)

server.tool("create-user","Create a new user in the database", {
    name: z.string(),
    email: z.string().email(),
    address: z.string(),
    phone: z.string(),
    password: z.string(),
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
        }    
    } catch (error) {
        return {
            content: [{ type: "text", text: `User ${params.name} creation failed` }]
        }    
    }  
})

server.tool("add-note", "Ajoute une nouvelle ligne au fichier de notes", {
    text: z.string().describe("Le texte à ajouter au fichier de notes"),
}, {
    title: "Ajouter une note",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ text }) => {
    try {
        const notesDir = path.join(userHomeDir, 'Documents', 'notes');
        // Créer le répertoire s'il n'existe pas
        await fs.mkdir(notesDir, { recursive: true });
        // Ajouter la nouvelle ligne au fichier
        await fs.appendFile(path.join(notesDir, 'note.txt'), `${new Date().toISOString()} - ${text}\n`);
        
        return {
            content: [{ type: "text", text: `${text},Note ajoutée avec succès` }]
        };
    } catch (error) {
        console.error("Erreur lors de l'ajout de la note:", error);
        return {
            content: [{ type: "text", text: `Erreur lors de l'ajout de la note` }]
        };
    }
})

async function createUser(user: {name: string, email: string, address: string, phone: string, password: string }) {
    const users = await import("./data/users.json", {
        with: {type: "json" },
    }).then((module) => module.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await fs.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
    
    return id;
}

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main();