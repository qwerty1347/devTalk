// 환경변수 로더.
// 인덱싱 스크립트에서 "다른 어떤 import보다 먼저" 이 파일을 import해야 한다.
// (ESM은 import를 먼저 실행하므로, lib/gemini 등이 평가되기 전에
//  여기서 GEMINI_API_KEY 등 환경변수를 채워둔다.)
import { config } from "dotenv";

config({ path: ".env.local" }); // .env.local 우선
config({ path: ".env" }); // 없는 값은 .env에서 보충 (기존 값은 덮어쓰지 않음)
