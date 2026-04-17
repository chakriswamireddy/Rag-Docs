export interface UploadQueueMessage {
  docId: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
}

export interface ChunkRecord {
  id: string;
  values: number[];
  metadata: {
    docId: string;
    page: number;
    chunkIndex: number;
    text: string;
    source: string;
    uploadedAt?: string;
    section?: string;
  };
}
