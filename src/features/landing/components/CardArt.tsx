/**
 * CardArt — placeholder card face (the prototype uses striped/gradient art; real
 * card imagery substitutes in the app). A radial "sheen" + diagonal texture over
 * a tintable base, plus a mono type line and a mana pip. Tint uses a mana color —
 * legitimate here because it's card DATA, not chrome.
 */
type Props = {
  name: string;
  type: string;
  /** mana identity color for the pip + subtle tint (data only) */
  pip?: string;
  cost?: string;
};

export function CardArt({ name, type, pip = 'var(--accent)', cost = '2' }: Props) {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden">
      {/* Art base: warm radial + diagonal texture, tinted by identity. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 42% 34%, #d9d2bf 0%, #8a7f6a 34%, #3a3228 68%, #17130f 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-70 mix-blend-overlay"
        style={{ background: `radial-gradient(circle at 60% 20%, ${pip}, transparent 60%)` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(58deg, rgba(255,255,255,.06) 0 3px, transparent 3px 11px)',
        }}
      />

      {/* Title bar */}
      <div className="relative flex items-center justify-between gap-2 px-2 pt-1.5">
        <span className="truncate font-display text-[11px] font-medium text-[#0a0a0f] drop-shadow-[0_1px_0_rgba(255,255,255,.35)]">
          {name}
        </span>
        <span
          className="mb-mono flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-[#0a0a0f]"
          style={{ background: pip, boxShadow: `0 0 8px ${pip}` }}
        >
          {cost}
        </span>
      </div>

      {/* Type line */}
      <div className="relative bg-[rgba(10,10,15,.72)] px-2 py-1 backdrop-blur-[1px]">
        <span className="mb-label !text-[8px] !tracking-[0.12em] !text-[#cfc7b4]">{type}</span>
      </div>
    </div>
  );
}
