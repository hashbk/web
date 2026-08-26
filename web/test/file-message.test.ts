import { describe, it, expect } from "vitest";
import { hbb } from "../src/proto/index.js";
import {
  encodeReadDir,
  encodeSendFiles,
  encodeReceiveFiles,
  encodeCreateDir,
  encodeRemoveFile,
  encodeRemoveDir,
  encodeReadAllFiles,
  encodeCancelJob,
  encodeSendConfirm,
  encodeReadEmptyDirs,
  makeFileEntry,
  makeFileDirJson,
  fileDirToJson,
  fileResponseDirToJson,
  fileResponseEmptyDirsToJson,
} from "../src/file/file-message.js";

function decodeFileAction(bytes: Uint8Array): hbb.IFileAction {
  const msg = hbb.Message.decode(bytes);
  return msg.fileAction!;
}

describe("file-message encoders", () => {
  it("encodeReadDir produces correct readDir action", () => {
    const bytes = encodeReadDir("/home/user", true);
    const action = decodeFileAction(bytes);
    expect(action.readDir).toBeDefined();
    expect(action.readDir!.path).toBe("/home/user");
    expect(action.readDir!.includeHidden).toBe(true);
  });

  it("encodeSendFiles produces correct send action", () => {
    const bytes = encodeSendFiles(5, "/remote/path", 2, false);
    const action = decodeFileAction(bytes);
    expect(action.send).toBeDefined();
    expect(action.send!.id).toBe(5);
    expect(action.send!.path).toBe("/remote/path");
    expect(action.send!.fileNum).toBe(2);
    expect(action.send!.includeHidden).toBe(false);
  });

  it("encodeReceiveFiles produces correct receive action", () => {
    const files = [
      makeFileEntry("a.txt", hbb.FileType.File, 100, 1000),
      makeFileEntry("b.txt", hbb.FileType.File, 200, 2000),
    ];
    const bytes = encodeReceiveFiles(3, "/dest", 0, files, 300);
    const action = decodeFileAction(bytes);
    expect(action.receive).toBeDefined();
    expect(action.receive!.id).toBe(3);
    expect(action.receive!.path).toBe("/dest");
    expect(action.receive!.fileNum).toBe(0);
    expect(Number(action.receive!.totalSize)).toBe(300);
    expect(action.receive!.files!.length).toBe(2);
    expect(action.receive!.files![0].name).toBe("a.txt");
  });

  it("encodeCreateDir produces correct create action", () => {
    const bytes = encodeCreateDir(7, "/new/dir");
    const action = decodeFileAction(bytes);
    expect(action.create).toBeDefined();
    expect(action.create!.id).toBe(7);
    expect(action.create!.path).toBe("/new/dir");
  });

  it("encodeRemoveFile produces correct removeFile action", () => {
    const bytes = encodeRemoveFile(1, "/file.txt", 3);
    const action = decodeFileAction(bytes);
    expect(action.removeFile).toBeDefined();
    expect(action.removeFile!.id).toBe(1);
    expect(action.removeFile!.path).toBe("/file.txt");
    expect(action.removeFile!.fileNum).toBe(3);
  });

  it("encodeRemoveDir produces correct removeDir action with recursive", () => {
    const bytes = encodeRemoveDir(2, "/dir");
    const action = decodeFileAction(bytes);
    expect(action.removeDir).toBeDefined();
    expect(action.removeDir!.id).toBe(2);
    expect(action.removeDir!.path).toBe("/dir");
    expect(action.removeDir!.recursive).toBe(true);
  });

  it("encodeReadAllFiles produces correct allFiles action", () => {
    const bytes = encodeReadAllFiles(4, "/scan", true);
    const action = decodeFileAction(bytes);
    expect(action.allFiles).toBeDefined();
    expect(action.allFiles!.id).toBe(4);
    expect(action.allFiles!.path).toBe("/scan");
    expect(action.allFiles!.includeHidden).toBe(true);
  });

  it("encodeCancelJob produces correct cancel action", () => {
    const bytes = encodeCancelJob(9);
    const action = decodeFileAction(bytes);
    expect(action.cancel).toBeDefined();
    expect(action.cancel!.id).toBe(9);
  });

  it("encodeSendConfirm produces correct sendConfirm action", () => {
    const bytes = encodeSendConfirm(1, 2, true);
    const action = decodeFileAction(bytes);
    expect(action.sendConfirm).toBeDefined();
    expect(action.sendConfirm!.id).toBe(1);
    expect(action.sendConfirm!.fileNum).toBe(2);
    expect(action.sendConfirm!.skip).toBe(true);
  });

  it("encodeReadEmptyDirs produces correct readEmptyDirs action", () => {
    const bytes = encodeReadEmptyDirs("/path", false);
    const action = decodeFileAction(bytes);
    expect(action.readEmptyDirs).toBeDefined();
    expect(action.readEmptyDirs!.path).toBe("/path");
    expect(action.readEmptyDirs!.includeHidden).toBe(false);
  });
});

