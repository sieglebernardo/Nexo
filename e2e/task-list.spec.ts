import { createDatabase } from "@nexo/database";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

type MailpitMessage = Readonly<{
  ID: string;
  To: ReadonlyArray<Readonly<{ Address: string }>>;
}>;

type MailpitMessagesResponse = Readonly<{
  messages: MailpitMessage[];
}>;

const mailpitBaseUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function loadVerificationMessage(request: APIRequestContext, email: string): Promise<string> {
  let messageId: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`${mailpitBaseUrl}/api/v1/messages`);
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as MailpitMessagesResponse;
      messageId = body.messages.find((message) =>
        message.To.some((recipient) => recipient.Address === email),
      )?.ID;
      return messageId;
    })
    .toBeTruthy();

  if (!messageId) throw new Error("Verification email was not delivered");
  const messageResponse = await request.get(`${mailpitBaseUrl}/api/v1/message/${messageId}`);
  expect(messageResponse.ok()).toBe(true);
  const message = (await messageResponse.json()) as { Text: string };
  const verificationUrl = message.Text.match(
    /https?:\/\/[^\s]+\/api\/auth\/verify-email\?[^\s]+/,
  )?.[0];
  if (!verificationUrl) throw new Error("Verification email did not contain a verification URL");
  return verificationUrl;
}

