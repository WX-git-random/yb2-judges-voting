import { VoteBoard } from "@/components/vote-board"

const BG_URL =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-08-20%20at%2002.04.16-wLaNlXBQtEA0WkUXDt6jqHNdr6FqtD.jpeg"

export default function Page() {
  return (
    <main
      className="relative min-h-dvh w-full bg-[#160a26] bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: `url(${BG_URL})` }}
    >
      {/* Subtle darkening so text stays legible over the collage */}
      <div className="absolute inset-0 bg-[#160a26]/30" aria-hidden="true" />
      <div className="relative">
        <VoteBoard />
      </div>
    </main>
  )
}
