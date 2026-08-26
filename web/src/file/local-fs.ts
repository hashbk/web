import { hbb } from "../proto/index.js";
import { makeFileEntry, type FileDirJson, type FileEntryJson } from "./file-message.js";

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

async function* dirEntries(
  dirHandle: DirHandle,
): AsyncIterableIterator<[string, FileSystemHandle]> {
  const entries = (dirHandle as unknown as {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries();
  for await (const entry of entries) {
    yield entry;
  }
}

export class LocalFileSystem {
  private rootHandle: DirHandle | null = null;
  private pathSep = "/";

  hasRoot(): boolean {
    return this.rootHandle !== null;
  }

  async pickRoot(): Promise<boolean> {
    const picker = (globalThis as any).showDirectoryPicker;
    if (!picker) return false;
    try {
      this.rootHandle = await picker.call(globalThis);
      return true;
    } catch {
      return false;
    }
  }

  setRootHandle(handle: DirHandle): void {
    this.rootHandle = handle;
  }

  getRootHandle(): DirHandle | null {
    return this.rootHandle;
  }

  async readDir(
    path: string,
    showHidden: boolean,
  ): Promise<FileDirJson> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const dirHandle = await this.resolveDir(path);
    const entries: FileEntryJson[] = [];

    for await (const [name, handle] of dirEntries(dirHandle)) {
      if (!showHidden && name.startsWith(".")) continue;
      if (handle.kind === "file") {
        const file = await (handle as FileHandle).getFile();
        entries.push({
          entry_type: hbb.FileType.File,
          name,
          size: file.size,
          modified_time: Math.floor(file.lastModified / 1000),
        });
      } else {
        entries.push({
          entry_type: hbb.FileType.Dir,
          name,
          size: 0,
          modified_time: 0,
        });
      }
    }

    return { id: 0, path, entries };
  }

  async readDirToJson(path: string, showHidden: boolean): Promise<string> {
    const fd = await this.readDir(path, showHidden);
    return JSON.stringify(fd);
  }

  async createDir(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    await this.resolveDir(path, true);
  }

  async removeFile(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const parts = this.splitPath(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid path: ${path}`);
    const parentDir = await this.resolveDir(parts.join(this.pathSep));
    await parentDir.removeEntry(fileName);
  }

  async removeDir(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const parts = this.splitPath(path);
    const dirName = parts.pop();
    if (!dirName) throw new Error(`Invalid path: ${path}`);
    const parentDir = await this.resolveDir(parts.join(this.pathSep));
    await parentDir.removeEntry(dirName, { recursive: true });
  }

  async removeAllEmptyDirs(path: string): Promise<void> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const dirHandle = await this.resolveDir(path);
    await this.removeEmptyDirsRecursive(dirHandle);
  }

  private async removeEmptyDirsRecursive(dirHandle: DirHandle): Promise<void> {
    const subdirs: Array<[string, DirHandle]> = [];
    for await (const [name, handle] of dirEntries(dirHandle)) {
      if (handle.kind === "directory") {
        subdirs.push([name, handle as DirHandle]);
      }
    }
    for (const [name, subdir] of subdirs) {
      await this.removeEmptyDirsRecursive(subdir);
      let isEmpty = true;
      for await (const _ of dirEntries(subdir)) {
        isEmpty = false;
        break;
      }
      if (isEmpty) {
        await dirHandle.removeEntry(name);
      }
    }
  }

  async getRecursiveFiles(
    path: string,
    includeHidden: boolean,
  ): Promise<hbb.IFileEntry[]> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const dirHandle = await this.resolveDir(path);
    return this.collectFilesRecursive(dirHandle, "", includeHidden);
  }

  private async collectFilesRecursive(
    dirHandle: DirHandle,
    prefix: string,
    includeHidden: boolean,
  ): Promise<hbb.IFileEntry[]> {
    const entries: hbb.IFileEntry[] = [];
    for await (const [name, handle] of dirEntries(dirHandle)) {
      if (!includeHidden && name.startsWith(".")) continue;
      const fullPath = prefix ? `${prefix}${this.pathSep}${name}` : name;
      if (handle.kind === "file") {
        const file = await (handle as FileHandle).getFile();
        entries.push(
          makeFileEntry(
            fullPath,
            hbb.FileType.File,
            file.size,
            Math.floor(file.lastModified / 1000),
          ),
        );
      } else {
        const subEntries = await this.collectFilesRecursive(
          handle as DirHandle,
          fullPath,
          includeHidden,
        );
        entries.push(...subEntries);
      }
    }
    return entries;
  }

  async getFileHandle(path: string): Promise<FileHandle> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const parts = this.splitPath(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid path: ${path}`);
    const parentDir = await this.resolveDir(parts.join(this.pathSep));
    return parentDir.getFileHandle(fileName);
  }

  async createFileHandle(path: string): Promise<FileHandle> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const parts = this.splitPath(path);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Invalid path: ${path}`);
    const parentDir = await this.resolveDir(parts.join(this.pathSep), true);
    return parentDir.getFileHandle(fileName, { create: true });
  }

  async readFile(path: string): Promise<Uint8Array> {
    const handle = await this.getFileHandle(path);
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const handle = await this.createFileHandle(path);
    const writable = await handle.createWritable();
    await writable.write(data as unknown as BufferSource);
    await writable.close();
  }

  private async resolveDir(
    path: string,
    create = false,
  ): Promise<DirHandle> {
    if (!this.rootHandle) throw new Error("No root directory selected");
    const parts = this.splitPath(path);
    let current: DirHandle = this.rootHandle;
    for (const part of parts) {
      if (!part) continue;
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  private splitPath(path: string): string[] {
    const normalized = path.replace(/\\/g, this.pathSep);
    return normalized.split(this.pathSep).filter((p) => p.length > 0);
  }

  joinPath(...parts: string[]): string {
    return parts.join(this.pathSep);
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof (globalThis as any).showDirectoryPicker === "function";
}
