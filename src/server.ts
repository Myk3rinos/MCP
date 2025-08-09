import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";


const execAsync = promisify(exec);

// Get the user directory path
const userHomeDir = process.env.USER_HOME || os.homedir();
const userName = process.env.USER || os.userInfo().username;

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

// Resource to get a user's details
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

// Tool to create a new user
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
        const users = await import("./data/users.json", {
            with: {type: "json" },
        }).then((module) => module.default);
        const id = users.length + 1;
        users.push({ id, ...params });
        await fs.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));
    
        // const id = await createUser(params);
        return {
            content: [{
                type: "text",
                text: `✓ User ${params.name} with id ${id} created successfully`,
            }]
        }    
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `✗ Error creating user ${params.name}: ${error}`,
                error: error
            }]
        }    
    }  
})

// Tool to add a note
server.tool("add-note", "Add a new line to the notes file", {
    text: z.string().describe("The text to add to the notes file"),
}, {
    title: "Add Note",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ text }) => {
    try {
        const notesDir = path.join(userHomeDir, 'Documents', 'notes');
        // Create the directory if it doesn't exist
        await fs.mkdir(notesDir, { recursive: true });
        // Add the new line to the file
        await fs.appendFile(path.join(notesDir, 'note.txt'), `${new Date().toISOString()} - ${text}\n`);
        
        return {
            content: [{
                type: "text",
                text: `✓ Note added successfully`,
            }]
        };
    } catch (error) {
        console.error("✗ Error while adding the note:", error);
        return {
            content: [{
                type: "text",
                text: `✗ Error while adding the note`,
                error: error
            }]
        };
    }
})

// Tool to change the wallpaper
server.tool("change-wallpaper", "Change random wallpaper", {
    command: z.string().optional().default("gsettings")
}, {
    title: "Change Random Wallpaper",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ command }) => {
    try {        
        // Lire le contenu du dossier des wallpapers
        const wallpapersDir = path.join(userHomeDir, 'Images', 'wallpapers');
        const files = await fs.readdir(wallpapersDir);
        
        if (files.length === 0) {
            throw new Error("No wallpapers found in the directory");
        }
        
        // Filtrer pour ne garder que les fichiers images
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
        const imageFiles = files.filter(file => 
            imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
        );
        
        if (imageFiles.length === 0) {
            throw new Error("No valid images found in the wallpapers directory");
        }
        
        // Choisir une image aléatoire
        const randomIndex = Math.floor(Math.random() * imageFiles.length);
        const selectedWallpaper = path.join(wallpapersDir, imageFiles[randomIndex]);
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
                text: `✓ Wallpaper changed successfully`
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `✗ Command failed: ${error}`,
                error: error
            }]
        };
    }
});

