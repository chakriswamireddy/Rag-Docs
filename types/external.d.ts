declare module "unpdf" {
  export function extractText(
    input: Uint8Array,
    options?: { mergePages?: boolean }
  ): Promise<{ text: string | string[] }>;
}

declare module "aws-lambda" {
  export interface SQSRecord {
    messageId: string;
    body: string;
  }

  export interface SQSEvent {
    Records: SQSRecord[];
  }
}
