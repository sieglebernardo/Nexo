import nodemailer from "nodemailer";

import type { ApiConfig } from "../../config.js";

export type VerificationEmail = Readonly<{
  name: string;
  to: string;
  url: string;
}>;

export type WorkspaceInvitationEmail = Readonly<{
  invitedByName: string;
  role: string;
  to: string;
  url: string;
  workspaceName: string;
}>;

export interface EmailDelivery {
  sendVerificationEmail(message: VerificationEmail): Promise<void>;
  sendWorkspaceInvitation(message: WorkspaceInvitationEmail): Promise<void>;
}

export function createSmtpEmailDelivery(config: ApiConfig): EmailDelivery {
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    requireTLS: config.smtpRequireTls ?? false,
    secure: config.smtpSecure,
  });

  return {
    async sendVerificationEmail(message) {
      await transport.sendMail({
        from: config.emailFrom,
        subject: "Verify your Nexo email",
        text: [
          `Hi ${message.name},`,
          "",
          "Verify your email address to finish setting up Nexo:",
          message.url,
          "",
          "If you did not create this account, you can ignore this email.",
        ].join("\n"),
        to: message.to,
      });
    },
    async sendWorkspaceInvitation(message) {
      await transport.sendMail({
        from: config.emailFrom,
        subject: `${message.invitedByName} invited you to ${message.workspaceName}`,
        text: [
          `${message.invitedByName} invited you to join ${message.workspaceName} as ${message.role}.`,
          "",
          "Accept the invitation:",
          message.url,
          "",
          "This private link expires in seven days.",
        ].join("\n"),
        to: message.to,
      });
    },
  };
}
