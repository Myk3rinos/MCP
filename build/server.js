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
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
// Get the user directory path
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
            content: [{ type: "text", text: `User ${params.name} with id ${id} created successfully` }]
        };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `User ${params.name} creation failed` }]
        };
    }
});
// Outil pour changer le fond d'écran
// server.tool("change-wallpaper", "Change the wallpaper to a random image from the wallpapers directory", {}, {
//     title: "Change Wallpaper",
//     readOnlyHint: false,
//     destructiveHint: false,
//     idempotentHint: false,
//     openWorldHint: true,
// }, async () => {
//     const wallpapersDir = "/home/will/Images/wallpapers";
//     try {
//         // Lire le contenu du dossier des wallpapers
//         const files = await fs.readdir(wallpapersDir);
//         if (files.length === 0) {
//             throw new Error("No wallpapers found in the directory");
//         }
//         // Filtrer pour ne garder que les fichiers images
//         const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
//         const imageFiles = files.filter(file => 
//             imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
//         );
//         if (imageFiles.length === 0) {
//             throw new Error("No valid images found in the wallpapers directory");
//         }
//         // Choisir une image aléatoire
//         const randomIndex = Math.floor(Math.random() * imageFiles.length);
//         const selectedWallpaper = path.join(wallpapersDir, imageFiles[randomIndex]);
//         // Commande pour changer le fond d'écran (pour GNOME)
//         const command = `gsettings set org.gnome.desktop.background picture-uri-dark "file:///home/will/Images/wallpapers/1.jpg"`;
//         // const command = `gsettings set org.gnome.desktop.background picture-uri-dark "file://${selectedWallpaper}"`;
//                         //  gsettings set org.gnome.desktop.background picture-uri-dark "file:///home/$USER/Images/wallpapers/1.jpg"
//         const { stdout, stderr } = await execAsync(command, {
//             timeout: 5000,
//             env: {
//                 ...process.env,
//                 DISPLAY: ":0"
//             }
//         });
//         // Exécuter la commande
//         // const { stdout, stderr } = await execAsync(command);
//         if (stderr) {
//             console.error("Error changing wallpaper:", stderr);
//             throw new Error(stderr);
//         }
//         return {
//             success: true,
//             message: `Wallpaper changed successfully: ${imageFiles[randomIndex]}`,
//             wallpaper: selectedWallpaper,
//             stdout,
//             stderr
//         };
//     } catch (error: unknown) {
//         const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
//         console.error("Error in setRandomWallpaper:", error);
//         return {
//             success: false,
//             message: `Error changing wallpaper: ${errorMessage}`,
//             error: errorMessage
//         };
//     }
// });
server.tool("add-note", "Add a new line to the notes file", {
    text: zod_1.z.string().describe("The text to add to the notes file"),
}, {
    title: "Add Note",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ text }) => {
    try {
        const notesDir = node_path_1.default.join(userHomeDir, 'Documents', 'notes');
        // Create the directory if it doesn't exist
        await promises_1.default.mkdir(notesDir, { recursive: true });
        // Add the new line to the file
        await promises_1.default.appendFile(node_path_1.default.join(notesDir, 'note.txt'), `${new Date().toISOString()} - ${text}\n`);
        return {
            content: [{ type: "text", text: `${text},Note added successfully` }]
        };
    }
    catch (error) {
        console.error("Error while adding the note:", error);
        return {
            content: [{ type: "text", text: `Error while adding the note` }]
        };
    }
});
// Solution 1: Forcer le contexte utilisateur avec dbus
server.tool("change-wallpaper", "Change random wallpaper", {
    command: zod_1.z.string().optional().default("gsettings")
}, {
    title: "Change Random Wallpaper",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ command }) => {
    try {
        // Lire le contenu du dossier des wallpapers
        const wallpapersDir = "/home/will/Images/wallpapers";
        const files = await promises_1.default.readdir(wallpapersDir);
        if (files.length === 0) {
            throw new Error("No wallpapers found in the directory");
        }
        // Filtrer pour ne garder que les fichiers images
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
        const imageFiles = files.filter(file => imageExtensions.some(ext => file.toLowerCase().endsWith(ext)));
        if (imageFiles.length === 0) {
            throw new Error("No valid images found in the wallpapers directory");
        }
        // Choisir une image aléatoire
        const randomIndex = Math.floor(Math.random() * imageFiles.length);
        const selectedWallpaper = node_path_1.default.join(wallpapersDir, imageFiles[randomIndex]);
        // Commande complète avec contexte utilisateur
        const fullCommand = `DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" gsettings set org.gnome.desktop.background picture-uri-dark 'file://${selectedWallpaper}'`;
        const { stdout, stderr } = await execAsync(fullCommand, {
            timeout: 10000,
            // shell: true, // Important pour les variables d'environnement
            env: {
                ...process.env,
                DISPLAY: ":0",
                HOME: "/home/will",
                USER: "will"
            }
        });
        // Forcer aussi picture-uri pour le mode clair
        await execAsync(`DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" gsettings set org.gnome.desktop.background picture-uri 'file://${selectedWallpaper}'`, {
            timeout: 5000,
            // shell: true,
            env: { ...process.env, DISPLAY: ":0", HOME: "/home/will", USER: "will" }
        });
        return {
            content: [{
                    type: "text",
                    text: `✅ Wallpaper command executed with dbus context\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nCommand: ${fullCommand}`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `❌ Command failed: ${error}`
                }]
        };
    }
});
// Ajoutez ce tool à votre serveur pour tester
// server.tool("test-system", "Test system command execution", {
//     command: z.string().optional().default("whoami")
// }, {
//     title: "Test System Command",
//     readOnlyHint: true,
//     destructiveHint: false,
//     idempotentHint: true,
//     openWorldHint: false,
// }, async ({ command }) => {
//     try {
//         console.log(`Testing command: ${command}`);
//         const { stdout, stderr } = await execAsync("whoami", {
//             timeout: 5000,
//             env: {
//                 ...process.env,
//                 DISPLAY: ":0"
//             }
//         });
//         return {
//             content: [{
//                 type: "text",
//                 text: `✅ Command executed successfully\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nENV: ${JSON.stringify({
//                     USER: process.env.USER,
//                     HOME: process.env.HOME,
//                     DISPLAY: process.env.DISPLAY,
//                     // UID: process.getuid(),
//                     // GID: process.getgid()
//                 }, null, 2)}`
//             }]
//         };
//     } catch (error) {
//         return {
//             content: [{
//                 type: "text", 
//                 text: `❌ Command failed: ${error}`
//             }]
//         };
//     }
// });
async function createUser(user) {
    const users = await import("./data/users.json", {
        with: { type: "json" },
    }).then((module) => module.default);
    const id = users.length + 1;
    users.push({ id, ...user });
    await promises_1.default.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
    return id;
}
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
// async function setRandomWallpaper() {
//     const wallpapersDir = "/home/will/Images/wallpapers";
//     try {
//         // Lire le contenu du dossier des wallpapers
//         const files = await fs.readdir(wallpapersDir);
//         if (files.length === 0) {
//             throw new Error("No wallpapers found in the directory");
//         }
//         // Filtrer pour ne garder que les fichiers images
//         const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
//         const imageFiles = files.filter(file => 
//             imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
//         );
//         if (imageFiles.length === 0) {
//             throw new Error("No valid images found in the wallpapers directory");
//         }
//         // Choisir une image aléatoire
//         const randomIndex = Math.floor(Math.random() * imageFiles.length);
//         const selectedWallpaper = path.join(wallpapersDir, imageFiles[randomIndex]);
//         // Commande pour changer le fond d'écran (pour GNOME)
//         const command = `gsettings set org.gnome.desktop.background picture-uri-dark "file:///home/will/Images/wallpapers/1.jpg"`;
//         // const command = `gsettings set org.gnome.desktop.background picture-uri-dark "file://${selectedWallpaper}"`;
//                         //  gsettings set org.gnome.desktop.background picture-uri-dark "file:///home/$USER/Images/wallpapers/1.jpg"
//         const { stdout, stderr } = await execAsync(command, {
//             timeout: 5000,
//             env: {
//                 ...process.env,
//                 DISPLAY: ":0"
//             }
//         });
//         // Exécuter la commande
//         // const { stdout, stderr } = await execAsync(command);
//         if (stderr) {
//             console.error("Error changing wallpaper:", stderr);
//             throw new Error(stderr);
//         }
//         return {
//             success: true,
//             message: `Wallpaper changed successfully: ${imageFiles[randomIndex]}`,
//             wallpaper: selectedWallpaper,
//             stdout,
//             stderr
//         };
//     } catch (error: unknown) {
//         const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
//         console.error("Error in setRandomWallpaper:", error);
//         return {
//             success: false,
//             message: `Error changing wallpaper: ${errorMessage}`,
//             error: errorMessage
//         };
//     }
// }
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main();