async function removeVerificationMessages(email: string) {
  const messagesResponse = await fetch(`${mailpitBaseUrl}/api/v1/messages`);
  if (!messagesResponse.ok) return;
  const body = (await messagesResponse.json()) as MailpitMessagesResponse;
  const messageIds = body.messages
    .filter((message) => message.To.some((recipient) => recipient.Address === email))
    .map((message) => message.ID);
  if (messageIds.length === 0) return;
  await fetch(`${mailpitBaseUrl}/api/v1/messages`, {
    body: JSON.stringify({ IDs: messageIds }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
}

async function removeTestIdentity(email: string) {
  const database = createDatabase(
    process.env.DATABASE_URL ?? "postgresql://nexo:nexo@localhost:5432/nexo",
  );
  const client = await database.pool.connect();
  try {
    await client.query("begin");
    const userResult = await client.query<{ id: string }>("select id from users where email = $1", [
      email,
    ]);
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      await client.query("rollback");
      return;
    }
    const workspaceResult = await client.query<{ workspace_id: string }>(
      "select workspace_id from memberships where user_id = $1",
      [userId],
    );
    for (const { workspace_id: workspaceId } of workspaceResult.rows) {
      await client.query("delete from task_activities where workspace_id = $1", [workspaceId]);
      await client.query("delete from tasks where workspace_id = $1", [workspaceId]);
      await client.query("delete from project_access where workspace_id = $1", [workspaceId]);
      await client.query("delete from projects where workspace_id = $1", [workspaceId]);
      await client.query("delete from invitations where workspace_id = $1", [workspaceId]);
      await client.query("delete from teams where workspace_id = $1", [workspaceId]);
      await client.query("delete from memberships where workspace_id = $1", [workspaceId]);
      await client.query("delete from workspaces where id = $1", [workspaceId]);
    }
    await client.query("delete from auth_verifications where identifier = $1", [email]);
    await client.query("delete from users where id = $1", [userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await database.close();
  }
}

function observeBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

test("verified user can manage a task through its project workflow", async ({ page, request }) => {
  test.setTimeout(60_000);
  const uniqueRun = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `nexo-e2e-${uniqueRun}@example.com`;
  const password = "Nexo-e2e-password-2026!";
  const browserFailures = observeBrowserFailures(page);

  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Create account", exact: true }).first().click();
    const authForm = page.locator("form.stack-form");
    await authForm.getByLabel("Your name").fill("Nexo E2E");
    await authForm.getByLabel("Email").fill(email);
    await authForm.getByLabel("Password").fill(password);
    await authForm.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(
      page.getByText("Check your inbox to verify your email, then sign in."),
    ).toBeVisible();

    const verificationUrl = await loadVerificationMessage(request, email);
    await page.goto(verificationUrl);
    await expect(page.getByRole("heading", { name: "Give your team a home." })).toBeVisible();

    const workspaceForm = page.locator("form.stack-form");
    await workspaceForm.getByLabel("Workspace name").fill(`E2E Workspace ${uniqueRun}`);
    await workspaceForm.getByLabel("Workspace timezone").fill("UTC");
    await workspaceForm.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { name: /Welcome to E2E Workspace/ })).toBeVisible();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Task Board Visibility" })).toBeVisible();
    await page.getByRole("radio", { name: /Private/ }).check();
    const visibilityResponse = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/settings"),
    );
    await page.getByRole("button", { name: "Save visibility" }).click();
    expect((await visibilityResponse).status()).toBe(200);
    await expect(page.getByText("Board visibility saved.")).toBeVisible();

    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Work your team can access" })).toBeVisible();
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    const projectForm = page.locator("form.project-create-form");
    await projectForm.getByLabel("Name").fill("E2E Task Project");
    await projectForm.getByLabel("Key").fill("E2E");
    await projectForm.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Task board" })).toBeVisible();

    await page.getByPlaceholder("Add a task…").fill("Browser task");
    await expect(page.getByLabel("New task assignee")).toHaveValue(/.+/);
    await page.getByLabel("New task due date").fill("2026-10-01");
    const createTaskResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/tasks"),
    );
    await page.getByRole("button", { name: "Add task" }).click();
    expect((await createTaskResponse).status()).toBe(201);
    const taskCard = page.locator(".task-card").filter({
      has: page.getByText("E2E-1", { exact: true }),
    });
    await expect(taskCard).toBeVisible();
    await expect(taskCard.getByText("E2E-1", { exact: true })).toBeVisible();

    await taskCard.getByRole("button", { name: "Browser task" }).click();
    await taskCard.getByLabel("Rename E2E-1").fill("Browser task renamed");
    const renameTaskResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await taskCard.getByRole("button", { name: "Save" }).click();
    expect((await renameTaskResponse).status()).toBe(200);
    await expect(taskCard).toBeVisible();
    const statusSelect = taskCard.getByLabel("Status for E2E-1");
    const transitionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith("/transition"),
    );
    await taskCard.dragTo(page.getByRole("region", { name: "In progress" }));
    expect((await transitionResponse).status()).toBe(200);
    await expect(statusSelect.locator("option:checked")).toHaveText("In progress");
    await expect(taskCard).not.toContainText("Saving…");
    const dueDateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/tasks\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await taskCard.getByLabel("Due date for E2E-1").fill("2026-10-02");
    expect((await dueDateResponse).status()).toBe(200);
    await expect(taskCard.getByLabel("Due date for E2E-1")).toHaveValue("2026-10-02");
    await expect(taskCard).not.toContainText("Saving…");

    const archiveResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/archive"),
    );
    await taskCard.getByRole("button", { name: "Archive" }).click();
    expect((await archiveResponse).status()).toBe(200);
    await expect(taskCard).toBeHidden();
    await page.getByRole("button", { name: "Archived", exact: true }).click();
    await expect(taskCard).toBeVisible();
    await expect(taskCard.getByLabel("Due date for E2E-1")).toHaveValue("2026-10-02");
    const restoreResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().endsWith("/restore"),
    );
    await taskCard.getByRole("button", { name: "Restore" }).click();
    expect((await restoreResponse).status()).toBe(200);
    await expect(taskCard).toBeHidden();
    await page.getByRole("button", { name: "Active", exact: true }).click();
    await expect(taskCard).toBeVisible();
    await expect(browserFailures).toEqual([]);
  } finally {
    const cleanupResults = await Promise.allSettled([
      removeVerificationMessages(email),
      removeTestIdentity(email),
    ]);
    for (const result of cleanupResults) {
      const message = result.status === "rejected" ? String(result.reason) : undefined;
      expect.soft(result.status, message).toBe("fulfilled");
    }
  }
});
