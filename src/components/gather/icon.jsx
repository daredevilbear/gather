const paths = {
  palette: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="9" r="1" />
      <circle cx="13" cy="7" r="1" />
      <circle cx="17" cy="11" r="1" />
      <path d="M12 21v-5H7" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 8h18M9 8v13" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  home: (
    <>
      <path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-7h6v7" />
    </>
  ),
  code: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
    </>
  ),
  arrowLeft: <path d="m10 5-7 7 7 7M3 12h18" />,
  check: <path d="m5 12 4 4L19 6" />,
  edit: (
    <>
      <path d="m14 4 6 6M4 20l5-1L21 7l-6-6L3 13l1 7Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </>
  ),
  bell: (
    <>
      <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4M12 2v2" />
    </>
  ),
  history: <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2" />,
  tabs: <path d="M3 8h18v13H3V8ZM3 8V3h7v5m0-3h6v3m0-3h5v3" />,
  signOut: <path d="M10 3H4v18h6M9 12h12m-5-5 5 5-5 5" />,
  chevron: <path d="m8 10 4 4 4-4" />,
};
export default function GatherIcon({ name }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
