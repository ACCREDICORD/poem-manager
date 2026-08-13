export default function ToneLine({ text }) {
  return (
    <span className="font-mono tracking-wider">
      {(text || '').split('').map((c, i) => (
        <span
          key={i}
          className={
            c === '平' ? 'text-emerald-600' : c === '仄' ? 'text-rose-500' : 'text-slate-400'
          }
        >
          {c}
        </span>
      ))}
    </span>
  )
}
