// Cursor app identity: the simulated viewer for local development.
// While neither CURSOR_APP_ID nor VERCEL is set, a request without the identity header reads as this viewer.
// Never write a real person's identity here.

/** @type {import('./identity').DevViewer | null} */
export const DEV_VIEWER = {
  sub: "user:dev",
  email: "dev@example.com",
  name: "Dev Viewer",
  teamId: 1,
  teamRole: "admin",
};
