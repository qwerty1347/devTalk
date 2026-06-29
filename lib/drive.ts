import { google } from "googleapis";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function getDrive() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // .env에 한 줄로 넣은 \n 을 실제 줄바꿈으로 복원
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string; // 변경 감지용 (증분 인덱싱)
};

// 폴더 안의 모든 파일을 가져온다. 하위 폴더까지 재귀적으로 탐색한다.
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const drive = getDrive();
  const out: DriveFile[] = [];

  async function walk(parentId: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        pageToken,
        pageSize: 100,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name || !f.mimeType) continue;
        if (f.mimeType === FOLDER_MIME) {
          await walk(f.id); // 하위 폴더 재귀 탐색
        } else {
          out.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            modifiedTime: f.modifiedTime ?? "",
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  await walk(folderId);
  return out;
}

// 텍스트/마크다운 파일 내용 읽기
export async function downloadText(fileId: string): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return res.data as string;
}

// Google Docs를 평문 텍스트로 export
export async function exportDoc(fileId: string): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return res.data as string;
}

// 이미지 등 바이너리 파일을 base64로 읽기
export async function downloadBase64(fileId: string): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer).toString("base64");
}

// 사람이 열어볼 수 있는 Drive 링크
export function driveUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
