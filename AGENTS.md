# Development rules

- Keep story tap-region logic in a browser-safe pure module next to the story viewer, with Node test coverage, so navigation can be checked without account credentials.
- Use the existing dropdown-menu and Button components for story actions, above the viewer stacking layer, so controls remain accessible without triggering media navigation.
- Test the shared music picker's closed mount and open/close lifecycle, including the Notes caller, because its effects run even when the picker is hidden and can crash all composers.

- Keep music availability and recording deduplication in the shared browser-safe musicAvailability module; distinguish preview sources from complete audio and isolate catalog failures so every composer keeps available full tracks.
