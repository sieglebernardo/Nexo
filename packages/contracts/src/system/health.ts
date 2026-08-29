import { type Static, Type } from "@sinclair/typebox";

export const HealthResponseSchema = Type.Object(
  {
    service: Type.Literal("nexo-api"),
    status: Type.Literal("ok"),
    timestamp: Type.String({ format: "date-time" }),
  },
  { $id: "HealthResponse" },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;
