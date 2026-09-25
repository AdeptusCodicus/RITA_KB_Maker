export interface DatabricksFile {
  path: string;
  is_dir: boolean;
  file_size?: number;
  object_id?: number;
}

function getAuthHeaders() {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  
  if (!host || !token) {
    throw new Error("Missing DATABRICKS_HOST or DATABRICKS_TOKEN in environment variables.");
  }
  
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function getHost() {
  const host = process.env.DATABRICKS_HOST;
  if (!host) throw new Error("DATABRICKS_HOST not defined.");
  return host.replace(/\/$/, ""); // remove trailing slash if any
}

export async function listFiles(path: string): Promise<DatabricksFile[]> {
  const host = getHost();
  const isVolume = path.startsWith("/Volumes/");
  const url = isVolume 
    ? `${host}/api/2.0/fs/directories${path}`
    : `${host}/api/2.0/workspace/list?path=${encodeURIComponent(path)}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Failed to list databricks files: ${await res.text()}`);
  }
  
  const data = await res.json();
  if (isVolume) {
    return (data.contents || []).map((f: any) => ({
      path: f.path,
      is_dir: f.is_directory,
      file_size: f.file_size
    }));
  }
  return data.objects || [];
}

export async function uploadFile(path: string, content: string, overwrite: boolean = true) {
  const host = getHost();
  const isVolume = path.startsWith("/Volumes/");
  
  if (isVolume) {
    // Files API requires PUT with binary content for Volumes
    const res = await fetch(`${host}/api/2.0/fs/files${path}?overwrite=${overwrite}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.DATABRICKS_TOKEN}`,
        "Content-Type": "application/octet-stream"
      },
      body: content
    });
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
    return true;
  } else {
    // Workspace API
    const res = await fetch(`${host}/api/2.0/workspace/import`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        path,
        format: "SOURCE",
        content: Buffer.from(content).toString('base64'),
        overwrite
      })
    });
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
    return true;
  }
}

export async function deleteFile(path: string) {
  const host = getHost();
  const isVolume = path.startsWith("/Volumes/");
  
  if (isVolume) {
    const res = await fetch(`${host}/api/2.0/fs/files${path}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`);
    return true;
  } else {
    const res = await fetch(`${host}/api/2.0/workspace/delete`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`);
    return true;
  }
}

export interface KnowledgeSourceStatus {
  state: "UPDATED" | "UPDATING" | "FAILED" | string;
  knowledge_cutoff_time?: string;
  id?: string;
  name?: string;
  display_name?: string;
  path?: string;
}

export function getAssistantId(explicitId?: string): string {
  return explicitId || process.env.DATABRICKS_ASSISTANT_ID || "3295cb12-158b-449a-a372-f5dc14ff1ec6";
}

export function getKbConfig() {
  return {
    kbPath: process.env.DATABRICKS_KB_PATH || "",
    assistantId: getAssistantId(),
  };
}

export async function syncKnowledgeSources(assistantId?: string) {
  const host = getHost();
  const id = getAssistantId(assistantId);
  const url = `${host}/api/2.1/knowledge-assistants/${id}/knowledge-sources:sync`;

  const res = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Knowledge Assistant sync failed: ${errorText}`);
  }

  return { success: true, assistantId: id };
}

export async function getKnowledgeSources(assistantId?: string): Promise<{
  sources: KnowledgeSourceStatus[];
  primarySource?: KnowledgeSourceStatus;
}> {
  const host = getHost();
  const id = getAssistantId(assistantId);
  const url = `${host}/api/2.1/knowledge-assistants/${id}/knowledge-sources`;

  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get knowledge sources: ${errorText}`);
  }

  const data = await res.json();
  const sources: KnowledgeSourceStatus[] = (data.knowledge_sources || []).map((s: any) => ({
    state: s.state || "UNKNOWN",
    knowledge_cutoff_time: s.knowledge_cutoff_time,
    id: s.id,
    name: s.name,
    display_name: s.display_name,
    path: s.files?.path,
  }));

  const kbPath = (process.env.DATABRICKS_KB_PATH || "").replace(/\/$/, "");
  const primarySource = sources.find((s) => {
    if (!s.path || !kbPath) return false;
    const cleanSourcePath = s.path.replace(/\/$/, "");
    return kbPath === cleanSourcePath || kbPath.startsWith(cleanSourcePath) || cleanSourcePath.startsWith(kbPath);
  }) || sources[0];

  return { sources, primarySource };
}
