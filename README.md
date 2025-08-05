# MCP Personal Tools Server

This project is a simple server that implements the Model Context Protocol (MCP). It exposes a set of personal tools that can be used by a compatible MCP client or agent. The initial tool allows for adding notes to a local file.

<a href="https://glama.ai/mcp/servers/@Myk3rinos/MCP">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Myk3rinos/MCP/badge" alt="Personal Tools Server MCP server" />
</a>

## Features

*   **Model Context Protocol (MCP) Server**: Built using the `@modelcontextprotocol/sdk`.
*   **Extensible Toolset**: Designed to be easily extended with new custom tools.
*   **Note-Taking Tool**: Includes a simple `add-note` tool to append text to a notes file.

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)

## Installation

1.  Clone the repository or set up the project files.
2.  Install the required dependencies:
    ```bash
    npm install
    ```

## Usage

There are several ways to run the server.

### Development Mode

To run the server with hot-reloading for development, use:
```bash
npm run server:dev
```

### Production

1.  **Build the TypeScript code:**
    This command compiles the `src/server.ts` file into JavaScript in the `build` directory.
    ```bash
    npm run build
    ```

2.  **Start the server:**
    This command runs the compiled server.
    ```bash
    npm start
    ```

### Inspecting the Server

The Model Context Protocol includes an inspector tool to view the server's capabilities (like the tools it offers). To use it, run:
```bash
npm run server:inspect
```
This will start your server and open the inspector, allowing you to see the available tools and their schemas.

## Available Tools

### `add-note`

*   **Description**: Adds a new line with a timestamp to a notes file.
*   **Parameters**:
    *   `text` (string): The text content to add to the note.
*   **File Location**: The notes are stored in a file named `note.txt` located in `~/Documents/notes/`. The directory is created automatically if it does not exist.

## How to Add a New Tool

You can easily add new tools to the server by following the pattern in `src/server.ts`.

1.  Open `src/server.ts`.
2.  Use the `server.tool()` method to define your new tool.
3.  Provide a name, a description, a Zod schema for the input parameters, and an async function to execute the tool's logic.

### Example

```typescript
server.tool("new-tool-name", "A description of what the new tool does.", {
    // Define input parameters using Zod
    param1: z.string().describe("Description for param1"),
    param2: z.boolean().describe("Description for param2"),
}, {
    // Tool metadata (optional but recommended)
    title: "New Tool Title",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
}, async ({ param1, param2 }) => {
    // Your tool's logic here
    console.log(`Executing with: ${param1} and ${param2}`);
    
    // Return a result
    return {
        content: [{ type: "text", text: "New tool executed successfully!" }]
    };
})
```