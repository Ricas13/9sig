// Runs once when the server starts: load the settings saved in the admin screen before the first
// request, so a restart never briefly falls back to older environment values.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSettings } = await import("@/lib/settings");
  await ensureSettings(true);
  const { announceSetupIfNeeded } = await import("@/lib/setup");
  await announceSetupIfNeeded();
}