// Tool to play a random music file from ~/Musique using Rhythmbox
server.tool("play-random-music", "Play a random audio file from a music directory using Rhythmbox", {
    directory: z.string().optional().describe("Music directory (default: ~/Musique)"),
    recursive: z.boolean().optional().default(true).describe("Search subdirectories recursively"),
    exts: z.array(z.string()).optional().describe("List of audio extensions to include, e.g., ['mp3','flac']"),
    player: z.string().optional().default("rhythmbox").describe("Player command to run (default: 'rhythmbox')")
}, {
    title: "Play Random Music",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ directory, recursive, exts, player }) => {
    try {
        const resolveTilde = (p: string) => p.startsWith('~') ? path.join(userHomeDir, p.slice(1)) : p;
        const baseCandidates: string[] = [];
        if (directory && directory.trim()) {
            baseCandidates.push(resolveTilde(directory.trim()));
        } else {
            baseCandidates.push(
                path.join(userHomeDir, 'Musique'),
                path.join(userHomeDir, 'Music'),
                path.join(userHomeDir, 'music')
            );
        }
        const exists = async (p: string) => !!await fs.stat(p).then(() => true).catch(() => false);
        let baseDir = '';
        for (const cand of baseCandidates) {
            if (await exists(cand)) { baseDir = cand; break; }
        }
        if (!baseDir) {
            return { content: [{ type: 'text', text: `✗ No music directory found. Tried: ${baseCandidates.join(', ')}. Pass the 'directory' parameter, e.g. { "directory": "~/Musique" }` }] };
        }
        const allowExts = (exts && exts.length ? exts : ['mp3','flac','wav','ogg','m4a','aac','opus'])
            .map(e => e.replace(/^\./, '').toLowerCase());

        // Recursively collect files (cap at 5000 to avoid huge scans)
        const files: string[] = [];
        const walk = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const ent of entries) {
                const p = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (recursive && files.length < 5000) {
                        await walk(p);
                    }
                } else if (ent.isFile()) {
                    const ext = path.extname(ent.name).slice(1).toLowerCase();
                    if (allowExts.includes(ext)) files.push(p);
                }
                if (files.length >= 5000) break;
            }
        };
        await walk(baseDir);
        if (files.length === 0) {
            return { content: [{ type: 'text', text: `✗ No audio files found in ${baseDir} (extensions: ${allowExts.join(', ')})` }] };
        }

        const pick = files[Math.floor(Math.random() * files.length)];
        const quoted = `"${pick.replace(/\"/g, '\\"')}"`;
        const fileUri = 'file://' + encodeURI(pick.replace(/\\/g, '/'));
        const preferred = player || 'rhythmbox';

        const env = { ...process.env, DISPLAY: ":0", HOME: userHomeDir, USER: userName };
        const withCtx = (cmd: string) => `DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" ${cmd}`;

        const attempts: string[] = [
            withCtx(`rhythmbox-client --play-uri=${fileUri}`),
            withCtx(`${preferred} ${quoted}`),
            withCtx(`gio open ${quoted}`),
            withCtx(`xdg-open ${quoted}`),
        ];

        const pickName = path.basename(pick);
        const errors: string[] = [];
        for (const cmd of attempts) {
            try {
                await execAsync(cmd, { timeout: 8000, env });
                return { content: [{ type: 'text', text: `✓ Playing: ${pickName}\n` }] };
                // return { content: [{ type: 'text', text: `✓ Playing: ${pick}\nCommand: ${cmd}` }] };
            } catch (e: any) {
                const msg = e && typeof e === 'object'
                    ? [e.message, e.stderr, e.stdout].filter(Boolean).join('\n')
                    : String(e);
                errors.push(`- ${cmd}\n  -> ${msg}`);
            }
        }

        return { content: [{ type: 'text', text: `✗ Failed to launch any player. Tried:\n${errors.join('\n')}` }] };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to play music: ${msg}`, error: msg }] };
    }
});

// Tool to get weather by city name using Open-Meteo (English output)
server.tool("get-weather", "Get current weather and a multi-day forecast for a city using Open-Meteo (no API key)", {
    city: z.string().describe("City name, e.g., London"),
    days: z.number().int().min(1).max(7).optional().default(3).describe("Number of forecast days (1-7)"),
    units: z.enum(["metric", "imperial"]).optional().default("metric").describe("Units system: metric or imperial")
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
        function describeCodeEn(code: number): string {
            const map: { [k: number]: string } = {
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

        return { content: [{ type: 'text', text: out || `✗ No weather data available for ${locationLabel}` }] };
    } catch (err) {
        return { content: [{ type: 'text', text: `✗ Error while retrieving weather: ${err}`, error: err as any }] };
    }
});


// ---------------------- Tools ----------------------

// Tool to show files in a directory
server.tool("list-files", "List files in a directory with full french linux path", {
    directory: z.string().optional().default(userHomeDir).describe("Directory to list"),
    args: z.string().optional().default("-la").describe("Arguments to pass to ls (default: -la) or --tree for tree view")
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
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                type: "text",
                text: `✗ Erreur lors de l'exécution de la commande ls :\n\`\`\`\n${errorMessage}\`\`\``,
                error: errorMessage
            }]
        };
    }
});
// Tool to read a file and return its contents (English)
server.tool("read-file", "Read a file and return its contents (truncated if too large)", {
    file: z.string().describe("Absolute or relative path to the file. '~' is supported."),
    encoding: z.enum(["utf-8", "utf8", "latin1", "base64"]).optional().default("utf-8").describe("Output encoding"),
    maxBytes: z.number().int().min(1).max(10 * 1024 * 1024).optional().default(200_000).describe("Max bytes to return (1-10MB)")
}, {
    title: "Read File",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ file, encoding, maxBytes }) => {
    try {
        // Resolve path (~, absolute, or relative to user's home)
        const resolvePath = (p: string) => {
            if (p.startsWith('~')) return path.join(userHomeDir, p.slice(1));
            return path.isAbsolute(p) ? p : path.join(userHomeDir, p);
        };
        const fullPath = resolvePath(file);

        // Ensure the target exists and is a file
        const st = await fs.stat(fullPath);
        if (!st.isFile()) {
            return { content: [{ type: 'text', text: `Path is not a file: ${fullPath}` }] };
        }

        // Read at most maxBytes
        const data = await fs.readFile(fullPath);
        const truncated = data.length > maxBytes;
        const slice = truncated ? data.subarray(0, maxBytes) : data;

        // Format output
        const text = (encoding === 'base64') ? slice.toString('base64') : slice.toString(encoding as BufferEncoding);
        const meta = `File: ${fullPath}\nSize: ${st.size} bytes\nReturned: ${slice.length} bytes${truncated ? ' (truncated)' : ''}`;

        return {
            content: [{
                type: 'text',
                text: `${meta}\n\n${text}`
            }]
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Failed to read file: ${msg}`, error: msg }] };
    }
});

// Tool to write content to a file (English)
server.tool("write-file", "Write text content to a file (append or overwrite)", {
    file: z.string().describe("Absolute or relative path to the file. '~' is supported."),
    content: z.string().describe("Text content to write"),
    encoding: z.enum(["utf-8", "utf8", "latin1", "base64"]).optional().default("utf-8").describe("Input/content encoding"),
    mode: z.enum(["overwrite", "append"]).optional().default("overwrite").describe("Overwrite the file or append to it"),
    makeDirs: z.boolean().optional().default(true).describe("Create parent directories if they don't exist")
}, {
    title: "Write File",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ file, content, encoding, mode, makeDirs }) => {
    try {
        const resolvePath = (p: string) => {
            if (p.startsWith('~')) return path.join(userHomeDir, p.slice(1));
            return path.isAbsolute(p) ? p : path.join(userHomeDir, p);
        };
        const fullPath = resolvePath(file);

        // Ensure parent directory exists
        const dir = path.dirname(fullPath);
        if (makeDirs) {
            await fs.mkdir(dir, { recursive: true });
        }

        // Prepare buffer from content per encoding
        const buf = Buffer.from(content, encoding as BufferEncoding);

        if (mode === 'append') {
            await fs.appendFile(fullPath, buf);
        } else {
            await fs.writeFile(fullPath, buf);
        }

        // Stat the file after write
        const st = await fs.stat(fullPath).catch(() => null);
        const sizeInfo = st ? `${st.size} bytes` : 'unknown size';

        return {
            content: [{
                type: 'text',
                text: `Wrote ${buf.length} bytes to ${fullPath} (${mode}). File size: ${sizeInfo}`
            }]
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Failed to write file: ${msg}`, error: msg }] };
    }
});


