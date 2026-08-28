import { hbb } from "../proto/index.js";
import { LocalFileSystem } from "./local-fs.js";
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
  encodeRenameFile,
} from "./file-message.js";

export enum JobState {
  None = 0,
  InProgress = 1,
  Done = 2,
  Error = 3,
  Paused = 4,
}

export interface JobProgress {
  id: number;
  path: string;
  to: string;
  fileNum: number;
  totalSize: number;
  finishedSize: number;
  state: JobState;
  err: string;
  isRemote: boolean;
}

export interface FileTransferConfig {
  transport: { send: (data: Uint8Array) => void };
  localFs: LocalFileSystem;
  onGlobalEvent?: (json: string) => void;
}

export interface SendFilesParams {
  id: number;
  path: string;
  to: string;
  fileNum: number;
  includeHidden: boolean;
  isRemote: boolean;
  isDir: boolean;
}

export class FileTransferManager {
  private jobs = new Map<number, JobProgress>();


  constructor(private config: FileTransferConfig) {}

  readRemoteDir(path: string, includeHidden: boolean): void {
    this.config.transport.send(encodeReadDir(path, includeHidden));
  }

  async sendFiles(params: SendFilesParams): Promise<void> {
    const { id, path, to, fileNum, includeHidden, isRemote } = params;

    this.jobs.set(id, {
      id,
      path,
      to,
      fileNum,
      totalSize: 0,
      finishedSize: 0,
      state: JobState.InProgress,
      err: "",
      isRemote,
    });

    if (isRemote) {
      this.config.transport.send(
        encodeSendFiles(id, path, fileNum, includeHidden),
      );
    } else {
      const files = await this.config.localFs.getRecursiveFiles(
        path,
        includeHidden,
      );
      let totalSize = 0;
      for (const f of files) {
        totalSize += Number(f.size ?? 0);
      }
      this.config.transport.send(
        encodeReceiveFiles(id, to, fileNum, files, totalSize),
      );
      const job = this.jobs.get(id);
      if (job) job.totalSize = totalSize;
    }
  }

  createDir(id: number, path: string, isRemote: boolean): void {
    if (isRemote) {
      this.config.transport.send(encodeCreateDir(id, path));
    } else {
      this.config.localFs
        .createDir(path)
        .then(() => {
          this.emitJobDone(id, -1);
        })
        .catch((err: Error) => {
          this.emitJobError(id, -1, err.message);
        });
    }
  }

  removeFile(
    id: number,
    path: string,
    fileNum: number,
    isRemote: boolean,
  ): void {
    if (isRemote) {
      this.config.transport.send(encodeRemoveFile(id, path, fileNum));
    } else {
      this.config.localFs
        .removeFile(path)
        .then(() => {
          this.emitJobDone(id, fileNum);
        })
        .catch((err: Error) => {
          this.emitJobError(id, fileNum, err.message);
        });
    }
  }

  removeDirAll(
    id: number,
    path: string,
    isRemote: boolean,
    includeHidden: boolean,
  ): void {
    if (isRemote) {
      this.config.transport.send(encodeReadAllFiles(id, path, includeHidden));
    } else {
      this.config.localFs
        .getRecursiveFiles(path, includeHidden)
        .then((files) => {
          this.emitFileDir(id, path, files, true);
        })
        .catch((err: Error) => {
          this.emitJobError(id, -1, err.message);
        });
    }
  }

  removeAllEmptyDirs(id: number, path: string, isRemote: boolean): void {
    if (isRemote) {
      this.config.transport.send(encodeRemoveDir(id, path));
    } else {
      this.config.localFs
        .removeAllEmptyDirs(path)
        .then(() => {
          this.emitJobDone(id, -1);
        })
        .catch((err: Error) => {
          this.emitJobError(id, -16, err.message);
        });
    }
  }

