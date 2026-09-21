export default function GatherMark({ className }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#173c38" />
      <path d="M23 10H17a7 7 0 0 0-7 7v6h13V10Z" fill="#b8ebce" />
      <path d="M25 10h6a7 7 0 0 1 7 7v6H25V10Z" fill="#77cbb2" />
      <path d="M10 25h13v13h-6a7 7 0 0 1-7-7v-6Z" fill="#77cbb2" />
      <path d="M25 25h13v6a7 7 0 0 1-7 7h-6V25Z" fill="#e0f3b3" />
    </svg>
  );
}
