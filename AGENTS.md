# Development rules

- Keep story tap-region logic in a browser-safe pure module next to the story viewer, with Node test coverage, so navigation can be checked without account credentials.
- Use the existing dropdown-menu and Button components for story actions, above the viewer stacking layer, so controls remain accessible without triggering media navigation.