// ----------------- CALENDAR -----------------------------

// Tool to add a calendar event on Ubuntu (creates .ics and opens it for import)
server.tool("add-calendar-event", "Create a calendar event (.ics) and open it for import in GNOME Calendar (Ubuntu)", {
    title: z.string().describe("Event title"),
    start: z.string().describe("Start datetime in ISO 8601, e.g. 2025-08-10T14:00:00"),
    end: z.string().optional().describe("End datetime in ISO 8601. If not provided, durationMinutes is used"),
    durationMinutes: z.number().int().positive().optional().default(60).describe("Duration in minutes if end not provided"),
    description: z.string().optional().default("").describe("Event description"),
    location: z.string().optional().default("").describe("Event location"),
    allDay: z.boolean().optional().default(false).describe("All-day event"),
    reminderMinutes: z.number().int().min(0).max(1440).optional().default(30).describe("Reminder before event in minutes (0 to disable)"),
}, {
    title: "Add Calendar Event",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ title, start, end, durationMinutes, description, location, allDay, reminderMinutes }) => {
    try {
        // Parse dates
        const startDate = new Date(start);
        if (isNaN(startDate.getTime())) {
            return { content: [{ type: 'text', text: `Invalid start datetime: ${start}` }] };
        }
        let endDate: Date;
        if (end) {
            endDate = new Date(end);
            if (isNaN(endDate.getTime())) {
                return { content: [{ type: 'text', text: `Invalid end datetime: ${end}` }] };
            }
        } else {
            endDate = new Date(startDate.getTime() + (durationMinutes || 60) * 60 * 1000);
        }

        const pad = (n: number) => String(n).padStart(2, '0');
        const toUTCStamp = (d: Date) => {
            return (
                d.getUTCFullYear().toString() +
                pad(d.getUTCMonth() + 1) +
                pad(d.getUTCDate()) + 'T' +
                pad(d.getUTCHours()) +
                pad(d.getUTCMinutes()) +
                pad(d.getUTCSeconds()) + 'Z'
            );
        };
        const toDateOnly = (d: Date) => {
            return (
                d.getUTCFullYear().toString() +
                pad(d.getUTCMonth() + 1) +
                pad(d.getUTCDate())
            );
        };

        const now = new Date();
        const uid = `${now.getTime()}-${Math.random().toString(36).slice(2)}@mcp.local`;
        const dtstamp = toUTCStamp(now);

        // Build ICS content
        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//MCP//Calendar Tool//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${dtstamp}`,
            `SUMMARY:${title.replace(/\n/g, ' ')}`,
        ];

        if (allDay) {
            // For all-day: DTSTART/DTEND are VALUE=DATE and DTEND is exclusive next day
            const startDateOnly = toDateOnly(startDate);
            const endExclusive = new Date(endDate);
            // ensure endExclusive is next day when same day given
            if (endExclusive <= startDate) {
                endExclusive.setUTCDate(startDate.getUTCDate() + 1);
            }
            const endDateOnly = toDateOnly(endExclusive);
            lines.push(`DTSTART;VALUE=DATE:${startDateOnly}`);
            lines.push(`DTEND;VALUE=DATE:${endDateOnly}`);
        } else {
            lines.push(`DTSTART:${toUTCStamp(startDate)}`);
            lines.push(`DTEND:${toUTCStamp(endDate)}`);
        }

        if (location) lines.push(`LOCATION:${location.replace(/\n/g, ' ')}`);
        if (description) lines.push(`DESCRIPTION:${description.replace(/\n/g, ' ')}`);

        if (reminderMinutes && reminderMinutes > 0) {
            lines.push('BEGIN:VALARM');
            lines.push('ACTION:DISPLAY');
            lines.push(`TRIGGER:-PT${reminderMinutes}M`);
            lines.push(`DESCRIPTION:Reminder for ${title.replace(/\n/g, ' ')}`);
            lines.push('END:VALARM');
        }

        lines.push('END:VEVENT');
        lines.push('END:VCALENDAR');

        const icsContent = lines.join('\n');

        // Save ICS to a user calendar directory
        const eventsDir = path.join(userHomeDir, 'Calendar', 'events');
        await fs.mkdir(eventsDir, { recursive: true });
        const fileNameSafe = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'event';
        const filePath = path.join(eventsDir, `${fileNameSafe}-${now.getTime()}.ics`);
        await fs.writeFile(filePath, icsContent, 'utf8');

        // Try to open with gio to prompt GNOME Calendar import
        let importNote = '';
        try {
            const { stdout, stderr } = await execAsync(`gio open "${filePath}"`, {
                env: { ...process.env, DISPLAY: ':0', HOME: userHomeDir, USER: userName },
                timeout: 5000,
            });
            importNote = `Opened for import via gio. ${stderr ? 'Warnings: ' + stderr : ''}`;
        } catch (e) {
            importNote = 'Could not open automatically. Please open the .ics file to import it in your calendar.';
        }

        return {
            content: [{
                type: 'text',
                text: `✓ Event created and saved to ${filePath}\n${importNote}`
            }]
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to create event: ${msg}`, error: msg }] };
    }
});

// Tool to list calendar events saved as .ics in ~/Calendar/events
server.tool("list-calendar-events", "List saved .ics events with basic details", {
    directory: z.string().optional().describe("Directory containing .ics files (default: ~/Calendar/events)"),
    limit: z.number().int().min(1).max(500).optional().default(100).describe("Max number of events to list"),
    sort: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort by file mtime (newest first by default)")
}, {
    title: "List Calendar Events",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ directory, limit, sort }) => {
    try {
        const baseDir = directory
            ? (directory.startsWith('~') ? path.join(userHomeDir, directory.slice(1)) : directory)
            : path.join(userHomeDir, 'Calendar', 'events');
        await fs.mkdir(baseDir, { recursive: true });
        const files = (await fs.readdir(baseDir)).filter(f => f.toLowerCase().endsWith('.ics'));
        const entries = await Promise.all(files.map(async f => {
            const full = path.join(baseDir, f);
            const st = await fs.stat(full);
            return { file: f, path: full, mtime: st.mtimeMs };
        }));
        entries.sort((a, b) => sort === 'asc' ? a.mtime - b.mtime : b.mtime - a.mtime);
        const pick = entries.slice(0, limit);

        const details = await Promise.all(pick.map(async e => {
            const content = await fs.readFile(e.path, 'utf8');
            // crude parse: find lines
            const get = (k: string) => {
                const m = content.match(new RegExp(`^${k}:(.*)$`, 'm'));
                return m ? m[1].trim() : '';
            };
            const uid = get('UID');
            const summary = get('SUMMARY');
            const location = get('LOCATION');
            const dtstart = get('DTSTART') || get('DTSTART;VALUE=DATE');
            const dtend = get('DTEND') || get('DTEND;VALUE=DATE');
            return `• ${summary || '(no title)'}\n  UID: ${uid}\n  File: ${e.file}\n  DTSTART: ${dtstart}\n  DTEND: ${dtend}${location ? `\n  Location: ${location}` : ''}`;
        }));

        return {
            content: [{ type: 'text', text: details.length ? details.join('\n\n') : `No .ics events found in ${baseDir}` }]
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to list events: ${msg}`, error: msg }] };
    }
});

