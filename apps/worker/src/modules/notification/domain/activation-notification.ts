export type ActivationNotification = {
  eventId: string;
  eventType: "contract.activated";
  schemaVersion: 1;
  tenantId: string;
  contractId: string;
  activationRevision: number;
  occurredAt: Date;
  correlationId: string;
};
