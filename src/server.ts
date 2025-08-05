import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Récupérer le chemin du répertoire utilisateur
const userHomeDir = process.env.USER_HOME || os.homedir();

// const NWS_API_BASE = "https://api.weather.gov";
// const USER_AGENT = "weather-app/1.0";

// Create server instance
const server = new McpServer({
    name: "mcp-personnal-tools",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});


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


async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main();