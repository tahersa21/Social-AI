import { getToken, removeToken } from "./auth";

const originalFetch = window.fetch;

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await originalFetch(input, { ...init, headers });

  if (response.status === 401) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/api/auth/")) {
      removeToken();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      if (!window.location.pathname.endsWith("/login")) {
        window.location.href = `${base}/login`;
      }
    }
  }

  return response;
};
