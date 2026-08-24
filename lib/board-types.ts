export type Side = "pro" | "con"
export type Phase = "impression" | "score" | "final"

export type JudgeState = {
  name: string
  photo: string | null
  /** Photo framing: zoom factor plus translate offsets in percent (0 = centered). */
  zoom: number
  ox: number
  oy: number
  votes: Record<Phase, Side | null>
}

export type BoardState = {
  topic: string
  proName: string
  conName: string
  judges: JudgeState[]
}

export const BOARD_ID = "main"
export const JUDGE_COUNT = 4

export const MIN_ZOOM = 1
export const MAX_ZOOM = 3
export const PAN_LIMIT = 60

/** Translate offsets are free on both axes so any photo can move up/down and left/right. */
export const clampPos = (v: number) => Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, Number(v.toFixed(2))))
export const clampZoom = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(v.toFixed(3))))

export const PHASES: { key: Phase; label: string; sub: string }[] = [
  { key: "impression", label: "印象票", sub: "第一轮" },
  { key: "score", label: "分数票", sub: "第二轮" },
  { key: "final", label: "决选票", sub: "第三轮" },
]

export function makeDefault(): BoardState {
  return {
    topic: "辩题：请在此输入本场辩题",
    proName: "正方",
    conName: "反方",
    judges: Array.from({ length: JUDGE_COUNT }, (_, i) => ({
      name: `评审${["一", "二", "三", "四"][i]}`,
      photo: null,
      zoom: 1,
      ox: 0,
      oy: 0,
      votes: { impression: null, score: null, final: null },
    })),
  }
}

/** Majority winner of a judge's three votes, only once all three are cast. */
export function judgeResult(votes: Record<Phase, Side | null>): Side | null {
  const cast = [votes.impression, votes.score, votes.final]
  if (cast.some((v) => v === null)) return null
  const pro = cast.filter((v) => v === "pro").length
  return pro >= 2 ? "pro" : "con"
}

const SIDES: Side[] = ["pro", "con"]

/** Normalizes untrusted DB/realtime rows into a valid BoardState. */
export function normalizeBoard(row: {
  topic?: unknown
  pro_name?: unknown
  con_name?: unknown
  judges?: unknown
}): BoardState {
  const base = makeDefault()
  const raw = Array.isArray(row.judges) ? row.judges : []

  return {
    topic: typeof row.topic === "string" ? row.topic : base.topic,
    proName: typeof row.pro_name === "string" ? row.pro_name : base.proName,
    conName: typeof row.con_name === "string" ? row.con_name : base.conName,
    judges: base.judges.map((fallback, i) => {
      const j = (raw[i] ?? {}) as Record<string, unknown>
      const v = (j.votes ?? {}) as Record<string, unknown>
      const side = (x: unknown): Side | null => (SIDES.includes(x as Side) ? (x as Side) : null)
      return {
        name: typeof j.name === "string" ? j.name : fallback.name,
        photo: typeof j.photo === "string" ? j.photo : null,
        zoom: typeof j.zoom === "number" ? clampZoom(j.zoom) : 1,
        ox: typeof j.ox === "number" ? clampPos(j.ox) : 0,
        oy: typeof j.oy === "number" ? clampPos(j.oy) : 0,
        votes: {
          impression: side(v.impression),
          score: side(v.score),
          final: side(v.final),
        },
      }
    }),
  }
}
