import type { CompanyDetail } from "@nexo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ApiClientError,
  getAdminCompanies,
  getAdminCompany,
  updateAdminCompany,
} from "../api/client.js";
import { Brand } from "../ui/Brand.js";
import { FieldLabel } from "../ui/FieldLabel.js";

function messageFor(error: unknown) {
  return error instanceof ApiClientError || error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function go(path: string) {
  window.location.assign(path);
}

function Detail({ companyId }: Readonly<{ companyId: string }>) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryFn: ({ signal }) => getAdminCompany(companyId, signal),
    queryKey: ["admin", "company", companyId],
  });
  const [name, setName] = useState("");
  const update = useMutation({
    mutationFn: () => updateAdminCompany(companyId, name),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
  });
  if (detail.isPending) return <p className="table-state">Loading company…</p>;
  if (detail.isError) return <div className="notice is-error">{messageFor(detail.error)}</div>;
  const data = detail.data;
  return (
    <CompanyDetails
      data={data}
      name={name || data.company.name}
      onNameChange={setName}
      onSave={() => update.mutate()}
      saving={update.isPending}
      error={update.error}
    />
  );
}

function CompanyDetails({
  data,
  name,
  onNameChange,
  onSave,
  saving,
  error,
}: Readonly<{
  data: CompanyDetail;
  name: string;
  onNameChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  error: unknown;
}>) {
  return (
    <section className="content content-stack admin-detail">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Active company</span>
          <h2>{data.company.name}</h2>
          <p>{data.company.id}</p>
        </div>
        <button className="secondary-button" onClick={() => go("/admin")} type="button">
          All companies
        </button>
      </header>
      {data.company.requiresReview && (
        <div className="notice is-error">
          This legacy company was isolated per workspace during migration and requires operator
          review before any consolidation.
        </div>
      )}
      <article className="panel-card">
        <span className="eyebrow">Company settings</span>
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>
            <FieldLabel required>Company name</FieldLabel>
            <input
              maxLength={160}
              onChange={(event) => onNameChange(event.target.value)}
              required
              value={name}
            />
          </label>
          <button className="primary-button fit-button" disabled={saving} type="submit">
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>
        {error ? <div className="notice is-error">{messageFor(error)}</div> : null}
      </article>
      <section className="admin-grid">
        <AdminTable
          title="Company users"
          headers={["Name", "Email", "Company role"]}
          rows={data.users.map((user) => [user.name, user.email, user.role])}
        />
        <AdminTable
          title="Workspaces"
          headers={["Name", "Timezone", "Task board"]}
          rows={data.workspaces.map((workspace) => [
            workspace.name,
            workspace.timezone,
            workspace.taskBoardVisibility,
          ])}
        />
        <AdminTable
          title="Projects"
          headers={["Key", "Name", "Workspace"]}
          rows={data.projects.map((project) => [project.key, project.name, project.workspaceId])}
        />
        <AdminTable
          title="Workflows"
          headers={["Name", "Project", "Workspace"]}
          rows={data.workflows.map((workflow) => [
            workflow.name,
            workflow.projectId,
            workflow.workspaceId,
          ])}
        />
        <AdminTable
          title="Recent tasks"
          headers={["Title", "Project", "Workspace"]}
          rows={data.tasks.map((task) => [task.title, task.projectId, task.workspaceId])}
        />
        <AdminTable
          title="Administrative audit log"
          headers={["Action", "Admin", "When"]}
          rows={data.auditLog.map((entry) => [
            entry.action,
            entry.adminName,
            new Date(entry.occurredAt).toLocaleString(),
          ])}
        />
      </section>
    </section>
  );
}

function AdminTable({
  title,
  headers,
  rows,
}: Readonly<{ title: string; headers: string[]; rows: string[][] }>) {
  return (
    <article className="panel-card admin-table">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${title}-${row.join("|")}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${row.join("|")}-${headers[cellIndex]}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted-copy">No records.</p>
      )}
    </article>
  );
}

function CompanyList() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const companies = useQuery({
    queryFn: ({ signal }) => getAdminCompanies({ offset, search }, signal),
    queryKey: ["admin", "companies", offset, search],
  });
  return (
    <section className="content content-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Platform administration</span>
          <h2>Companies</h2>
          <p>All data is shown in explicit company context.</p>
        </div>
      </header>
      <form
        className="invite-form admin-search"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
        }}
      >
        <label>
          <FieldLabel>Search companies</FieldLabel>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Company name"
            value={search}
          />
        </label>
        <button className="secondary-button fit-button" type="submit">
          Search
        </button>
      </form>
      {companies.isPending && <p className="table-state">Loading companies…</p>}
      {companies.isError && <div className="notice is-error">{messageFor(companies.error)}</div>}
      {companies.data && (
        <article className="panel-card">
          <div className="panel-heading">
            <h3>{companies.data.total} companies</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Workspaces</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {companies.data.companies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <strong>{company.name}</strong>
                      {company.requiresReview && <small>Migration review required</small>}
                    </td>
                    <td>{company.workspaceCount}</td>
                    <td>{new Date(company.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => go(`/admin?company=${company.id}`)}
                        type="button"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-pagination">
            <button
              className="secondary-button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
              type="button"
            >
              Previous
            </button>
            <button
              className="secondary-button"
              disabled={companies.data.nextOffset === null}
              onClick={() => setOffset(companies.data.nextOffset ?? offset)}
              type="button"
            >
              Next
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

export function AdminApp({ onSignOut }: Readonly<{ onSignOut: () => Promise<void> }>) {
  const companyId = new URLSearchParams(window.location.search).get("company");
  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          <button className="sidebar-item" onClick={() => go("/admin")} type="button">
            Companies
          </button>
        </nav>
        <button className="text-button" onClick={onSignOut} type="button">
          Sign out
        </button>
      </aside>
      <main className="main-area">
        {companyId ? <Detail companyId={companyId} /> : <CompanyList />}
      </main>
    </div>
  );
}
