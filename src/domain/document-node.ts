export interface NodeBase {
  id: string;
  originalText: string;
  originalLine: number;
  modified: boolean;
}

export type DocumentNode =
  | (NodeBase & { kind: "comment" })
  | (NodeBase & { kind: "blank" })
  | (NodeBase & {
      kind: "known-setting";
      key: string;
      value: string;
      modelPath: string;
    })
  | (NodeBase & {
      kind: "unknown-setting";
      key: string;
      value: string;
    })
  | (NodeBase & { kind: "include"; target: string })
  | (NodeBase & { kind: "section"; name: string })
  | (NodeBase & { kind: "malformed"; reason: string });
