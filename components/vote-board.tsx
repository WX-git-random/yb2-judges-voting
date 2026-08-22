"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Trophy, RotateCcw, Camera, X, Pencil, Check, Link2, User, Minus, Plus } from "lucide-react"

type Side = "pro" | "con"
type Phase = "impression" | "score" | "final"

type JudgeState = {
  name: string
  photo: string | null
  /** Photo framing: zoom factor plus translate offsets in percent (0 = centered). */
  zoom: number
  ox: number
  oy: number
  votes: Record<Phase, Side | null>
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const PAN_LIMIT = 60

/** Translate offsets are free on both axes so any photo can move up/down and left/right. */
const clampPos = (v: number) => Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, Number(v.toFixed(2))))
const clampZoom = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(v.toFixed(3))))

type BoardState = {
  topic: string
  proName: string
  conName: string
  judges: JudgeState[]
}

const PHASES: { key: Phase; label: string; sub: string }[] = [
  { key: "impression", label: "印象票", sub: "第一轮" },
  { key: "score", label: "分数票", sub: "第二轮" },
  { key: "final", label: "决选票", sub: "第三轮" },
]

const STORAGE_KEY = "judge-vote-board-v2"

function makeDefault(): BoardState {
  return {
    topic: "辩题：请在此输入本场辩题",
    proName: "正方",
    conName: "反方",
    judges: Array.from({ length: 4 }, (_, i) => ({
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
function judgeResult(votes: Record<Phase, Side | null>): Side | null {
  const cast = [votes.impression, votes.score, votes.final]
  if (cast.some((v) => v === null)) return null
  const pro = cast.filter((v) => v === "pro").length
  return pro >= 2 ? "pro" : "con"
}

export function VoteBoard() {
  const [state, setState] = useState<BoardState>(makeDefault)
  const [loaded, setLoaded] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as BoardState
        if (parsed?.judges?.length === 4) {
          // Older saves have no framing fields — fill them in.
          setState({
            ...parsed,
            judges: parsed.judges.map((j) => ({
              ...j,
              zoom: typeof j.zoom === "number" ? j.zoom : 1,
              // Old saves stored 0–100 object-position values; recenter them for translate-based panning.
              ox: typeof j.ox === "number" ? clampPos(j.ox - 50) : 0,
              oy: typeof j.oy === "number" ? clampPos(j.oy - 50) : 0,
            })),
          })
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage may be full (large images) — fail silently
    }
  }, [state, loaded])

  const { topic, proName, conName, judges } = state

  function setJudges(updater: (prev: JudgeState[]) => JudgeState[]) {
    setState((s) => ({ ...s, judges: updater(s.judges) }))
  }

  function castVote(judgeIndex: number, phase: Phase, side: Side) {
    if (editMode) return
    setJudges((prev) =>
      prev.map((j, i) => {
        if (i !== judgeIndex) return j
        const current = j.votes[phase]
        return { ...j, votes: { ...j.votes, [phase]: current === side ? null : side } }
      }),
    )
  }

  function handlePhoto(judgeIndex: number, file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setJudges((prev) =>
        prev.map((j, i) => (i === judgeIndex ? { ...j, photo: dataUrl, zoom: 1, ox: 0, oy: 0 } : j)),
      )
    }
    reader.readAsDataURL(file)
  }

  function adjustPhoto(judgeIndex: number, patch: { zoom?: number; ox?: number; oy?: number }) {
    setJudges((prev) => prev.map((j, i) => (i === judgeIndex ? { ...j, ...patch } : j)))
  }

  function resetVotes() {
    setJudges((prev) => prev.map((j) => ({ ...j, votes: { impression: null, score: null, final: null } })))
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard blocked — ignore
    }
  }

  const results = judges.map((j) => judgeResult(j.votes))
  const proTotal = results.filter((r) => r === "pro").length
  const conTotal = results.filter((r) => r === "con").length
  const allDone = results.every((r) => r !== null)

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-3 font-sans text-white sm:p-5 md:p-8">
      <div className="flex w-[96%] max-w-[2000px] flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#1a0f2e]/75 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        {/* Header */}
        <header className="relative border-b border-white/10 px-5 py-4 sm:px-7 sm:py-5">
          <div className="absolute right-5 top-4 flex items-center gap-2 sm:right-7 sm:top-5">
            <button
              onClick={copyUrl}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 active:scale-95"
            >
              {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
              {copied ? "已复制" : "复制链接"}
            </button>
            <button
              onClick={resetVotes}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/15 active:scale-95"
            >
              <RotateCcw className="size-3.5" />
              重置
            </button>
            <button
              onClick={() => setEditMode((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-95"
              style={{
                background: editMode ? "var(--color-pro)" : "rgba(0,0,0,0.3)",
                borderColor: editMode ? "var(--color-pro)" : "rgba(255,255,255,0.2)",
              }}
            >
              {editMode ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
              {editMode ? "完成" : "编辑"}
            </button>
          </div>

          <div className="mx-auto flex max-w-4xl flex-col items-center px-0 text-center sm:px-40">
            <h1 className="text-2xl font-black tracking-wide text-white sm:text-3xl">辩论赛评审投票</h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {editMode ? (
                <>
                  <SideInput side="pro" value={proName} onChange={(v) => setState((s) => ({ ...s, proName: v }))} />
                  <span className="text-sm font-bold text-white/40">VS</span>
                  <SideInput side="con" value={conName} onChange={(v) => setState((s) => ({ ...s, conName: v }))} />
                </>
              ) : (
                <>
                  <span className="rounded-lg bg-[var(--color-pro)] px-5 py-2 text-2xl font-bold text-white">
                    {proName}
                  </span>
                  <span className="text-base font-bold text-white/50">VS</span>
                  <span className="rounded-lg bg-[var(--color-con)] px-5 py-2 text-2xl font-bold text-white">
                    {conName}
                  </span>
                </>
              )}
            </div>
            {editMode ? (
              <input
                value={topic}
                onChange={(e) => setState((s) => ({ ...s, topic: e.target.value }))}
                placeholder="输入辩题"
                className="mt-2 w-full rounded-md border border-white/25 bg-black/40 px-2.5 py-1.5 text-center text-xl font-medium outline-none focus:border-white/60"
              />
            ) : (
              <p className="mt-2 text-xl font-medium text-balance text-white/70">{topic}</p>
            )}
          </div>
        </header>

        {/* Table */}
        <div className="px-3 py-4 sm:px-5 sm:py-5">
          <div className="grid grid-cols-[minmax(90px,auto)_repeat(4,1fr)] items-center gap-x-2 gap-y-4 sm:gap-x-4">
            {/* Judge header row */}
            <div />
            {judges.map((judge, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <AvatarFrame
                  judge={judge}
                  onPick={() => fileInputs.current[i]?.click()}
                  onAdjust={(patch) => adjustPhoto(i, patch)}
                  onDelete={() => setJudges((prev) => prev.map((j, k) => (k === i ? { ...j, photo: null } : j)))}
                >
                  <input
                    ref={(el) => {
                      fileInputs.current[i] = el
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handlePhoto(i, file)
                      e.target.value = ""
                    }}
                  />
                </AvatarFrame>
                {editMode ? (
                  <input
                    value={judge.name}
                    onChange={(e) => setJudges((prev) => prev.map((j, k) => (k === i ? { ...j, name: e.target.value } : j)))}
                    className="w-full rounded-md border border-white/25 bg-black/40 px-1 py-1 text-center text-base font-bold outline-none focus:border-white/60"
                  />
                ) : (
                  <span className="max-w-full truncate text-center text-lg font-bold">{judge.name}</span>
                )}
              </div>
            ))}

            {/* Vote phase rows */}
            {PHASES.map(({ key, label, sub }) => (
              <RowGroup key={key} label={label} sub={sub}>
                {judges.map((judge, i) => {
                  const selected = judge.votes[key]
                  return (
                    <div key={i} className="flex justify-center gap-1.5">
                      <VoteButton
                        side="pro"
                        selected={selected === "pro"}
                        dimmed={selected === "con"}
                        onClick={() => castVote(i, key, "pro")}
                      />
                      <VoteButton
                        side="con"
                        selected={selected === "con"}
                        dimmed={selected === "pro"}
                        onClick={() => castVote(i, key, "con")}
                      />
                    </div>
                  )
                })}
              </RowGroup>
            ))}

            {/* Aggregate row */}
            <RowGroup label="归一票" sub="各评审三票归一" divider big>
              {judges.map((_, i) => {
                const r = results[i]
                return (
                  <div key={i} className="flex justify-center">
                    {r ? (
                      <span
                        className="rounded-xl px-5 py-2 text-2xl font-bold text-white shadow"
                        style={{ background: r === "pro" ? "var(--color-pro)" : "var(--color-con)" }}
                      >
                        {r === "pro" ? proName : conName}
                      </span>
                    ) : (
                      <span className="text-2xl text-white/30">—</span>
                    )}
                  </div>
                )
              })}
            </RowGroup>
          </div>
        </div>

        {/* Footer */}
        <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/10 bg-black/25 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-2">
            <Trophy className="size-7 text-[var(--color-pro)]" />
            <span className="text-xl font-black text-white">最终归属</span>
            <span className="hidden text-sm font-medium text-white/45 sm:inline">评审多者胜</span>
          </div>
          {/* Fixed-width slots keep the score in the same spot for every result (4:0, 3:1, 2:2, …) */}
          <div className="flex items-center justify-center gap-4">
            <ScorePill side="pro" value={proTotal} active={allDone} />
            <span className="w-4 text-center text-3xl font-black text-white/40">:</span>
            <ScorePill side="con" value={conTotal} active={allDone} />
          </div>
          <div className="flex justify-end text-base font-bold">
            {allDone ? (
              <span
                className="rounded-xl px-5 py-2 text-2xl font-black text-white shadow-lg"
                style={{
                  background:
                    proTotal === conTotal
                      ? "rgba(255,255,255,0.18)"
                      : proTotal > conTotal
                        ? "var(--color-pro)"
                        : "var(--color-con)",
                }}
              >
                {proTotal === conTotal ? "平局" : `${proTotal > conTotal ? proName : conName}胜出`}
              </span>
            ) : (
              <span className="text-white/45">进行中…</span>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function AvatarFrame({
  judge,
  onPick,
  onAdjust,
  onDelete,
  children,
}: {
  judge: JudgeState
  onPick: () => void
  onAdjust: (patch: { zoom?: number; ox?: number; oy?: number }) => void
  onDelete: () => void
  children: React.ReactNode
}) {
  const { photo, name, zoom, ox, oy } = judge
  const frameRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Non-passive wheel listener so zooming doesn't scroll the page.
  useEffect(() => {
    const el = frameRef.current
    if (!el || !photo) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onAdjust({ zoom: clampZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08)) })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [photo, zoom, onAdjust])

  function handlePointerDown(e: React.PointerEvent) {
    if (!photo) return
    frameRef.current?.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox, oy }
    setDragging(true)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = drag.current
    const rect = frameRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    // Photo follows the pointer on both axes.
    onAdjust({
      ox: clampPos(d.ox + ((e.clientX - d.x) / rect.width) * 100),
      oy: clampPos(d.oy + ((e.clientY - d.y) / rect.height) * 100),
    })
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  return (
    <div className="group relative">
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (!photo) onPick()
        }}
        className="relative size-40 overflow-hidden rounded-full border-2 border-white/20 bg-white/5 transition hover:border-white/50 sm:size-[250px]"
        style={{ cursor: photo ? (dragging ? "grabbing" : "grab") : "pointer" }}
        role={photo ? undefined : "button"}
        aria-label={photo ? `拖动调整${name}的照片` : `上传${name}的照片`}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo || "/placeholder.svg"}
            alt={name}
            draggable={false}
            className="size-full select-none object-cover"
            style={{ transform: `scale(${zoom}) translate(${ox}%, ${oy}%)` }}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-white/40">
            <User className="size-16" />
          </span>
        )}

        {!photo && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
            <Camera className="size-6" />
          </span>
        )}
      </div>

      {photo && (
        <>
          <button
            onClick={onDelete}
            className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-white/30 bg-[#160a26] text-white/85 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--color-con)] active:scale-90"
            aria-label="删除照片"
          >
            <X className="size-3.5" />
          </button>

          {/* Framing controls — appear on hover so the stage view stays clean */}
          <div className="absolute inset-x-4 bottom-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/85 px-2 py-1.5 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
            <button
              onClick={() => onAdjust({ zoom: clampZoom(zoom - 0.12) })}
              className="shrink-0 rounded p-0.5 text-white/80 transition hover:bg-white/15 active:scale-90"
              aria-label="缩小"
            >
              <Minus className="size-3.5" />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              onChange={(e) => onAdjust({ zoom: clampZoom(Number(e.target.value)) })}
              className="h-1 min-w-0 flex-1 accent-[var(--color-pro)]"
              aria-label="缩放照片"
            />
            <button
              onClick={() => onAdjust({ zoom: clampZoom(zoom + 0.12) })}
              className="shrink-0 rounded p-0.5 text-white/80 transition hover:bg-white/15 active:scale-90"
              aria-label="放大"
            >
              <Plus className="size-3.5" />
            </button>
            <button
              onClick={() => onAdjust({ zoom: 1, ox: 0, oy: 0 })}
              className="shrink-0 rounded p-0.5 text-white/80 transition hover:bg-white/15 active:scale-90"
              aria-label="复位"
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button
              onClick={onPick}
              className="shrink-0 rounded p-0.5 text-white/80 transition hover:bg-white/15 active:scale-90"
              aria-label="更换照片"
            >
              <Camera className="size-3.5" />
            </button>
          </div>
        </>
      )}
      {children}
    </div>
  )
}

function RowGroup({
  label,
  sub,
  divider,
  big,
  children,
}: {
  label: string
  sub: string
  divider?: boolean
  big?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <div className={divider ? "border-t border-white/10 pt-4" : ""}>
        <div className={big ? "text-2xl font-black text-white" : "text-sm font-black text-white"}>{label}</div>
        <div className={big ? "text-sm font-medium text-white/40" : "text-[11px] font-medium text-white/40"}>{sub}</div>
      </div>
      {children}
    </>
  )
}

function VoteButton({
  side,
  selected,
  dimmed,
  onClick,
}: {
  side: Side
  selected: boolean
  dimmed: boolean
  onClick: () => void
}) {
  const color = side === "pro" ? "var(--color-pro)" : "var(--color-con)"
  return (
    <button
      onClick={onClick}
      className="flex h-14 w-16 items-center justify-center rounded-lg border text-2xl font-bold transition active:scale-90 sm:w-20"
      style={{
        background: selected ? color : "rgba(255,255,255,0.04)",
        borderColor: selected ? color : "rgba(255,255,255,0.18)",
        color: selected ? "#fff" : dimmed ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.82)",
        boxShadow: selected ? `0 0 14px ${color}` : "none",
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {side === "pro" ? "正" : "反"}
    </button>
  )
}

function ScorePill({ side, value, active }: { side: Side; value: number; active: boolean }) {
  const color = side === "pro" ? "var(--color-pro)" : "var(--color-con)"
  return (
    <span
      className="flex size-14 items-center justify-center rounded-xl text-3xl font-extrabold text-white transition"
      style={{ background: color, boxShadow: active ? `0 0 14px ${color}` : "none" }}
    >
      {value}
    </span>
  )
}

function SideInput({ side, value, onChange }: { side: Side; value: string; onChange: (v: string) => void }) {
  const color = side === "pro" ? "var(--color-pro)" : "var(--color-con)"
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-56 rounded-lg px-4 py-2 text-center text-xl font-bold text-white outline-none ring-2 ring-transparent placeholder:text-white/60 focus:ring-white/40"
      style={{ background: color }}
    />
  )
}
