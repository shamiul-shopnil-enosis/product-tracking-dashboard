export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice bad" role="alert">
      <strong>This did not load.</strong> {message}{' '}
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}
