import type { User } from "firebase/auth";

const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "https://carserviceapp.digitalviyabari.com/api";

async function result<T>(response: Response) {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "The server could not complete this request.");
  return value;
}

export async function apiGet<T>(user: User, path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${await user.getIdToken()}` },
  });
  return result<T>(response);
}

export async function apiRequest<T>(user: User, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  return result<T>(response);
}
