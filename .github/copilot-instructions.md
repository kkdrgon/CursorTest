# Copilot Instructions for webGL Game Workspace

## Project Overview
This workspace implements a browser-based tower defense game using JavaScript and WebGL. The main logic is in `worker.js`, which manages game state, entities, and communication with the main thread via `postMessage`. Rendering and UI are handled in `index.html` and related `.glsl` shader files.

## Key Components
- `worker.js`: Core game logic, entity management (towers, enemies, bullets), game state updates, and message handling.
- `.glsl` files: Shaders for WebGL rendering (vertex and fragment shaders).
- `index.html`: Entry point for the game, sets up the WebGL context and UI.

## Data Flow & Architecture
- Game state is encapsulated in the `GameState` class in `worker.js`.
- Entities (towers, enemies, bullets) are stored in Maps for efficient access and mutation.
- Game loop advances via `nextTick`, updating entities and posting render data to the main thread.
- Communication between worker and main thread uses `postMessage` with structured payloads (e.g., `{ type: 'render', data: ... }`).
- SharedArrayBuffer is used for efficient transfer of render data.

## Developer Workflows
- **Debugging**: Use `console.log` in `worker.js` for inspecting game state. The worker posts messages for key events (e.g., gold, HP, defeat).
- **Hot Reload**: Refresh `index.html` in the browser to reload the game and worker.
- **Shader Updates**: Edit `.glsl` files and reload the page to see changes.

## Project-Specific Patterns
- Entity IDs are managed via incrementing counters (`towerId`, `enemyId`, `bulletId`).
- Game logic is highly stateful; avoid stateless refactors unless preserving all side effects.
- Grid-based pathfinding and collision logic are custom and rely on direct array manipulation.
- All game state mutations occur inside the worker; main thread only triggers actions via messages.
- Tower upgrades and deletions are handled by specific message types (`update`, `delete`).

## Integration Points
- No external dependencies; all logic is custom and self-contained.
- WebGL rendering is tightly coupled to the data format produced by the worker.
- No build system or test framework detected; manual browser testing is standard.

## Examples
- To add a new tower type, update the `towerData` array in `worker.js`.
- To change enemy behavior, modify `enemyData` and related logic in `processEnemy`.
- To extend rendering, update the data format in the `postMessage({ type: 'render', ... })` payload and corresponding shader code.

## Conventions
- Use ES6 classes and Maps for entity management.
- All coordinates and directions use the `Vector2` class.
- Maintain message type consistency between worker and main thread.

---
For questions or unclear patterns, review `worker.js` for canonical logic and data flows. Suggest improvements or request clarification for any ambiguous sections.
