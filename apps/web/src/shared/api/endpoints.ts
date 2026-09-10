export const API_ENDPOINTS = {
  signIn: "/api/auth/sign-in",
  refresh: "/api/auth/refresh",
  signOut: "/api/auth/sign-out",
  identity: "/api/auth/identity",
  activeTemplate: "/api/templates/active",
  contracts: "/api/contracts",
  contractRegister: (query: string) =>
    query ? `/api/contracts?${query}` : "/api/contracts",
  contractDetail: (contractId: string) => `/api/contracts/${contractId}`,
  contractHistory: (contractId: string) =>
    `/api/contracts/${contractId}/history`,
  activateContract: (contractId: string) =>
    `/api/contracts/${contractId}/activate`,
} as const;
