# MCP Demo Server

This project is a demonstration server for the Model Context Protocol (MCP). It provides a set of resources and tools to interact with a simple user database.

## Architecture

```
mcp/
├───.gitignore
├───package-lock.json
├───package.json
├───tsconfig.json
├───.git/...
├───build/
│   └───data/...
└───src/
    ├───server.ts
    └───data/
        └───users.json
```

The server is built with Node.js and TypeScript, using the `@modelcontextprotocol/sdk`. It communicates over standard I/O using a `StdioServerTransport`.

The server exposes the following:

*   **Resources:**
    *   `user-details`: Fetches user profiles from a JSON file.
*   **Tools:**
    *   `create-user`: Creates a new user in the JSON database.
    *   `add-note`: Adds a note to a local file in the user's documents directory.

## Installation

1.  Clone the repository.
2.  Install the dependencies:

    ```bash
    npm install
    ```

3.  Build the server:

    ```bash
    npm run server:build
    ```

## Usage

To start the server, run:

```bash
npm start
```

For development, you can use:

```bash
npm run server:dev
```

This will start the server with `tsx` for automatic recompilation.

## Available Scripts

*   `npm start`: Starts the production server.
*   `npm run server:dev`: Starts the development server.
*   `npm run server:build`: Compiles the TypeScript code.
*   `npm run server:build:watch`: Compiles the TypeScript code in watch mode.
*   `npm run server:inspect`: Inspects the server using the MCP Inspector.

## Resources

### `user-details`

*   **Description:** Get a user's details from the database.
*   **URI:** `users://{userId}/profile`
*   **MIME Type:** `application/json`

## Tools

### `create-user`

*   **Description:** Create a new user in the database.
*   **Parameters:**
    *   `name` (string)
    *   `email` (string)
    *   `address` (string)
    *   `phone` (string)
    *   `password` (string)

### `add-note`

*   **Description:** Adds a new line to the notes file.
*   **Parameters:**
    *   `text` (string): The text to add to the notes file.
