"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  BOARD_ID,
  JUDGE_COUNT,
  clampPos,
  clampZoom,
  makeDefault,
  normalizeBoard,
  type BoardState,
  type Phase,
  type Side,
} from "@/lib/board-types"

const PHASE_KEYS: Phase[] = ["impression", "score", "final"]
const SIDES: Side[] = ["pro", "con"]
const MAX_TEXT = 120
const MAX_PHOTO_BYTES = 6 * 1024 * 1024

type Result = { ok: true } | { ok: false; error: string }

function checkPassword(password: unknown): boolean {
  const expected = process.env.BOARD_ADMIN_PASSWORD
  if (!expected) return false
  return typeof password === "string" && password === expected
}

/** Reads the shared board, seeding the row if it's somehow missing. */
export async function getBoard(): Promise<BoardState> {
  const supabase = createAdminClient()
  const { data } = await supabase.from("vote_board").select("*").eq("id", BOARD_ID).maybeSingle()

  if (!data) {
    const fresh = makeDefault()
    await supabase.from("vote_board").upsert({
      id: BOARD_ID,
      topic: fresh.topic,
      pro_name: fresh.proName,
      con_name: fresh.conName,
      judges: fresh.judges,
    })
    return fresh
  }
  return normalizeBoard(data)
}

async function loadJudges() {
  const supabase = createAdminClient()
  const board = await getBoard()
  return { supabase, board }
}

async function saveJudges(judges: BoardState["judges"]): Promise<Result> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("vote_board")
    .update({ judges, updated_at: new Date().toISOString() })
    .eq("id", BOARD_ID)
  if (error) {
    console.log("[v0] saveJudges failed:", error.message)
    return { ok: false, error: "保存失败，请重试" }
  }
  return { ok: true }
}

/** Open to everyone with the link. Toggles the vote off when re-clicked. */
export async function castVote(judgeIndex: number, phase: Phase, side: Side): Promise<Result> {
  if (!Number.isInteger(judgeIndex) || judgeIndex < 0 || judgeIndex >= JUDGE_COUNT) {
    return { ok: false, error: "无效的评审" }
  }
  if (!PHASE_KEYS.includes(phase) || !SIDES.includes(side)) {
    return { ok: false, error: "无效的投票" }
  }

  const { board } = await loadJudges()
  const judges = board.judges.map((j, i) => {
    if (i !== judgeIndex) return j
    const current = j.votes[phase]
    return { ...j, votes: { ...j.votes, [phase]: current === side ? null : side } }
  })
  return saveJudges(judges)
}

/** Photo framing (zoom/pan) is treated like voting — no password needed. */
export async function adjustPhoto(
  judgeIndex: number,
  patch: { zoom?: number; ox?: number; oy?: number },
): Promise<Result> {
  if (!Number.isInteger(judgeIndex) || judgeIndex < 0 || judgeIndex >= JUDGE_COUNT) {
    return { ok: false, error: "无效的评审" }
  }
  const { board } = await loadJudges()
  const judges = board.judges.map((j, i) =>
    i === judgeIndex
      ? {
          ...j,
          zoom: typeof patch.zoom === "number" ? clampZoom(patch.zoom) : j.zoom,
          ox: typeof patch.ox === "number" ? clampPos(patch.ox) : j.ox,
          oy: typeof patch.oy === "number" ? clampPos(patch.oy) : j.oy,
        }
      : j,
  )
  return saveJudges(judges)
}

/** Uploads to public storage so every device loads the same URL. */
export async function uploadPhoto(judgeIndex: number, formData: FormData): Promise<Result> {
  if (!Number.isInteger(judgeIndex) || judgeIndex < 0 || judgeIndex >= JUDGE_COUNT) {
    return { ok: false, error: "无效的评审" }
  }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "请选择图片" }
  if (!file.type.startsWith("image/")) return { ok: false, error: "只支持图片文件" }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "图片过大（上限 6MB）" }

  const supabase = createAdminClient()
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")
  const path = `judge-${judgeIndex}-${Date.now()}.${ext || "jpg"}`

  const { error: upErr } = await supabase.storage
    .from("judge-photos")
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) {
    console.log("[v0] uploadPhoto failed:", upErr.message)
    return { ok: false, error: "上传失败，请重试" }
  }

  const { data } = supabase.storage.from("judge-photos").getPublicUrl(path)
  const board = await getBoard()
  const judges = board.judges.map((j, i) =>
    i === judgeIndex ? { ...j, photo: data.publicUrl, zoom: 1, ox: 0, oy: 0 } : j,
  )
  return saveJudges(judges)
}

export async function deletePhoto(judgeIndex: number): Promise<Result> {
  if (!Number.isInteger(judgeIndex) || judgeIndex < 0 || judgeIndex >= JUDGE_COUNT) {
    return { ok: false, error: "无效的评审" }
  }
  const { board } = await loadJudges()
  const judges = board.judges.map((j, i) => (i === judgeIndex ? { ...j, photo: null, zoom: 1, ox: 0, oy: 0 } : j))
  return saveJudges(judges)
}

export async function verifyPassword(password: string): Promise<Result> {
  if (!checkPassword(password)) return { ok: false, error: "密码错误" }
  return { ok: true }
}

/** Password-gated: topic, side names and judge names. */
export async function updateMeta(
  password: string,
  meta: { topic?: string; proName?: string; conName?: string; judgeNames?: string[] },
): Promise<Result> {
  if (!checkPassword(password)) return { ok: false, error: "密码错误" }

  const supabase = createAdminClient()
  const board = await getBoard()
  const text = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.slice(0, MAX_TEXT) : fallback

  const judges = Array.isArray(meta.judgeNames)
    ? board.judges.map((j, i) => ({ ...j, name: text(meta.judgeNames?.[i], j.name) }))
    : board.judges

  const { error } = await supabase
    .from("vote_board")
    .update({
      topic: text(meta.topic, board.topic),
      pro_name: text(meta.proName, board.proName),
      con_name: text(meta.conName, board.conName),
      judges,
      updated_at: new Date().toISOString(),
    })
    .eq("id", BOARD_ID)

  if (error) {
    console.log("[v0] updateMeta failed:", error.message)
    return { ok: false, error: "保存失败，请重试" }
  }
  return { ok: true }
}

/** Password-gated full reset: topic, names, photos and votes. */
export async function resetBoard(password: string): Promise<Result> {
  if (!checkPassword(password)) return { ok: false, error: "密码错误" }

  const supabase = createAdminClient()
  const fresh = makeDefault()
  const { error } = await supabase
    .from("vote_board")
    .update({
      topic: fresh.topic,
      pro_name: fresh.proName,
      con_name: fresh.conName,
      judges: fresh.judges,
      updated_at: new Date().toISOString(),
    })
    .eq("id", BOARD_ID)

  if (error) {
    console.log("[v0] resetBoard failed:", error.message)
    return { ok: false, error: "重置失败，请重试" }
  }

  // Clear stored photos so the bucket doesn't accumulate orphans.
  const { data: files } = await supabase.storage.from("judge-photos").list()
  if (files?.length) {
    await supabase.storage.from("judge-photos").remove(files.map((f) => f.name))
  }
  return { ok: true }
}
