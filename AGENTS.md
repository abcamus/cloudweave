# Project Knowledge

## Solved Issues

### Canvas flickering during panning (2026-07-06)
- **Symptoms**: Entire Obsidian UI flickers when panning canvas
- **Root cause 1**: `backdrop-filter: blur(12px)` in glass card style — forces GPU to recomposite blurred background every frame, causing full-window repaint
- **Fix**: Removed `backdrop-filter`, use semi-transparent background instead
- **Root cause 2**: `MutationObserver` watching entire `document.body` with `subtree: true` — fires on every DOM mutation during canvas operation
- **Fix**: Added early return `if (!isCanvasBgContextMenu && !isCanvasNodeContextMenu) return` so observer does no work during normal canvas use

### Canvas context menu cloud item missing icon (2026-07-06)
- **Symptoms**: "Insert from cloud storage" menu item had empty icon area
- **Root cause**: Used `createDiv` for icon and title (native items use `span`), and never called `setIcon`
- **Fix**: Changed to `createSpan` + `setIcon(icon, "cloud")`, matching native menu item structure

### Card style settings implementation (2026-07-06)
- Styles: Notion (clean shadow), Linear (glass, no backdrop-filter), Milanote (sticky), Figma (border accent)
- Applied via `body` class toggle (`cc-card-style-{name}`)
- Persisted with `plugin.loadData/saveData`
- Card style dropdown in settings tab

### Batch insert directory as tree (2026-07-06)
- Folders as text cards (not group nodes)
- Edges removed (pure layout positioning instead)
- Recursive sub-directory expansion (depth=1)
- 3-column grid layout for children

## Key Patterns

### Canvas injection
- Layout buttons into `.canvas-controls`: inject once via flag (`layoutInjected`)
- Cloud/AI buttons into `.canvas-card-menu` / `.canvas-menu`: inject via 1s poll
- Use marker classes (`cc-layout-btn`, `cc-cloud-insert-btn`, `cc-ai-menu-items`) to prevent re-injection
- Poll runs at 1000ms (was 500ms — reduced to prevent interference with canvas animation)

### DOM element creation
- Use `createSpan` not `createDiv` for native menu item children
- Use `activeDocument.createElementNS` not `document.createElementNS` for pop-out window compatibility

### Settings
- LLM config uses `app.loadLocalStorage` / `app.saveLocalStorage`
- Plugin settings use `plugin.loadData` / `plugin.saveData`

### Collapsible settings sections
- Use `<details><summary>` HTML elements styled in `styles.css` (`.cc-settings-section`, `.cc-settings-summary`, `.cc-settings-content`)
- Section expanded state persisted via `app.loadLocalStorage/saveLocalStorage` under key `"cc-settings-collapse"`
- `buildSection(key, parent, fn)` helper: passes `content` div to callback so `Setting` instances attach to the right container
