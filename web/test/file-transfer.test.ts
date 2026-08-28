import { describe, it, expect, vi } from "vitest";
import { hbb } from "../src/proto/index.js";
import {
  FileTransferManager,
  JobState,
  type FileTransferConfig,
} from "../src/file/file-transfer.js";
import { LocalFileSystem } from "../src/file/local-fs.js";
import { makeFileEntry } from "../src/file/file-message.js";

function makeMockTransport() {
  const sent: Uint8Array[] = [];
  return {
    send: (data: Uint8Array) => sent.push(data),
    sent,
  };
}

function makeMockLocalFs(): LocalFileSystem {
  const fs = new LocalFileSystem();
  return fs;
}

function makeConfig(
  events: string[] = [],
): { config: FileTransferConfig; transport: ReturnType<typeof makeMockTransport> } {
  const transport = makeMockTransport();
  const config: FileTransferConfig = {
    transport,
    localFs: makeMockLocalFs(),
    onGlobalEvent: (json: string) => events.push(json),
  };
  return { config, transport };
}

function decodeFileAction(bytes: Uint8Array): hbb.IFileAction {
  const msg = hbb.Message.decode(bytes);
  return msg.fileAction!;
}

describe("FileTransferManager", () => {
  it("readRemoteDir sends readDir action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.readRemoteDir("/remote", true);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.readDir).toBeDefined();
    expect(action.readDir!.path).toBe("/remote");
    expect(action.readDir!.includeHidden).toBe(true);
  });

  it("sendFiles with isRemote=true sends send action", async () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    await ft.sendFiles({
      id: 1,
      path: "/remote/file",
      to: "/local/file",
      fileNum: 0,
      includeHidden: false,
      isRemote: true,
      isDir: false,
    });
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.send).toBeDefined();
    expect(action.send!.id).toBe(1);
    expect(action.send!.path).toBe("/remote/file");
    const job = ft.getJob(1);
    expect(job).toBeDefined();
    expect(job!.state).toBe(JobState.InProgress);
    expect(job!.isRemote).toBe(true);
  });

  it("sendFiles with isRemote=false sends receive action with local files", async () => {
    const { config, transport } = makeConfig();
    const mockFiles = [
      makeFileEntry("a.txt", hbb.FileType.File, 100, 0),
      makeFileEntry("b.txt", hbb.FileType.File, 200, 0),
    ];
    vi.spyOn(config.localFs, "getRecursiveFiles").mockResolvedValue(mockFiles);

    const ft = new FileTransferManager(config);
    await ft.sendFiles({
      id: 2,
      path: "/local/dir",
      to: "/remote/dir",
      fileNum: 0,
      includeHidden: true,
      isRemote: false,
      isDir: false,
    });
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.receive).toBeDefined();
    expect(action.receive!.id).toBe(2);
    expect(action.receive!.path).toBe("/remote/dir");
    expect(action.receive!.files!.length).toBe(2);
    expect(Number(action.receive!.totalSize)).toBe(300);
    const job = ft.getJob(2);
    expect(job).toBeDefined();
    expect(job!.totalSize).toBe(300);
    expect(job!.isRemote).toBe(false);
  });

  it("createDir with isRemote=true sends create action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.createDir(3, "/remote/newdir", true);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.create).toBeDefined();
    expect(action.create!.id).toBe(3);
    expect(action.create!.path).toBe("/remote/newdir");
  });

  it("createDir with isRemote=false calls localFs and emits job_done", async () => {
    const events: string[] = [];
    const { config, transport } = makeConfig(events);
    vi.spyOn(config.localFs, "createDir").mockResolvedValue(undefined);

    const ft = new FileTransferManager(config);
    ft.createDir(4, "/local/newdir", false);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(transport.sent.length).toBe(0);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_done");
    expect(parsed.id).toBe("4");
  });

  it("createDir with isRemote=false emits job_error on failure", async () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    vi.spyOn(config.localFs, "createDir").mockRejectedValue(new Error("disk full"));

    const ft = new FileTransferManager(config);
    ft.createDir(5, "/local/newdir", false);
    await vi.waitFor(() => expect(events.length).toBe(1));
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_error");
    expect(parsed.id).toBe("5");
    expect(parsed.err).toBe("disk full");
  });

  it("removeFile with isRemote=true sends removeFile action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.removeFile(6, "/remote/file", 1, true);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.removeFile).toBeDefined();
    expect(action.removeFile!.id).toBe(6);
  });

  it("removeFile with isRemote=false calls localFs and emits job_done", async () => {
    const events: string[] = [];
    const { config, transport } = makeConfig(events);
    vi.spyOn(config.localFs, "removeFile").mockResolvedValue(undefined);

    const ft = new FileTransferManager(config);
    ft.removeFile(7, "/local/file", 2, false);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(transport.sent.length).toBe(0);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_done");
    expect(parsed.file_num).toBe("2");
  });

  it("removeDirAll with isRemote=true sends allFiles action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.removeDirAll(8, "/remote/dir", true, false);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.allFiles).toBeDefined();
    expect(action.allFiles!.id).toBe(8);
  });

  it("removeDirAll with isRemote=false emits file_dir with local files", async () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const mockFiles = [
      makeFileEntry("file1.txt", hbb.FileType.File, 10, 0),
    ];
    vi.spyOn(config.localFs, "getRecursiveFiles").mockResolvedValue(mockFiles);

    const ft = new FileTransferManager(config);
    ft.removeDirAll(9, "/local/dir", false, true);
    await vi.waitFor(() => expect(events.length).toBe(1));
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("file_dir");
    expect(parsed.is_local).toBe("true");
    const value = JSON.parse(parsed.value);
    expect(value.entries.length).toBe(1);
  });

  it("removeAllEmptyDirs with isRemote=true sends removeDir action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.removeAllEmptyDirs(10, "/remote/dir", true);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.removeDir).toBeDefined();
    expect(action.removeDir!.recursive).toBe(true);
  });

  it("removeAllEmptyDirs with isRemote=false calls localFs", async () => {
    const events: string[] = [];
    const { config, transport } = makeConfig(events);
    vi.spyOn(config.localFs, "removeAllEmptyDirs").mockResolvedValue(undefined);

    const ft = new FileTransferManager(config);
    ft.removeAllEmptyDirs(11, "/local/dir", false);
    await vi.waitFor(() => expect(events.length).toBe(1));
    expect(transport.sent.length).toBe(0);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_done");
  });

  it("cancelJob sends cancel action and marks job done", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.addJob(12, "/src", "/dst", 0, false, true);
    ft.cancelJob(12);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.cancel).toBeDefined();
    expect(action.cancel!.id).toBe(12);
    const job = ft.getJob(12);
    expect(job!.state).toBe(JobState.Done);
    expect(job!.err).toBe("cancel");
  });

  it("confirmOverrideFile sends sendConfirm with inverted skip", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.confirmOverrideFile(13, 1, true, false, false);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.sendConfirm).toBeDefined();
    expect(action.sendConfirm!.skip).toBe(false);
  });

  it("confirmOverrideFile with needOverride=false sends skip=true", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.confirmOverrideFile(14, 0, false, false, false);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.sendConfirm!.skip).toBe(true);
  });

  it("readEmptyDirs sends readEmptyDirs action", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.readEmptyDirs("/path", true);
    expect(transport.sent.length).toBe(1);
    const action = decodeFileAction(transport.sent[0]);
    expect(action.readEmptyDirs).toBeDefined();
    expect(action.readEmptyDirs!.path).toBe("/path");
  });

  it("addJob and getJob manage job state", () => {
    const { config } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.addJob(15, "/src", "/dst", 0, false, true);
    const job = ft.getJob(15);
    expect(job).toBeDefined();
    expect(job!.state).toBe(JobState.None);
    expect(job!.isRemote).toBe(true);
    expect(ft.getJob(999)).toBeUndefined();
  });

  it("getAllJobs returns all jobs", () => {
    const { config } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.addJob(1, "/a", "/b", 0, false, true);
    ft.addJob(2, "/c", "/d", 0, false, false);
    const jobs = ft.getAllJobs();
    expect(jobs.length).toBe(2);
  });

  it("resumeJob sets state to InProgress", () => {
    const { config } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.addJob(16, "/src", "/dst", 0, false, true);
    ft.resumeJob(16, true);
    expect(ft.getJob(16)!.state).toBe(JobState.InProgress);
  });

  it("updateJobProgress emits job_progress event", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    ft.addJob(17, "/src", "/dst", 0, false, true);
    ft.updateJobProgress(17, 2, 1024, 5000);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_progress");
    expect(parsed.id).toBe("17");
    expect(parsed.file_num).toBe("2");
    expect(parsed.speed).toBe("1024");
    expect(parsed.finished_size).toBe("5000");
    const job = ft.getJob(17);
    expect(job!.fileNum).toBe(2);
    expect(job!.finishedSize).toBe(5000);
  });

  it("updateJobProgress does nothing for unknown job", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    ft.updateJobProgress(999, 0, 0, 0);
    expect(events.length).toBe(0);
  });

  it("handleFileResponse with dir emits file_dir event", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    const fr: hbb.IFileResponse = {
      dir: {
        id: 1,
        path: "/remote",
        entries: [makeFileEntry("file.txt", hbb.FileType.File, 100, 0)],
      },
    };
    ft.handleFileResponse(fr);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("file_dir");
    expect(parsed.is_local).toBe("false");
  });

  it("handleFileResponse with done emits job_done event", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    ft.addJob(18, "/src", "/dst", 0, false, true);
    const fr: hbb.IFileResponse = {
      done: { id: 18, fileNum: 2 },
    };
    ft.handleFileResponse(fr);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_done");
    expect(parsed.id).toBe("18");
    expect(ft.getJob(18)!.state).toBe(JobState.Done);
  });

  it("handleFileResponse with error emits job_error event", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    ft.addJob(19, "/src", "/dst", 0, false, true);
    const fr: hbb.IFileResponse = {
      error: { id: 19, fileNum: 0, error: "permission denied" },
    };
    ft.handleFileResponse(fr);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("job_error");
    expect(parsed.err).toBe("permission denied");
    expect(ft.getJob(19)!.state).toBe(JobState.Error);
  });

  it("handleFileResponse with digest emits override_file_confirm event", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    const fr: hbb.IFileResponse = {
      digest: { id: 20, fileNum: 1, isUpload: true, isIdentical: false },
    };
    ft.handleFileResponse(fr);
    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.name).toBe("override_file_confirm");
    expect(parsed.id).toBe("20");
    expect(parsed.is_upload).toBe("true");
    expect(parsed.is_identical).toBe("false");
  });

  it("handleFileResponse with empty response does nothing", () => {
    const events: string[] = [];
    const { config } = makeConfig(events);
    const ft = new FileTransferManager(config);
    ft.handleFileResponse({});
    expect(events.length).toBe(0);
  });

  it("download flow: dir fills files, digest confirms, block writes, done closes", async () => {
    const events: string[] = [];
    const { config, transport } = makeConfig(events);
    const ft = new FileTransferManager(config);

    const writes: Uint8Array[] = [];
    const mockWriter = {
      write: vi.fn((d: Uint8Array) => {
        writes.push(d);
        return Promise.resolve();
      }),
      close: vi.fn(() => Promise.resolve()),
      abort: vi.fn(() => Promise.resolve()),
    };
    const mockHandle = {
      createWritable: () => Promise.resolve(mockWriter),
    };
    vi.spyOn(config.localFs, "createFileHandle").mockResolvedValue(
      mockHandle as unknown as FileSystemFileHandle,
    );

    await ft.sendFiles({
      id: 100,
      path: "/remote/f",
      to: "/local/f",
      fileNum: 0,
      includeHidden: false,
      isRemote: true,
      isDir: false,
    });

    ft.handleFileResponse({
      dir: {
        id: 100,
        path: "/remote",
        entries: [makeFileEntry("file.txt", hbb.FileType.File, 5, 0)],
      },
    });
    expect(events.some((e) => JSON.parse(e).name === "file_dir")).toBe(true);

    ft.handleFileResponse({
      digest: { id: 100, fileNum: 0, isUpload: false, isIdentical: false },
    });
    const confirmAction = decodeFileAction(transport.sent[transport.sent.length - 1]);
    expect(confirmAction.sendConfirm).toBeDefined();
    expect(confirmAction.sendConfirm!.offsetBlk).toBe(0);

    ft.handleFileResponse({
      block: {
        id: 100,
        fileNum: 0,
        data: new Uint8Array([1, 2, 3]),
        compressed: false,
        blkId: 0,
      },
    });
    await vi.waitFor(() => expect(writes.length).toBe(1));
    expect(writes[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(config.localFs.createFileHandle).toHaveBeenCalledWith(
      "/local/f/file.txt",
    );

    ft.handleFileResponse({ done: { id: 100, fileNum: 0 } });
    await vi.waitFor(() => expect(mockWriter.close).toHaveBeenCalled());
    expect(
      events.some((e) => {
        const p = JSON.parse(e);
        return p.name === "job_done" && p.id === "100";
      }),
    ).toBe(true);
  });

  it("download digest with isUpload=true does not send confirm", () => {
    const { config, transport } = makeConfig();
    const ft = new FileTransferManager(config);
    ft.handleFileResponse({
      digest: { id: 200, fileNum: 0, isUpload: true, isIdentical: false },
    });
    expect(transport.sent.length).toBe(0);
  });

  it("download error aborts the writer", async () => {
    const { config } = makeConfig();
    const ft = new FileTransferManager(config);
    const mockWriter = {
      write: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      abort: vi.fn(() => Promise.resolve()),
    };
    vi.spyOn(config.localFs, "createFileHandle").mockResolvedValue({
      createWritable: () => Promise.resolve(mockWriter),
    } as unknown as FileSystemFileHandle);

    await ft.sendFiles({
      id: 300,
      path: "/remote/f",
      to: "/local/f",
      fileNum: 0,
      includeHidden: false,
      isRemote: true,
      isDir: false,
    });
    ft.handleFileResponse({
      dir: {
        id: 300,
        path: "/remote",
        entries: [makeFileEntry("file.txt", hbb.FileType.File, 5, 0)],
      },
    });
    ft.handleFileResponse({
      block: {
        id: 300,
        fileNum: 0,
        data: new Uint8Array([1]),
        compressed: false,
        blkId: 0,
      },
    });
    await vi.waitFor(() => expect(mockWriter.write).toHaveBeenCalled());
    ft.handleFileResponse({
      error: { id: 300, fileNum: 0, error: "boom" },
    });
    await vi.waitFor(() => expect(mockWriter.abort).toHaveBeenCalled());
  });
});