  cancelJob(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.state = JobState.Done;
      job.err = "cancel";
    }
    this.config.transport.send(encodeCancelJob(id));
  }

  confirmOverrideFile(
    id: number,
    fileNum: number,
    needOverride: boolean,
    _remember: boolean,
    _isUpload: boolean,
  ): void {
    this.config.transport.send(
      encodeSendConfirm(id, fileNum, !needOverride),
    );
  }

  readEmptyDirs(path: string, includeHidden: boolean): void {
    this.config.transport.send(encodeReadEmptyDirs(path, includeHidden));
  }

  renameFile(id: number, path: string, newName: string, isRemote: boolean): void {
    if (isRemote) {
      this.config.transport.send(encodeRenameFile(id, path, newName));
    }
  }

  selectFiles(): void {
    this.config.onGlobalEvent?.(
      JSON.stringify({ name: "selected_files", files: [] }),
    );
  }

  addJob(
    id: number,
    path: string,
    to: string,
    fileNum: number,
    _includeHidden: boolean,
    isRemote: boolean,
  ): void {
    this.jobs.set(id, {
      id,
      path,
      to,
      fileNum,
      totalSize: 0,
      finishedSize: 0,
      state: JobState.None,
      err: "",
      isRemote,
    });
  }

  resumeJob(id: number, _isRemote: boolean): void {
    const job = this.jobs.get(id);
    if (job) {
      job.state = JobState.InProgress;
    }
  }

  getJob(id: number): JobProgress | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): JobProgress[] {
    return Array.from(this.jobs.values());
  }

  updateJobProgress(
    id: number,
    fileNum: number,
    speed: number,
    finishedSize: number,
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.fileNum = fileNum;
    job.finishedSize = finishedSize;
    this.config.onGlobalEvent?.(
      JSON.stringify({
        name: "job_progress",
        id: String(id),
        file_num: String(fileNum),
        speed: String(speed),
        finished_size: String(finishedSize),
      }),
    );
  }

  handleFileResponse(fr: hbb.IFileResponse): void {
    if (fr.dir) {
      this.emitFileDir(
        fr.dir.id ?? 0,
        fr.dir.path ?? "",
        fr.dir.entries ?? [],
        false,
      );
      return;
    }
    if (fr.done) {
      this.emitJobDone(fr.done.id ?? 0, fr.done.fileNum ?? 0);
      return;
    }
    if (fr.error) {
      this.emitJobError(
        fr.error.id ?? 0,
        fr.error.fileNum ?? 0,
        fr.error.error ?? "",
      );
      return;
    }
    if (fr.digest) {
      const d = fr.digest;
      this.config.onGlobalEvent?.(
        JSON.stringify({
          name: "override_file_confirm",
          id: String(d.id ?? 0),
          file_num: String(d.fileNum ?? 0),
          read_path: "",
          is_upload: d.isUpload ? "true" : "false",
          is_identical: d.isIdentical ? "true" : "false",
        }),
      );
      return;
    }
  }

  private emitFileDir(
    id: number,
    path: string,
    entries: hbb.IFileEntry[],
    isLocal: boolean,
  ): void {
    const entriesJson = entries.map((e) => ({
      entry_type: e.entryType ?? 0,
      name: e.name ?? "",
      size: Number(e.size ?? 0),
      modified_time: Number(e.modifiedTime ?? 0),
    }));
    this.config.onGlobalEvent?.(
      JSON.stringify({
        name: "file_dir",
        is_local: isLocal ? "true" : "false",
        value: JSON.stringify({ id, path, entries: entriesJson }),
      }),
    );
  }

  private emitJobDone(id: number, fileNum: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.state = JobState.Done;
    }
    this.config.onGlobalEvent?.(
      JSON.stringify({
        name: "job_done",
        id: String(id),
        file_num: String(fileNum),
      }),
    );
  }

  private emitJobError(id: number, fileNum: number, err: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.state = JobState.Error;
      job.err = err;
    }
    this.config.onGlobalEvent?.(
      JSON.stringify({
        name: "job_error",
        id: String(id),
        err,
        file_num: String(fileNum),
      }),
    );
  }
}