describe("file-message JSON helpers", () => {
  it("makeFileEntry creates correct entry", () => {
    const entry = makeFileEntry("test.txt", hbb.FileType.File, 500, 1234, true);
    expect(entry.name).toBe("test.txt");
    expect(entry.entryType).toBe(hbb.FileType.File);
    expect(Number(entry.size)).toBe(500);
    expect(Number(entry.modifiedTime)).toBe(1234);
    expect(entry.isHidden).toBe(true);
  });

  it("makeFileDirJson produces correct JSON format", () => {
    const entries = [
      makeFileEntry("dir1", hbb.FileType.Dir, 0, 0),
      makeFileEntry("file1.txt", hbb.FileType.File, 100, 2000),
    ];
    const json = makeFileDirJson(1, "/path", entries);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(1);
    expect(parsed.path).toBe("/path");
    expect(parsed.entries.length).toBe(2);
    expect(parsed.entries[0]).toEqual({
      entry_type: hbb.FileType.Dir,
      name: "dir1",
      size: 0,
      modified_time: 0,
    });
    expect(parsed.entries[1]).toEqual({
      entry_type: hbb.FileType.File,
      name: "file1.txt",
      size: 100,
      modified_time: 2000,
    });
  });

  it("fileDirToJson handles FileDirectory object", () => {
    const fd: hbb.IFileDirectory = {
      id: 2,
      path: "/test",
      entries: [makeFileEntry("a.txt", hbb.FileType.File, 10, 0)],
    };
    const json = fileDirToJson(fd);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(2);
    expect(parsed.path).toBe("/test");
    expect(parsed.entries[0].name).toBe("a.txt");
  });

  it("fileResponseDirToJson returns null when no dir", () => {
    const fr: hbb.IFileResponse = {};
    expect(fileResponseDirToJson(fr)).toBeNull();
  });

  it("fileResponseDirToJson returns JSON when dir present", () => {
    const fr: hbb.IFileResponse = {
      dir: {
        id: 1,
        path: "/remote",
        entries: [makeFileEntry("file.txt", hbb.FileType.File, 50, 0)],
      },
    };
    const json = fileResponseDirToJson(fr);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.id).toBe(1);
    expect(parsed.entries[0].name).toBe("file.txt");
  });

  it("fileResponseEmptyDirsToJson returns null when no emptyDirs", () => {
    const fr: hbb.IFileResponse = {};
    expect(fileResponseEmptyDirsToJson(fr)).toBeNull();
  });

  it("fileResponseEmptyDirsToJson returns JSON when emptyDirs present", () => {
    const fr: hbb.IFileResponse = {
      emptyDirs: {
        path: "/root",
        emptyDirs: [
          {
            id: 0,
            path: "/root/empty1",
            entries: [],
          },
        ],
      },
    };
    const json = fileResponseEmptyDirsToJson(fr);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.path).toBe("/root");
    expect(parsed.empty_dirs.length).toBe(1);
    expect(parsed.empty_dirs[0].path).toBe("/root/empty1");
  });
});