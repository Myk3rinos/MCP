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
const userName = process.env.USER || node_os_1.default.userInfo().username;
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
// Resource to get a user's details
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
// Tool to create a new user
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
        const users = await import("./data/users.json", {
            with: { type: "json" },
        }).then((module) => module.default);
        const id = users.length + 1;
        users.push({ id, ...params });
        await promises_1.default.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
        // const id = await createUser(params);
        return {
            content: [{
                    type: "text",
                    text: `User ${params.name} with id ${id} created successfully`,
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `User ${params.name} creation failed`,
                    error: error
                }]
        };
    }
});
// Tool to add a note
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
            content: [{
                    type: "text",
                    text: `${text},Note added successfully`,
                }]
        };
    }
    catch (error) {
        console.error("Error while adding the note:", error);
        return {
            content: [{
                    type: "text",
                    text: `Error while adding the note`,
                    error: error
                }]
        };
    }
});
// Tool to show files in a directory
server.tool("list-files", "List files in a directory with full french linux path", {
    directory: zod_1.z.string().optional().default(userHomeDir).describe("Directory to list"),
    args: zod_1.z.string().optional().default("-la").describe("Arguments to pass to ls (default: -la) or --tree for tree view")
}, {
    title: "List Files",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ directory, args }) => {
    try {
        // Utilisation de la commande ls avec l'option -la pour un affichage détaillé
        // const command = `ls -la "${directory}"`;
        const command = `ls ${args} "${directory}"`;
        const { stdout, stderr } = await execAsync(command, {
            timeout: 5000,
            env: {
                ...process.env,
                DISPLAY: ":0",
                HOME: userHomeDir,
                USER: userName
            }
        });
        return {
            content: [{
                    type: "text",
                    shell: command,
                    text: `📁 Contenu de ${directory} :\n\`\`\`\n${stdout}\`\`\`\n${stderr ? `Erreurs :\n\`\`\`\n${stderr}\`\`\`` : ''}`
                }]
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                    type: "text",
                    text: `❌ Erreur lors de l'exécution de la commande ls :\n\`\`\`\n${errorMessage}\`\`\``,
                    error: errorMessage
                }]
        };
    }
});
// Tool to change the wallpaper
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
        const wallpapersDir = node_path_1.default.join(userHomeDir, 'Images', 'wallpapers');
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
                HOME: userHomeDir,
                USER: userName
            }
        });
        // Forcer aussi picture-uri pour le mode clair
        await execAsync(`DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" gsettings set org.gnome.desktop.background picture-uri 'file://${selectedWallpaper}'`, {
            timeout: 5000,
            // shell: true,
            env: { ...process.env, DISPLAY: ":0", HOME: userHomeDir, USER: userName }
        });
        return {
            content: [{
                    type: "text",
                    // text: `✅ Wallpaper command executed with dbus context\nSTDOUT: ${stdout}\nSTDERR: ${stderr}\nCommand: ${fullCommand}`
                    // text: `✅ Wallpaper command executed with dbus context\n`
                    text: `✅ Wallpaper changed successfully`
                }]
        };
    }
    catch (error) {
        return {
            content: [{
                    type: "text",
                    text: `❌ Command failed: ${error}`,
                    error: error
                }]
        };
    }
});
// Tool pour récupérer la météo de Marseille via l'API Météo-France
// server.tool("get-weather", "Récupère la météo actuelle et les prévisions pour une ville via l'API Météo-France", {
//     type: z.enum(["current", "forecast", "both"]).optional().default("both").describe("Type d'information météo : current (actuelle), forecast (prévisions), both (les deux)"),
//     city: z.string().optional().default("Marseille").describe("Ville pour laquelle récupérer la météo"),
// }, {
//     title: "Météo Marseille",
//     readOnlyHint: true,
//     destructiveHint: false,
//     idempotentHint: true,
//     openWorldHint: false,
// }, async ({ type, city }) => {
//     try {
//         // async function foundINSEEfromCity(city: string): Promise<string | null> {
//         //     try {
//         //         // Nettoyer le nom de la ville
//         //         const cleanCity = city.trim();
//         //         if (!cleanCity) return null;
//         //         // Appel à l'API Géo du gouvernement français
//         //         const response = await fetch(
//         //             `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(cleanCity)}&boost=population&limit=1`,
//         //             {
//         //                 headers: {
//         //                     'Accept': 'application/json',
//         //                     'User-Agent': 'MCP-WeatherBot/1.0'
//         //                 }
//         //             }
//         //         );
//         //         if (!response.ok) {
//         //             console.error(`Erreur API Géo: ${response.status} ${response.statusText}`);
//         //             return null;
//         //         }
//         //         const data = await response.json();
//         //         // Si on a des résultats, retourner le code INSEE du premier résultat (le plus peuplé)
//         //         if (Array.isArray(data) && data.length > 0) {
//         //             return data[0].code;
//         //         }
//         //         return null;
//         //     } catch (error) {
//         //         console.error('Erreur lors de la recherche du code INSEE:', error);
//         //         return null;
//         //     }
//         // }
//         // const inseeCode = await foundINSEEfromCity(city); 
//         // Code INSEE de Marseille : 13055
//         const marseilleCode = "13055";
//         const baseUrl = "https://api.meteo-france.com/public/DPObs/v1/station/infrahoraire-6m";
//         const forecastUrl = "https://api.meteo-france.com/public/DPPrev/v1/chainage/JSON/COMMUN";
//         let weatherData = "";
//         if (type === "current" || type === "both") {
//             try {
//                 // Récupération des données actuelles
//                 const currentResponse = await fetch(`${baseUrl}?id_station=${marseilleCode}&format=json`, {
//                     headers: {
//                         'Accept': 'application/json',
//                         'User-Agent': 'MCP-WeatherBot/1.0'
//                     }
//                 });
//                 if (currentResponse.ok) {
//                     const currentData = await currentResponse.json();
//                     if (currentData && currentData.data && currentData.data.length > 0) {
//                         const latest = currentData.data[0];
//                         weatherData += "🌤️ **MÉTÉO ACTUELLE - MARSEILLE**\n";
//                         weatherData += `📅 Dernière mise à jour : ${new Date(latest.validity_time).toLocaleString('fr-FR')}\n`;
//                         weatherData += `🌡️ Température : ${latest.t || 'N/A'}°C\n`;
//                         weatherData += `💨 Vent : ${latest.ff || 'N/A'} km/h (direction: ${latest.dd || 'N/A'}°)\n`;
//                         weatherData += `💧 Humidité : ${latest.hu || 'N/A'}%\n`;
//                         weatherData += `🌧️ Précipitations : ${latest.rr1 || '0'} mm\n`;
//                         weatherData += `📊 Pression : ${latest.pmer || 'N/A'} hPa\n\n`;
//                     } else {
//                         weatherData += "❌ Données météo actuelles non disponibles\n\n";
//                     }
//                 } else {
//                     // Fallback avec l'API publique simplifiée
//                     const fallbackResponse = await fetch(`https://api.meteo-france.com/public/DPObs/v1/station/horaire?id_station=07190&format=json`);
//                     if (fallbackResponse.ok) {
//                         const fallbackData = await fallbackResponse.json();
//                         weatherData += "🌤️ **MÉTÉO RÉGION PACA** (station de référence)\n";
//                         weatherData += `📊 Données météo régionales disponibles\n\n`;
//                     } else {
//                         weatherData += "⚠️ Impossible de récupérer les données météo actuelles\n\n";
//                     }
//                 }
//             } catch (currentError) {
//                 // weatherData += `⚠️ Erreur lors de la récupération des données actuelles : ${currentError.message}\n\n`;
//                 weatherData += `⚠️ Erreur lors de la récupération des données actuelles : ${currentError}\n\n`;
//             }
//         }
//         if (type === "forecast" || type === "both") {
//             try {
//                 // Récupération des prévisions (API alternative car l'API principale nécessite une clé)
//                 const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=43.2965&longitude=5.3698&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=Europe/Paris&forecast_days=3`, {
//                     headers: {
//                         'Accept': 'application/json',
//                         'User-Agent': 'MCP-WeatherBot/1.0'
//                     }
//                 });
//                 if (forecastResponse.ok) {
//                     const forecastData = await forecastResponse.json();
//                     weatherData += "🔮 **PRÉVISIONS - MARSEILLE** (3 jours)\n";
//                     // Météo actuelle depuis Open-Meteo
//                     if (forecastData.current_weather) {
//                         const current = forecastData.current_weather;
//                         weatherData += `🌡️ Température actuelle : ${current.temperature}°C\n`;
//                         weatherData += `💨 Vent : ${current.windspeed} km/h\n`;
//                         weatherData += `☁️ Code météo : ${getWeatherDescription(current.weathercode)}\n\n`;
//                     }
//                     // Prévisions sur 3 jours
//                     if (forecastData.daily) {
//                         const daily = forecastData.daily;
//                         for (let i = 0; i < Math.min(3, daily.time.length); i++) {
//                             const date = new Date(daily.time[i]).toLocaleDateString('fr-FR', { 
//                                 weekday: 'long', 
//                                 day: 'numeric', 
//                                 month: 'long' 
//                             });
//                             weatherData += `📅 **${date}**\n`;
//                             weatherData += `  🌡️ Min/Max : ${daily.temperature_2m_min[i]}°C / ${daily.temperature_2m_max[i]}°C\n`;
//                             weatherData += `  🌧️ Précipitations : ${daily.precipitation_sum[i]} mm\n`;
//                             weatherData += `  💨 Vent max : ${daily.windspeed_10m_max[i]} km/h\n\n`;
//                         }
//                     }
//                 } else {
//                     weatherData += "⚠️ Impossible de récupérer les prévisions météo\n\n";
//                 }
//             } catch (forecastError) {
//                 // weatherData += `⚠️ Erreur lors de la récupération des prévisions : ${forecastError.message}\n\n`;
//                 weatherData += `⚠️ Erreur lors de la récupération des prévisions : ${forecastError}\n\n`;
//             }
//         }
//         // Ajouter des conseils basés sur la météo
//         // weatherData += "💡 **CONSEILS MÉTÉO**\n";
//         // weatherData += "🏖️ Marseille bénéficie d'un climat méditerranéen\n";
//         // weatherData += "☀️ Pensez à la protection solaire en été\n";
//         // weatherData += "🌊 Attention au mistral (vent fort du nord-ouest)\n";
//         return {
//             content: [{
//                 type: "text",
//                 text: weatherData || "❌ Aucune donnée météo disponible"
//             }]
//         };
//     } catch (error) {
//         console.error("Erreur lors de la récupération de la météo:", error);
//         return {
//             content: [{
//                 type: "text",
//                 text: `❌ Erreur lors de la récupération des données météo : ${error}`,
//                 error: error
//             }]
//         };
//     }
// });
// Tool to get weather by city name using Open-Meteo (English output)
server.tool("get-weather", "Get current weather and a multi-day forecast for a city using Open-Meteo (no API key)", {
    city: zod_1.z.string().describe("City name, e.g., London"),
    days: zod_1.z.number().int().min(1).max(7).optional().default(3).describe("Number of forecast days (1-7)"),
    units: zod_1.z.enum(["metric", "imperial"]).optional().default("metric").describe("Units system: metric or imperial")
}, {
    title: "Weather (Open-Meteo)",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ city, days, units }) => {
    try {
        // Geocode the city name to coordinates
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResp = await fetch(geoUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'MCP-WeatherBot/1.0' }
        });
        if (!geoResp.ok) {
            return { content: [{ type: 'text', text: `Failed to geocode city: ${city} (HTTP ${geoResp.status})` }] };
        }
        const geo = await geoResp.json();
        if (!geo || !geo.results || geo.results.length === 0) {
            return { content: [{ type: 'text', text: `City not found: ${city}` }] };
        }
        const loc = geo.results[0];
        const latitude = loc.latitude;
        const longitude = loc.longitude;
        const locationLabel = `${loc.name}${loc.admin1 ? ", " + loc.admin1 : ''}${loc.country ? ", " + loc.country : ''}`;
        const timezone = encodeURIComponent(loc.timezone || 'auto');
        // Configure unit parameters for Open-Meteo
        const unitParams = units === 'imperial'
            ? 'temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch'
            : 'temperature_unit=celsius&windspeed_unit=kmh&precipitation_unit=mm';
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=${timezone}&forecast_days=${days}&${unitParams}`;
        const meteoResp = await fetch(forecastUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'MCP-WeatherBot/1.0' }
        });
        if (!meteoResp.ok) {
            return { content: [{ type: 'text', text: `Failed to fetch weather for ${locationLabel} (HTTP ${meteoResp.status})` }] };
        }
        const data = await meteoResp.json();
        // Helper: English weather code description
        function describeCodeEn(code) {
            const map = {
                0: "Clear sky",
                1: "Mainly clear",
                2: "Partly cloudy",
                3: "Overcast",
                45: "Fog",
                48: "Depositing rime fog",
                51: "Light drizzle",
                53: "Moderate drizzle",
                55: "Dense drizzle",
                61: "Slight rain",
                63: "Moderate rain",
                65: "Heavy rain",
                71: "Slight snow",
                73: "Moderate snow",
                75: "Heavy snow",
                95: "Thunderstorm",
                96: "Thunderstorm with slight hail",
                99: "Thunderstorm with heavy hail",
            };
            return map[code] || `Weather code ${code}`;
        }
        let out = '';
        out += `🌍 Location: ${locationLabel}\n`;
        if (data.current_weather) {
            const cw = data.current_weather;
            const unitTemp = units === 'imperial' ? '°F' : '°C';
            const unitWind = units === 'imperial' ? 'mph' : 'km/h';
            out += `\n🌤️ Current Weather\n`;
            out += `• Time: ${new Date(cw.time).toLocaleString('en-GB')}\n`;
            out += `• Temperature: ${cw.temperature}${unitTemp}\n`;
            out += `• Wind: ${cw.windspeed} ${unitWind}\n`;
            out += `• Conditions: ${describeCodeEn(cw.weathercode)}\n`;
        }
        if (data.daily) {
            const d = data.daily;
            const unitTemp = units === 'imperial' ? '°F' : '°C';
            const unitPrec = units === 'imperial' ? 'in' : 'mm';
            const unitWind = units === 'imperial' ? 'mph' : 'km/h';
            out += `\n🔮 ${days}-Day Forecast\n`;
            for (let i = 0; i < Math.min(days, d.time.length); i++) {
                const dateLabel = new Date(d.time[i]).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
                out += `• ${dateLabel}: min/max ${d.temperature_2m_min[i]}${unitTemp} / ${d.temperature_2m_max[i]}${unitTemp}, precip ${d.precipitation_sum[i]} ${unitPrec}, max wind ${d.windspeed_10m_max[i]} ${unitWind}\n`;
            }
        }
        return { content: [{ type: 'text', text: out || `No weather data available for ${locationLabel}` }] };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error while retrieving weather: ${err}`, error: err }] };
    }
});
// Tool to read a file and return its contents (English)
server.tool("read-file", "Read a file and return its contents (truncated if too large)", {
    file: zod_1.z.string().describe("Absolute or relative path to the file. '~' is supported."),
    encoding: zod_1.z.enum(["utf-8", "utf8", "latin1", "base64"]).optional().default("utf-8").describe("Output encoding"),
    maxBytes: zod_1.z.number().int().min(1).max(10 * 1024 * 1024).optional().default(200_000).describe("Max bytes to return (1-10MB)")
}, {
    title: "Read File",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ file, encoding, maxBytes }) => {
    try {
        // Resolve path (~, absolute, or relative to user's home)
        const resolvePath = (p) => {
            if (p.startsWith('~'))
                return node_path_1.default.join(userHomeDir, p.slice(1));
            return node_path_1.default.isAbsolute(p) ? p : node_path_1.default.join(userHomeDir, p);
        };
        const fullPath = resolvePath(file);
        // Ensure the target exists and is a file
        const st = await promises_1.default.stat(fullPath);
        if (!st.isFile()) {
            return { content: [{ type: 'text', text: `Path is not a file: ${fullPath}` }] };
        }
        // Read at most maxBytes
        const data = await promises_1.default.readFile(fullPath);
        const truncated = data.length > maxBytes;
        const slice = truncated ? data.subarray(0, maxBytes) : data;
        // Format output
        const text = (encoding === 'base64') ? slice.toString('base64') : slice.toString(encoding);
        const meta = `File: ${fullPath}\nSize: ${st.size} bytes\nReturned: ${slice.length} bytes${truncated ? ' (truncated)' : ''}`;
        return {
            content: [{
                    type: 'text',
                    text: `${meta}\n\n${text}`
                }]
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Failed to read file: ${msg}`, error: msg }] };
    }
});
// Tool to write content to a file (English)
server.tool("write-file", "Write text content to a file (append or overwrite)", {
    file: zod_1.z.string().describe("Absolute or relative path to the file. '~' is supported."),
    content: zod_1.z.string().describe("Text content to write"),
    encoding: zod_1.z.enum(["utf-8", "utf8", "latin1", "base64"]).optional().default("utf-8").describe("Input/content encoding"),
    mode: zod_1.z.enum(["overwrite", "append"]).optional().default("overwrite").describe("Overwrite the file or append to it"),
    makeDirs: zod_1.z.boolean().optional().default(true).describe("Create parent directories if they don't exist")
}, {
    title: "Write File",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ file, content, encoding, mode, makeDirs }) => {
    try {
        const resolvePath = (p) => {
            if (p.startsWith('~'))
                return node_path_1.default.join(userHomeDir, p.slice(1));
            return node_path_1.default.isAbsolute(p) ? p : node_path_1.default.join(userHomeDir, p);
        };
        const fullPath = resolvePath(file);
        // Ensure parent directory exists
        const dir = node_path_1.default.dirname(fullPath);
        if (makeDirs) {
            await promises_1.default.mkdir(dir, { recursive: true });
        }
        // Prepare buffer from content per encoding
        const buf = Buffer.from(content, encoding);
        if (mode === 'append') {
            await promises_1.default.appendFile(fullPath, buf);
        }
        else {
            await promises_1.default.writeFile(fullPath, buf);
        }
        // Stat the file after write
        const st = await promises_1.default.stat(fullPath).catch(() => null);
        const sizeInfo = st ? `${st.size} bytes` : 'unknown size';
        return {
            content: [{
                    type: 'text',
                    text: `Wrote ${buf.length} bytes to ${fullPath} (${mode}). File size: ${sizeInfo}`
                }]
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Failed to write file: ${msg}`, error: msg }] };
    }
});
// Fonction helper pour décrire les codes météo Open-Meteo
function getWeatherDescription(code) {
    const descriptions = {
        0: "☀️ Ciel dégagé",
        1: "🌤️ Principalement dégagé",
        2: "⛅ Partiellement nuageux",
        3: "☁️ Couvert",
        45: "🌫️ Brouillard",
        48: "🌫️ Brouillard givrant",
        51: "🌦️ Bruine légère",
        53: "🌦️ Bruine modérée",
        55: "🌦️ Bruine forte",
        61: "🌧️ Pluie légère",
        63: "🌧️ Pluie modérée",
        65: "🌧️ Pluie forte",
        71: "❄️ Neige légère",
        73: "❄️ Neige modérée",
        75: "❄️ Neige forte",
        95: "⛈️ Orage",
        96: "⛈️ Orage avec grêle légère",
        99: "⛈️ Orage avec grêle forte"
    };
    return descriptions[code] || `Code ${code}`;
}
// List of forbidden commands (case insensitive)
const BLACKLISTED_COMMANDS = [
    // Commandes de suppression
    // 'ls',
    // 'ls -la "/"',
    'sudo\\s*\\S*',
    'sudo\\s+\\S+',
    'rm\\s+(-[rf]+\\s+)*[/\\\\*]',
    'rm\\s+(-[rf]+\\s+)*/dev/sd[a-z]\\d*',
    'rm\\s+(-[rf]+\\s+)*/etc',
    'rm\\s+(-[rf]+\\s+)*/boot',
    'rm\\s+(-[rf]+\\s+)*/root',
    'rm\\s+(-[rf]+\\s+)*/home',
    // Commandes système critiques
    'mkfs\\b',
    'fdisk\\b',
    'dd\\s+if=.*of=.*',
    'chmod\\s+[-]?[0-7]\\d{2,3}\\s+[/\\\\*]',
    'chmod\\s+[-]?[0-7]\\d{2,3}\\s+-R\\s+[/\\\\*]',
    'chown\\s+[-]?[a-z0-9_]+:[a-z0-9_]+\\s+[/\\\\*]',
    'mv\\s+.*\\s+/dev/null',
    'mv\\s+/.*\\s+',
    '>\\s*/dev/sd[a-z]',
    '>\\s*/dev/null',
    ':\\s*\\(\\s*\\)\\s*{\\s*:\\s*\\|\\s*:\\s*&\\s*}\\s*;\\s*:', // Fork bomb
    // Commandes réseau
    'wget\\b',
    'curl\\b',
    'nc\\b',
    'netcat\\b',
    'ssh\\s+.*\\|\\s*sh',
    'telnet\\b',
    'ftp\\b',
    'sftp\\b',
    'scp\\b',
    'rsync\\b',
    'wget.*\\|\\s*sh',
    'curl.*\\|\\s*sh',
    // Arrêt du système
    'shutdown\\b',
    'halt\\b',
    'reboot\\b',
    'poweroff\\b',
    'init\\s+[016]',
    'systemctl\\s+(stop|poweroff|reboot|halt)',
    // Commandes utilisateur et permissions
    'useradd\\b',
    'userdel\\b',
    'usermod\\b',
    'groupadd\\b',
    'groupdel\\b',
    'passwd\\b',
    'chsh\\b',
    'chfn\\b',
    // Montage/démontage
    'mount\\s+.*\\s+/',
    'umount\\s+/(?!dev|proc|sys|run|tmp)',
    // Kernel et modules
    'rmmod\\b',
    'modprobe\\s+-[ar]',
    'insmod\\b',
    'depmod\\b',
    // Autres commandes dangereuses
    'mkfs\\..*',
    'fsck\\b',
    'mkinitramfs\\b',
    'update-initramfs\\b',
    'update-grub\\b',
    'grub-install\\b',
    'dpkg\\s+--purge',
    'apt-get\\s+(remove|purge|autoremove)',
    'apt\\s+(remove|purge|autoremove)',
    'yum\\s+remove',
    'dnf\\s+remove',
    'zypper\\s+remove',
    'pacman\\s+-R',
    // Commandes de débogage et accès bas niveau
    'gdb\\b',
    'strace\\b',
    'ltrace\\b',
    'ptrace\\b',
    'perf\\b',
    // Commandes de gestion des processus
    'killall\\b',
    'pkill\\s+-9',
    'kill\\s+-9\\s+-1',
    'killall\\s+-9',
    // Commandes de journalisation
    '>\\s*/var/log/',
    '>\\s*/var/log/.*\\.log',
    'rm\\s+(-[rf]+\\s+)*/var/log/',
    // Commandes de redirection de ports
    'iptables\\s+.*-j\\s+ACCEPT',
    'ufw\\s+allow',
    'firewall-cmd\\s+--add-port',
    // Commandes de manipulation de paquets
    'dpkg-reconfigure\\s+-a',
    'dpkg\\s+--force-all',
    // Commandes de gestion des services
    'systemctl\\s+disable',
    'systemctl\\s+mask',
    'service\\s+.*\\s+stop',
    // Commandes de manipulation de disque
    'fdisk\\s+/dev/sd[a-z]',
    'parted\\b',
    'gparted\\b',
    'cfdisk\\b',
    'sfdisk\\b',
    'sgdisk\\b',
    'partprobe\\b',
    'blockdev\\b',
    'hdparm\\b',
    'badblocks\\b',
    'e2fsck\\s+-[fy]',
    'fsck\\s+-[fy]',
    'mkfs\\..*\\s+/dev/sd[a-z]',
    'mkswap\\b',
    'swapon\\b',
    'swapoff\\b',
    'wipefs\\b',
    'blkdiscard\\b',
    'hdparm\\s+--dco-identify',
    'hdparm\\s+--security-erase',
    'hdparm\\s+--sanitize-',
    'nvme\\s+format',
    'nvme\\s+sanitize',
    'nvme\\s+reset',
    'smartctl\\s+--all',
    'smartctl\\s+--test',
    'smartctl\\s+--xall',
    'smartctl\\s+--scan',
    'smartctl\\s+--health',
    'smartctl\\s+--attributes',
    'smartctl\\s+--capabilities',
    'smartctl\\s+--error',
    'smartctl\\s+--log',
    'smartctl\\s+--selective',
    'smartctl\\s+--set',
    'smartctl\\s+--smart'
];
// Tool to execute a shell command
server.tool("execute-shell-command", "If user ask you a action on is french os linux , you can Executes a shell command with this tool", {
    command: zod_1.z.string().describe("The command to execute"),
}, {
    title: "Execute Shell Command",
    readOnlyHint: false, // This could be true or false depending on the command
    destructiveHint: true, // It's safer to assume it can be destructive
    idempotentHint: false,
    openWorldHint: true,
    // requiresConfirmation: true, // This will trigger a confirmation dialog
    // confirmationTitle: "Confirm Command Execution",
    // confirmationPrompt: (params: { command: string; confirmationMessage?: string }) => {
    //     return params.confirmationMessage || 
    //            `Are you sure you want to execute this command?\n\`${params.command}\``;
    // },
}, async ({ command }) => {
    try {
        // Nettoyer et normaliser la commande
        const normalizedCmd = command.trim().replace(/^sudo\s+/i, '').trim();
        // Vérifier si la commande est dans la liste noire (avec ou sans sudo)
        const isBlacklisted2 = BLACKLISTED_COMMANDS.some(forbidden => {
            // Créer un motif qui correspond à la commande avec ou sans sudo
            const pattern = `^\\s*(sudo\\s+)?${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}\\s*$`;
            const regex = new RegExp(pattern, 'i');
            return regex.test(command);
        });
        // Vérifier aussi la commande normalisée (sans sudo)
        const isNormalizedBlacklisted2 = BLACKLISTED_COMMANDS.some(forbidden => {
            const regex = new RegExp(`^\\s*${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}\\s*$`, 'i');
            return regex.test(normalizedCmd);
        });
        // Vérification corrigée de la blacklist
        // const isLSCommand = (command);
        const isBlacklisted = BLACKLISTED_COMMANDS.some(forbidden => {
            try {
                // Utiliser directement le pattern de la blacklist (qui contient déjà les regex)
                const regex = new RegExp(forbidden, 'i');
                return regex.test(command);
            }
            catch (e) {
                // Si la regex est malformée, considérer comme non-match
                return false;
            }
        });
        // Vérifier aussi la commande normalisée (sans sudo)
        const isNormalizedBlacklisted = BLACKLISTED_COMMANDS.some(forbidden => {
            try {
                const regex = new RegExp(forbidden, 'i');
                return regex.test(normalizedCmd);
            }
            catch (e) {
                return false;
            }
        });
        if (isBlacklisted || isNormalizedBlacklisted || isBlacklisted2 || isNormalizedBlacklisted2) {
            return {
                content: [{
                        type: "text",
                        text: "❌ Erreur : Cette commande est interdite pour des raisons de sécurité.",
                        error: "Commande non autorisée"
                    }]
            };
        }
        // const { stdout, stderr } = await execAsync(command, {
        //     timeout: 15000, // 15 seconds timeout
        //     env: {
        //         ...process.env,
        //         DISPLAY: ":0",
        //         HOME: userHomeDir,
        //         USER: userName
        //     }
        // });
        const { stdout, stderr } = await execAsync(command, {
            timeout: 15000,
            env: {
                // ✅ Environnement minimal et contrôlé
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                HOME: userHomeDir,
                USER: userName,
                DISPLAY: ":0",
                LANG: 'fr_FR.UTF-8',
                // Pas d'héritage complet de process.env
            },
            uid: 1000, // ✅ Force un UID non-root si possible
            gid: 1000,
            cwd: userHomeDir // ✅ Répertoire de travail contrôlé
        });
        // let output = `Command executed: ${command}\n`;
        // if (stdout) {
        //     output += `\n--- STDOUT ---\n${stdout}`;
        // }
        // if (stderr) {
        //     output += `\n--- STDERR ---\n${stderr}`;
        // }
        return {
            content: [{
                    type: "text",
                    text: stdout,
                    shell: command,
                }]
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                    type: "text",
                    text: `❌ Error executing command:\n${errorMessage}`,
                    error: errorMessage
                }]
        };
    }
});
// Tool to execute a shell command - VERSION CORRIGÉE
// server.tool("execute-shell-command", "If user ask you a action on is french os linux , you can Executes a shell command with this tool", {
//     command: z.string().describe("The command to execute"),
// }, {
//     title: "Execute Shell Command",
//     readOnlyHint: false,
//     destructiveHint: true,
//     idempotentHint: false,
//     openWorldHint: true,
// }, async ({ command }) => {
//     try {
//         // Nettoyer la commande
//         const cleanCommand = command.trim();
//         const normalizedCmd = cleanCommand.replace(/^sudo\s+/i, '').trim();
//         // Fonction pour vérifier si une commande match un pattern de la blacklist
//         function matchesBlacklistPattern(cmd: string, pattern: string): boolean {
//             try {
//                 const regex = new RegExp(pattern, 'i');
//                 return regex.test(cmd);
//             } catch (e) {
//                 // Si la regex est malformée, on considère que ça ne match pas
//                 return false;
//             }
//         }
//         // Vérifier contre la blacklist
//         let isBlacklisted = false;
//         let matchedPattern = '';
//         for (const forbidden of BLACKLISTED_COMMANDS) {
//             // Tester la commande originale (avec sudo potentiel)
//             if (matchesBlacklistPattern(cleanCommand, forbidden)) {
//                 isBlacklisted = true;
//                 matchedPattern = forbidden;
//                 break;
//             }
//             // Tester la commande sans sudo
//             if (matchesBlacklistPattern(normalizedCmd, forbidden)) {
//                 isBlacklisted = true;
//                 matchedPattern = forbidden;
//                 break;
//             }
//         }
//         // Vérifications supplémentaires pour sudo
//         if (cleanCommand.toLowerCase().startsWith('sudo')) {
//             // Bloquer sudo avec des commandes système critiques même si pas dans la blacklist
//             const sudoBlacklist = [
//                 'su\\b',
//                 'passwd\\b',
//                 'visudo\\b',
//                 'usermod\\b',
//                 'adduser\\b',
//                 'deluser\\b',
//                 'systemctl\\s+(start|stop|restart|enable|disable)\\s+ssh',
//                 'ufw\\s+disable',
//                 'iptables\\s+-F',
//                 'mount\\b',
//                 'umount\\b'
//             ];
//             for (const sudoForbidden of sudoBlacklist) {
//                 if (matchesBlacklistPattern(normalizedCmd, sudoForbidden)) {
//                     isBlacklisted = true;
//                     matchedPattern = `sudo + ${sudoForbidden}`;
//                     break;
//                 }
//             }
//         }
//         if (isBlacklisted) {
//             return {
//                 content: [{
//                     type: "text",
//                     text: `❌ Erreur : Cette commande est interdite pour des raisons de sécurité.\n🚫 Pattern détecté : ${matchedPattern}\n💡 Commande bloquée : ${cleanCommand}`,
//                     error: "Commande non autorisée"
//                 }]
//             };
//         }
//         // // Exécuter la commande si elle passe tous les contrôles
//         // const { stdout, stderr } = await execAsync(cleanCommand, {
//         //     timeout: 15000,
//         //     env: {
//         //         ...process.env,
//         //         DISPLAY: ":0",
//         //         HOME: userHomeDir,
//         //         USER: userName
//         //     }
//         // });
//         const { stdout, stderr } = await execAsync(command, {
//             timeout: 15000,
//             env: {
//                 // ✅ Environnement minimal et contrôlé
//                 PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
//                 HOME: userHomeDir,
//                 USER: userName,
//                 DISPLAY: ":0",
//                 LANG: 'fr_FR.UTF-8',
//                 // Pas d'héritage complet de process.env
//             },
//             uid: 1000, // ✅ Force un UID non-root si possible
//             gid: 1000,
//             cwd: userHomeDir // ✅ Répertoire de travail contrôlé
//         });
//         return {
//             content: [{
//                 type: "text",
//                 text: stdout || stderr || "Commande exécutée sans sortie",
//                 shell: cleanCommand,
//             }]
//         };
//     } catch (error) {
//         const errorMessage = error instanceof Error ? error.message : String(error);
//         return {
//             content: [{
//                 type: "text",
//                 text: `❌ Error executing command:\n${errorMessage}`,
//                 error: errorMessage
//             }]
//         };
//     }
// });
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main();
