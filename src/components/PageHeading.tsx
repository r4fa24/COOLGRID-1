export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
    </div>
  )
}
