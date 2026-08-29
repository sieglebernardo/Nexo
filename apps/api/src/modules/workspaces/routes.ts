import {
  type AcceptInvitationBody,
  AcceptInvitationBodySchema,
  ApiErrorSchema,
  type CreateInvitationBody,
  CreateInvitationBodySchema,
  type CreateWorkspaceBody,
  CreateWorkspaceBodySchema,
  InvitationListResponseSchema,
  InvitationSchema,
  WorkspaceListResponseSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceSummarySchema,
} from "@nexo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

import type { SessionResolver } from "../identity/session.js";
import type { WorkspaceService } from "./service.js";

type WorkspaceParams = Readonly<{ workspaceId: string }>;
type MembershipParams = Readonly<{ membershipId: string; workspaceId: string }>;

const WorkspaceParamsSchema = Type.Object({
  workspaceId: Type.String({ format: "uuid" }),
});

const MembershipParamsSchema = Type.Object({
  membershipId: Type.String({ format: "uuid" }),
  workspaceId: Type.String({ format: "uuid" }),
});

const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  service: WorkspaceService,
  resolveSession: SessionResolver,
): Promise<void> {
  app.get(
    "/api/v1/workspaces",
    { schema: { response: { 200: WorkspaceListResponseSchema, ...commonErrors } } },
    async (request) => {
      const user = await resolveSession(request);
      return { workspaces: await service.listWorkspaces(user.id) };
    },
  );

  app.post<{ Body: CreateWorkspaceBody }>(
    "/api/v1/workspaces",
    {
      schema: {
        body: CreateWorkspaceBodySchema,
        response: { 201: WorkspaceSummarySchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const user = await resolveSession(request);
      const workspace = await service.createWorkspace(user.id, request.body);
      return reply.status(201).send(workspace);
    },
  );

  app.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/members",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: { 200: WorkspaceMembersResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      const members = await service.listMembers(user.id, request.params.workspaceId);
      return {
        members: members.map((member) => ({
          ...member,
          deactivatedAt: member.deactivatedAt?.toISOString() ?? null,
        })),
      };
    },
  );

  app.get<{ Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/invitations",
    {
      schema: {
        params: WorkspaceParamsSchema,
        response: { 200: InvitationListResponseSchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      const invitationRows = await service.listInvitations(user.id, request.params.workspaceId);
      return {
        invitations: invitationRows.map((invitation) => ({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Body: CreateInvitationBody; Params: WorkspaceParams }>(
    "/api/v1/workspaces/:workspaceId/invitations",
    {
      schema: {
        body: CreateInvitationBodySchema,
        params: WorkspaceParamsSchema,
        response: { 201: InvitationSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const user = await resolveSession(request);
      const invitation = await service.inviteMember(user, request.params.workspaceId, request.body);
      return reply.status(201).send({
        ...invitation,
        expiresAt: invitation.expiresAt.toISOString(),
      });
    },
  );

  app.post<{ Body: AcceptInvitationBody }>(
    "/api/v1/invitations/accept",
    {
      schema: {
        body: AcceptInvitationBodySchema,
        response: { 200: WorkspaceSummarySchema, ...commonErrors },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      return service.acceptInvitation(user, request.body.token);
    },
  );

  app.post<{ Params: MembershipParams }>(
    "/api/v1/workspaces/:workspaceId/members/:membershipId/deactivate",
    {
      schema: {
        params: MembershipParamsSchema,
        response: {
          200: Type.Object({ deactivatedAt: Type.String({ format: "date-time" }) }),
          ...commonErrors,
        },
      },
    },
    async (request) => {
      const user = await resolveSession(request);
      const result = await service.deactivateMember(
        user.id,
        request.params.workspaceId,
        request.params.membershipId,
      );
      return { deactivatedAt: result.deactivatedAt.toISOString() };
    },
  );
}
