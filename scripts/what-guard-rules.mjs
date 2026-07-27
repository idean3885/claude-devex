/**
 * 도메인 What 추상화 룰 — 커밋·PR·이슈 본문에서 구현 세부를 탐지한다.
 *
 * 이 모듈이 룰의 단일 출처다. `pre-tool-use.mjs` 의 gh/git 경로와, 다른 트래커를 쓰는
 * 소비자(사내 API 를 curl 로 호출하는 어댑터 등)가 같은 룰을 공유하도록 분리했다.
 * 룰이 호출부마다 복제되면 한쪽만 갱신되어 같은 본문이 경로에 따라 통과·차단으로 갈린다.
 *
 * 사용:
 *   import { scanWhatViolations } from './what-guard-rules.mjs';
 *   const { blocked, hits } = scanWhatViolations([{ source: 'body', value: '...' }]);
 */

export const WHAT_RULES = [
  {
    id: 'hexagonal-classname',
    // PascalCase + 헥사고날 접미사 합성어 (단어 경계)
    // 예: WorkloadSnapshotUserService, NodeContainerMetricPortAdapter
    regex: /\b[A-Z][a-zA-Z0-9]+(Port|Adapter|UseCase|Listener|Service|Repository|Validator|Controller|Handler)\b/g,
    threshold: 1,
  },
  {
    id: 'annotation',
    // Spring/Lombok/Jakarta 어노테이션 (PascalCase)
    // 예: @TransactionalEventListener, @RequiredArgsConstructor
    regex: /@[A-Z][a-zA-Z]+/g,
    threshold: 1,
  },
  {
    id: 'tx-phase-const',
    // 트랜잭션 phase/propagation 상수
    regex: /\b(AFTER_COMMIT|BEFORE_COMMIT|AFTER_COMPLETION|AFTER_ROLLBACK|REQUIRES_NEW|MANDATORY|REQUIRED|SUPPORTS|NOT_SUPPORTED|NESTED|NEVER)\b/g,
    threshold: 1,
  },
  {
    id: 'config-file-path',
    // application-*.yml / application-*.yaml / build.gradle / *.properties 같은 의존성 파일 경로
    regex: /\bapplication-[a-z0-9_-]+\.ya?ml\b|\bbuild\.gradle\b|\b[a-z0-9_-]+\.properties\b/g,
    threshold: 1,
  },
  {
    id: 'artifact-count',
    // "N종 신규", "N files changed", "+M / -N"
    regex: /\d+\s*(종\s*신규|files?\s+changed|insertions?\b|deletions?\b)|\+\d+\s*\/\s*-\d+/g,
    threshold: 1,
  },
  {
    id: 'method-signature',
    // camelCase + 빈 괄호 (메서드 호출 표기) — 예: validateForCreate(), startDelegation()
    regex: /\b[a-z][a-zA-Z0-9]*\(\)/g,
    threshold: 1,
  },
];

export function snippet(text, index, length) {
  const before = Math.max(0, index - 25);
  const after = Math.min(text.length, index + length + 25);
  const frag = text.substring(before, after).replace(/\s+/g, ' ');
  return `"${before > 0 ? '…' : ''}${frag}${after < text.length ? '…' : ''}"`;
}

/**
 * 텍스트 목록에서 What 위반을 찾는다.
 * @param {Array<{source: string, value: string}>} texts
 * @returns {{blocked: boolean, hits: Array<{rule: string, match: string, source: string, context: string}>}}
 */
export function scanWhatViolations(texts) {
  const hits = [];
  for (const t of texts) {
    // mermaid 코드 블록은 흐름 시각화라 검사 제외
    const stripped = String(t.value || '').replace(/```mermaid[\s\S]*?```/g, '');
    for (const rule of WHAT_RULES) {
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      let count = 0;
      let m;
      while ((m = re.exec(stripped)) !== null) {
        count++;
        if (count <= 3) {
          hits.push({
            rule: rule.id,
            match: m[0],
            source: t.source,
            context: snippet(stripped, m.index, m[0].length),
          });
        }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      // threshold 미만이면 이번 룰 히트 무효화 (예: threshold=3 인데 1개만 매치 → 무시)
      if (count < rule.threshold) {
        const removeCount = Math.min(count, hits.length);
        for (let i = 0; i < removeCount; i++) {
          if (hits[hits.length - 1].rule === rule.id) hits.pop();
        }
      }
    }
  }
  return { blocked: hits.length > 0, hits };
}
