export function ProgressBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? '#22c55e' : percent >= 40 ? '#eab308' : '#ef4444';

  return (
    <div style={{
      width: '100%',
      height: 8,
      backgroundColor: '#e5e7eb',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${percent}%`,
        height: '100%',
        backgroundColor: color,
        borderRadius: 4,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}
