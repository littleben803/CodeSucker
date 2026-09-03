export default function UpdateAvailableDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`update-available-dot${className ? ` ${className}` : ''}`}
      role="img"
      aria-label="有可用更新"
      title="有可用更新"
    />
  );
}
