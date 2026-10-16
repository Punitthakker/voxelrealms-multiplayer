// Connects the engine to the PlayForge server: session, API, lobby room, profile and library.
// STUB: the platform workstream replaces this with the real start-up (see playforge/WEBAPP.md).
export async function startPlatform(E) {
  E.Caps.online = false; E.Caps.room = null; E.Caps.ready = true;
}
