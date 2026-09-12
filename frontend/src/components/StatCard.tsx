export default function StatCard({ title, value, color = '#3498db' }: { title: string; value: number; color?: string }) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{title}</span>
    </div>
  )
}
