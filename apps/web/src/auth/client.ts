import { createAuthClient } from "better-auth/react";

import { apiBaseUrl } from "../api/client.js";

export const authClient = createAuthClient({
  baseURL: apiBaseUrl || window.location.origin,
  fetchOptions: {
    credentials: "include",
  },
});
