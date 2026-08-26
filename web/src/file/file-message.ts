import { hbb } from "../proto/index.js";

export interface FileEntryJson {
  entry_type: number;
  name: string;
  size: number;
  modified_time: number;
}

export interface FileDirJson {
  id: number;
  path: string;
  entries: FileEntryJson[];
}

export function makeFileDirJson(
  id: number,
  path: string,
  entries: hbb.IFileEntry[],
): string {
  const entriesOut = entries.map((e) => ({
    entry_type: e.entryType ?? 0,
    name: e.name ?? "",
    size: Number(e.size ?? 0),
    modified_time: Number(e.modifiedTime ?? 0),
  }));
  return JSON.stringify({ id, path, entries: entriesOut });
}

export function fileDirToJson(fd: hbb.IFileDirectory): string {
  return makeFileDirJson(fd.id ?? 0, fd.path ?? "", fd.entries ?? []);
}

export function encodeReadDir(path: string, includeHidden: boolean): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { readDir: { path, includeHidden } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeSendFiles(
  id: number,
  path: string,
  fileNum: number,
  includeHidden: boolean,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: {
      send: { id, path, includeHidden, fileNum, fileType: 0 },
    },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeReceiveFiles(
  id: number,
  path: string,
  fileNum: number,
  files: hbb.IFileEntry[],
  totalSize: number,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: {
      receive: { id, path, files, fileNum, totalSize },
    },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeCreateDir(id: number, path: string): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { create: { id, path } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeRemoveFile(
  id: number,
  path: string,
  fileNum: number,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { removeFile: { id, path, fileNum } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeRemoveDir(id: number, path: string): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { removeDir: { id, path, recursive: true } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeReadAllFiles(
  id: number,
  path: string,
  includeHidden: boolean,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { allFiles: { id, path, includeHidden } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeCancelJob(id: number): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { cancel: { id } },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeSendConfirm(
  id: number,
  fileNum: number,
  skip: boolean,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: {
      sendConfirm: { id, fileNum, skip },
    },
  });
  return hbb.Message.encode(msg).finish();
}

export function encodeReadEmptyDirs(
  path: string,
  includeHidden: boolean,
): Uint8Array {
  const msg = hbb.Message.create({
    fileAction: { readEmptyDirs: { path, includeHidden } },
  });
  return hbb.Message.encode(msg).finish();
}

export function makeFileEntry(
  name: string,
  entryType: hbb.FileType,
  size: number,
  modifiedTime: number,
  isHidden = false,
): hbb.IFileEntry {
  return {
    name,
    entryType,
    size,
    modifiedTime,
    isHidden,
  };
}

export function fileResponseDirToJson(fr: hbb.IFileResponse): string | null {
  if (!fr.dir) return null;
  return fileDirToJson(fr.dir);
}

export function fileResponseEmptyDirsToJson(
  fr: hbb.IFileResponse,
): string | null {
  if (!fr.emptyDirs) return null;
  const res = fr.emptyDirs;
  const fdJsons = (res.emptyDirs ?? []).map((fd) =>
    JSON.parse(fileDirToJson(fd)),
  );
  return JSON.stringify({ path: res.path ?? "", empty_dirs: fdJsons });
}