// Tool to delete a calendar event by UID or file path
server.tool("delete-calendar-event", "Delete a saved .ics event by UID or filename", {
    uid: z.string().optional().describe("Event UID to delete (from the .ics contents)"),
    file: z.string().optional().describe("Filename or absolute path to the .ics to delete"),
    directory: z.string().optional().describe("Events directory if deleting by filename (default: ~/Calendar/events)")
}, {
    title: "Delete Calendar Event",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ uid, file, directory }) => {
    try {
        if (!uid && !file) {
            return { content: [{ type: 'text', text: 'Provide either uid or file to delete.' }] };
        }

        let targetPath: string | null = null;
        if (file) {
            targetPath = file.startsWith('~') ? path.join(userHomeDir, file.slice(1)) : (path.isAbsolute(file) ? file : path.join(userHomeDir, 'Calendar', 'events', file));
        } else if (uid) {
            const baseDir = directory
                ? (directory.startsWith('~') ? path.join(userHomeDir, directory.slice(1)) : directory)
                : path.join(userHomeDir, 'Calendar', 'events');
            const files = (await fs.readdir(baseDir)).filter(f => f.toLowerCase().endsWith('.ics'));
            for (const f of files) {
                const p = path.join(baseDir, f);
                const content = await fs.readFile(p, 'utf8');
                if (new RegExp(`^UID:${uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(content)) {
                    targetPath = p;
                    break;
                }
            }
            if (!targetPath) {
                return { content: [{ type: 'text', text: `Event with UID not found: ${uid}` }] };
            }
        }

        if (!targetPath) {
            return { content: [{ type: 'text', text: 'No target file resolved to delete.' }] };
        }
        await fs.unlink(targetPath);
        return { content: [{ type: 'text', text: `✓ Deleted event file: ${targetPath}` }] };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to delete event: ${msg}`, error: msg }] };
    }
});

