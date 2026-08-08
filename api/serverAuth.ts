export async function isAuthenticatedUser(supabaseUrl: string, supabaseKey: string, token: string) {
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, authorization: `Bearer ${token}` },
    });
    return authResponse.ok;
  } catch {
    return false;
  }
}
