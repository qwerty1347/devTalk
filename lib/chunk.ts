// 긴 텍스트를 검색 단위로 분할한다. (문자 기준, 청크 간 오버랩 포함)
// 오버랩을 두면 청크 경계에 걸친 내용도 검색에 잘 잡힌다.
export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + size, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
  }
  return chunks;
}