// Tool to update a calendar event by UID (rebuilds .ics while preserving UID)
server.tool("update-calendar-event", "Update fields of an existing .ics event identified by UID", {
    uid: z.string().describe("UID of the event to update"),
    directory: z.string().optional().describe("Events directory (default: ~/Calendar/events)"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    location: z.string().optional().describe("New location"),
    start: z.string().optional().describe("New start datetime ISO 8601"),
    end: z.string().optional().describe("New end datetime ISO 8601"),
    durationMinutes: z.number().int().positive().optional().describe("If end not provided, use duration from start"),
    allDay: z.boolean().optional().describe("Set as all-day event"),
    reminderMinutes: z.number().int().min(0).max(1440).optional().describe("Reminder minutes (0 disables)")
}, {
    title: "Update Calendar Event",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async (args) => {
    try {
        const baseDir = args.directory
            ? (args.directory.startsWith('~') ? path.join(userHomeDir, args.directory.slice(1)) : args.directory)
            : path.join(userHomeDir, 'Calendar', 'events');
        await fs.mkdir(baseDir, { recursive: true });
        const files = (await fs.readdir(baseDir)).filter(f => f.toLowerCase().endsWith('.ics'));
        let targetPath: string | null = null;
        let existing: string | null = null;
        for (const f of files) {
            const p = path.join(baseDir, f);
            const content = await fs.readFile(p, 'utf8');
            if (new RegExp(`^UID:${args.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(content)) {
                targetPath = p;
                existing = content;
                break;
            }
        }
        if (!targetPath || !existing) {
            return { content: [{ type: 'text', text: `Event with UID not found: ${args.uid}` }] };
        }

        // Extract current fields with simple regexes
        const get = (k: string) => {
            const m = existing!.match(new RegExp(`^${k}:(.*)$`, 'm'));
            return m ? m[1].trim() : '';
        };
        const currentSummary = get('SUMMARY');
        const currentLocation = get('LOCATION');
        const currentDescription = get('DESCRIPTION');
        const currentDtStart = get('DTSTART') || get('DTSTART;VALUE=DATE');
        const currentDtEnd = get('DTEND') || get('DTEND;VALUE=DATE');

        // Decide new values
        const title = args.title ?? currentSummary;
        const location = args.location ?? currentLocation;
        const description = args.description ?? currentDescription;

        const parseICSToDate = (s: string): Date | null => {
            if (!s) return null;
            // Supports YYYYMMDD or YYYYMMDDThhmmssZ
            if (/^\d{8}$/.test(s)) {
                const y = Number(s.slice(0,4));
                const m = Number(s.slice(4,6));
                const d = Number(s.slice(6,8));
                return new Date(Date.UTC(y, m-1, d, 0, 0, 0));
            }
            if (/^\d{8}T\d{6}Z$/.test(s)) {
                const y = Number(s.slice(0,4));
                const m = Number(s.slice(4,6));
                const d = Number(s.slice(6,8));
                const hh = Number(s.slice(9,11));
                const mm = Number(s.slice(11,13));
                const ss = Number(s.slice(13,15));
                return new Date(Date.UTC(y, m-1, d, hh, mm, ss));
            }
            return null;
        };

        const startIso = args.start ?? (currentDtStart ? (parseICSToDate(currentDtStart)?.toISOString() ?? '') : '');
        const endIso = args.end ?? (currentDtEnd ? (parseICSToDate(currentDtEnd)?.toISOString() ?? '') : '');

        let startDate: Date | null = startIso ? new Date(startIso) : null;
        let endDate: Date | null = endIso ? new Date(endIso) : null;
        const allDay = args.allDay ?? /^\d{8}$/.test(currentDtStart);
        if (startDate && !endDate) {
            endDate = new Date(startDate.getTime() + (args.durationMinutes ?? 60) * 60 * 1000);
        }
        if (!startDate) {
            return { content: [{ type: 'text', text: `Provide start (or ensure existing DTSTART is parsable)` }] };
        }
        if (!endDate) {
            return { content: [{ type: 'text', text: `Provide end or durationMinutes` }] };
        }

        const pad = (n: number) => String(n).padStart(2, '0');
        const toUTCStamp = (d: Date) => (
            d.getUTCFullYear().toString() +
            pad(d.getUTCMonth() + 1) +
            pad(d.getUTCDate()) + 'T' +
            pad(d.getUTCHours()) +
            pad(d.getUTCMinutes()) +
            pad(d.getUTCSeconds()) + 'Z'
        );
        const toDateOnly = (d: Date) => (
            d.getUTCFullYear().toString() +
            pad(d.getUTCMonth() + 1) +
            pad(d.getUTCDate())
        );

        const now = new Date();
        const dtstamp = toUTCStamp(now);

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//MCP//Calendar Tool//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${args.uid}`,
            `DTSTAMP:${dtstamp}`,
            `SUMMARY:${(title || '').replace(/\n/g, ' ')}`,
        ];
        if (allDay) {
            const startDateOnly = toDateOnly(startDate);
            const endExclusive = new Date(endDate);
            if (endExclusive <= startDate) endExclusive.setUTCDate(startDate.getUTCDate() + 1);
            const endDateOnly = toDateOnly(endExclusive);
            lines.push(`DTSTART;VALUE=DATE:${startDateOnly}`);
            lines.push(`DTEND;VALUE=DATE:${endDateOnly}`);
        } else {
            lines.push(`DTSTART:${toUTCStamp(startDate)}`);
            lines.push(`DTEND:${toUTCStamp(endDate)}`);
        }
        if (location) lines.push(`LOCATION:${location.replace(/\n/g, ' ')}`);
        if (description) lines.push(`DESCRIPTION:${description.replace(/\n/g, ' ')}`);

        const reminder = args.reminderMinutes;
        if (typeof reminder === 'number') {
            if (reminder > 0) {
                lines.push('BEGIN:VALARM');
                lines.push('ACTION:DISPLAY');
                lines.push(`TRIGGER:-PT${reminder}M`);
                lines.push(`DESCRIPTION:Reminder for ${(title || '').replace(/\n/g, ' ')}`);
                lines.push('END:VALARM');
            }
            // if 0, no VALARM block
        }
        lines.push('END:VEVENT');
        lines.push('END:VCALENDAR');

        await fs.writeFile(targetPath, lines.join('\n'), 'utf8');
        return { content: [{ type: 'text', text: `✓ Updated event UID ${args.uid} at ${targetPath}` }] };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to update event: ${msg}`, error: msg }] };
    }
});

// Tool to export calendar events as JSON or CSV
server.tool("export-calendar-events", "Export .ics events from a directory as JSON or CSV", {
    directory: z.string().optional().describe("Events directory (default: ~/Calendar/events)"),
    format: z.enum(["json", "csv"]).optional().default("json").describe("Export format")
}, {
    title: "Export Calendar Events",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
}, async ({ directory, format }) => {
    try {
        const baseDir = directory
            ? (directory.startsWith('~') ? path.join(userHomeDir, directory.slice(1)) : directory)
            : path.join(userHomeDir, 'Calendar', 'events');
        await fs.mkdir(baseDir, { recursive: true });
        const files = (await fs.readdir(baseDir)).filter(f => f.toLowerCase().endsWith('.ics'));
        const rows: any[] = [];
        for (const f of files) {
            const p = path.join(baseDir, f);
            const content = await fs.readFile(p, 'utf8');
            const pick = (k: string) => {
                const m = content.match(new RegExp(`^${k}:(.*)$`, 'm'));
                return m ? m[1].trim() : '';
            };
            rows.push({
                file: f,
                uid: pick('UID'),
                summary: pick('SUMMARY'),
                location: pick('LOCATION'),
                description: pick('DESCRIPTION'),
                dtstart: pick('DTSTART') || pick('DTSTART;VALUE=DATE'),
                dtend: pick('DTEND') || pick('DTEND;VALUE=DATE'),
            });
        }
        if (format === 'json') {
            return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
        } else {
            const header = ['file','uid','summary','location','description','dtstart','dtend'];
            const csv = [header.join(',')].concat(rows.map(r => header.map(h => {
                const v = (r[h] ?? '').toString().replace(/"/g, '""');
                return `"${v}"`;
            }).join(','))).join('\n');
            return { content: [{ type: 'text', text: csv }] };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `✗ Failed to export events: ${msg}`, error: msg }] };
    }
});


// ---------------------- COMMANDS ----------------------

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
    command: z.string().describe("The command to execute"),
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
            } catch (e) {
                // Si la regex est malformée, considérer comme non-match
                return false;
            }
        });

        // Vérifier aussi la commande normalisée (sans sudo)
        const isNormalizedBlacklisted = BLACKLISTED_COMMANDS.some(forbidden => {
            try {
                const regex = new RegExp(forbidden, 'i');
                return regex.test(normalizedCmd);
            } catch (e) {
                return false;
            }
        });



        if (isBlacklisted || isNormalizedBlacklisted || isBlacklisted2 || isNormalizedBlacklisted2) {
            return {
                content: [{
                    type: "text",
                    text: "✗ Erreur : Cette commande est interdite pour des raisons de sécurité.",
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
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                type: "text",
                text: `✗ Error executing command:\n${errorMessage}`,
                error: errorMessage
            }]
        };
    }
});



async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main();
