export const API_ENDPOINTS = {
  signIn: "/api/auth/sign-in",
  refresh: "/api/auth/refresh",
  signOut: "/api/auth/sign-out",
  identity: "/api/auth/identity",
  activeTemplate: "/api/templates/active",
  contracts: "/api/contracts",
  contractDetail: (contractId: string) => `/api/contracts/${contractId}`,
  activateContract: (contractId: string) =>
    `/api/contracts/${contractId}/activate`,
} as const;
