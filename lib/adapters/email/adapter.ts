import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const emailAdapterMeta: ToolAdapterMeta = {
  toolId: "email",
  availability: "connector_required",
  authority: "claudia_connector",
  futureClaudiaTaskKind: "email.sync",
};

export type EmailFolder = {
  id: string;
  label: string;
};

export type EmailMessage = {
  id: string;
  subject: string;
  from: string;
  preview: string;
  unread: boolean;
  folder: string;
};

export async function listFolders(): Promise<AdapterReadResult<EmailFolder[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Email folders require system mail integration through the Connector.",
    data: [],
  };
}

export async function listMessages(folder: string): Promise<AdapterReadResult<EmailMessage[]>> {
  void folder;
  return {
    ok: false,
    availability: "connector_required",
    reason: "Inbox messages are not available in hosted Nexus without the Connector.",
    data: [],
  };
}
