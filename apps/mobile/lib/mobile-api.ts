import type { User } from "firebase/auth";

const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "https://carserviceapp.digitalviyabari.com/api";

export async function apiRequest<T>(user: User, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The server could not complete this request.");
  return result;
}
