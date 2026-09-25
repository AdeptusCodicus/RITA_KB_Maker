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
