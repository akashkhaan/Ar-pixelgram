# Development rules

- Keep story tap-region logic in a browser-safe pure module next to the story viewer, with Node test coverage, so navigation can be checked without account credentials.
- Use the existing dropdown-menu and Button components for story actions, above the viewer stacking layer, so controls remain accessible without triggering media navigation.
- Test the shared music picker's closed mount and open/close lifecycle, including the Notes caller, because its effects run even when the picker is hidden and can crash all composers.

- Keep music availability and recording deduplication in the shared browser-safe musicAvailability module; distinguish preview sources from complete audio and isolate catalog failures so every composer keeps available full tracks.

- Lazy-load route pages behind the existing router suspense boundary so unrelated composers and admin tools do not block startup.
- Bound each inbox/profile loading phase; publish inbox rows before optional presence and calls, and fetch only the newest message for inbox summaries while preserving full conversation history.
- Keep reel like decoration best-effort: optional session/like failures must not discard successfully loaded feed rows.
- Notification surfaces and text use global theme tokens so light/dark changes apply consistently.
- Put optional search actions in GlassSearch's expanded-only trailingAction slot; keep focus transitions inside the control open so voice and clear actions remain usable.

- Android background uploads use the locally registered BackgroundUpload Capacitor plugin and a dataSync foreground service, owning private file bytes and final publishing; never rely on WebView timers or keep-alive tricks.
- Native publishing uses a stable record UUID and read-back before retry; reconcile native-owned jobs before browser recovery to avoid duplicate uploads after reopening.
