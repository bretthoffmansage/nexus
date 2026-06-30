"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

function UserRow({
  user,
  onApprove,
  onSuspend,
  onReactivate,
  onGrant,
  onRevoke,
}: {
  user: {
    _id: string;
    clerkUserId: string;
    primaryEmail: string;
    displayName?: string;
    status: string;
    roles: string[];
  };
  onApprove: (id: string) => void;
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  onGrant: (id: string, role: "knowledge_reader" | "nexus_admin") => void;
  onRevoke: (id: string, role: "knowledge_reader" | "nexus_admin") => void;
}) {
  return (
    <li className="nexus-source-card">
      <div className="nexus-source-card-head">
        <h3 className="nexus-source-card-title">{user.primaryEmail}</h3>
        <span className="nexus-source-type">{user.status}</span>
      </div>
      <p className="nexus-source-meta">{user.clerkUserId}</p>
      <p className="nexus-source-meta">Roles: {user.roles.length ? user.roles.join(", ") : "none"}</p>
      <div className="nexus-source-footer" style={{ gap: "0.35rem" }}>
        {user.status === "pending" ? (
          <button type="button" className="nexus-btn nexus-btn-primary" onClick={() => onApprove(user.clerkUserId)}>
            Approve
          </button>
        ) : null}
        {user.status === "active" ? (
          <button type="button" className="nexus-btn nexus-btn-ghost" onClick={() => onSuspend(user.clerkUserId)}>
            Suspend
          </button>
        ) : null}
        {user.status === "suspended" ? (
          <button type="button" className="nexus-btn" onClick={() => onReactivate(user.clerkUserId)}>
            Reactivate
          </button>
        ) : null}
        {!user.roles.includes("knowledge_reader") ? (
          <button
            type="button"
            className="nexus-btn nexus-btn-ghost"
            onClick={() => onGrant(user.clerkUserId, "knowledge_reader")}
          >
            Grant knowledge_reader
          </button>
        ) : (
          <button
            type="button"
            className="nexus-btn nexus-btn-ghost"
            onClick={() => onRevoke(user.clerkUserId, "knowledge_reader")}
          >
            Revoke knowledge_reader
          </button>
        )}
        {!user.roles.includes("nexus_admin") ? (
          <button
            type="button"
            className="nexus-btn nexus-btn-ghost"
            onClick={() => onGrant(user.clerkUserId, "nexus_admin")}
          >
            Grant nexus_admin
          </button>
        ) : (
          <button
            type="button"
            className="nexus-btn nexus-btn-ghost"
            onClick={() => onRevoke(user.clerkUserId, "nexus_admin")}
          >
            Revoke nexus_admin
          </button>
        )}
      </div>
    </li>
  );
}

export function AccessAdminPanel() {
  const pending = useQuery(api.admin.listUsersByStatus, { status: "pending" });
  const active = useQuery(api.admin.listUsersByStatus, { status: "active" });
  const suspended = useQuery(api.admin.listUsersByStatus, { status: "suspended" });

  const approveUser = useMutation(api.admin.approveUser);
  const suspendUser = useMutation(api.admin.suspendUser);
  const reactivateUser = useMutation(api.admin.reactivateUser);
  const grantRole = useMutation(api.admin.adminGrantRole);
  const revokeRole = useMutation(api.admin.adminRevokeRole);

  return (
    <section className="nexus-card">
      <header style={{ marginBottom: "1rem" }}>
        <h1 className="nexus-card-title">Access administration</h1>
        <p className="nexus-card-subtitle">
          Approve users and manage Nexus roles. Changes are enforced in Convex.
        </p>
        <Link href="/" className="nexus-nav-item" style={{ display: "inline-block", marginTop: "0.5rem" }}>
          Back to Nexus
        </Link>
      </header>

      <h2 className="nexus-section-label">Pending</h2>
      <ul className="nexus-source-list">
        {(pending ?? []).map((user) => (
          <UserRow
            key={user._id}
            user={user}
            onApprove={(id) => void approveUser({ targetClerkUserId: id })}
            onSuspend={(id) => void suspendUser({ targetClerkUserId: id })}
            onReactivate={(id) => void reactivateUser({ targetClerkUserId: id })}
            onGrant={(id, role) => void grantRole({ targetClerkUserId: id, role })}
            onRevoke={(id, role) => void revokeRole({ targetClerkUserId: id, role })}
          />
        ))}
      </ul>

      <h2 className="nexus-section-label" style={{ marginTop: "1rem" }}>
        Active
      </h2>
      <ul className="nexus-source-list">
        {(active ?? []).map((user) => (
          <UserRow
            key={user._id}
            user={user}
            onApprove={(id) => void approveUser({ targetClerkUserId: id })}
            onSuspend={(id) => void suspendUser({ targetClerkUserId: id })}
            onReactivate={(id) => void reactivateUser({ targetClerkUserId: id })}
            onGrant={(id, role) => void grantRole({ targetClerkUserId: id, role })}
            onRevoke={(id, role) => void revokeRole({ targetClerkUserId: id, role })}
          />
        ))}
      </ul>

      <h2 className="nexus-section-label" style={{ marginTop: "1rem" }}>
        Suspended
      </h2>
      <ul className="nexus-source-list">
        {(suspended ?? []).map((user) => (
          <UserRow
            key={user._id}
            user={user}
            onApprove={(id) => void approveUser({ targetClerkUserId: id })}
            onSuspend={(id) => void suspendUser({ targetClerkUserId: id })}
            onReactivate={(id) => void reactivateUser({ targetClerkUserId: id })}
            onGrant={(id, role) => void grantRole({ targetClerkUserId: id, role })}
            onRevoke={(id, role) => void revokeRole({ targetClerkUserId: id, role })}
          />
        ))}
      </ul>
    </section>
  );
}
