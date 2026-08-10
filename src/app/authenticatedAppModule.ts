let modulePromise: ReturnType<typeof importAuthenticatedApp> | undefined;

function importAuthenticatedApp() {
  return import("./AuthenticatedApp");
}

export function loadAuthenticatedApp() {
  modulePromise ??= importAuthenticatedApp();
  return modulePromise;
}
